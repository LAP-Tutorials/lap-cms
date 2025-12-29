import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
// remove dotenv import as firebase loads .env automatically
// import * as dotenv from "dotenv";

// dotenv.config();

// Ensure Firebase Admin is initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Lazy initialization of Firebase Admin
let db: admin.firestore.Firestore | null = null;
function getDb() {
  if (!db) {
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    db = admin.firestore();
  }
  return db;
}

// Lazy initialization to prevent global scope crashes
let analyticsDataClient: BetaAnalyticsDataClient | null = null;

function getAnalyticsClient() {
  if (!analyticsDataClient) {
    analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GA_CLIENT_EMAIL,
        private_key: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
    });
  }
  return analyticsDataClient;
}

// Property ID will be read inside the function

export const updatePopularPosts = onSchedule(
  {
    schedule: "every day 00:00",
    region: "europe-west1",
  },
  async (event) => {
    logger.info("Starting updatePopularPosts function");

    const propertyId = process.env.GA_PROPERTY_ID;

    if (
      !propertyId ||
      !process.env.GA_CLIENT_EMAIL ||
      !process.env.GA_PRIVATE_KEY
    ) {
      logger.error("Missing Google Analytics credentials or Property ID");
      return;
    }

    try {
      // 1. Fetch Top 5 Viewed Articles from GA4 (Past 3 Days)
      const client = getAnalyticsClient();
      const [response] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: "30daysAgo",
            endDate: "today",
          },
        ],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        // Increase fetch limit to ensure we find enough articles even if top results are non-articles
        limit: 100,
      });

      const topSlugs: string[] = [];
      const rows = response.rows || [];

      logger.info(`Fetched ${rows.length} rows from Analytics`);

      // Log raw rows for debugging
      rows.forEach((row) => {
        logger.info(
          `Row: ${row.dimensionValues?.[0]?.value} - ${row.metricValues?.[0]?.value}`
        );
      });

      for (const row of rows) {
        const path = row.dimensionValues?.[0]?.value;
        // Check for both /articles/ and /posts/ to be safe, or just /posts/ based on logs.
        // Logs show: /posts/how-to-install-ani-cli
        if (
          path &&
          (path.startsWith("/articles/") || path.startsWith("/posts/"))
        ) {
          // Extract slug: /posts/my-slug -> my-slug
          const parts = path.split("/");
          // parts[0]="", parts[1]="posts"|"articles", parts[2]="slug"
          if (parts.length >= 3) {
            // Clean slug of any query params if they exist (though GA usually separates them)
            const slug = parts[2].split("?")[0];
            if (slug && !topSlugs.includes(slug)) {
              topSlugs.push(slug);
            }
          }
        }
        // User requested top 4
        if (topSlugs.length >= 4) break;
      }

      logger.info(`Identified Top 5 Slugs: ${JSON.stringify(topSlugs)}`);

      // 2. Database Update Transaction/Batch
      const db = getDb();
      const batch = db.batch();

      // Step A: Reset ALL currently popular posts
      const currentPopularSnapshot = await db
        .collection("articles")
        .where("popularity", "==", true)
        .get();

      currentPopularSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { popularity: false });
      });

      logger.info(
        `Queued reset for ${currentPopularSnapshot.size} currently popular articles`
      );

      // Step B: Set new popular posts
      if (topSlugs.length > 0) {
        // Note: 'in' queries support up to 10 items, we have max 5, so this is safe.
        const newPopularSnapshot = await db
          .collection("articles")
          .where("slug", "in", topSlugs)
          .get();

        if (newPopularSnapshot.empty) {
          logger.warn(
            "No documents found in Firestore matching the top slugs!"
          );
        } else {
          newPopularSnapshot.docs.forEach((doc) => {
            logger.info(
              `Marking doc ${doc.id} (slug: ${doc.data().slug}) as popular`
            );
            batch.update(doc.ref, { popularity: true });
          });
        }
        logger.info(
          `Queued set popular for ${newPopularSnapshot.size} new articles`
        );
      } else {
        logger.warn("No top slugs found to mark as popular.");
      }

      await batch.commit();
      logger.info("Successfully updated popular posts.");

      // VERIFICATION STEP: Read back one of the docs to confirm
      if (topSlugs.length > 0) {
        const verifySnapshot = await db
          .collection("articles")
          .where("slug", "in", [topSlugs[0]])
          .get();
        verifySnapshot.docs.forEach((doc) => {
          logger.info(
            `VERIFICATION READ: Doc ${doc.id} (${
              doc.data().slug
            }) popularity is now: ${doc.data().popularity}`
          );
        });
      }
    } catch (error) {
      logger.error("Error in updatePopularPosts", error);
    }
  }
);

