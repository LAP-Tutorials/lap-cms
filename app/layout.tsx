import "./globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "L.A.P CMS",
  description: "L.A.P CMS with Next.js + Firebase",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
