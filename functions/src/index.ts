import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
// remove dotenv import as firebase loads .env automatically
// import * as dotenv from "dotenv";

// dotenv.config();

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
          private_key: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });
  }
  return analyticsDataClient;
}

// Property ID will be read inside the function

export const updatePopularPosts = onSchedule({
  schedule: "every day 00:00",
  region: "europe-west1",
}, async (event) => {
  logger.info("Starting updatePopularPosts function");

  const propertyId = process.env.GA_PROPERTY_ID;

  if (!propertyId || !process.env.GA_CLIENT_EMAIL || !process.env.GA_PRIVATE_KEY) {
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
                  startDate: '30daysAgo',
                  endDate: 'today',
              },
          ],
          dimensions: [
              { name: 'pagePath' },
          ],
          metrics: [
              { name: 'screenPageViews' },
          ],
          orderBys: [
              { metric: { metricName: 'screenPageViews' }, desc: true },
          ],
          // Increase fetch limit to ensure we find enough articles even if top results are non-articles
          limit: 100, 
      });

      const topSlugs: string[] = [];
      const rows = response.rows || [];

      logger.info(`Fetched ${rows.length} rows from Analytics`);
      
      // Log raw rows for debugging
      rows.forEach(row => {
        logger.info(`Row: ${row.dimensionValues?.[0]?.value} - ${row.metricValues?.[0]?.value}`);
      });

      for (const row of rows) {
          const path = row.dimensionValues?.[0]?.value;
          // Check for both /articles/ and /posts/ to be safe, or just /posts/ based on logs.
          // Logs show: /posts/how-to-install-ani-cli
          if (path && (path.startsWith('/articles/') || path.startsWith('/posts/'))) {
              // Extract slug: /posts/my-slug -> my-slug
              const parts = path.split('/');
              // parts[0]="", parts[1]="posts"|"articles", parts[2]="slug"
              if (parts.length >= 3) {
                   // Clean slug of any query params if they exist (though GA usually separates them)
                   const slug = parts[2].split('?')[0]; 
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
      const currentPopularSnapshot = await db.collection('articles')
          .where('popularity', '==', true)
          .get();

      currentPopularSnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, { popularity: false });
      });
      
      logger.info(`Queued reset for ${currentPopularSnapshot.size} currently popular articles`);

      // Step B: Set new popular posts
      if (topSlugs.length > 0) {
          // Note: 'in' queries support up to 10 items, we have max 5, so this is safe.
          const newPopularSnapshot = await db.collection('articles')
              .where('slug', 'in', topSlugs)
              .get();
          
          if (newPopularSnapshot.empty) {
             logger.warn('No documents found in Firestore matching the top slugs!');
          } else {
             newPopularSnapshot.docs.forEach((doc) => {
                 logger.info(`Marking doc ${doc.id} (slug: ${doc.data().slug}) as popular`);
                 batch.update(doc.ref, { popularity: true });
             });
          }
          logger.info(`Queued set popular for ${newPopularSnapshot.size} new articles`);
      } else {
          logger.warn("No top slugs found to mark as popular.");
      }

      await batch.commit();
      logger.info("Successfully updated popular posts.");

      // VERIFICATION STEP: Read back one of the docs to confirm
      if (topSlugs.length > 0) {
         const verifySnapshot = await db.collection('articles')
             .where('slug', 'in', [topSlugs[0]])
             .get();
         verifySnapshot.docs.forEach(doc => {
             logger.info(`VERIFICATION READ: Doc ${doc.id} (${doc.data().slug}) popularity is now: ${doc.data().popularity}`);
         });
      }

  } catch (error) {
      logger.error("Error in updatePopularPosts", error);
  }
});
