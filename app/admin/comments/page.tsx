"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { Eye, EyeOff, ExternalLink, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Breadcrumb } from "@/components/breadcrumb";

type ModeratedComment = {
  id: string;
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  authorId: string;
  authorName: string;
  authorHandle?: string;
  authorPhotoURL?: string;
  content: string;
  status: "visible" | "hidden";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  edited?: boolean;
};

export default function CommentsModerationPage() {
  const { user } = useAuth();
  const [comments, setComments] = useState<ModeratedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "visible" | "hidden">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const commentsQuery = query(
      collection(db, "comments"),
      orderBy("createdAt", "desc"),
      limit(250),
    );

    return onSnapshot(
      commentsQuery,
      (snapshot) => {
        setComments(
          snapshot.docs.map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          })) as ModeratedComment[],
        );
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        console.error("Unable to load comments:", snapshotError);
        setError("Unable to load comments. Check the deployed Firestore rules.");
        setLoading(false);
      },
    );
  }, []);

  const filteredComments = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return comments.filter((comment) => {
      if (statusFilter !== "all" && comment.status !== statusFilter) return false;
      if (!needle) return true;
      return [comment.authorName, comment.authorHandle, comment.articleTitle, comment.content]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [comments, searchTerm, statusFilter]);

  const visibleCount = comments.filter((comment) => comment.status === "visible").length;
  const hiddenCount = comments.filter((comment) => comment.status === "hidden").length;

  const setCommentStatus = async (
    commentId: string,
    status: "visible" | "hidden",
  ) => {
    if (!user) return;
    setBusyId(commentId);
    setError("");
    try {
      await updateDoc(doc(db, "comments", commentId), {
        status,
        moderatedAt: serverTimestamp(),
        moderatedBy: user.uid,
      });
    } catch (updateError) {
      console.error("Unable to moderate comment:", updateError);
      setError("The moderation change could not be saved.");
    } finally {
      setBusyId(null);
    }
  };

  const removeComment = async (commentId: string) => {
    if (!window.confirm("Delete this comment permanently? This cannot be undone.")) return;
    setBusyId(commentId);
    setError("");
    try {
      await deleteDoc(doc(db, "comments", commentId));
    } catch (deleteError) {
      console.error("Unable to delete comment:", deleteError);
      setError("The comment could not be deleted.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen text-white">
      <Breadcrumb items={[{ label: "Dashboard", href: "/admin" }, { label: "Comments" }]} />

      <div className="mt-6 flex flex-col gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">Community</p>
          <h1 className="mt-2 text-3xl font-semibold">Comment moderation</h1>
          <p className="mt-2 max-w-2xl text-white/60">
            Hide harmful comments, restore approved discussions, or permanently remove abuse.
            Comment text can only be edited by its original author.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border border-white/10 p-4">
            <p className="text-sm text-white/50">Total</p>
            <p className="mt-1 text-2xl font-semibold">{comments.length}</p>
          </div>
          <div className="border border-white/10 p-4">
            <p className="text-sm text-white/50">Visible</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">{visibleCount}</p>
          </div>
          <div className="border border-white/10 p-4">
            <p className="text-sm text-white/50">Hidden</p>
            <p className="mt-1 text-2xl font-semibold text-amber-300">{hiddenCount}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search author, article, or comment…"
              className="pl-10"
            />
          </div>
          <div className="flex border border-white/10">
            {(["all", "visible", "hidden"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 text-sm uppercase ${
                  statusFilter === status ? "bg-white text-black" : "hover:bg-white/10"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="border border-red-400/40 p-4 text-red-200">{error}</p> : null}
        {loading ? <p className="py-12 text-center text-white/60">Loading comments…</p> : null}

        {!loading && filteredComments.length === 0 ? (
          <p className="border border-dashed border-white/20 py-12 text-center text-white/50">
            No comments match this view.
          </p>
        ) : null}

        <div className="space-y-4 pb-12">
          {filteredComments.map((comment) => {
            const createdAt = comment.createdAt?.toDate();
            const isBusy = busyId === comment.id;
            return (
              <article key={comment.id} className="border border-white/10 bg-white/[0.02] p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-white/10 font-semibold uppercase text-white/60">
                        {comment.authorPhotoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={comment.authorPhotoURL}
                            alt={`${comment.authorName}'s profile picture`}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          comment.authorName.charAt(0)
                        )}
                      </div>
                      <div>
                        <h2 className="font-semibold">{comment.authorName}</h2>
                        {comment.authorHandle ? (
                          <p className="font-mono text-xs text-violet-300">@{comment.authorHandle}</p>
                        ) : null}
                      </div>
                      <span
                        className={`px-2 py-1 text-xs uppercase ${
                          comment.status === "visible"
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-amber-400/10 text-amber-300"
                        }`}
                      >
                        {comment.status}
                      </span>
                      <span className="text-sm text-white/40">
                        {createdAt ? createdAt.toLocaleString() : "Pending timestamp"}
                        {comment.edited ? " · edited" : ""}
                      </span>
                    </div>

                    <p className="mt-4 whitespace-pre-wrap break-words leading-7 text-white/85">
                      {comment.content}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/50">
                      <span>On: {comment.articleTitle || comment.articleId}</span>
                      {comment.articleSlug ? (
                        <Link
                          href={`https://lap.onl/posts/${comment.articleSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-white underline underline-offset-4"
                        >
                          View post <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {comment.status === "visible" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => setCommentStatus(comment.id, "hidden")}
                      >
                        <EyeOff className="mr-2 h-4 w-4" /> Hide
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => setCommentStatus(comment.id, "visible")}
                      >
                        <Eye className="mr-2 h-4 w-4" /> Restore
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => removeComment(comment.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
