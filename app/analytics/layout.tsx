"use client"

import type React from "react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import AdminSidebar from "@/components/admin-sidebar"
import { useAuth } from "@/lib/auth-context"

import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Lock } from "lucide-react"

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, userRole, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/auth/login")
    } else if (!isLoading && user && !["super", "admin", "manager"].includes(userRole || "")) {
      router.replace("/auth/login")
    }
  }, [user, userRole, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex h-screen w-full bg-background">
        {/* Sidebar Skeleton */}
        <div className="hidden w-60 border-r md:block p-4 space-y-4">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-2 mt-8">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        {/* Content Skeleton */}
        <div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-xl mt-8" />
        </div>
      </div>
    )
  }

  if (!user || !["super", "admin", "manager"].includes(userRole || "")) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#121212] p-4 text-white">
        <div className="w-full max-w-md border border-white/15 bg-white/[0.03] p-8 text-center backdrop-blur">
          <div className="flex justify-center mb-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 border border-red-500/25 text-red-400">
              <Lock className="h-6 w-6" />
            </div>
          </div>
          <h2 className="text-xl font-bold uppercase tracking-wider text-white">Access Denied</h2>
          <p className="mt-2 text-sm text-white/60 leading-6">
            You do not have permission to access the analytics area.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              onClick={() => router.replace("/admin")}
              className="bg-[#8a2ae3] text-white hover:bg-[#7822c7] transition-colors font-semibold"
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex text-white">
      <AdminSidebar />
      <main className="flex-1 ml-0 md:ml-60 p-4 pt-[calc(env(safe-area-inset-top,1rem)+1rem)] md:pt-4 w-full relative z-[900]">
        {children}
      </main>
    </div>
  )
}
