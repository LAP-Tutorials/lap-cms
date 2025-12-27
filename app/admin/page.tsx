"use client"

import { useEffect, useState } from "react"
import PageTitle from "@/components/PageTitle"
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview"

export default function AdminDashboardPage() {
  const [articlesCount, setArticlesCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [newsCount, setNewsCount] = useState(0)

  const [latestArticles, setLatestArticles] = useState<any[]>([])
  const [latestNews, setLatestNews] = useState<any[]>([])
  const [monthlyArticlesData, setMonthlyArticlesData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch counts
      const articlesSnap = await getDocs(collection(db, "articles"))
      setArticlesCount(articlesSnap.size)

      const teamSnap = await getDocs(collection(db, "authors"))
      setTeamCount(teamSnap.size)

      const newsSnap = await getDocs(collection(db, "news"))
      setNewsCount(newsSnap.size)

      // 2. Fetch latest articles (limit 3, order by createdAt desc)
      const latestArticlesQuery = query(collection(db, "articles"), orderBy("createdAt", "desc"), limit(3))
      const latestArticlesSnap = await getDocs(latestArticlesQuery)
      const articlesList = latestArticlesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      setLatestArticles(articlesList)

      // 3. Fetch latest news (limit 3, order by createdAt desc)
      const latestNewsQuery = query(collection(db, "news"), orderBy("createdAt", "desc"), limit(3))
      const latestNewsSnap = await getDocs(latestNewsQuery)
      const newsList = latestNewsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      setLatestNews(newsList)

      // 4. Fetch articles for the last 6 months for chart
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      const articlesForChartQuery = query(
        collection(db, "articles"),
        where("createdAt", ">=", Timestamp.fromDate(sixMonthsAgo)),
        orderBy("createdAt", "asc"),
      )
      const chartSnap = await getDocs(articlesForChartQuery)
      const monthlyCounts: { [key: string]: number } = {}

      chartSnap.docs.forEach((doc) => {
        const data = doc.data()
        if (data.createdAt) {
          const date = data.createdAt.toDate()
          const month = date.toLocaleString("default", { month: "short", year: "2-digit" })
          monthlyCounts[month] = (monthlyCounts[month] || 0) + 1
        }
      })

      // Prepare data for the chart, ensuring we have entries for the last 6 months
      const chartData = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const monthKey = d.toLocaleString("default", { month: "short", year: "2-digit" })
        chartData.push({
          month: monthKey,
          articles: monthlyCounts[monthKey] || 0,
        })
      }
      setMonthlyArticlesData(chartData)

      setLoading(false)
    }

    fetchData()
  }, [])

  // Skeleton for a summary card
  const SummaryCardSkeleton = () => (
    <div className="p-4 border border-neutral-800 rounded animate-pulse">
      <div className="h-6 bg-gray-700 rounded w-1/2 mb-2"></div>
      <div className="h-8 bg-gray-700 rounded w-1/3"></div>
    </div>
  )

  // Skeleton for a list item (article) with thumbnail
  const ListItemSkeleton = () => (
    <div className="flex items-center gap-4 border-b border-neutral-800 py-5 animate-pulse">
      <div className="w-16 h-16 bg-gray-700 rounded"></div>
      <div className="flex-1">
        <div className="h-6 bg-gray-700 rounded w-3/4 mb-1"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2"></div>
      </div>
    </div>
  )

  const ChartSkeleton = () => (
    <div className="h-[300px] w-full bg-gray-800 animate-pulse rounded p-4">
      <div className="h-full w-full bg-gray-700 rounded"></div>
    </div>
  )

  return (
    <div>
      <div className="mt-10 md:-mt-8">
        <PageTitle className="sr-only" imgSrc="/images/titles/Dashboard.svg" imgAlt="Dashboard">
          Dashboard
        </PageTitle>
      </div>

      {/* Responsive Summary cards */}
      {/* Analytics Overview - Full Width */ }
      <div className="mb-8 mt-10 w-full md:w-[95%] mx-auto">
        <AnalyticsOverview /> 
      </div>

      {/* Responsive Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-19 w-full md:w-[95%] mx-auto">
        {loading ? (
          <>
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
          </>
        ) : (
          <>
            <div className="p-4 border border-neutral-800">
              <h2 className="text-lg font-bold">Articles</h2>
              <p className="text-xl">{articlesCount}</p>
            </div>
            <div className="p-4 border border-neutral-800">
              <h2 className="text-lg font-bold">Members</h2>
              <p className="text-xl">{teamCount}</p>
            </div>
            <div className="p-4 border border-neutral-800">
              <h2 className="text-lg font-bold">News Items</h2>
              <p className="text-xl">{newsCount}</p>
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis dataKey="month" stroke="#fff" />
                <YAxis stroke="#fff" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                  }}
                  labelStyle={{ color: "#fff" }}
                />
                <Legend wrapperStyle={{ color: "#fff" }} />
                <Bar dataKey="articles" fill="#8a2be2" name="Posts Published" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Latest Articles */}
      <div className="mb-20 md:ml-5">
        <h2 className="text-subtitle font-bold mb-5">Latest Posts</h2>
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => <ListItemSkeleton key={index} />)
        ) : latestArticles.length > 0 ? (
          latestArticles.map((article) => (
            <div key={article.id} className="flex items-center gap-4 border-b border-white/20 py-5">
              <img src={article.img || "/images/articles/preview/an-indestructible-hope.jpg"} alt={article.imgAlt || "Thumbnail"} className="w-22 object-cover" />
              <div>
                <p className="font-semibold text-xl mb-1">{article.title}</p>
                <p className="text-sm text-white/50">
                  By {article.authorName} • {article.createdAt?.toDate?.().toLocaleString()}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p>No articles found.</p>
        )}
      </div>

      {/* Latest News */}
      <div className="mb-15 md:ml-5">
        <h2 className="text-subtitle font-bold mb-5">Latest News</h2>
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => <ListItemSkeleton key={index} />)
        ) : latestNews.length > 0 ? (
          latestNews.map((newsItem) => (
            <div key={newsItem.id} className="border-b border-white/20 py-5">
              <p className="font-semibold text-lg mb-1">{newsItem.title}</p>
              <p className="text-sm text-white/50">{newsItem.createdAt?.toDate?.().toLocaleString?.()}</p>
            </div>
          ))
        ) : (
          <p>No news found.</p>
        )}
      </div>
    </div>
  )
}
