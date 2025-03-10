"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { FiMenu } from "react-icons/fi";
import { FaTimes } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/auth/login");
  };

  // Framer Motion variants for smooth slide animation.
  const sidebarVariants = {
    hidden: { x: "-100%", opacity: 0 },
    visible: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.3, ease: "easeInOut" },
    },
    exit: {
      x: "-100%",
      opacity: 0,
      transition: { duration: 0.3, ease: "easeInOut" },
    },
  };

  // Helper to add active outline styling if the link matches the current pathname.
  const getLinkClasses = (href: string) =>
    `block transition ease-in-out duration-300 hover:text-purple-400 ${
      pathname === href ? "border-b-2 border-purple-400 pb-1.5" : ""
    }`;

  return (
    <>
      {/* Mobile toggle button */}
      <div className="fixed top-4 left-4 z-50 p-1 px-2 md:hidden">
        <button onClick={() => setIsOpen(!isOpen)} className="text-white">
          {isOpen ? <FaTimes size={24} /> : <FiMenu size={24} />}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay for mobile: clicking it will hide the sidebar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed md:hidden top-0 left-0 w-full h-screen  z-30"
              onClick={() => setIsOpen(false)}
            />

            {/* Sidebar */}
            <motion.aside
              variants={sidebarVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed top-0 left-0 z-40 w-60 border-r border-white p-4 flex flex-col h-screen "
            >
              <div>
                {/* Logo (centered and rounded) */}
                <div className="flex justify-center mt-5 mb-10">
                  <Image
                    src="/logos/LAP-Logo-Color.png"
                    width={100}
                    height={100}
                    alt="L.A.P Logo"
                    className="rounded-full"
                  />
                </div>

                {/* Separation bar */}
                <hr className="my-5 border-white/30" />

                {/* Navigation links */}
                <nav className="space-y-5 mt-10 font-semibold text-lg p-3">
                  <Link href="/admin" className={getLinkClasses("/admin")}>
                    Dashboard
                  </Link>
                  <Link
                    href="/admin/articles"
                    className={getLinkClasses("/admin/articles")}
                  >
                    Posts
                  </Link>
                  <Link
                    href="/admin/team"
                    className={getLinkClasses("/admin/team")}
                  >
                    Team
                  </Link>
                  <Link
                    href="/admin/news"
                    className={getLinkClasses("/admin/news")}
                  >
                    News
                  </Link>
                  <Link
                    href="/admin/profile"
                    className={getLinkClasses("/admin/profile")}
                  >
                    Profile
                  </Link>
                </nav>
              </div>

              {/* Sign Out button at the bottom */}
              <button
                onClick={handleSignOut}
                className="mt-auto py-3 font-semibold text-center mb-19 md:mb-7 transition ease-in-out duration-300"
              >
                Sign Out
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
