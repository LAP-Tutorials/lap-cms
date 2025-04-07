"use client"

import { useState, useEffect } from "react"
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Breadcrumb } from "@/components/breadcrumb"
import { formatDate } from "@/lib/utils"
import { Loader2, AlertTriangle } from "lucide-react"

export default function EditNewsPage() {
  const [title, setTitle] = useState("")
  const [createdAt, setCreatedAt] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const id = typeof params.id === "string" ? params.id : ""

  useEffect(() => {
    const fetchNews = async () => {
      if (!id) {
        setError("Invalid news ID")
        setLoading(false)
        return
      }

      try {
        const ref = doc(db, "news", id)
        const snap = await getDoc(ref)

        if (snap.exists()) {
          const data = snap.data()
          setTitle(data.title || "")
          setCreatedAt(data.createdAt || null)
        } else {
          setError("News item not found")
        }
      } catch (err) {
        console.error("Error fetching news:", err)
        setError("Failed to load news item")
      } finally {
        setLoading(false)
      }
    }

    fetchNews()
  }, [id])

  const handleUpdate = async () => {
    if (!title.trim()) {
      toast({
        title: "Missing title",
        description: "Please enter a title for the news item",
        variant: "destructive",
      })
      return
    }

    setSaving(true)

    try {
      const ref = doc(db, "news", id)
      // Preserve existing createdAt
      await updateDoc(ref, {
        title,
        createdAt, // keep the old date
      })

      toast({
        title: "News updated",
        description: "News item has been successfully updated",
        variant: "success",
      })

      router.push("/admin/news")
    } catch (error) {
      console.error("Error updating news:", error)
      toast({
        title: "Error",
        description: "Failed to update news item",
        variant: "destructive",
      })
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      const ref = doc(db, "news", id)
      await deleteDoc(ref)

      toast({
        title: "News deleted",
        description: "News item has been permanently removed",
        variant: "success",
      })

      router.push("/admin/news")
    } catch (error) {
      console.error("Error deleting news:", error)
      toast({
        title: "Error",
        description: "Failed to delete news item",
        variant: "destructive",
      })
    }
  }

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "News", href: "/admin/news" },
    { label: "Edit" },
  ]

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2be2]"></div>
        <span className="ml-3">Loading news item...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-center min-h-[60vh] flex-col">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-white/70">{error}</p>
          <Button onClick={() => router.push("/admin/news")} className="mt-6">
            Back to News
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <h1 className="text-subtitle font-bold mb-8 mt-4">Edit News</h1>

      <div className="max-w-2xl">
        <div className="mb-6">
          <label className="block mb-2 font-medium">News Title:</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full" />
        </div>

        {createdAt && (
          <div className="mb-6">
            <label className="block mb-2 font-medium">Created:</label>
            <Input
              value={formatDate(createdAt?.toDate?.())}
              disabled
              className="w-full opacity-70 cursor-not-allowed"
            />
            <p className="text-sm text-white/50 mt-1">Creation date cannot be modified</p>
          </div>
        )}

        <div className="flex gap-4 mt-8">
          <Button onClick={handleUpdate} disabled={saving}  variant="outline">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Updating..." : "Update"}
          </Button>

          <Button
             variant="outline"
             className="text-red-500 border-red-500"
            onClick={() => {
              if (window.confirm("Are you sure you want to delete this news item? This action cannot be undone.")) {
                handleDelete()
              }
            }}
            disabled={saving}
          >
            Delete
          </Button>

          <Button variant="outline" onClick={() => router.push("/admin/news")} disabled={saving} className="ml-auto">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

