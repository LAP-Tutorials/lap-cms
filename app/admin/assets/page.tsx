"use client"

import { AssetManager } from "@/components/admin/assets/asset-manager"
import PageTitle from "@/components/PageTitle"
import { Breadcrumb } from "@/components/breadcrumb"

export default function AssetsPage() {
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
