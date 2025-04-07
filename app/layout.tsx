import type React from "react"
import "./globals.css"
import type { Metadata } from "next"
import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  title: "L.A.P CMS",
  description: "Getting things done on L.A.P Docs",
    generator: 'v0.dev'
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#121212",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="icon" href="/logos/LAP-Logo-Color.png" type="image/x-icon" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}



import './globals.css'