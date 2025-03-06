import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { FiMenu } from "react-icons/fi";
import { FaTimes } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminSidebar() {
  const router = useRouter();
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

  return (
    <>
      {/* Mobile toggle button (visible on mobile screens) */}
      <div className="md:hidden p-4 absolute z-50">
        <button onClick={() => setIsOpen(!isOpen)} className="text-white">
          {isOpen ? <FaTimes size={24} /> : <FiMenu size={24} />}
        </button>
      </div>

      {/* Sidebar animated with Framer Motion */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            variants={sidebarVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-60 border-r border-white p-4 flex flex-col h-screen md:relative absolute"
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
                <Link
                  href="/admin"
                  className="block hover:text-purple-400 transition ease-in-out duration-300"
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/articles"
                  className="block hover:text-purple-400 transition ease-in-out duration-300"
                >
                  Articles
                </Link>
                <Link
                  href="/admin/team"
                  className="block hover:text-purple-400 transition ease-in-out duration-300"
                >
                  Team
                </Link>
                <Link
                  href="/admin/news"
                  className="block hover:text-purple-400 transition ease-in-out duration-300"
                >
                  News
                </Link>
                <Link
                  href="/admin/profile"
                  className="block hover:text-purple-400 transition ease-in-out duration-300"
                >
                  Profile
                </Link>
              </nav>
            </div>

            {/* Sign Out button at the bottom */}
            <button
              onClick={handleSignOut}
              className="mt-auto py-3 text-center mb-5 hover:text-purple-400 transition ease-in-out duration-300"
            >
              Sign Out
            </button>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
