"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import {
  Menu,
  X,
  LayoutDashboard,
  FileText,
  Users,
  User,
  LogOut,
  FolderOpen,
  MessageSquare,
  AtSign,
  Bell,
  Shield,
  ShieldAlert,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getCmsNotificationHref, openCmsNotification } from "@/lib/notification-href";

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, userRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const isInitialSnapshotRef = useRef(true);

  // Subscribe to unread notifications count & handle native browser alerts
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    isInitialSnapshotRef.current = true;
    const q = query(
      collection(db, "users", user.uid, "notifications"),
      where("read", "==", false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setUnreadCount(snapshot.size);

        if (isInitialSnapshotRef.current) {
          isInitialSnapshotRef.current = false;
        } else {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const data = change.doc.data();
              if (
                typeof window !== "undefined" &&
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                try {
                  const href = getCmsNotificationHref(data);
                  const options: NotificationOptions = {
                    body: data.message || "You have a new notification in the CMS.",
                    icon: "/logos/LAP-Logo-Color.png",
                    tag: change.doc.id,
                    data: { url: href },
                  };

                  if ("serviceWorker" in navigator) {
                    void navigator.serviceWorker.ready
                      .then((registration) =>
                        registration.showNotification(
                          data.title || "New CMS Notification",
                          options,
                        ),
                      )
                      .catch((popupErr) => {
                        console.error("Error displaying CMS service worker notification:", popupErr);
                      });
                  } else {
                    const popup = new Notification(
                      data.title || "New CMS Notification",
                      options,
                    );
                    popup.onclick = () => {
                      window.focus();
                      openCmsNotification(data, (nextHref) => router.push(nextHref));
                      popup.close();
                    };
                  }
                } catch (popupErr) {
                  console.error("Error displaying native CMS notification:", popupErr);
                }
              }
            }
          });
        }
      },
      (err) => {
        console.error("Error subscribing to unread notifications count:", err);
      }
    );

    return () => unsubscribe();
  }, [user, router]);

  // Subscribe to pending reports count for staff (super, admin, moderator)
  useEffect(() => {
    if (!user || !userRole || !["super", "admin", "moderator"].includes(userRole)) {
      setPendingReportsCount(0);
      return;
    }

    const q = query(
      collection(db, "reports"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setPendingReportsCount(snapshot.size);
      },
      (err) => {
        console.error("Error subscribing to pending reports count:", err);
      }
    );

    return () => unsubscribe();
  }, [user, userRole]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(true);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsOpen(false);
    }
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/auth/login");
  };

  const sidebarVariants = {
    hidden: { x: "-100%", opacity: 0 },
    visible: {
      x: 0,
      opacity: 1,
    },
    exit: {
      x: "-100%",
      opacity: 0,
    },
  };

  const getLinkClasses = (href: string) =>
    `flex items-center gap-3 py-3 px-4 transition-colors hover:bg-white/10 ${
      pathname === href ? "border-l-4 border-[#8a2ae3] bg-white/5 font-semibold" : ""
    }`;

  const navItems = [
    {
      href: "/admin",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      href: "/admin/notifications",
      label: "Notifications",
      icon: <Bell className="h-5 w-5" />,
      badge: unreadCount,
      badgeClass: "bg-[#8a2be2] shadow-[0_0_8px_rgba(138,43,226,0.5)]",
    },
    {
      href: "/admin/articles",
      label: "Posts",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      href: "/admin/assets",
      label: "Assets",
      icon: <FolderOpen className="h-5 w-5" />,
    },
    {
      href: "/admin/comments",
      label: "Comments",
      icon: <MessageSquare className="h-5 w-5" />,
    },
    {
      href: "/admin/reports",
      label: "Reports",
      icon: <ShieldAlert className="h-5 w-5" />,
      badge: pendingReportsCount,
      badgeClass: "bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.6)]",
    },
    {
      href: "/admin/users",
      label: "Users",
      icon: <Users className="h-5 w-5" />,
    },
    { href: "/admin/team", label: "Team", icon: <Shield className="h-5 w-5" /> },
    {
      href: "/admin/handles",
      label: "Handles",
      icon: <AtSign className="h-5 w-5" />,
      superOnly: true,
    },
    {
      href: "/admin/activity",
      label: "Activity Log",
      icon: <History className="h-5 w-5" />,
      superOnly: true,
    },
    {
      href: "/admin/profile",
      label: "Profile",
      icon: <User className="h-5 w-5" />,
    },
  ].filter((item) => {
    if (item.superOnly && userRole !== "super") return false;
    if (userRole === "author") {
      return [
        "/admin",
        "/admin/notifications",
        "/admin/articles",
        "/admin/comments",
        "/admin/profile",
      ].includes(item.href);
    }
    if (userRole === "moderator") {
      return [
        "/admin",
        "/admin/notifications",
        "/admin/comments",
        "/admin/reports",
        "/admin/profile",
      ].includes(item.href);
    }
    return true;
  });

  return (
    <>
      {/* Mobile Top Header Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-[#121212] px-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsOpen(!isOpen)}
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Toggle navigation menu"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link href="/admin" className="flex items-center gap-2">
            <Image
              src="/logos/LAP-Logo-Color.png"
              width={26}
              height={26}
              alt="L.A.P Logo"
              className="rounded-full"
            />
            <span className="font-bold text-sm tracking-wider uppercase text-white">L.A.P CMS</span>
          </Link>
        </div>

        <Link
          href="/admin/notifications"
          aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
          className="relative flex h-9 w-9 items-center justify-center text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-[1rem] items-center justify-center bg-[#8a2be2] px-1 font-mono text-[10px] font-bold text-white shadow-[0_0_8px_rgba(138,43,226,0.6)]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>
      </header>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay for mobile: clicking it will hide the sidebar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="fixed md:hidden inset-0 bg-black/60 z-50"
              onClick={() => setIsOpen(false)}
            />

            {/* Sidebar */}
            <motion.aside
              variants={sidebarVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="fixed top-0 left-0 z-50 w-64 border-r border-white/10 bg-[#121212] flex flex-col h-screen pt-safe"
            >
              <div className="flex flex-col h-full">
                {/* Logo */}
                <div className="flex justify-center mt-6 mb-8">
                  <Image
                    src="/logos/LAP-Logo-Color.png"
                    width={80}
                    height={80}
                    alt="L.A.P Logo"
                    className="rounded-full"
                  />
                </div>

                {/* Separation bar */}
                <div className="h-px bg-white/10 mx-4 mb-6" />

                {/* Navigation links */}
                <nav className="space-y-1 font-medium px-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={getLinkClasses(item.href)}
                    >
                      <span className="relative flex items-center shrink-0">
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className={`ml-auto text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${item.badgeClass || "bg-[#8a2be2] shadow-[0_0_8px_rgba(138,43,226,0.5)]"}`}>
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </nav>

                {/* Sign Out button at the bottom */}
                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  className="mt-auto mx-4 mb-6 flex items-center gap-2 justify-center"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign Out</span>
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
