"use client";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import PageTitle from "@/components/PageTitle";

export default function AnalyticsPage() {
  return (
    <div>
      <div className="mt-10 md:-mt-8">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/Analytics.svg"
          imgAlt="Analytics"
        >
          Analytics
        </PageTitle>
      </div>

      <div className="w-full md:w-[95%] mx-auto mb-20 mt-10">
        {/* <div className="space-y-0.5 mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground">
            Real-time insights and performance metrics.
            </p>
        </div> */}

        <AnalyticsDashboard />
      </div>
    </div>
  );
}
