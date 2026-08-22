"use client";

import Link from "next/link";
import { Eye, EyeOff, MessageSquare, Youtube } from "lucide-react";
import { useEffect, useState } from "react";
import PageTitle from "@/components/PageTitle";
import {
  collection,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  limit,
  where,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview";
import { useAuth } from "@/lib/auth-context";

export default function AdminDashboardPage() {
  const { userRole } = useAuth();

  return userRole === "moderator" ? (
    <ModeratorDashboard />
  ) : (
    <ContentDashboard />
  );
}

type ModeratorComment = {
  id: string;
  status?: "visible" | "hidden";
  authorHandle?: string;
  authorName?: string;
  articleTitle?: string;
  content?: string;
  createdAt?: Timestamp;
};

function ModeratorDashboard() {
  const [comments, setComments] = useState<ModeratorComment[]>([]);
  const [counts, setCounts] = useState({ all: 0, visible: 0, hidden: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const commentsRef = collection(db, "comments");
        const [snapshot, allCount, visibleCount, hiddenCount] = await Promise.all([
          getDocs(query(commentsRef, orderBy("createdAt", "desc"), limit(5))),
          getCountFromServer(commentsRef),
          getCountFromServer(query(commentsRef, where("status", "==", "visible"))),
          getCountFromServer(query(commentsRef, where("status", "==", "hidden"))),
        ]);
        const nextComments = snapshot.docs
          .map((commentDoc) => ({
            id: commentDoc.id,
            ...commentDoc.data(),
          })) as ModeratorComment[];
        setComments(nextComments);
        setCounts({
          all: allCount.data().count,
          visible: visibleCount.data().count,
          hidden: hiddenCount.data().count,
        });
      } catch (fetchError) {
        console.error("Unable to load the moderator dashboard:", fetchError);
        setError("The comments dashboard could not be loaded. Check that the latest Firestore rules are deployed.");
      } finally {
        setLoading(false);
      }
    };

    void fetchComments();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl pb-16 pt-10 md:pt-2">
      <PageTitle
        className="sr-only"
        imgSrc="/images/titles/Dashboard.svg"
        imgAlt="Moderator dashboard"
      >
        Dashboard
      </PageTitle>

      {error ? (
        <p role="alert" className="mt-8 border border-red-400/30 bg-red-400/10 p-4 text-red-100">
          {error}
        </p>
      ) : null}

      <dl className="mt-7 grid grid-cols-3 border-y border-white/15">
        {[
          { label: "All comments", value: counts.all, icon: MessageSquare },
          { label: "Visible", value: counts.visible, icon: Eye },
          { label: "Hidden", value: counts.hidden, icon: EyeOff },
        ].map(({ label, value, icon: Icon }, index) => (
          <div
            key={label}
            className={`min-w-0 py-4 sm:py-5 ${index === 0 ? "pr-3 sm:pr-6" : "border-l border-white/15 px-3 sm:px-6"}`}
          >
            <div className="flex items-center gap-2 text-white/45">
              <Icon className="h-4 w-4 shrink-0 text-[#8a2ae3]" aria-hidden="true" />
              <dt className="truncate text-[11px] sm:text-sm">{label}</dt>
            </div>
            <dd className="mt-3 font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
              {loading ? "—" : value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/15 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Latest activity
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Recent comments</h2>
          </div>
          <Link
            href="/admin/comments"
            className="border-b border-[#8a2ae3] pb-1 text-sm font-semibold uppercase hover:text-[#8a2ae3]"
          >
            Manage all comments
          </Link>
        </div>

        {loading ? (
          <p className="py-10 text-white/50">Loading comments…</p>
        ) : comments.length === 0 ? (
          <p className="py-10 text-white/50">No comments have been posted yet.</p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="grid gap-3 border-b border-white/10 py-5 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-start"
            >
              <p className="font-semibold text-white/80">
                @{comment.authorHandle || comment.authorName || "reader"}
              </p>
              <div className="min-w-0">
                <p className="truncate text-sm text-white/45">{comment.articleTitle || "Article"}</p>
                <p className="mt-1 line-clamp-2 text-white/75">{comment.content}</p>
              </div>
              <span
                className={`w-fit text-xs font-semibold uppercase tracking-wide ${
                  comment.status === "hidden" ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {comment.status || "visible"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ContentDashboard() {
  const [articlesCount, setArticlesCount] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);

  const [latestArticles, setLatestArticles] = useState<any[]>([]);
  const [monthlyArticlesData, setMonthlyArticlesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch counts
      const articlesSnap = await getDocs(collection(db, "articles"));
      setArticlesCount(articlesSnap.size);

      const teamSnap = await getDocs(collection(db, "authors"));
      setTeamCount(teamSnap.size);

      // Fetch YouTube Subscribers
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

      // 2. Fetch latest articles (limit 3, order by createdAt desc)
      const latestArticlesQuery = query(
        collection(db, "articles"),
        orderBy("createdAt", "desc"),
        limit(3),
      );
      const latestArticlesSnap = await getDocs(latestArticlesQuery);
      const articlesList = latestArticlesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLatestArticles(articlesList);

      // 4. Fetch articles for the last 6 months for chart
      // 4. Fetch articles for the last 6 months for chart
      const now = new Date();
      // Start from the beginning of the 6-month window (5 months ago + current month)
      const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);

      const articlesForChartQuery = query(
        collection(db, "articles"),
        where("date", ">=", Timestamp.fromDate(startDate)),
        orderBy("date", "asc"),
      );
      const chartSnap = await getDocs(articlesForChartQuery);
      const monthlyCounts: { [key: string]: number } = {};

      chartSnap.docs.forEach((doc) => {
        const data = doc.data();
        // Only count published articles with a valid date
        if (data.date && data.publish) {
          const date = data.date.toDate();
          const month = date.toLocaleString("en-US", {
            month: "short",
            year: "numeric",
          });
          monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
        }
      });

      // Prepare data for the chart, ensuring we have entries for the last 6 months
      const chartData = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthKey = d.toLocaleString("en-US", {
          month: "short",
          year: "numeric",
        });
        chartData.push({
          month: monthKey,
          articles: monthlyCounts[monthKey] || 0,
        });
      }
      setMonthlyArticlesData(chartData);

      setLoading(false);
    };

    fetchData();
  }, []);

  // Skeleton for a summary card
  const SummaryCardSkeleton = () => (
    <div className="p-4 border border-neutral-800 rounded animate-pulse">
      <div className="h-6 bg-gray-700 rounded w-1/2 mb-2"></div>
      <div className="h-8 bg-gray-700 rounded w-1/3"></div>
    </div>
  );

  // Skeleton for a list item (article) with thumbnail
  const ListItemSkeleton = () => (
    <div className="flex items-center gap-4 border-b border-neutral-800 py-5 animate-pulse">
      <div className="w-16 h-16 bg-gray-700 rounded"></div>
      <div className="flex-1">
        <div className="h-6 bg-gray-700 rounded w-3/4 mb-1"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2"></div>
      </div>
    </div>
  );

  const ChartSkeleton = () => (
    <div className="h-[300px] w-full bg-gray-800 animate-pulse rounded p-4">
      <div className="h-full w-full bg-gray-700 rounded"></div>
    </div>
  );

  return (
    <div>
      <div className="mt-10 md:-mt-8">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/Dashboard.svg"
          imgAlt="Dashboard"
        >
          Dashboard
        </PageTitle>
      </div>

      {/* Responsive Summary cards */}
      {/* Analytics Overview - Full Width */}
      <div className="mb-8 mt-10 w-full md:w-[95%] mx-auto">
        <AnalyticsOverview />
      </div>

      {/* Responsive Summary cards */}
      <div className="flex flex-wrap justify-center gap-4 mb-19 w-full md:w-[95%] mx-auto">
        {loading ? (
          <>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)]">
              <SummaryCardSkeleton />
            </div>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)]">
              <SummaryCardSkeleton />
            </div>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)]">
              <SummaryCardSkeleton />
            </div>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)]">
              <SummaryCardSkeleton />
            </div>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)]">
              <SummaryCardSkeleton />
            </div>
          </>
        ) : (
          <>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)] p-4 border border-neutral-800">
              <h2 className="text-lg font-bold">Articles</h2>
              <p className="text-xl">{articlesCount}</p>
            </div>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)] p-4 border border-neutral-800">
              <h2 className="text-lg font-bold">Members</h2>
              <p className="text-xl">{teamCount}</p>
            </div>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)] p-4 border border-neutral-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Youtube className="w-5 h-5 text-[#FF0000]" />
                Subscribers
              </h2>
              <p className="text-xl">
                {subscriberCount !== null
                  ? subscriberCount.toLocaleString()
                  : "..."}
              </p>
            </div>
            {/* Second Row - Centered */}
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)] p-4 border border-neutral-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Youtube className="w-5 h-5 text-[#FF0000]" />
                Total Views
              </h2>
              <p className="text-xl">
                {viewCount !== null ? viewCount.toLocaleString() : "..."}
              </p>
            </div>
            <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.75rem)] p-4 border border-neutral-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Youtube className="w-5 h-5 text-[#FF0000]" />
                Total Videos
              </h2>
              <p className="text-xl">
                {videoCount !== null ? videoCount.toLocaleString() : "..."}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Monthly Articles Chart */}
      <div className="mb-20 md:ml-5">
        <h2 className="text-subtitle font-bold mb-5">Monthly Post</h2>
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="w-full h-[300px]">
            <ResponsiveContainer>
              <BarChart data={monthlyArticlesData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255, 255, 255, 0.1)"
                />
                <XAxis
                  dataKey="month"
                  stroke="#fff"
                  interval="preserveStartEnd"
                />
                <YAxis stroke="#fff" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                  }}
                  labelStyle={{ color: "#fff" }}
                />
                <Legend wrapperStyle={{ color: "#fff" }} />
                <Bar dataKey="articles" fill="#8a2ae3" name="Posts Published" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Latest Articles */}
      <div className="mb-20 md:ml-5">
        <h2 className="text-subtitle font-bold mb-5">Latest Posts</h2>
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <ListItemSkeleton key={index} />
          ))
        ) : latestArticles.length > 0 ? (
          latestArticles.map((article) => (
            <div
              key={article.id}
              className="flex items-center gap-4 border-b border-white/20 py-5"
            >
              <img
                src={
                  article.img ||
                  "/images/articles/preview/an-indestructible-hope.jpg"
                }
                alt={article.imgAlt || "Thumbnail"}
                className="w-22 object-cover"
              />
              <div>
                <p className="font-semibold text-xl mb-1">{article.title}</p>
                <p className="text-sm text-white/50">
                  By {article.authorName} •{" "}
                  {article.createdAt?.toDate?.().toLocaleString()}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p>No articles found.</p>
        )}
      </div>
    </div>
  );
}
