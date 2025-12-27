import { BetaAnalyticsDataClient } from '@google-analytics/data';

const propertyId = process.env.GA_PROPERTY_ID;

// Initialize the client with credentials
// Check if the environment variables are set to avoid runtime errors during build if missing
const analyticsDataClient = (process.env.GA_CLIENT_EMAIL && process.env.GA_PRIVATE_KEY) 
  ? new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GA_CLIENT_EMAIL,
        private_key: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    })
  : null;

export async function getAnalyticsData(days = 7, customRange?: { startDate: string, endDate: string }) {
  if (!analyticsDataClient || !propertyId) {
    console.warn("Google Analytics credentials or Property ID missing.");
    return null;
  }

  const dateRange = customRange ? {
    startDate: customRange.startDate,
    endDate: customRange.endDate,
  } : {
    startDate: `${days}daysAgo`,
    endDate: 'today',
  };

  try {
    // Parallelize requests for performance
    const [
        timelineRes, 
        topPagesRes,
        deviceRes,
        countryRes,
        acquisitionRes,
        cityRes,
        browserRes,
        osRes,
        newVsReturningRes,
        summaryRes
    ] = await Promise.all([
        // 1. Timeline (Users, Views, Sessions)
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [{ name: 'date' }],
            metrics: [
                { name: 'activeUsers' },
                { name: 'screenPageViews' },
                { name: 'sessions' },
                { name: 'userEngagementDuration' }
            ],
            orderBys: [{ dimension: { dimensionName: 'date' } }]
        }),
        // 2. Top Pages
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
            metrics: [{ name: 'screenPageViews' }],
            limit: 10,
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }]
        }),
        // 3. Device Category (Desktop/Mobile)
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'activeUsers' }],
        }),
        // 4. Country
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 100, // Increased limit to get total count
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
        }),
        // 5. Acquisition (Source/Medium)
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [{ name: 'sessionSourceMedium' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 5,
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
        }),
        // 6. City
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [{ name: 'city' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 100, // Limit for fetching city data
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
        }),
        // 7. Browser
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [{ name: 'browser' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 10,
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
        }),
        // 8. Operating System
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [{ name: 'operatingSystem' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 10,
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
        }),
        // 9. New vs Returning
        analyticsDataClient.runReport({
             property: `properties/${propertyId}`,
             dateRanges: [dateRange],
             dimensions: [{ name: 'newVsReturning' }],
             metrics: [{ name: 'activeUsers' }],
        }),
        // 10. Summary (Total Users, Views, Sessions, Engagement)
        analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            metrics: [
                { name: 'activeUsers' },
                { name: 'screenPageViews' },
                { name: 'sessions' },
                { name: 'userEngagementDuration' }
            ],
        })
    ]);

    const formatResponse = (res: any) => res[0];

    // Helper to extract timeline
    const timeline = formatResponse(timelineRes).rows?.map((row: any) => ({
        date: row.dimensionValues?.[0]?.value,
        users: parseInt(row.metricValues?.[0]?.value || '0', 10),
        views: parseInt(row.metricValues?.[1]?.value || '0', 10),
        sessions: parseInt(row.metricValues?.[2]?.value || '0', 10),
        engagementDuration: parseInt(row.metricValues?.[3]?.value || '0', 10),
    })) || [];

    // Helper to extract top pages
    const topPages = formatResponse(topPagesRes).rows?.map((row: any) => ({
        path: row.dimensionValues?.[0]?.value,
        title: row.dimensionValues?.[1]?.value,
        views: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];

    // Helper to extract devices
    const devices = formatResponse(deviceRes).rows?.map((row: any) => ({
        device: row.dimensionValues?.[0]?.value,
        users: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];

    // Helper to extract countries
    const countries = formatResponse(countryRes).rows?.map((row: any) => ({
        country: row.dimensionValues?.[0]?.value,
        users: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];

    // Helper to extract acquisition
    const acquisition = formatResponse(acquisitionRes).rows?.map((row: any) => ({
        source: row.dimensionValues?.[0]?.value,
        users: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];

    // Helper to extract cities
    const cities = formatResponse(cityRes).rows?.map((row: any) => ({
        city: row.dimensionValues?.[0]?.value,
        users: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];

    // Helper to extract browsers
    const browsers = formatResponse(browserRes).rows?.map((row: any) => ({
        browser: row.dimensionValues?.[0]?.value,
        users: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];

    // Helper to extract OS
    const operatingSystems = formatResponse(osRes).rows?.map((row: any) => ({
        os: row.dimensionValues?.[0]?.value,
        users: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];

    // Helper to extract new vs returning
    const newVsReturning = formatResponse(newVsReturningRes).rows?.map((row: any) => ({
        userType: row.dimensionValues?.[0]?.value,
        users: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];

    // Extract summary
    const summaryRow = formatResponse(summaryRes).rows?.[0];
    const summary = {
        users: parseInt(summaryRow?.metricValues?.[0]?.value || '0', 10),
        views: parseInt(summaryRow?.metricValues?.[1]?.value || '0', 10),
        sessions: parseInt(summaryRow?.metricValues?.[2]?.value || '0', 10),
        engagementDuration: parseInt(summaryRow?.metricValues?.[3]?.value || '0', 10),
    };

    return {
      timeline,
      topPages,
      devices,
      countries,
      acquisition,
      cities,
      browsers,
      operatingSystems,
      newVsReturning,
      summary
    };
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    return null;
  }
}
