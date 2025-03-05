import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function AdminSidebar() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/auth/login");
  };

  return (
    <aside className="w-64 border-r border-gray-800 p-4">
      <nav className="space-y-2">
        <Link href="/admin" className="block hover:text-purple-400">
          Dashboard
        </Link>
        <Link href="/admin/articles" className="block hover:text-purple-400">
          Articles
        </Link>
        <Link href="/admin/team" className="block hover:text-purple-400">
          Team
        </Link>
        <Link href="/admin/news" className="block hover:text-purple-400">
          News
        </Link>
        <Link href="/admin/profile" className="block hover:text-purple-400">
          Profile
        </Link>
        <button
          onClick={handleSignOut}
          className="mt-4 text-red-400 hover:text-red-500"
        >
          Sign Out
        </button>
      </nav>
    </aside>
  );
}
