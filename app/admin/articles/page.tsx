"use client";

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Article {
  id: string;
  title: string;
  authorName: string;
  createdAt?: any; // Firestore timestamp
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    const fetchArticles = async () => {
      const snap = await getDocs(collection(db, "articles"));
      const docs = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Article[];
      setArticles(docs);
    };
    fetchArticles();
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Articles</h1>
        <Link
          href="/admin/articles/new"
          className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded"
        >
          + New Article
        </Link>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="p-2">Title</th>
            <th className="p-2">Author</th>
            <th className="p-2">Created</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((article) => (
            <tr key={article.id} className="border-b border-gray-700">
              <td className="p-2">{article.title}</td>
              <td className="p-2">{article.authorName}</td>
              <td className="p-2">
                {article.createdAt?.toDate?.().toLocaleString() ?? ""}
              </td>
              <td className="p-2">
                <Link
                  href={`/admin/articles/${article.id}`}
                  className="mr-2 text-blue-400 hover:underline"
                >
                  View/Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
