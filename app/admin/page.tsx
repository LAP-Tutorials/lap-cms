"use client";

import Link from "next/link";
import {
  Eye,
  EyeOff,
  MessageSquare,
  MessageCircle,
  Youtube,
  FileText,
  FileEdit,
  Users,
  UserCheck,
  Trash2,
  Plus,
  ArrowRight,
  AtSign,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import PageTitle from "@/components/PageTitle";
import { Breadcrumb } from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
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
    <div className="w-full pb-16">
      <div className="w-full">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/Dashboard.svg"
          imgAlt="Moderator dashboard"
        >
          Dashboard
        </PageTitle>
      </div>

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
              className="flex flex-col gap-2 border-b border-white/10 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
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

interface RecentUser {
  uid: string;
  email?: string;
  displayName?: string;
  handle?: string;
  photoURL?: string;
  provider?: string;
  createdAt?: Timestamp;
}

function ContentDashboard() {
  const { userRole } = useAuth();

  // Content Counts
  const [articlesCount, setArticlesCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [teamCount, setTeamCount] = useState(0);

  // Audience & Community Counts
  const [readersCount, setReadersCount] = useState(0);
  const [claimedHandlesCount, setClaimedHandlesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [repliesCount, setRepliesCount] = useState(0);

  // YouTube Metrics
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);

  // Recent Activity
  const [latestArticles, setLatestArticles] = useState<any[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [monthlyArticlesData, setMonthlyArticlesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Articles Counts (Total, Published, Drafts)
        const articlesRef = collection(db, "articles");
        const [
          articlesSnap,
          publishedSnap,
          draftSnap,
          teamSnap,
        ] = await Promise.all([
          getCountFromServer(articlesRef).catch(() => ({ data: () => ({ count: 0 }) })),
          getCountFromServer(query(articlesRef, where("publish", "==", true))).catch(() => ({ data: () => ({ count: 0 }) })),
          getCountFromServer(query(articlesRef, where("publish", "==", false))).catch(() => ({ data: () => ({ count: 0 }) })),
          getCountFromServer(collection(db, "authors")).catch(() => ({ data: () => ({ count: 0 }) })),
        ]);

        setArticlesCount(articlesSnap.data().count);
        setPublishedCount(publishedSnap.data().count);
        setDraftCount(draftSnap.data().count);
        setTeamCount(teamSnap.data().count);

        // 2. Trash Count (Admins/Superadmins only)
        if (userRole === "admin" || userRole === "super") {
          try {
            const trashSnap = await getCountFromServer(collection(db, "articleTrash"));
            setTrashCount(trashSnap.data().count);
          } catch {
            setTrashCount(0);
          }
        }

        // 3. Readers & Community Counts
        const usersRef = collection(db, "users");
        const commentsRef = collection(db, "comments");
        const repliesRef = collection(db, "commentReplies");

        const [
          usersCountSnap,
          claimedCountSnap,
          commentsCountSnap,
          repliesCountSnap,
        ] = await Promise.all([
          getCountFromServer(usersRef).catch(() => ({ data: () => ({ count: 0 }) })),
          getCountFromServer(query(usersRef, where("handle", "!=", ""))).catch(() => ({ data: () => ({ count: 0 }) })),
          getCountFromServer(commentsRef).catch(() => ({ data: () => ({ count: 0 }) })),
          getCountFromServer(repliesRef).catch(() => ({ data: () => ({ count: 0 }) })),
        ]);

        setReadersCount(usersCountSnap.data().count);
        setClaimedHandlesCount(claimedCountSnap.data().count);
        setCommentsCount(commentsCountSnap.data().count);
        setRepliesCount(repliesCountSnap.data().count);

        // 4. Fetch YouTube Stats from meta/stats
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
        } catch (err) {
          console.error("Error fetching YouTube stats:", err);
        }

        // 5. Fetch Latest Articles (limit 4)
        const latestArticlesQuery = query(
          articlesRef,
          orderBy("createdAt", "desc"),
          limit(4),
        );
        const latestArticlesSnap = await getDocs(latestArticlesQuery).catch(() => null);
        if (latestArticlesSnap) {
          const articlesList = latestArticlesSnap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
          setLatestArticles(articlesList);
        }

        // 6. Fetch Recent Registered Readers (limit 4)
        try {
          const recentUsersQuery = query(
            usersRef,
            orderBy("createdAt", "desc"),
            limit(4),
          );
          const recentUsersSnap = await getDocs(recentUsersQuery);
          const usersList = recentUsersSnap.docs.map((docSnap) => ({
            uid: docSnap.id,
            ...docSnap.data(),
          })) as RecentUser[];
          setRecentUsers(usersList);
        } catch (err) {
          console.warn("Unable to load recent readers list:", err);
        }

        // 7. Fetch Articles for the last 6 months for Chart
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const articlesForChartQuery = query(
          articlesRef,
          where("date", ">=", Timestamp.fromDate(startDate)),
          orderBy("date", "asc"),
        );
        const chartSnap = await getDocs(articlesForChartQuery).catch(() => null);
        const monthlyCounts: { [key: string]: number } = {};

        if (chartSnap) {
          chartSnap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.date && data.publish) {
              const date = data.date.toDate();
              const month = date.toLocaleString("en-US", {
                month: "short",
                year: "numeric",
              });
              monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
            }
          });
        }

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
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userRole]);

  const StatCardSkeleton = () => (
    <div className="border border-white/10 bg-[#141414] p-5 animate-pulse">
      <div className="h-4 bg-white/10 w-1/3 mb-3"></div>
      <div className="h-8 bg-white/15 w-1/2"></div>
    </div>
  );

  return (
    <div className="w-full space-y-8 pb-16">
      {/* Full width PageTitle spanning the entire header */}
      <div className="w-full">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/Dashboard.svg"
          imgAlt="Dashboard"
        >
          Dashboard
        </PageTitle>
      </div>

      {/* Action Shortcuts Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="sm" className="bg-[#8a2ae3] hover:bg-[#7823c9] text-white">
            <Link href="/admin/articles/new">
              <Plus className="mr-1.5 h-4 w-4" /> New Post
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="border-white/20 bg-white/5 hover:bg-white/10 text-white">
            <Link href="/admin/handles">
              <AtSign className="mr-1.5 h-4 w-4 text-[#8a2ae3]" /> Handles
            </Link>
          </Button>
        </div>
      </div>

      {/* Analytics Overview - Google Analytics 4 */}
      <div className="border border-white/10 bg-[#141414]">
        <AnalyticsOverview />
      </div>

      {/* SECTION 1: Community & Audience Metrics */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-[#8a2ae3]" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            Community & Readers
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {loading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <div className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider">Registered Readers</span>
                  <Users className="h-4 w-4 text-[#8a2ae3]" />
                </div>
                <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
                  {readersCount.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-white/40">Total public accounts</p>
              </div>

              <div className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider">Active Handles</span>
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
                  {claimedHandlesCount.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-emerald-400/80">Onboarded comment handles</p>
              </div>

              <div className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider">Comments</span>
                  <MessageSquare className="h-4 w-4 text-[#8a2ae3]" />
                </div>
                <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
                  {commentsCount.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-white/40">Total top-level comments</p>
              </div>

              <div className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider">Replies</span>
                  <MessageCircle className="h-4 w-4 text-[#8a2ae3]" />
                </div>
                <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
                  {repliesCount.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-white/40">Threaded discussion replies</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SECTION 2: Editorial & Publication Metrics */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-[#8a2ae3]" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            Editorial & Articles
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {loading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <div className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider">All Posts</span>
                  <FileText className="h-4 w-4 text-white/60" />
                </div>
                <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
                  {articlesCount}
                </p>
                <p className="mt-1 text-[11px] text-white/40">Total created articles</p>
              </div>

              <div className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider">Published</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
                <p className="font-mono text-2xl font-bold text-emerald-400 sm:text-3xl">
                  {publishedCount}
                </p>
                <p className="mt-1 text-[11px] text-white/40">Live on website</p>
              </div>

              <div className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider">Drafts</span>
                  <FileEdit className="h-4 w-4 text-amber-400" />
                </div>
                <p className="font-mono text-2xl font-bold text-amber-400 sm:text-3xl">
                  {draftCount}
                </p>
                <p className="mt-1 text-[11px] text-white/40">Unpublished drafts</p>
              </div>

              <div className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider">Team Authors</span>
                  <Users className="h-4 w-4 text-[#8a2ae3]" />
                </div>
                <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
                  {teamCount}
                </p>
                <p className="mt-1 text-[11px] text-white/40">Staff contributors</p>
              </div>

              <Link
                href="/admin/articles/trash"
                className="border border-white/10 bg-[#141414] p-5 transition-colors hover:border-red-500/40 hover:bg-red-500/5 group"
              >
                <div className="flex items-center justify-between text-white/45 mb-2">
                  <span className="text-xs uppercase font-medium tracking-wider group-hover:text-red-300">In Trash</span>
                  <Trash2 className="h-4 w-4 text-red-400/80 group-hover:text-red-300" />
                </div>
                <p className="font-mono text-2xl font-bold text-white group-hover:text-red-200 sm:text-3xl">
                  {trashCount}
                </p>
                <p className="mt-1 text-[11px] text-white/40 group-hover:text-red-300/70">Archived posts</p>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* SECTION 3: YouTube & Channel Stats */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Youtube className="h-4 w-4 text-[#FF0000]" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            YouTube Channel
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border border-white/10 bg-[#141414] p-5">
            <div className="flex items-center justify-between text-white/45 mb-2">
              <span className="text-xs uppercase font-medium tracking-wider">Subscribers</span>
              <Youtube className="h-4 w-4 text-[#FF0000]" />
            </div>
            <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
              {subscriberCount !== null ? subscriberCount.toLocaleString() : "..."}
            </p>
            <p className="mt-1 text-[11px] text-white/40">Channel followers</p>
          </div>

          <div className="border border-white/10 bg-[#141414] p-5">
            <div className="flex items-center justify-between text-white/45 mb-2">
              <span className="text-xs uppercase font-medium tracking-wider">Total Views</span>
              <TrendingUp className="h-4 w-4 text-white/60" />
            </div>
            <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
              {viewCount !== null ? viewCount.toLocaleString() : "..."}
            </p>
            <p className="mt-1 text-[11px] text-white/40">All-time video views</p>
          </div>

          <div className="border border-white/10 bg-[#141414] p-5">
            <div className="flex items-center justify-between text-white/45 mb-2">
              <span className="text-xs uppercase font-medium tracking-wider">Published Videos</span>
              <Sparkles className="h-4 w-4 text-amber-400" />
            </div>
            <p className="font-mono text-2xl font-bold text-white sm:text-3xl">
              {videoCount !== null ? videoCount.toLocaleString() : "..."}
            </p>
            <p className="mt-1 text-[11px] text-white/40">Video catalog</p>
          </div>
        </div>
      </div>

      {/* Monthly Articles Chart */}
      <div className="border border-white/10 bg-[#141414] p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white">Publishing Velocity</h2>
            <p className="text-xs text-white/45">Monthly post distribution over the last 6 months</p>
          </div>
        </div>
        {loading ? (
          <div className="h-[280px] w-full bg-white/5 animate-pulse rounded" />
        ) : (
          <div className="w-full h-[280px]">
            <ResponsiveContainer>
              <BarChart data={monthlyArticlesData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255, 255, 255, 0.08)"
                />
                <XAxis
                  dataKey="month"
                  stroke="#a3a3a3"
                  fontSize={12}
                  interval="preserveStartEnd"
                />
                <YAxis stroke="#a3a3a3" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#121212",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "4px",
                  }}
                  labelStyle={{ color: "#ffffff", fontWeight: "bold" }}
                />
                <Legend wrapperStyle={{ color: "#ffffff", fontSize: "12px" }} />
                <Bar
                  dataKey="articles"
                  fill="#8a2ae3"
                  radius={[4, 4, 0, 0]}
                  name="Posts Published"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* SECTION 4: Dual Activity Feeds (Latest Posts & Recent Readers) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Latest Articles Feed */}
        <div className="border border-white/10 bg-[#141414] p-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Latest Posts</h2>
            </div>
            <Link
              href="/admin/articles"
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-white/60 transition-colors hover:text-[#8a2ae3]"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-4 animate-pulse">
                  <div className="h-14 w-14 bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-white/15 w-3/4" />
                    <div className="h-3 bg-white/10 w-1/2" />
                  </div>
                </div>
              ))
            ) : latestArticles.length > 0 ? (
              latestArticles.map((article) => (
                <div
                  key={article.id}
                  className="flex items-center gap-4 py-3.5 group"
                >
                  <img
                    src={
                      article.img ||
                      "/images/articles/preview/an-indestructible-hope.jpg"
                    }
                    alt={article.imgAlt || "Thumbnail"}
                    className="h-14 w-14 object-cover border border-white/10 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/articles/${article.id}`}
                        className="font-medium text-white truncate hover:text-[#8a2ae3] transition-colors"
                      >
                        {article.title}
                      </Link>
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 shrink-0 ${
                          article.publish
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                        }`}
                      >
                        {article.publish ? "Live" : "Draft"}
                      </span>
                    </div>
                    <p className="text-xs text-white/45 mt-0.5 truncate">
                      By {article.authorName || "Author"} &bull;{" "}
                      {article.createdAt?.toDate?.()
                        ? article.createdAt.toDate().toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Recent"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-white/50 text-center">No articles created yet.</p>
            )}
          </div>
        </div>

        {/* Recent Registered Readers Feed */}
        <div className="border border-white/10 bg-[#141414] p-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Recent Readers</h2>
            </div>
            <Link
              href="/admin/handles"
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-white/60 transition-colors hover:text-[#8a2ae3]"
            >
              <span>Manage handles</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-4 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-white/15 w-1/2" />
                    <div className="h-3 bg-white/10 w-1/3" />
                  </div>
                </div>
              ))
            ) : recentUsers.length > 0 ? (
              recentUsers.map((reader) => {
                const hasHandle = Boolean(reader.handle && reader.handle.trim());
                const initial = hasHandle
                  ? reader.handle!.slice(0, 2).toUpperCase()
                  : reader.displayName
                    ? reader.displayName.slice(0, 2).toUpperCase()
                    : reader.email
                      ? reader.email.slice(0, 2).toUpperCase()
                      : "R";

                return (
                  <div
                    key={reader.uid}
                    className="flex items-center justify-between py-3.5 gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {reader.photoURL ? (
                        <img
                          src={reader.photoURL}
                          alt="Reader Avatar"
                          className="h-10 w-10 rounded-full object-cover border border-white/15 shrink-0"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg?height=40&width=40";
                          }}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/60 text-xs shrink-0 font-bold">
                          {initial}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {hasHandle ? (
                            <span className="font-semibold text-white truncate text-sm">
                              @{reader.handle}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium text-white/85 truncate text-sm">
                                {reader.displayName || (reader.email ? reader.email.split("@")[0] : "New reader")}
                              </span>
                              <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded shrink-0">
                                No handle yet
                              </span>
                            </div>
                          )}

                          {reader.provider && (
                            <span className="text-[10px] uppercase font-bold text-white/40 px-1 py-0.2 border border-white/15 rounded shrink-0">
                              {reader.provider === "google.com" ? "Google" : "Email"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/45 truncate mt-0.5">
                          {reader.email || "No email provided"}
                        </p>
                      </div>
                    </div>

                    <span className="text-xs text-white/40 shrink-0 font-mono">
                      {reader.createdAt?.toDate?.()
                        ? reader.createdAt.toDate().toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "Recent"}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-sm text-white/50 text-center">No readers registered yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
