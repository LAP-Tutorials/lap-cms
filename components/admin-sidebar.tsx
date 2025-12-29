"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { useState, useEffect } from "react";
import {
  Menu,
  X,
  LayoutDashboard,
  FileText,
  Users,
  User,
  LogOut,
  FolderOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Update the useEffect for handling resize and initial state
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(true);
      }
    };

    // Set initial state
    handleResize();

    // Add event listener for window resize
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Replace the useEffect for route changes with this version that only affects mobile
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsOpen(false);
    }
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/auth/login");
  };

  // Framer Motion variants for smooth slide animation
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

  // Helper to add active styling if the link matches the current pathname
  const getLinkClasses = (href: string) =>
    `flex items-center gap-3 py-3 px-4 transition-colors hover:bg-white/10 ${
      pathname === href ? "border-l-4 border-[#8a2be2] bg-white/5" : ""
    }`;

  const navItems = [
    {
      href: "/admin",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
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
    { href: "/admin/team", label: "Team", icon: <Users className="h-5 w-5" /> },

    {
      href: "/admin/profile",
      label: "Profile",
      icon: <User className="h-5 w-5" />,
    },
  ];

  return (
    <>
      {/* Mobile toggle button */}
      <div className="fixed top-[env(safe-area-inset-top,1rem)] left-4 z-[1000] md:hidden mt-3">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          variant="ghost"
          size="icon"
          className="bg-[#121212] hover:bg-[#1a1a1a]"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

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
                {/* Logo (centered and rounded) */}
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
                      {item.icon}
                      <span>{item.label}</span>
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
