"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { db, auth } from "@/lib/firebase"
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore"
import { marked } from "marked"
import DOMPurify from "dompurify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { Breadcrumb } from "@/components/breadcrumb"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/utils"
import { Loader2, AlertTriangle } from "lucide-react"
import { MarkdownToolbar } from "@/components/markdown-toolbar"

export default function EditArticlePage() {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [description, setDescription] = useState("")
  const [img, setImg] = useState("")
  const [imgAlt, setImgAlt] = useState("")
  const [label, setLabel] = useState("")
  const [slug, setSlug] = useState("")
  const [date, setDate] = useState("")
  const [popularity, setPopularity] = useState(false)
  const [readTime, setReadTime] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState("")
  const contentRef = useRef<HTMLTextAreaElement>(null!)

  const router = useRouter()
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const { toast } = useToast()

  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) return
      setLoading(true)
      setError(null)

      try {
        const ref = doc(db, "articles", id)
        const snap = await getDoc(ref)

        if (snap.exists()) {
          const data = snap.data()
          setTitle(data.title || "")
          setContent(
            typeof data.content === "string" ? data.content : data.content ? JSON.stringify(data.content, null, 2) : "",
          )
          setDescription(data.description || "")
          setImg(data.img || "")
          setImgAlt(data.imgAlt || "")
          setLabel(data.label || "")
          setSlug(data.slug || "")
          setPopularity(data.popularity || false)
          setReadTime(data.read || "")
          setDate(data.date ? formatDate(data.date.toDate()) : "")
        } else {
          setError("Article not found")
        }
      } catch (err) {
        console.error("Error fetching article:", err)
        setError("Failed to load article")
      } finally {
        setLoading(false)
      }
    }

    fetchArticle()
  }, [id])

  const handleUpdate = async () => {
    if (!title || !content) {
      toast({
        title: "Missing fields",
        description: "Title and content are required",
        variant: "destructive",
      })
      return
    }

    const user = auth.currentUser
    if (!user || !id) {
      toast({
        title: "Authentication error",
        description: "You must be logged in to update articles",
        variant: "destructive",
      })
      return
    }

    setSaving(true)

    try {
      const ref = doc(db, "articles", id)
      await updateDoc(ref, {
        title,
        content,
        description,
        img,
        imgAlt,
        label,
        slug,
        popularity,
        read: readTime,
        updatedAt: serverTimestamp(),
        // Don't update date to keep it uneditable
      })

      toast({
        title: "Article updated",
        description: "Your article has been successfully updated",
        variant: "success",
      })

      router.push("/admin/articles")
    } catch (err) {
      console.error("Error updating article:", err)
      toast({
        title: "Error",
        description: "Failed to update article",
        variant: "destructive",
      })
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      if (!id) return
      const ref = doc(db, "articles", id)
      await deleteDoc(ref)

      toast({
        title: "Article deleted",
        description: "The article has been permanently removed",
        variant: "success",
      })

      router.push("/admin/articles")
    } catch (err) {
      console.error("Error deleting article:", err)
      toast({
        title: "Error",
        description: "Failed to delete article",
        variant: "destructive",
      })
    }
  }
  
  const handleMarkdownInsert = (textToInsert: string) => {
    const textarea = contentRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newContent = `${content.substring(0, start)}${textToInsert}${content.substring(end)}`
    setContent(newContent)

    // Focus and set cursor position after the inserted text
    setTimeout(() => {
      textarea.focus()
      const newCursorPosition = start + textToInsert.length
      textarea.setSelectionRange(newCursorPosition, newCursorPosition)
    }, 0)
  }

  // Convert markdown to HTML using Marked and sanitize it with DOMPurify
  useEffect(() => {
    const generatePreview = async () => {
      try {
        marked.setOptions({
          gfm: true,
          breaks: true,
        })
        const rawHtml = await marked.parse(content)
        const sanitized = DOMPurify.sanitize(rawHtml, {
          ADD_TAGS: ["iframe"],
          ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "height", "scrolling", "src", "width"],
        })
        setPreviewHtml(sanitized)
      } catch (err) {
        console.error("Error generating preview:", err)
        setPreviewHtml("<p>Error generating preview</p>")
      }
    }

    generatePreview()
  }, [content])

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Articles", href: "/admin/articles" },
    { label: "Edit Article" },
  ]

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2be2]"></div>
        <span className="ml-3">Loading article...</span>
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
          <Button onClick={() => router.push("/admin/articles")} className="mt-6">
            Back to Articles
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

      <h1 className="text-subtitle font-bold mb-8 mt-4">Edit Article</h1>

      <div className="max-w-4xl">
        {/* Title */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Title:</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="w-full"
          />
        </div>

        {/* Slug */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Slug:</label>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="URL-friendly identifier"
            className="w-full"
          />
          <p className="text-sm text-white/50 mt-1">Used in article URLs</p>
        </div>

        {/* Date (uneditable) */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Date:</label>
          <Input value={date} disabled className="w-full opacity-70 cursor-not-allowed" />
          <p className="text-sm text-white/50 mt-1">Creation date cannot be modified</p>
        </div>

        {/* Toggle Editor/Preview for Content */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Content:</label>
          <Tabs defaultValue="write" className="w-full">
            <TabsList>
              <TabsTrigger value="write">Write</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <MarkdownToolbar textareaRef={contentRef} onInsert={handleMarkdownInsert} />
              <Textarea
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your article content in Markdown..."
                className="min-h-[400px] font-mono border-t-0 rounded-t-none"
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="border border-white p-4 min-h-[400px] markdown-body overflow-auto">
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Description */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Description:</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the article"
            className="w-full"
          />
        </div>

        {/* Image URL with Preview */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Image URL:</label>
          <Input
            value={img}
            onChange={(e) => setImg(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full"
          />
          {img && (
            <div className="mt-4">
              <p className="font-medium mb-2">Image Preview:</p>
              <img
                src={img || "/placeholder.svg"}
                alt={imgAlt || "Image Preview"}
                className="max-h-64 object-contain border border-white/20"
                onError={(e) => {
                  e.currentTarget.src = "/placeholder.svg?height=200&width=400"
                }}
              />
            </div>
          )}
        </div>

        {/* Image Alt */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Image Alt:</label>
          <Input
            value={imgAlt}
            onChange={(e) => setImgAlt(e.target.value)}
            placeholder="Description of the image for accessibility"
            className="w-full"
          />
        </div>

        {/* Label */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Label:</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Article category or label"
            className="w-full"
          />
        </div>

        {/* Popularity */}
        <div className="mb-6 flex items-center space-x-2">
          <Checkbox
            id="popularity"
            checked={popularity}
            onCheckedChange={(checked) => setPopularity(checked as boolean)}
          />
          <label
            htmlFor="popularity"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Mark as popular article
          </label>
        </div>

        {/* Read Time */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Read Time:</label>
          <Input
            value={readTime}
            onChange={(e) => setReadTime(e.target.value)}
            placeholder="e.g., 5 min read"
            className="w-full"
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-4 mt-8">
          <Button onClick={handleUpdate} disabled={saving}  variant="outline">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Updating..." : "Update Article"}
          </Button>

          <Button
             variant="outline"
             className="border-red-500 text-red-500"
            onClick={() => {
              if (window.confirm("Are you sure you want to delete this article? This action cannot be undone.")) {
                handleDelete()
              }
            }}
            disabled={saving}
          >
            Delete Article
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push("/admin/articles")}
            disabled={saving}
            className="ml-auto"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
