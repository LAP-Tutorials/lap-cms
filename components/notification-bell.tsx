"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  Bell,
  CheckCheck,
  Trash2,
  AtSign,
  MessageSquare,
  FileText,
  X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

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
  });
}

export default function NotificationBell({
  className = "",
}: {
  className?: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Subscribe to real-time staff/user notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const notificationsRef = collection(db, "users", user.uid, "notifications");
    const q = query(
      notificationsRef,
      orderBy("createdAt", "desc"),
      limit(30)
    );

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
      (error) => {
        console.error("Error subscribing to notifications:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;
  const displayedNotifications =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!user) return;
    setIsOpen(false);

    // Mark as read if not already
    if (!item.read) {
      try {
        await updateDoc(
          doc(db, "users", user.uid, "notifications", item.id),
          { read: true }
        );
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
      console.error("Error marking all notifications read:", err);
    }
  };

  const handleClearAll = async () => {
    if (!user || notifications.length === 0) return;
    if (!window.confirm("Clear all notifications?")) return;

    try {
      const batch = writeBatch(db);
      notifications.forEach((item) => {
        const ref = doc(db, "users", user.uid, "notifications", item.id);
        batch.delete(ref);
      });
      await batch.commit();
    } catch (err) {
      console.error("Error clearing notifications:", err);
    }
  };

  const handleDeleteItem = async (
    event: React.MouseEvent,
    notificationId: string
  ) => {
    event.stopPropagation();
    if (!user) return;

    try {
      await deleteDoc(doc(db, "users", user.uid, "notifications", notificationId));
    } catch (err) {
      console.error("Error deleting notification:", err);
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

  return (
    <div className={`relative ${className}`} ref={popoverRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
        aria-expanded={isOpen}
        className="relative flex items-center justify-center p-2 text-white/80 transition-colors duration-200 hover:text-white hover:bg-white/10 rounded-md focus:outline-none"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 min-w-[1rem] items-center justify-center bg-[#8a2be2] px-1 font-mono text-[10px] font-bold text-white shadow-[0_0_8px_rgba(138,43,226,0.6)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown / Popover */}
      {isOpen && (
        <div
          className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-[1100] w-[320px] sm:w-[380px] max-w-[calc(100vw-2rem)] border border-white/20 bg-[#121212] shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
          role="dialog"
          aria-label="Staff Notifications Panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold uppercase tracking-wider text-sm text-white">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="bg-[#8a2be2]/20 text-[#8a2be2] border border-[#8a2be2]/40 px-1.5 py-0.5 text-xs font-mono font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                  className="p-1.5 text-white/60 hover:text-white transition-colors"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  title="Clear all"
                  className="p-1.5 text-white/60 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                className="p-1.5 text-white/60 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-white/10 text-xs font-mono">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`flex-1 py-2 text-center uppercase tracking-wider transition-colors ${
                filter === "all"
                  ? "border-b-2 border-[#8a2be2] text-white font-medium bg-white/[0.04]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`flex-1 py-2 text-center uppercase tracking-wider transition-colors ${
                filter === "unread"
                  ? "border-b-2 border-[#8a2be2] text-white font-medium bg-white/[0.04]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-white/[0.07]">
            {loading ? (
              <div className="py-10 text-center text-sm text-white/40">
                Loading notifications…
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-12 text-center text-white/40">
                <Bell className="mx-auto mb-2 h-6 w-6 opacity-30" />
                <p className="text-sm">No {filter === "unread" ? "unread " : ""}notifications</p>
              </div>
            ) : (
              displayedNotifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`group relative flex items-start gap-3 p-3.5 cursor-pointer transition-colors ${
                    !item.read
                      ? "bg-white/[0.05] hover:bg-white/[0.08]"
                      : "hover:bg-white/[0.03]"
                  }`}
                >
                  {/* Type Icon / Badge */}
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-white/[0.07] border border-white/10">
                    {renderIcon(item.type)}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={`text-xs font-semibold uppercase leading-snug truncate ${
                          !item.read ? "text-white" : "text-white/70"
                        }`}
                      >
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[10px] font-mono text-white/40">
                        {formatTimeAgo(item.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-white/60 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>

                  {/* Unread indicator dot & delete button */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    {!item.read && (
                      <span
                        className="h-2 w-2 rounded-full bg-[#8a2be2] shadow-[0_0_6px_#8a2be2]"
                        aria-label="Unread"
                      />
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteItem(e, item.id)}
                      title="Delete"
                      className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-red-400 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
