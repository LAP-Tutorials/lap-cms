"use client";

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEffect, useState } from "react";
import Link from "next/link";

interface NewsItem {
  id: string;
  title: string;
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    const fetchNews = async () => {
      const snap = await getDocs(collection(db, "news"));
      const docs = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as NewsItem[];
      setNews(docs);
    };
    fetchNews();
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">News</h1>
        <Link
          href="/admin/news/new"
          className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded"
        >
          + New News
        </Link>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="p-2">Title</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {news.map((item) => (
            <tr key={item.id} className="border-b border-gray-700">
              <td className="p-2">{item.title}</td>
              <td className="p-2">
                <Link
                  href={`/admin/news/${item.id}`}
                  className="mr-2 text-blue-400 hover:underline"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
