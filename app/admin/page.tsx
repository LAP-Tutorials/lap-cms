"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminDashboardPage() {
  const [articlesCount, setArticlesCount] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [newsCount, setNewsCount] = useState(0);

  const [latestArticles, setLatestArticles] = useState<any[]>([]);
  const [latestNews, setLatestNews] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch counts
      const articlesSnap = await getDocs(collection(db, "articles"));
      setArticlesCount(articlesSnap.size);

      const teamSnap = await getDocs(collection(db, "authors"));
      setTeamCount(teamSnap.size);

      const newsSnap = await getDocs(collection(db, "news"));
      setNewsCount(newsSnap.size);

      // 2. Fetch latest articles (limit 3, order by createdAt desc)
      const latestArticlesQuery = query(
        collection(db, "articles"),
        orderBy("createdAt", "desc"),
        limit(3)
      );
      const latestArticlesSnap = await getDocs(latestArticlesQuery);
      const articlesList = latestArticlesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLatestArticles(articlesList);

      // 3. Fetch latest news (limit 3, order by createdAt desc)
      const latestNewsQuery = query(
        collection(db, "news"),
        orderBy("createdAt", "desc"),
        limit(3)
      );
      const latestNewsSnap = await getDocs(latestNewsQuery);
      const newsList = latestNewsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLatestNews(newsList);
    };

    fetchData();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 border border-gray-700 rounded">
          <h2 className="text-lg font-semibold">Total Articles</h2>
          <p className="text-2xl">{articlesCount}</p>
        </div>
        <div className="p-4 border border-gray-700 rounded">
          <h2 className="text-lg font-semibold">Total Team Members</h2>
          <p className="text-2xl">{teamCount}</p>
        </div>
        <div className="p-4 border border-gray-700 rounded">
          <h2 className="text-lg font-semibold">Total News Items</h2>
          <p className="text-2xl">{newsCount}</p>
        </div>
      </div>

      {/* Latest Articles */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-2">Latest Articles</h2>
        {latestArticles.map((article) => (
          <div key={article.id} className="border-b border-gray-700 py-2">
            <p className="font-semibold">{article.title}</p>
            <p className="text-sm text-gray-400">
              {article.createdAt?.toDate?.().toLocaleString()}
            </p>
          </div>
        ))}
        {latestArticles.length === 0 && <p>No articles found.</p>}
      </div>

      {/* Latest News */}
      <div>
        <h2 className="text-xl font-bold mb-2">Latest News</h2>
        {latestNews.map((newsItem) => (
          <div key={newsItem.id} className="border-b border-gray-700 py-2">
            <p className="font-semibold">{newsItem.title}</p>
            <p className="text-sm text-gray-400">
              {newsItem.createdAt?.toDate?.().toLocaleString?.()}
            </p>
          </div>
        ))}
        {latestNews.length === 0 && <p>No news found.</p>}
      </div>
    </div>
  );
}