export const manageAssets = onCall(
  {
    region: "europe-west1",
    minInstances: 0,
  },
  async (request) => {
    logger.info("Starting manageAssets function", {
      action: request.data.action,
      itemsCount: request.data.items?.length,
    });

    const { action, items, destPath, newName } = request.data;

    // items should be an array of full storage paths, e.g. ["folder/file.png"]
    if (!action || !items || !Array.isArray(items) || items.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required arguments: action and items array."
      );
    }

    const bucket = admin.storage().bucket(); // Default bucket
    const results = {
      success: 0,
      failure: 0,
      errors: [] as string[],
    };

    try {
      if (action === "rename") {
        if (items.length !== 1 || !newName) {
          throw new HttpsError(
            "invalid-argument",
            "Rename requires exactly 1 item and newName."
          );
        }
        const srcPath = items[0];

        let isFolder = false;
        try {
          await bucket.file(srcPath).getMetadata();
        } catch (e: any) {
          if (e.code === 404) isFolder = true;
          else throw e;
        }

        const pathParts = srcPath.split("/");
        pathParts.pop(); // remove old name
        const parentPath = pathParts.join("/");
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;

        if (!isFolder) {
          await bucket.file(srcPath).move(newPath);
          logger.info(`Renamed file ${srcPath} to ${newPath}`);
        } else {
          // Folder rename = move all files with prefix
          const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
          const [files] = await bucket.getFiles({ prefix });
          logger.info(
            `Renaming folder ${srcPath} to ${newPath}, found ${files.length} files`
          );

          for (const file of files) {
            // srcPath: "a/b/old"
            // file: "a/b/old/sub/file.txt"
            // newPath: "a/b/new"
            // rel: "sub/file.txt" (part after srcPath + /)

            // We can just replace the prefix string
            const targetPath = file.name.replace(prefix, `${newPath}/`);
            await file.move(targetPath);
          }
        }
        results.success++;
      } else if (action === "copy" || action === "move") {
        if (destPath === undefined || destPath === null) {
          throw new HttpsError(
            "invalid-argument",
            "Copy/Move requires destPath (can be empty string)."
          );
        }

        // destPath: "targetFolder" (no trailing slash needed usually)
        // For each item "sourceFolder/file.png", we want "targetFolder/file.png"

        for (const srcPath of items) {
          try {
            // Check if it's a "folder" (exists as a prefix or we treat it as one if it ends in /? No, client sends exact path)
            // But GCS "folders" are just prefixes. If the user selected a "folder" in UI, use-assets sends its path.
            // We need to list all files starting with this path + "/"

            // Standard file handling first
            let isFolder = false;
            try {
              // Quick check if it's a file
              await bucket.file(srcPath).getMetadata();
            } catch (e: any) {
              if (e.code === 404) {
                // Might be a folder path (prefix)
                isFolder = true;
              } else {
                throw e;
              }
            }

            if (!isFolder) {
              // Normal file operation
              const fileName = srcPath.split("/").pop();
              if (!fileName) continue;
              const targetPath = destPath
                ? `${destPath}/${fileName}`
                : fileName;

              if (action === "copy") {
                await bucket.file(srcPath).copy(targetPath);
                logger.info(`Copied ${srcPath} to ${targetPath}`);
              } else {
                await bucket.file(srcPath).move(targetPath);
                logger.info(`Moved ${srcPath} to ${targetPath}`);
              }
              results.success++;
            } else {
              // Folder operation - list all files with this prefix
              // Ensure trailing slash for prefix matching
              const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
              const [files] = await bucket.getFiles({ prefix });

              logger.info(
                `Processing folder ${prefix}, found ${files.length} files`
              );

              for (const file of files) {
                const relativePath = file.name.slice(prefix.length);
                const targetPath = destPath
                  ? `${destPath}/${srcPath.split("/").pop()}/${relativePath}`
                  : `${srcPath.split("/").pop()}/${relativePath}`;

                if (action === "copy") {
                  await file.copy(targetPath);
                } else {
                  await file.move(targetPath);
                }
              }
              results.success++;
            }
          } catch (e) {
            logger.error(`Failed to ${action} ${srcPath}`, e);
            results.failure++;
            results.errors.push(
              `Failed to ${action} ${srcPath}: ${
                e instanceof Error ? e.message : String(e)
              }`
            );
          }
        }
      } else if (action === "delete") {
        for (const srcPath of items) {
          try {
            await bucket.file(srcPath).delete();
            results.success++;
          } catch (e) {
            logger.error(`Failed to delete ${srcPath}`, e);
            results.failure++;
            results.errors.push(`Failed to delete ${srcPath}`);
          }
        }
      } else {
        throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
      }
    } catch (error) {
      logger.error("Global error in manageAssets", error);
      throw new HttpsError(
        "internal",
        "Internal error processing assets",
        error
      );
    }

    return results;
  }
);
