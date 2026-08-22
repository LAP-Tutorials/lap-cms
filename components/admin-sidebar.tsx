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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, userRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
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
                  const popup = new Notification(
                    data.title || "New CMS Notification",
                    {
                      body: data.message || "You have a new notification in the CMS.",
                      icon: "/favicon.ico",
                      tag: change.doc.id,
                    }
                  );
                  popup.onclick = () => {
                    window.focus();
                    router.push("/admin/comments");
                    popup.close();
                  };
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
    { href: "/admin/team", label: "Team", icon: <Users className="h-5 w-5" /> },
    {
      href: "/admin/handles",
      label: "Handles",
      icon: <AtSign className="h-5 w-5" />,
      superOnly: true,
    },
    {
      href: "/admin/profile",
      label: "Profile",
      icon: <User className="h-5 w-5" />,
    },
  ].filter(
    (item) =>
      (!item.superOnly || userRole === "super") &&
      (userRole !== "moderator" ||
        ["/admin", "/admin/notifications", "/admin/comments", "/admin/profile"].includes(item.href)),
  );

  return (
    <>
      {/* Mobile toggle button */}
      <div className="fixed top-[env(safe-area-inset-top,1rem)] left-4 z-[1000] md:hidden mt-3">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          variant="ghost"
          size="icon"
          className="bg-[#121212] hover:bg-[#1a1a1a]"
          aria-label="Toggle navigation menu"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile notifications link button */}
      <Link
        href="/admin/notifications"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
        className="fixed top-[env(safe-area-inset-top,1rem)] right-4 z-[1000] md:hidden mt-3 flex items-center justify-center h-10 w-10 bg-[#121212] hover:bg-[#1a1a1a] text-white/80 hover:text-white transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[1rem] items-center justify-center bg-[#8a2be2] px-1 font-mono text-[10px] font-bold text-white shadow-[0_0_8px_rgba(138,43,226,0.6)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay for mobile: clicking it will hide the sidebar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed md:hidden top-0 left-0 w-full h-screen bg-black z-30"
              onClick={() => setIsOpen(false)}
            />

            {/* Sidebar */}
            <motion.aside
              variants={sidebarVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="fixed top-0 left-0 z-[999] w-64 border-r border-white/10 bg-[#121212] flex flex-col h-screen pt-safe"
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
                        <span className="ml-auto bg-[#8a2be2] text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center shadow-[0_0_8px_rgba(138,43,226,0.5)]">
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
