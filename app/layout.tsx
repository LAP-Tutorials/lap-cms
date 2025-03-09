import "./globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "L.A.P CMS",
  description: "Getting things done on L.A.P Docs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link
          rel="icon"
          href="/logos/LAP-Logo-Color.png"
          type="image/x-icon"
        />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
