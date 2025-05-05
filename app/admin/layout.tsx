"use client"

import type React from "react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import AdminSidebar from "@/components/admin-sidebar"
import { useAuth } from "@/lib/auth-context"

export default function AdminLayout({
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
      <div className="flex items-center justify-center h-screen text-white">
        <p>Loading...</p>
      </div>
    )
  }

  if (!user || !["super", "admin", "manager"].includes(userRole || "")) {
    return (
      <div className="flex items-center justify-center h-screen text-white">
        <p>Access Denied</p>
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
