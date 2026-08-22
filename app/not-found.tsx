import PageTitle from "@/components/PageTitle";
import Link from "next/link";

export const metadata = {
  title: "Page not found | L.A.P",
  description: "Page does not exist",
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#121212] px-4 text-white">
      <div className="w-full max-w-md border border-white/15 bg-white/[0.03] p-8 text-center backdrop-blur">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/NotFound.svg"
          imgAlt="The words 'Not Found' in bold uppercase lettering"
        >
          404 - Page Not Found
        </PageTitle>
        <h1 className="text-2xl font-bold uppercase tracking-wider text-white">404 - Page Not Found</h1>
        <p className="mt-2 text-sm text-white/60 leading-6">
          The page you&apos;re looking for does not exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            className="inline-flex items-center rounded bg-[#8a2ae3] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#7822c7]"
            href="/admin"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
