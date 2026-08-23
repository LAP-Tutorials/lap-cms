"use client";

import Link from "next/link";
import { orderBy } from "firebase/firestore";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import { usePaginatedCollection } from "@/hooks/use-firestore-query";
import { useToast } from "@/hooks/use-toast";
import {
  ARTICLE_TRASH_COLLECTION,
  permanentlyDeleteArticle,
  restoreArticleFromTrash,
} from "@/lib/article-trash";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { logAuditActivity } from "@/lib/audit-logger";

interface DeletedArticle {
  id: string;
  article: {
    title?: string;
    authorName?: string;
    authorUID?: string;
    authorId?: string;
    img?: string;
    slug?: string;
  };
  deletedBy?: string;
  deletedAt?: { toDate?: () => Date };
}

export default function ArticleRecycleBinPage() {
  const { user, userRole } = useAuth();
  const [busyArticleId, setBusyArticleId] = useState<string | null>(null);
  const { toast } = useToast();
  const { items, loading, hasMore, loadMore, refresh } =
    usePaginatedCollection(ARTICLE_TRASH_COLLECTION, 20, [
      orderBy("deletedAt", "desc"),
    ]);

  const canManageTrash = (item: DeletedArticle) => {
    if (userRole === "super" || userRole === "admin") return true;
    if (userRole === "author") {
      return (
        item.article?.authorUID === user?.uid ||
        item.article?.authorId === user?.uid ||
        item.deletedBy === user?.uid
      );
    }
    return false;
  };

  const deletedArticles = (items as DeletedArticle[]).filter(canManageTrash);

  const restoreArticle = async (article: DeletedArticle) => {
    if (!canManageTrash(article)) {
      toast({
        title: "Permission denied",
        description: "You can only restore your own articles.",
        variant: "destructive",
      });
      return;
    }
    setBusyArticleId(article.id);
    try {
      await restoreArticleFromTrash(article.id);
      logAuditActivity({
        action: "article.restore",
        category: "articles",
        details: `Restored article "${article.article?.title || article.id}" from recycle bin`,
        targetId: article.id,
        targetTitle: article.article?.title || article.id,
        metadata: { slug: article.article?.slug },
      });
      toast({
        title: "Article restored",
        description: "The article is back in the posts list",
        variant: "success",
      });
      refresh();
    } catch (error) {
      toast({
        title: "Could not restore article",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyArticleId(null);
    }
  };

  const permanentlyDelete = async (article: DeletedArticle) => {
    if (!canManageTrash(article)) {
      toast({
        title: "Permission denied",
        description: "You can only delete your own articles.",
        variant: "destructive",
      });
      return;
    }
    if (
      !window.confirm(
        `Permanently delete "${article.article?.title || "this article"}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusyArticleId(article.id);
    try {
      await permanentlyDeleteArticle(article.id);
      logAuditActivity({
        action: "article.delete_permanent",
        category: "articles",
        details: `Permanently deleted article "${article.article?.title || article.id}"`,
        targetId: article.id,
        targetTitle: article.article?.title || article.id,
        metadata: { slug: article.article?.slug },
      });
      toast({
        title: "Article permanently deleted",
        description: "This article can no longer be recovered",
        variant: "success",
      });
      refresh();
    } catch (error) {
      console.error("Error permanently deleting article:", error);
      toast({
        title: "Could not delete article",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyArticleId(null);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden px-4 pb-4 text-white">
      <div className="mb-2 pt-4 md:pt-0">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Articles", href: "/admin/articles" },
            { label: "Recycle Bin" },
          ]}
        />
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Recycle Bin</h1>
          <p className="mt-2 text-sm text-white/60">
            Restore deleted posts or remove them permanently.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/articles">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Posts
          </Link>
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto border border-white/10">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5">
            <tr>
              <th className="p-4 text-left font-medium text-white/70">Image</th>
              <th className="p-4 text-left font-medium text-white/70">Title</th>
              <th className="p-4 text-left font-medium text-white/70">Author</th>
              <th className="p-4 text-left font-medium text-white/70">Deleted</th>
              <th className="p-4 text-left font-medium text-white/70">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {deletedArticles.map((item) => (
              <tr key={item.id} className="hover:bg-white/5">
                <td className="p-4">
                  <div className="h-16 w-28 overflow-hidden bg-white/5">
                    {item.article.img && (
                      <img
                        src={item.article.img}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                </td>
                <td className="max-w-sm break-words p-4 font-medium">
                  {item.article.title || "Untitled article"}
                </td>
                <td className="whitespace-nowrap p-4">
                  {item.article.authorName || "Unknown"}
                </td>
                <td className="whitespace-nowrap p-4">
                  {formatDate(item.deletedAt?.toDate?.())}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreArticle(item)}
                      disabled={busyArticleId !== null}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Restore
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-500"
                      title="Permanently delete article"
                      onClick={() => permanentlyDelete(item)}
                      disabled={busyArticleId !== null}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && deletedArticles.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-white/50">
                  The recycle bin is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && deletedArticles.length === 0 && (
        <div className="py-12 text-center text-white/60">Loading...</div>
      )}

      {hasMore && deletedArticles.length > 0 && (
        <div className="mt-4 flex justify-center">
          <Button onClick={loadMore} variant="outline" disabled={loading}>
            {loading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
