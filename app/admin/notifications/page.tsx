"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import PageTitle from "@/components/PageTitle";
import {
  Bell,
  CheckCheck,
  Trash2,
  AtSign,
  MessageSquare,
  FileText,
  Search,
  ExternalLink,
  Check,
  X,
  Clock,
  Sparkles,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Breadcrumb } from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type NotificationItem = {
  id: string;
  userId: string;
  type: "mention" | "new_comment" | "new_post";
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt?: Timestamp;
  metadata?: {
    articleId?: string;
    articleSlug?: string;
    commentId?: string;
    parentCommentId?: string;
    authorId?: string;
    authorName?: string;
    authorHandle?: string;
    authorPhotoURL?: string;
    isStaffAlert?: boolean;
    isReply?: boolean;
    img?: string;
  };
};

function formatTimeAgo(timestamp?: Timestamp): string {
  if (!timestamp) return "Just now";
  const seconds = Math.floor((Date.now() - timestamp.toMillis()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return timestamp.toDate().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFullDate(timestamp?: Timestamp): string {
  if (!timestamp) return "";
  return timestamp.toDate().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "unread" | "mention" | "new_comment" | "new_post"
  >("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const requestBrowserPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        setBrowserPermission(perm);
      } catch (err) {
        console.error("Error requesting notification permission:", err);
      }
    }
  };

  // Real-time notifications listener
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const notificationsRef = collection(db, "users", user.uid, "notifications");
    const q = query(notificationsRef, orderBy("createdAt", "desc"), limit(200));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as NotificationItem[];
        setNotifications(items);
        setLoading(false);
      },
      (err) => {
        console.error("Error subscribing to staff notifications:", err);
        setError("Unable to load notifications. Please check your connection.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Derived statistics
  const unreadCount = notifications.filter((n) => !n.read).length;
  const mentionsCount = notifications.filter((n) => n.type === "mention").length;
  const commentsCount = notifications.filter((n) => n.type === "new_comment").length;
  const postsCount = notifications.filter((n) => n.type === "new_post").length;

  // Search & Filter
  const filteredNotifications = useMemo(() => {
    const queryStr = searchTerm.trim().toLowerCase();

    return notifications.filter((item) => {
      // Type Filter
      if (typeFilter === "unread" && item.read) return false;
      if (typeFilter === "mention" && item.type !== "mention") return false;
      if (typeFilter === "new_comment" && item.type !== "new_comment") return false;
      if (typeFilter === "new_post" && item.type !== "new_post") return false;

      // Search query
      if (!queryStr) return true;
      const haystack = [
        item.title,
        item.message,
        item.metadata?.authorName,
        item.metadata?.authorHandle,
        item.metadata?.articleSlug,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(queryStr);
    });
  }, [notifications, typeFilter, searchTerm]);

  // Actions
  const handleToggleRead = async (item: NotificationItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;
    setBusyId(item.id);
    try {
      await updateDoc(doc(db, "users", user.uid, "notifications", item.id), {
        read: !item.read,
      });
    } catch (err) {
      console.error("Error toggling read status:", err);
    } finally {
      setBusyId(null);
    }
  };

  const handleNavigate = async (item: NotificationItem) => {
    if (!user) return;
    if (!item.read) {
      try {
        await updateDoc(doc(db, "users", user.uid, "notifications", item.id), {
          read: true,
        });
      } catch (err) {
        console.error("Error marking notification as read:", err);
      }
    }

    router.push("/admin/comments");
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      unread.forEach((item) => {
        const ref = doc(db, "users", user.uid, "notifications", item.id);
        batch.update(ref, { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  const handleClearAll = async () => {
    if (!user || notifications.length === 0) return;
    if (!window.confirm("Clear all notifications permanently?")) return;

    try {
      const batch = writeBatch(db);
      notifications.forEach((item) => {
        const ref = doc(db, "users", user.uid, "notifications", item.id);
        batch.delete(ref);
      });
      await batch.commit();
    } catch (err) {
      console.error("Error clearing all notifications:", err);
    }
  };

  const handleDeleteItem = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setBusyId(notificationId);
    try {
      await deleteDoc(doc(db, "users", user.uid, "notifications", notificationId));
    } catch (err) {
      console.error("Error deleting notification:", err);
    } finally {
      setBusyId(null);
    }
  };

  const renderIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "mention":
        return <AtSign className="h-4 w-4 text-[#8a2be2]" />;
      case "new_comment":
        return <MessageSquare className="h-4 w-4 text-[#5eead4]" />;
      case "new_post":
        return <FileText className="h-4 w-4 text-[#f3c969]" />;
      default:
        return <Bell className="h-4 w-4 text-white/70" />;
    }
  };

  const renderTypeBadge = (type: NotificationItem["type"]) => {
    switch (type) {
      case "mention":
        return (
          <span className="inline-flex items-center gap-1 bg-[#8a2be2]/15 text-[#8a2be2] border border-[#8a2be2]/30 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider">
            <AtSign className="h-3 w-3" /> Mention
          </span>
        );
      case "new_comment":
        return (
          <span className="inline-flex items-center gap-1 bg-[#5eead4]/15 text-[#5eead4] border border-[#5eead4]/30 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider">
            <MessageSquare className="h-3 w-3" /> Comment
          </span>
        );
      case "new_post":
        return (
          <span className="inline-flex items-center gap-1 bg-[#f3c969]/15 text-[#f3c969] border border-[#f3c969]/30 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider">
            <FileText className="h-3 w-3" /> Post
          </span>
        );
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-[76rem] w-full min-w-0 text-white">
      <div className="mb-2">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Notifications" },
          ]}
        />
      </div>

      {/* Header & Title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/notifications.svg"
          imgAlt="Notifications"
        >
          Notifications
        </PageTitle>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              onClick={handleMarkAllRead}
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/[0.03] hover:bg-white/10 text-white"
            >
              <CheckCheck className="h-4 w-4 mr-1.5 text-[#8a2be2]" />
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-white/15 py-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8">
        {[
          { label: "Total", value: notifications.length, icon: Bell },
          { label: "Unread", value: unreadCount, icon: Sparkles },
          { label: "Mentions", value: mentionsCount, icon: AtSign },
          { label: "Comments", value: commentsCount, icon: MessageSquare },
          { label: "Posts", value: postsCount, icon: FileText },
        ].map(({ label, value, icon: StatIcon }) => (
          <div key={label} className="flex items-center gap-2.5">
            <StatIcon className="h-4 w-4 text-white/30" aria-hidden="true" />
            <dd className="font-mono text-sm font-semibold tabular-nums text-white/90">
              {value}
            </dd>
            <dt className="text-xs text-white/40 uppercase font-mono">{label}</dt>
          </div>
        ))}
      </dl>

      {/* Search & Filter Tabs */}
      <section className="sticky top-0 z-20 border-b border-white/15 bg-[#121212]/95 py-3 backdrop-blur mt-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search notifications by title, author, or content..."
              className="h-10 border-white/15 bg-white/[0.025] pl-10 text-sm placeholder:text-white/30 focus-visible:ring-[#8a2be2]"
            />
          </div>

          <div className="flex w-full overflow-x-auto bg-white/[0.025] p-0.5 sm:w-auto">
            {(
              [
                { id: "all", label: "All" },
                { id: "unread", label: `Unread (${unreadCount})` },
                { id: "mention", label: "Mentions" },
                { id: "new_comment", label: "Comments" },
                { id: "new_post", label: "Posts" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={`min-w-0 flex-1 shrink-0 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors duration-200 sm:flex-none ${
                  typeFilter === id
                    ? "bg-[#8a2be2] text-white font-semibold"
                    : "text-white/50 hover:bg-white/5 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="my-4 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Notifications list */}
      <div className="mt-4 pb-20">
        {loading ? (
          <div className="py-24 text-center text-white/40">
            <Bell className="mx-auto mb-3 h-8 w-8 animate-bounce opacity-30" />
            <p className="text-sm">Loading your notifications…</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-24 text-center border border-dashed border-white/15 bg-white/[0.01]">
            <Bell className="mx-auto mb-3 h-10 w-10 text-white/20" />
            <h3 className="text-base font-semibold uppercase tracking-wider text-white/80">
              No notifications found
            </h3>
            <p className="mt-1 text-sm text-white/40">
              {searchTerm
                ? "Try adjusting your search query or filters."
                : typeFilter === "unread"
                ? "You are all caught up! No unread notifications."
                : "Notifications will appear here when readers interact or content is published."}
            </p>
            {browserPermission === "default" && (
              <div className="mt-4">
                <Button
                  onClick={requestBrowserPermission}
                  variant="outline"
                  size="sm"
                  className="border-[#8a2be2]/40 bg-[#8a2be2]/10 hover:bg-[#8a2be2]/20 text-[#8a2be2]"
                >
                  <Bell className="h-4 w-4 mr-1.5" />
                  Enable browser pop-ups
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 text-xs text-white/50">
              <div className="flex items-center gap-3">
                <span>
                  Showing {filteredNotifications.length} {filteredNotifications.length === 1 ? "notification" : "notifications"}
                </span>
                {browserPermission === "default" && (
                  <Button
                    onClick={requestBrowserPermission}
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs border-[#8a2be2]/40 bg-[#8a2be2]/10 hover:bg-[#8a2be2]/20 text-[#8a2be2] font-medium"
                  >
                    <Bell className="h-3 w-3 mr-1.5" />
                    Enable browser pop-ups
                  </Button>
                )}
              </div>
              {notifications.length > 0 && (
                <Button
                  onClick={handleClearAll}
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear all
                </Button>
              )}
            </div>

            <div className="divide-y divide-white/10 border border-white/15 bg-[#121212]">
              {filteredNotifications.map((item) => (
              <div
                key={item.id}
                onClick={() => handleNavigate(item)}
                className={`group relative flex flex-col sm:flex-row items-start justify-between gap-4 p-4 sm:p-5 transition-colors cursor-pointer ${
                  !item.read
                    ? "bg-white/[0.04] hover:bg-white/[0.07] border-l-4 border-l-[#8a2be2]"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {/* Type Icon Container */}
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 bg-white/[0.05]">
                    {renderIcon(item.type)}
                  </div>

                  {/* Content Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {renderTypeBadge(item.type)}
                      <h4
                        className={`text-sm font-semibold uppercase tracking-wide truncate ${
                          !item.read ? "text-white" : "text-white/80"
                        }`}
                      >
                        {item.title}
                      </h4>
                      {!item.read && (
                        <span className="h-2 w-2 rounded-full bg-[#8a2be2] shadow-[0_0_6px_#8a2be2]" />
                      )}
                    </div>

                    <p className="text-sm text-white/70 leading-relaxed break-words line-clamp-2">
                      {item.message}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-white/40">
                      <span className="flex items-center gap-1" title={formatFullDate(item.createdAt)}>
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(item.createdAt)}
                      </span>
                      {item.metadata?.authorHandle && (
                        <span>@{item.metadata.authorHandle}</span>
                      )}
                      {item.metadata?.articleSlug && (
                        <span className="text-white/30 truncate max-w-xs">
                          /{item.metadata.articleSlug}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleToggleRead(item, e)}
                    disabled={busyId === item.id}
                    title={item.read ? "Mark as unread" : "Mark as read"}
                    className="h-8 px-2.5 text-xs text-white/60 hover:text-white hover:bg-white/10"
                  >
                    {item.read ? (
                      <>
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        Mark unread
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1 text-[#8a2be2]" />
                        Mark read
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleDeleteItem(item.id, e)}
                    disabled={busyId === item.id}
                    title="Delete notification"
                    className="h-8 w-8 text-white/40 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
