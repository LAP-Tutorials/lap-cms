import type React from "react";
import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fira_Code, Roboto } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-fira-code",
  display: "swap",
});

const titleFont = Roboto({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-title",
  display: "swap",
});

const generalSans = localFont({
  src: [
    {
      path: "../public/fonts/general-sans/GeneralSans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/general-sans/GeneralSans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/general-sans/GeneralSans-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-general-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lap-cms.vercel.app"),
  title: {
    default: "L.A.P CMS",
    template: "%s | L.A.P CMS",
  },
  description: "Getting things done on L.A.P Docs",
  generator: "v0.dev",
  openGraph: {
    title: "L.A.P CMS",
    description: "Getting things done on L.A.P Docs",
    url: "https://lap-cms.vercel.app", // Assuming a URL or leaving generic
    siteName: "L.A.P CMS",
    images: [
      {
        url: "/logos/LAP-Logo-Color.png",
        width: 800,
        height: 600,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "L.A.P CMS",
    description: "Getting things done on L.A.P Docs",
    images: ["/logos/LAP-Logo-Color.png"],
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-video-preview": -1,
      "max-image-preview": "none",
      "max-snippet": -1,
    },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#121212",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="icon" href="/logos/LAP-Logo-Color.png" type="image/x-icon" />
      </head>
      <body
        className={`${generalSans.variable} ${firaCode.variable} ${titleFont.variable} font-sans`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
