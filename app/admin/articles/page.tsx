"use client";

import { collection, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { useEffect, useState } from "react";
import PageTitle from "@/components/PageTitle";
import { FaArrowUp, FaArrowDown } from "react-icons/fa";

interface Article {
  id: string;
  title: string;
  authorName: string;
  createdAt?: any;
  publish: boolean;
  img: string;
  slug: string;
  label: string;
}

type SortField = "title" | "authorName" | "createdAt" | "publish" | "label";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Toggle the publish status
  const togglePublish = async (articleId: string, currentStatus: boolean) => {
    try {
      const articleRef = doc(db, "articles", articleId);
      await updateDoc(articleRef, { publish: !currentStatus });
      setArticles((prevArticles) =>
        prevArticles.map((article) =>
          article.id === articleId
            ? { ...article, publish: !currentStatus }
            : article
        )
      );
    } catch (error) {
      console.error("Error updating publish status:", error);
    }
  };

  // Delete an article after confirmation
  const deleteArticle = async (articleId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this article?");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "articles", articleId));
      setArticles((prevArticles) =>
        prevArticles.filter((article) => article.id !== articleId)
      );
    } catch (error) {
      console.error("Error deleting article:", error);
    }
  };

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

  // Sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Filter and sort articles
  const filteredArticles = articles
    .filter((article) => {
      const term = searchTerm.toLowerCase();
      return (
        article.title.toLowerCase().includes(term) ||
        article.authorName.toLowerCase().includes(term) ||
        article.label.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === "createdAt") {
        aVal = aVal?.toDate?.() ?? new Date(0);
        bVal = bVal?.toDate?.() ?? new Date(0);
      }
      if (sortField === "publish") {
        aVal = aVal ? 1 : 0;
        bVal = bVal ? 1 : 0;
      }
      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  // Render sort icons for the active column
  const renderSortIcon = (field: SortField) => {
    if (sortField === field) {
      return sortOrder === "asc" ? (
        <FaArrowUp className="inline ml-1" />
      ) : (
        <FaArrowDown className="inline ml-1" />
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen text-white overflow-x-hidden w-full">
      {/* Header */}
      <div className="w-full px-4">
        <div className="mt-10 md:-mt-8">
          <PageTitle
            className="sr-only"
            imgSrc="/images/titles/posts.svg"
            imgAlt="Dashboard"
          >
            L.A.P CMS
          </PageTitle>
        </div>
        <div className="mt-4">
          <Link
            href="/admin/articles/new"
            className="new-article-btn px-8 py-3 font-semibold inline-block"
          >
            + New Posts
          </Link>
        </div>
        {/* Search Bar */}
        <div className="mt-5">
          <input
            type="text"
            placeholder="Search by title, author, or label..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-white/20 text-white outline-none w-full"
          />
        </div>
      </div>

      {/* Scrollable table area */}
      <div className="px-4 pb-4 mt-5">
        {/* Only the table container scrolls horizontally on mobile */}
        <div className="overflow-x-auto">
          <table className="min-w-[800px] md:w-full text-left">
            <thead>
              <tr>
                <th className="p-2 whitespace-nowrap">Image</th>
                <th className="p-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("title")}>
                  Title {renderSortIcon("title")}
                </th>
                <th className="p-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("label")}>
                  Label {renderSortIcon("label")}
                </th>
                <th className="p-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("authorName")}>
                  Author {renderSortIcon("authorName")}
                </th>
                <th className="p-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("createdAt")}>
                  Created {renderSortIcon("createdAt")}
                </th>
                <th className="p-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("publish")}>
                  Publish {renderSortIcon("publish")}
                </th>
                <th className="p-2 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((article) => (
                <tr key={article.id} className="border-b border-white/20">
                  {/* Thumbnail */}
                  <td className="p-2 whitespace-nowrap">
                    <img
                      src={article.img}
                      alt={article.title}
                      className="w-20 object-cover"
                    />
                  </td>
                  {/* Title */}
                  <td className="p-2 whitespace-nowrap">{article.title}</td>
                  {/* Label */}
                  <td className="p-2 whitespace-nowrap">{article.label}</td>
                  {/* Author */}
                  <td className="p-2 whitespace-nowrap">{article.authorName}</td>
                  {/* Created Date */}
                  <td className="p-2 whitespace-nowrap">
                    {article.createdAt?.toDate?.().toLocaleString() ?? ""}
                  </td>
                  {/* Publish Toggle */}
                  <td className="p-2 whitespace-nowrap">
                    <button
                      onClick={() => togglePublish(article.id, article.publish)}
                      className="px-2 py-1 text-white transition duration-300"
                    >
                      {article.publish ? "Published" : "Unpublished"}
                    </button>
                  </td>
                  {/* Actions */}
                  <td className="p-2 space-x-2 whitespace-nowrap">
                    <Link
                      href={`https://lap-docs.netlify.app/posts/${article.slug}`}
                      target="_blank"
                      className="new-article-btn px-4 py-2 mr-4 transition duration-300"
                    >
                      View
                    </Link>
                    <Link
                      href={`/admin/articles/${article.id}`}
                      className="new-article-btn px-4 py-2 mr-4 transition duration-300"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => deleteArticle(article.id)}
                      className="px-4 py-2 transition duration-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredArticles.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-white/50">
                    No articles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
