"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility, { passive: true });
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top of preview"
      title="Scroll to top"
      className="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/85 text-white shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-110 hover:border-[#8a2ae3] hover:bg-[#8a2ae3] hover:shadow-[0_0_20px_rgba(138,42,227,0.5)] focus:outline-none focus:ring-2 focus:ring-[#8a2ae3]"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
