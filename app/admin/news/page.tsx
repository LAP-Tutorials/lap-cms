"use client";

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageTitle from "@/components/PageTitle";

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
    <div className="ml-0 md:ml-3">
      <div className="flex justify-between items-center mb-4">
        <PageTitle
          className="sr-only mt-10 md:-mt-8"
          imgSrc="/images/titles/news.svg"
          imgAlt="Dashboard"
        >
          News
        </PageTitle>
      </div>
      <div className="mt-4 mb-9">
        <Link
          href="/admin/news/new"
          className="new-article-btn px-8 py-3 font-semibold inline-block"
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
            <tr key={item.id} className="border-b border-white/20">
              <td className="p-2">{item.title}</td>
              <td className="p-2 whitespace-nowrap pb-4 pt-4">
                <Link
                  href={`/admin/news/${item.id}`}
                  className="new-article-btn px-4 py-2 mr-4 transition duration-300"
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
