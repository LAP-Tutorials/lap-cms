import Link from "next/link";
import { RiArrowRightLine } from "react-icons/ri"; // Importing Right Arrow Icon

type PostNavigationProps = {
  children: React.ReactNode;
  href: string;
};

export default function PostNavigation({ children, href }: PostNavigationProps) {
  return (
    <div className="flex items-center justify-between py-4 md:pt-8 md:pb-24">
      <Link
        className="flex items-center gap-2 uppercase font-semibold w-full text-white"
        href={href}
      >
        <RiArrowRightLine className="rotate-180 text-2xl" />
        Go Back
      </Link>
      <p className="uppercase font-semibold text-lg md:text-[2rem] text-white">
        {children}
      </p>
    </div>
  );
}
