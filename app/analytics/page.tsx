"use client";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AnalyticsPage() {
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchYouTubeStats = async () => {
      try {
        const statsDoc = await getDoc(doc(db, "meta", "stats"));
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          if (data.youtube) {
            setSubscriberCount(data.youtube.subscriberCount || 0);
            setVideoCount(data.youtube.videoCount || 0);
            setViewCount(data.youtube.viewCount || 0);
          }
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchYouTubeStats();
  }, []);
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

        <AnalyticsDashboard
          youtubeStats={{ subscriberCount, videoCount, viewCount }}
        />
      </div>
    </div>
  );
}
