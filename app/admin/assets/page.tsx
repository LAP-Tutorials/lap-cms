"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AssetManager } from "@/components/admin/assets/asset-manager"
import PageTitle from "@/components/PageTitle"
import { Breadcrumb } from "@/components/breadcrumb"
import { useAuth } from "@/lib/auth-context"

export default function AssetsPage() {
  const { userRole, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && (userRole === "author" || userRole === "moderator")) {
      router.replace("/admin")
    }
  }, [userRole, isLoading, router])

  if (isLoading || userRole === "author" || userRole === "moderator") {
    return null
  }

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Assets" },
  ]

  return (
    <div className="w-full">
      <div className="mb-2">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <PageTitle
        className="sr-only"
        imgSrc="/images/titles/assets.svg"
        imgAlt="Assets"
      >
        Assets
      </PageTitle>

      <div className="max-w-7xl mx-auto">
         <AssetManager />
      </div>
    </div>
  )
}
