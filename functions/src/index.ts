import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import * as JSZip from "jszip";
// import { google } from "googleapis";
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

export const createTeamMember = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const caller = await getDb()
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    const callerRole = caller.data()?.role;

    if (!caller.exists || !["admin", "super"].includes(callerRole)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to create team members."
      );
    }

    const {
      name,
      email,
      password,
      role,
      city,
      job,
      avatar,
      imgAlt,
      slug,
      socials,
    } = request.data ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 6 ||
      typeof role !== "string" ||
      !["manager", "admin", "super"].includes(role)
    ) {
      throw new HttpsError("invalid-argument", "Invalid member details.");
    }

    if (role === "super" && callerRole !== "super") {
      throw new HttpsError(
        "permission-denied",
        "Only a super admin can create another super admin."
      );
    }

    const optionalString = (value: unknown) =>
      typeof value === "string" ? value : "";

    const newUser = await admin
      .auth()
      .createUser({
        email: email.trim(),
        password,
        displayName: name.trim(),
      })
      .catch((error) => {
        logger.error("Failed to create Auth user", error);
        if (error?.code === "auth/email-already-exists") {
          throw new HttpsError(
            "already-exists",
            "A user with this email already exists."
          );
        }
        throw new HttpsError("internal", "Failed to create the user account.");
      });

    try {
      await getDb().collection("authors").doc(newUser.uid).set({
        uid: newUser.uid,
        name: name.trim(),
        city: optionalString(city),
        job: optionalString(job),
        role,
        avatar: optionalString(avatar),
        imgAlt: optionalString(imgAlt),
        biography: { body: "", summary: "" },
        slug: optionalString(slug),
        socials:
          typeof socials === "object" && socials !== null ? socials : {},
        createdAt: new Date().toISOString(),
        dateJoined: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      await admin.auth().deleteUser(newUser.uid).catch((cleanupError) => {
        logger.error("Failed to roll back Auth user", cleanupError);
      });
      logger.error("Failed to create author profile", error);
      throw new HttpsError("internal", "Failed to create the author profile.");
    }

    return { uid: newUser.uid };
  }
);

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
        // Fetch more candidates (e.g. 20) to ensure we find 5 published ones
        // even if some top views are drafts
        if (topSlugs.length >= 20) break;
      }

      logger.info(
        `Identified Top ${topSlugs.length} Candidate Slugs: ${JSON.stringify(
          topSlugs
        )}`
      );

      // 2. Database Update Transaction/Batch
      const db = getDb();
      const batch = db.batch();

      // Step A: Reset ALL currently popular posts
      const currentPopularSnapshot = await db
        .collection("articles")
        .where("popularity", "==", true)
        .get();

      currentPopularSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          popularity: false,
          popularityRank: admin.firestore.FieldValue.delete(),
        });
      });

      logger.info(
        `Queued reset for ${currentPopularSnapshot.size} currently popular articles`
      );

      // Step B: Filter candidates for published status and pick top 5
      const finalPopularSlugs: string[] = [];

      if (topSlugs.length > 0) {
        // Firestore 'in' query limit is 10. We need to batch requests if we have > 10.
        const slugChunks = [];
        for (let i = 0; i < topSlugs.length; i += 10) {
          slugChunks.push(topSlugs.slice(i, i + 10));
        }

        const validDocsMap = new Map<
          string,
          admin.firestore.DocumentSnapshot
        >();

        for (const chunk of slugChunks) {
          const snapshot = await db
            .collection("articles")
            .where("slug", "in", chunk)
            .get();

          snapshot.docs.forEach((doc) => {
            validDocsMap.set(doc.data().slug, doc);
          });
        }

        // Iterate through original sorted topSlugs to maintain rank order
        let rankCounter = 1;
        for (const slug of topSlugs) {
          const doc = validDocsMap.get(slug);
          if (doc) {
            const data = doc.data();
            // ONLY allow if explicitly published
            if (data && data.publish === true) {
              batch.update(doc.ref, {
                popularity: true,
                popularityRank: rankCounter,
              });

              logger.info(
                `Marking doc ${doc.id} (slug: ${slug}) as popular (Rank: ${rankCounter})`
              );

              finalPopularSlugs.push(slug);
              rankCounter++;

              if (finalPopularSlugs.length >= 5) break;
            } else {
              logger.info(`Skipping popular candidate (Draft): ${slug}`);
            }
          }
        }

        if (finalPopularSlugs.length === 0) {
          logger.warn("No published articles found among top views.");
        } else {
          logger.info(
            `Final Top 5 Popular: ${JSON.stringify(finalPopularSlugs)}`
          );
        }
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
    timeoutSeconds: 540, // Increase timeout for large folder operations
    memory: "1GiB",
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

    const bucket = admin.storage().bucket();
    const debugLogs: string[] = [];
    const log = (msg: string) => {
      debugLogs.push(msg);
      logger.info(msg);
    };

    const results = {
      success: 0,
      failure: 0,
      errors: [] as string[],
      logs: debugLogs,
    };

    log(`Starting action: ${action} on ${items.length} items`);

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
          log(`Renamed file ${srcPath} to ${newPath}`);
        } else {
          // Folder rename = move all files with prefix
          const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
          const [files] = await bucket.getFiles({ prefix });
          log(
            `Renaming folder ${srcPath} to ${newPath}, found ${files.length} files`
          );

          for (const file of files) {
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

        for (const srcPath of items) {
          try {
            let isFolder = false;
            try {
              await bucket.file(srcPath).getMetadata();
            } catch (e: any) {
              if (e.code === 404) {
                isFolder = true;
              } else {
                throw e;
              }
            }

            if (!isFolder) {
              const fileName = srcPath.split("/").pop();
              if (!fileName) continue;
              const targetPath = destPath
                ? `${destPath}/${fileName}`
                : fileName;

              if (action === "copy") {
                await bucket.file(srcPath).copy(targetPath);
                log(`Copied ${srcPath} to ${targetPath}`);
              } else {
                await bucket.file(srcPath).move(targetPath);
                log(`Moved ${srcPath} to ${targetPath}`);
              }
              results.success++;
            } else {
              const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
              const [files] = await bucket.getFiles({ prefix });

              log(`Processing folder ${prefix}, found ${files.length} files`);

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
            const err = `Failed to ${action} ${srcPath}: ${e}`;
            logger.error(err);
            results.failure++;
            results.errors.push(err);
          }
        }
      } else if (action === "delete") {
        for (const srcPath of items) {
          // 1. CLEANUP INDEX FIRST
          try {
            const db = getDb();
            const indexRef = db.collection("assets_index");

            // Normalize path
            const normalizedPath = srcPath.replace(/\/$/, "");

            // Delete the folder/file doc itself
            const safeId = normalizedPath.replace(/\//g, "___");
            await indexRef.doc(safeId).delete();

            // Recursive delete of children using ID RANGE
            const startId = safeId + "___";
            const endId = safeId + "___\uf8ff";

            const allChildren = await indexRef
              .where(admin.firestore.FieldPath.documentId(), ">=", startId)
              .where(admin.firestore.FieldPath.documentId(), "<=", endId)
              .get();

            if (!allChildren.empty) {
              const BATCH_SIZE = 450;
              let batch = db.batch();
              let count = 0;
              let totalDeleted = 0;

              for (const doc of allChildren.docs) {
                batch.delete(doc.ref);
                count++;
                if (count >= BATCH_SIZE) {
                  await batch.commit();
                  batch = db.batch();
                  count = 0;
                }
                totalDeleted++;
              }

              if (count > 0) {
                await batch.commit();
              }
              log(
                `Recursively deleted ${totalDeleted} index entries for ${srcPath}`
              );
            }
          } catch (indexError: any) {
            const msg = `Failed to clean up index for ${srcPath}: ${indexError.message}`;
            logger.error(msg);
            results.errors.push(msg);
          }

          // 2. DELETE FROM STORAGE
          try {
            // Check if it's a file first and delete it
            try {
              await bucket.file(srcPath).delete();
              log(`Deleted file: ${srcPath}`);
            } catch (e: any) {
              if (e.code !== 404) {
                throw e;
              }
            }

            // Delete folder contents (Manual Iteration)
            const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;

            log(`Listing files for prefix: ${prefix}`);
            const [files] = await bucket.getFiles({ prefix });

            if (files.length > 0) {
              log(`Found ${files.length} items in ${srcPath}, deleting...`);

              const DELETE_BATCH = 50;
              for (let i = 0; i < files.length; i += DELETE_BATCH) {
                const chunk = files.slice(i, i + DELETE_BATCH);
                await Promise.all(
                  chunk.map((f) =>
                    f.delete().catch((e) => {
                      const err = `Failed to delete file ${f.name}: ${e.message}`;
                      logger.error(err);
                      results.errors.push(err);
                    })
                  )
                );
              }
              log(`Successfully deleted contents of ${srcPath}`);
            } else {
              log(`No files found under prefix ${prefix}`);
            }

            results.success++;
          } catch (e: any) {
            const err = `Failed to delete from storage ${srcPath}: ${e.message}`;
            logger.error(err);
            results.failure++;
            results.errors.push(err);
          }
        }
      } else if (action === "downloadFolder") {
        if (items.length !== 1) {
          throw new HttpsError(
            "invalid-argument",
            "Download folder requires exactly 1 item (folder path)."
          );
        }
        const srcPath = items[0];
        const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
        const [files] = await bucket.getFiles({ prefix });

        if (files.length === 0) {
          // It might be empty, just return empty zip? Or error?
          // Let's allow empty zip or just handle gracefully.
        }

        const zip = new JSZip();

        // Download all files in parallel
        // WARNING: Large folders might run out of memory.
        // Ideally we stream, but JSZip generateAsync needs all data for compression unless we use a stream-capable zip lib.
        // JSZip is memory-bound.

        await Promise.all(
          files.map(async (file) => {
            if (file.name.endsWith("/")) return; // Skip directories if listed
            try {
              const [content] = await file.download();
              const relativePath = file.name.slice(prefix.length);
              if (relativePath) {
                zip.file(relativePath, content);
              }
            } catch (e) {
              logger.error(`Failed to download file for zip: ${file.name}`, e);
            }
          })
        );

        const zipContent = await zip.generateAsync({ type: "nodebuffer" });

        const fileName =
          srcPath.replace(/\/$/, "").split("/").pop() || "download";
        const tempFilePath = `temp_downloads/${fileName}-${Date.now()}.zip`;
        const tempFile = bucket.file(tempFilePath);

        await tempFile.save(zipContent, {
          contentType: "application/zip",
          metadata: {
            metadata: {
              tempDownload: "true", // Tag for cleanup lifecycle rules
            },
          },
        });

        const [url] = await tempFile.getSignedUrl({
          action: "read",
          expires: Date.now() + 15 * 60 * 1000, // 15 min
          version: "v4",
        });

        results.success++;
        return { ...results, downloadUrl: url };
      } else if (action === "downloadFile") {
        if (items.length !== 1) {
          throw new HttpsError(
            "invalid-argument",
            "Download file requires exactly 1 item (file path)."
          );
        }
        const srcPath = items[0];
        const file = bucket.file(srcPath);
        const [match] = await file.exists();
        if (!match) {
          throw new HttpsError("not-found", "File not found");
        }

        // Generate signed URL with response-content-disposition attachment
        // This forces the browser to download instead of open
        // Using v4 to avoid permission issues
        const [url] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 15 * 60 * 1000, // 15 min
          version: "v4",
          responseDisposition: "attachment",
        });

        results.success++;
        return { ...results, downloadUrl: url };
      } else if (action === "syncIndex") {
        // Manual Trigger for Asset Indexing
        // Replicating logic from syncAssetIndex

        const collectionRef = getDb().collection("assets_index");
        const [files] = await bucket.getFiles();
        logger.info(`Manual sync: Found ${files.length} files`);

        const BATCH_SIZE = 450;
        let batch = getDb().batch();
        let operationCount = 0;
        const currentSyncTime = admin.firestore.Timestamp.now();
        const processedFolders = new Set<string>();

        for (const file of files) {
          if (file.name.endsWith("/")) continue;

          const fileName = file.name.split("/").pop() || "";
          const safeId = file.name.replace(/\//g, "___"); // File ID
          const parentId = file.name.includes("/")
            ? file.name.substring(0, file.name.lastIndexOf("/"))
            : "";

          // Keywords
          const keywords = fileName
            .toLowerCase()
            .split(/[\s\-_.]+/)
            .filter((k) => k.length > 2);
          keywords.push(fileName.toLowerCase());

          batch.set(
            collectionRef.doc(safeId),
            {
              name: fileName,
              path: file.name,
              parentId: parentId,
              type: "file",
              size: file.metadata.size
                ? parseInt(String(file.metadata.size))
                : 0,
              mimeType: file.metadata.contentType || "application/octet-stream",
              updatedAt: file.metadata.updated || new Date().toISOString(),
              createdAt: file.metadata.timeCreated || new Date().toISOString(),
              lastSync: currentSyncTime,
              nameLower: fileName.toLowerCase(),
              keywords: keywords,
            },
            { merge: true }
          );
          operationCount++;

          // Folders
          let parentPath = parentId;
          while (parentPath) {
            if (!processedFolders.has(parentPath)) {
              processedFolders.add(parentPath);
              const safeFolderId = parentPath.replace(/\//g, "___");
              const folderName = parentPath.split("/").pop() || parentPath;
              const folderParentId = parentPath.includes("/")
                ? parentPath.substring(0, parentPath.lastIndexOf("/"))
                : "";

              batch.set(
                collectionRef.doc(safeFolderId),
                {
                  name: folderName,
                  path: parentPath,
                  parentId: folderParentId,
                  type: "folder",
                  size: 0,
                  mimeType: "application/vnd.google-apps.folder",
                  updatedAt: currentSyncTime.toDate().toISOString(),
                  createdAt: currentSyncTime.toDate().toISOString(),
                  lastSync: currentSyncTime,
                  nameLower: folderName.toLowerCase(),
                  keywords: [folderName.toLowerCase()],
                },
                { merge: true }
              );
              operationCount++;
            }
            parentPath = parentPath.includes("/")
              ? parentPath.substring(0, parentPath.lastIndexOf("/"))
              : "";

            if (operationCount >= BATCH_SIZE) {
              await batch.commit();
              batch = getDb().batch();
              operationCount = 0;
            }
          }

          if (operationCount >= BATCH_SIZE) {
            await batch.commit();
            batch = getDb().batch();
            operationCount = 0;
          }
        }

        if (operationCount > 0) {
          await batch.commit();
        }

        results.success = files.length;
        logger.info("Manual asset index sync complete");
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

export const updateYouTubeSubscribers = onSchedule(
  {
    schedule: "every 12 hours",
    region: "europe-west1",
  },
  async (event) => {
    logger.info("Starting updateYouTubeSubscribers function");

    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!channelId || !apiKey) {
      logger.error("Missing YouTube Channel ID or API Key");
      return;
    }

    try {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`;
      const response = await fetch(url);
      const data = (await response.json()) as any;

      if (data.items && data.items.length > 0) {
        const stats = data.items[0].statistics;
        const subscriberCount = parseInt(stats.subscriberCount, 10);
        const videoCount = parseInt(stats.videoCount, 10);
        const viewCount = parseInt(stats.viewCount, 10);

        const db = getDb();
        await db
          .collection("meta")
          .doc("stats")
          .set(
            {
              youtube: {
                subscriberCount,
                videoCount,
                viewCount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );

        logger.info(
          `Successfully updated YouTube stats: ${subscriberCount} subscribers`
        );
      } else {
        logger.warn("No YouTube channel data found for ID:", channelId);
      }
    } catch (error) {
      logger.error("Error fetching YouTube stats", error);
    }
  }
);

export const syncAssetIndex = onSchedule(
  {
    schedule: "every day 01:00",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    logger.info("Starting syncAssetIndex function");
    const bucket = admin.storage().bucket();
    const db = getDb();
    const collectionRef = db.collection("assets_index");

    try {
      // 1. Get all files
      const [files] = await bucket.getFiles();
      logger.info(`Found ${files.length} files in storage`);

      const BATCH_SIZE = 450;
      let batch = db.batch();
      let operationCount = 0;
      let totalBatches = 0;

      const currentSyncTime = admin.firestore.Timestamp.now();
      const processedFolders = new Set<string>();

      for (const file of files) {
        if (file.name.endsWith("/")) continue;

        // Process File
        const fileName = file.name.split("/").pop() || "";
        const safeId = file.name.replace(/\//g, "___");
        const parentId = file.name.includes("/")
          ? file.name.substring(0, file.name.lastIndexOf("/"))
          : "";

        // Generate simple keywords for search (name parts)
        const keywords = fileName
          .toLowerCase()
          .split(/[\s\-_.]+/)
          .filter((k) => k.length > 2);
        keywords.push(fileName.toLowerCase()); // full name

        batch.set(
          collectionRef.doc(safeId),
          {
            name: fileName,
            path: file.name,
            parentId: parentId, // Index parent folder path
            type: "file",
            size: file.metadata.size ? parseInt(String(file.metadata.size)) : 0,
            mimeType: file.metadata.contentType || "application/octet-stream",
            updatedAt: file.metadata.updated || new Date().toISOString(),
            createdAt: file.metadata.timeCreated || new Date().toISOString(),
            lastSync: currentSyncTime,
            nameLower: fileName.toLowerCase(),
            keywords: keywords,
          },
          { merge: true }
        );
        operationCount++;

        // Process Parent Folders
        // "a/b/c.jpg" -> process "a/b", then "a"
        let parentPath = parentId;
        while (parentPath) {
          if (!processedFolders.has(parentPath)) {
            processedFolders.add(parentPath);
            const safeFolderId = parentPath.replace(/\//g, "___");
            const folderName = parentPath.split("/").pop() || parentPath;
            const folderParentId = parentPath.includes("/")
              ? parentPath.substring(0, parentPath.lastIndexOf("/"))
              : "";

            batch.set(
              collectionRef.doc(safeFolderId),
              {
                name: folderName,
                path: parentPath,
                parentId: folderParentId, // Index parent of the folder
                type: "folder",
                size: 0, // Folders don't have intrinsic size in this model, or we aggregate later?
                // For stats, we sum files. For listing, we just need existence.
                mimeType: "application/vnd.google-apps.folder",
                updatedAt: currentSyncTime.toDate().toISOString(),
                createdAt: currentSyncTime.toDate().toISOString(),
                lastSync: currentSyncTime,
                nameLower: folderName.toLowerCase(),
                keywords: [folderName.toLowerCase()],
              },
              { merge: true }
            );
            operationCount++;
          }
          // Move up
          parentPath = parentPath.includes("/")
            ? parentPath.substring(0, parentPath.lastIndexOf("/"))
            : "";
          if (operationCount >= BATCH_SIZE) {
            await batch.commit();
            totalBatches++;
            batch = db.batch();
            operationCount = 0;
          }
        }

        if (operationCount >= BATCH_SIZE) {
          await batch.commit();
          totalBatches++;
          batch = db.batch();
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
        totalBatches++;
      }

      logger.info("Asset index sync complete");
    } catch (error) {
      logger.error("Error syncing asset index", error);
    }
  }
);

// Real-time Indexing Triggers
// Note: Requires "firebase-functions/v2/storage" import if using v2, but we use v1/v2 mixed.
// Let's use v2 storage triggers.
import {
  onObjectFinalized,
  onObjectDeleted,
} from "firebase-functions/v2/storage";

export const indexAssetOnUpload = onObjectFinalized(
  { region: "europe-west1" },
  async (event) => {
    const file = event.data;
    const db = getDb();
    const safeId = file.name.replace(/\//g, "___");
    const parentId = file.name.includes("/")
      ? file.name.substring(0, file.name.lastIndexOf("/"))
      : "";
    const fileName = file.name.split("/").pop() || "";

    // Keywords
    const keywords = fileName
      .toLowerCase()
      .split(/[\s\-_.]+/)
      .filter((k) => k.length > 2);
    keywords.push(fileName.toLowerCase());

    await db
      .collection("assets_index")
      .doc(safeId)
      .set(
        {
          name: fileName,
          path: file.name,
          parentId: parentId,
          items: [file.name],
          type: "file",
          size: file.size ? parseInt(String(file.size)) : 0,
          mimeType: file.contentType || "application/octet-stream",
          updatedAt: file.updated || new Date().toISOString(),
          createdAt: file.timeCreated || new Date().toISOString(),
          lastSync: admin.firestore.Timestamp.now(),
          nameLower: fileName.toLowerCase(),
          keywords: keywords,
        },
        { merge: true }
      );

    // Also ensure parent folder exists (simple check)
    if (parentId) {
      const safeFolderId = parentId.replace(/\//g, "___");
      const folderName = parentId.split("/").pop() || parentId;
      const folderParentId = parentId.includes("/")
        ? parentId.substring(0, parentId.lastIndexOf("/"))
        : "";

      // Upsert folder just in case
      await db
        .collection("assets_index")
        .doc(safeFolderId)
        .set(
          {
            name: folderName,
            path: parentId,
            parentId: folderParentId,
            type: "folder",
            mimeType: "application/vnd.google-apps.folder",
            updatedAt: new Date().toISOString(),
            lastSync: admin.firestore.Timestamp.now(),
            nameLower: folderName.toLowerCase(),
            keywords: [folderName.toLowerCase()],
          },
          { merge: true }
        );
    }

    logger.info(`Indexed new asset: ${file.name}`);
  }
);

export const removeAssetFromIndex = onObjectDeleted(
  { region: "europe-west1" },
  async (event) => {
    const file = event.data;
    const db = getDb();
    const safeId = file.name.replace(/\//g, "___");

    await db.collection("assets_index").doc(safeId).delete();
    logger.info(`Removed asset from index: ${file.name}`);
  }
);

export const checkScheduledPosts = onSchedule(
  {
    schedule: "every 1 hours",
    region: "europe-west1",
  },
  async (event) => {
    logger.info("Starting checkScheduledPosts function");
    const db = getDb();
    const now = admin.firestore.Timestamp.now();

    try {
      // Query for articles that are NOT published AND have a scheduled date in the past
      const snapshot = await db
        .collection("articles")
        .where("publish", "==", false)
        .where("scheduledPublishDate", "<=", now)
        .get();

      if (snapshot.empty) {
        logger.info("No scheduled posts found to publish.");
        return;
      }

      logger.info(`Found ${snapshot.size} scheduled posts to publish.`);

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          publish: true,
          date: doc.data().scheduledPublishDate || now, // Use scheduled time as publish time
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
      logger.info(`Successfully published ${snapshot.size} articles.`);
    } catch (error) {
      logger.error("Error in checkScheduledPosts", error);
    }
  }
);
