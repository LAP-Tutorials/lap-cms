"use client";

import { orderBy, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import PageTitle from "@/components/PageTitle";
import {
  ArrowUp,
  ArrowDown,
  Search,
  Eye,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Breadcrumb } from "@/components/breadcrumb";
import { formatDate } from "@/lib/utils";
import {
  usePaginatedCollection,
  useUpdateDocument,
} from "@/hooks/use-firestore-query";
import { moveArticleToTrash } from "@/lib/article-trash";

interface Article {
  id: string;
  title: string;
  authorName: string;
  createdAt?: any;
  date?: any; // Published date
  scheduledPublishDate?: any; // Scheduled published date
  publish: boolean;
  img: string;
  slug: string;
  label: string;
}

const getArticleViewConfig = (article: Article) => {
  const hasPublicView = article.publish && Boolean(article.slug);

  if (hasPublicView) {
    return {
      href: `https://lap-docs.netlify.app/posts/${article.slug}`,
      title: "View live article",
    };
  }

  return {
    href: `/admin/articles/${article.id}/preview`,
    title: article.scheduledPublishDate
      ? "Preview scheduled article"
      : "Preview draft article",
  };
};

type SortField =
  | "title"
  | "authorName"
  | "createdAt"
  | "publish"
  | "label"
  | "date";

export default function ArticlesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(
    null,
  );

  const { toast } = useToast();
  const updateArticle = useUpdateDocument("articles");

  // Set up query constraints based on sort field and order
  const getConstraints = () => {
    const constraints = [];

    if (sortField) {
      constraints.push(orderBy(sortField, sortOrder));
    } else {
      constraints.push(orderBy("createdAt", "desc"));
    }

    return constraints;
  };

  // Use the paginated collection hook
  const {
    items: articles,
    loading,
    hasMore,
    loadMore,
    refresh,
  } = usePaginatedCollection("articles", 20, getConstraints());

  // Toggle the publish status
  const togglePublish = async (articleId: string, currentStatus: boolean) => {
    try {
      const updateData: any = { publish: !currentStatus };

      // If publishing (currentStatus is false -> true), update the date
      if (!currentStatus) {
        updateData.date = serverTimestamp();
      }

      await updateArticle.mutateAsync({
        id: articleId,
        data: updateData,
      });

      // Force refresh the articles list after toggling publish status
      refresh();

      toast({
        title: "Status updated",
        description: `Article is now ${
          !currentStatus ? "published" : "unpublished"
        }`,
        variant: "success",
      });
    } catch (error) {
      console.error("Error updating publish status:", error);
      toast({
        title: "Error",
        description: "Failed to update article status",
        variant: "destructive",
      });
    }
  };

  // Delete article
  const confirmDelete = (articleId: string) => {
    if (
      window.confirm(
        "Move this article to the recycle bin? You can restore it later."
      )
    ) {
      deleteArticle(articleId);
    }
  };

  const deleteArticle = async (articleId: string) => {
    setDeletingArticleId(articleId);
    try {
      await moveArticleToTrash(articleId);

      toast({
        title: "Article moved",
        description: "The article is now in the recycle bin",
        variant: "success",
      });

      refresh(); // Refresh the list after deletion
    } catch (error) {
      console.error("Error deleting article:", error);
      toast({
        title: "Error",
        description: "Failed to delete article",
        variant: "destructive",
      });
    } finally {
      setDeletingArticleId(null);
    }
  };

  // Sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Effect to refresh data when sort parameters change
  useEffect(() => {
    // Add console log to verify when this effect runs
    console.log("Sort parameters changed, refreshing data", {
      sortField,
      sortOrder,
    });
    refresh();
  }, [sortField, sortOrder]);

  // Filter articles based on search term
  const filteredArticles = articles.filter((article) => {
    const term = searchTerm.toLowerCase();
    const articleData = article as Article;
    return (
      articleData.title?.toLowerCase().includes(term) ||
      articleData.authorName?.toLowerCase().includes(term) ||
      articleData.label?.toLowerCase().includes(term)
    );
  });

  // Render sort icons for the active column
  const renderSortIcon = (field: SortField) => {
    if (sortField === field) {
      return sortOrder === "asc" ? (
        <ArrowUp className="inline ml-1 h-4 w-4" />
      ) : (
        <ArrowDown className="inline ml-1 h-4 w-4" />
      );
    }
    return null;
  };

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Articles" },
  ];

  return (
    <div className="min-h-screen text-white overflow-x-hidden w-full">
      {/* Header */}
      <div className="w-full px-4 pt-4 md:pt-0">
        <div className="mb-2 mt-6 md:mt-0">
          <Breadcrumb items={breadcrumbItems} />
        </div>

        <div className="mt-4">
          <PageTitle
            className="sr-only"
            imgSrc="/images/titles/posts.svg"
            imgAlt="Dashboard"
          >
            L.A.P CMS
          </PageTitle>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/admin/articles/new">
                <Plus className="mr-2 h-4 w-4" /> New Post
              </Link>
            </Button>
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/admin/articles/trash">
                <Trash2 className="mr-2 h-4 w-4" /> Recycle Bin
              </Link>
            </Button>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64 md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
            <Input
              type="text"
              placeholder="Search articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Scrollable table area */}
      <div className="px-4 pb-4 mt-6">
        {loading && articles.length === 0 ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2ae3]"></div>
            <span className="ml-3">Loading articles...</span>
          </div>
        ) : (
          <div className="overflow-x-auto border border-white/10 rounded-none">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="p-4 text-left font-medium text-white/70 whitespace-nowrap">
                    Image
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("title")}
                  >
                    Title {renderSortIcon("title")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("label")}
                  >
                    Label {renderSortIcon("label")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("authorName")}
                  >
                    Author {renderSortIcon("authorName")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("createdAt")}
                  >
                    Created {renderSortIcon("createdAt")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("date")}
                  >
                    Published {renderSortIcon("date")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("publish")}
                  >
                    Status {renderSortIcon("publish")}
                  </th>
                  <th className="p-4 text-left font-medium text-white/70 whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredArticles.map((article) => {
                  const articleData = article as Article;
                  const articleView = getArticleViewConfig(articleData);
                  return (
                    <tr key={articleData.id} className="hover:bg-white/5">
                      {/* Thumbnail */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="w-28 h-16 overflow-hidden">
                          <img
                            src={
                              articleData.img ||
                              "/images/articles/preview/an-indestructible-hope.jpg"
                            }
                            alt={articleData.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src =
                                "/images/articles/preview/an-indestructible-hope.jpg";
                            }}
                          />
                        </div>
                      </td>
                      {/* Title */}
                      <td className="p-4 whitespace-nowrap font-medium">
                        {articleData.title}
                      </td>
                      {/* Label */}
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-1 bg-white/10 text-xs rounded-none">
                          {articleData.label || "Uncategorized"}
                        </span>
                      </td>
                      {/* Author */}
                      <td className="p-4 whitespace-nowrap">
                        {articleData.authorName}
                      </td>
                      {/* Created Date */}
                      <td className="p-4 whitespace-nowrap">
                        {formatDate(articleData.createdAt?.toDate?.())}
                      </td>
                      {/* Published Date */}
                      <td className="p-4 whitespace-nowrap">
                        {articleData.publish && articleData.date ? (
                          formatDate(
                            articleData.date.toDate?.() || articleData.date
                          )
                        ) : articleData.scheduledPublishDate ? (
                          <span className="text-orange-400">
                            {formatDate(
                              articleData.scheduledPublishDate.toDate?.() ||
                                articleData.scheduledPublishDate
                            )}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      {/* Publish Toggle */}
                      <td className="p-4 whitespace-nowrap">
                        <Button
                          onClick={() =>
                            togglePublish(articleData.id, articleData.publish)
                          }
                          variant={
                            articleData.publish ? "default" : "secondary"
                          }
                          size="sm"
                          disabled={updateArticle.isPending}
                          className={
                            !articleData.publish &&
                            articleData.scheduledPublishDate
                              ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                              : ""
                          }
                        >
                          {articleData.publish
                            ? "Published"
                            : articleData.scheduledPublishDate
                            ? "Scheduled"
                            : "Draft"}
                        </Button>
                      </td>
                      {/* Actions */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <Button asChild size="icon" variant="ghost">
                            <Link
                              href={articleView.href}
                              target="_blank"
                              rel="noreferrer"
                              title={articleView.title}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button asChild size="icon" variant="ghost">
                            <Link
                              href={`/admin/articles/${articleData.id}`}
                              title="Edit article"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-500"
                            onClick={() => confirmDelete(articleData.id)}
                            title="Move article to recycle bin"
                            disabled={deletingArticleId !== null}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredArticles.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-white/50">
                      {searchTerm
                        ? "No matching articles found."
                        : "No articles found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Load more button */}
        {hasMore && filteredArticles.length > 0 && (
          <div className="flex justify-center mt-4">
            <Button onClick={loadMore} variant="outline" disabled={loading}>
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-[#8a2ae3] mr-2"></div>
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
