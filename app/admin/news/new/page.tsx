"use client"

import { useState } from "react"
import { db } from "@/lib/firebase"
import { doc, setDoc, serverTimestamp } from "firebase/firestore"
import { v4 as uuidv4 } from "uuid"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Breadcrumb } from "@/components/breadcrumb"
import { Loader2 } from "lucide-react"

export default function NewNewsPage() {
  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({
        title: "Missing title",
        description: "Please enter a title for the news item",
        variant: "destructive",
      })
      return
    }

    setCreating(true)

    try {
      const id = uuidv4()
      await setDoc(doc(db, "news", id), {
        title,
        createdAt: serverTimestamp(),
      })

      toast({
        title: "News created",
        description: "News item has been successfully created",
        variant: "success",
      })

      router.push("/admin/news")
    } catch (error) {
      console.error("Error creating news:", error)
      toast({
        title: "Error",
        description: "Failed to create news item",
        variant: "destructive",
      })
      setCreating(false)
    }
  }

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "News", href: "/admin/news" },
    { label: "New" },
  ]

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <h1 className="text-subtitle font-bold mb-8 mt-4">Create News</h1>

      <div className="max-w-2xl">
        <div className="mb-6">
          <label className="block mb-2 font-medium">News Title:</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter news title"
            className="w-full"
          />
        </div>

        <div className="flex gap-4 mt-8">
          <Button onClick={handleCreate} disabled={creating}  variant="outline">
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {creating ? "Creating..." : "Create News"}
          </Button>

          <Button variant="outline" onClick={() => router.push("/admin/news")} disabled={creating}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

