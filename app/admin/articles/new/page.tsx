"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { db, auth } from "@/lib/firebase"
import { collection, setDoc, serverTimestamp, doc, getDocs } from "firebase/firestore"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { Breadcrumb } from "@/components/breadcrumb"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"
import { marked } from "marked"
import DOMPurify from "dompurify"
import { generateSlugFromTitle } from "@/lib/utils"
import { MarkdownToolbar } from "@/components/markdown-toolbar"

// Type for an author document
interface Author {
  id: string
  name: string
  uid: string
}

export default function NewArticlePage() {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [description, setDescription] = useState("")
  const [img, setImg] = useState("")
  const [imgAlt, setImgAlt] = useState("")
  const [label, setLabel] = useState("")
  const [popularity, setPopularity] = useState(false)
  const [readTime, setReadTime] = useState("")
  const [slug, setSlug] = useState("")
  const [creating, setCreating] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const contentRef = useRef<HTMLTextAreaElement>(null!)

  // Author autocomplete state
  const [authorName, setAuthorName] = useState("")
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null)
  const [authors, setAuthors] = useState<Author[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const { toast } = useToast()

  // Fetch authors on mount
  useEffect(() => {
    const fetchAuthors = async () => {
      try {
        const snap = await getDocs(collection(db, "authors"))
        const docs = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Author[]
        setAuthors(docs)
      } catch (error) {
        console.error("Error fetching authors:", error)
        toast({
          title: "Error",
          description: "Failed to load authors",
          variant: "destructive",
        })
      }
    }
    fetchAuthors()
  }, [toast])

  // Auto-generate slug from title
  useEffect(() => {
    if (title) {
      setSlug(generateSlugFromTitle(title))
    }
  }, [title])

  // Update selected author if input changes
  useEffect(() => {
    if (authorName.trim() === "") {
      setSelectedAuthor(null)
      return
    }
    const match = authors.find((a) => a.name.toLowerCase().includes(authorName.toLowerCase()))
    if (match) {
      setSelectedAuthor(match)
    } else {
      setSelectedAuthor(null)
    }
  }, [authorName, authors])

  // Hide suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Convert markdown to HTML for preview
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

  const handleSave = async () => {
    if (!title.trim()) {
      toast({
        title: "Missing title",
        description: "Please enter a title for the article",
        variant: "destructive",
      })
      return
    }

    if (!content.trim()) {
      toast({
        title: "Missing content",
        description: "Please enter content for the article",
        variant: "destructive",
      })
      return
    }

    if (!authorName.trim()) {
      toast({
        title: "Missing author",
        description: "Please select an author for the article",
        variant: "destructive",
      })
      return
    }

    const user = auth.currentUser
    if (!user) {
      toast({
        title: "Authentication error",
        description: "You must be logged in to create articles",
        variant: "destructive",
      })
      return
    }

    setCreating(true)

    try {
      // Create new article ID
      const docId = uuidv4()
      await setDoc(doc(db, "articles", docId), {
        title,
        content,
        description,
        img,
        imgAlt,
        label,
        popularity,
        read: readTime,
        slug,
        // Use selected author if available; otherwise fallback
        authorName: selectedAuthor ? selectedAuthor.name : authorName,
        authorUID: selectedAuthor ? selectedAuthor.uid : user.uid,
        authorRef: selectedAuthor ? doc(db, "authors", selectedAuthor.id) : doc(db, "authors", user.uid),
        createdAt: serverTimestamp(),
        date: serverTimestamp(),
        publish: false, // Default to draft
      })

      toast({
        title: "Article created",
        description: "Your article has been successfully created",
        variant: "success",
      })

      router.push("/admin/articles")
    } catch (error) {
      console.error("Error creating article:", error)
      toast({
        title: "Error",
        description: "Failed to create article",
        variant: "destructive",
      })
      setCreating(false)
    }
  }

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Articles", href: "/admin/articles" },
    { label: "New Article" },
  ]

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <h1 className="text-subtitle font-bold mb-8 mt-4">New Article</h1>

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
          <p className="text-sm text-white/50 mt-1">Auto-generated from title</p>
        </div>

        {/* Author Name with Autocomplete */}
        <div className="mb-6 relative">
          <label className="block mb-2 font-medium">Author:</label>
          <Input
            value={authorName}
            onChange={(e) => {
              setAuthorName(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Start typing author name..."
            className="w-full"
          />
          {showSuggestions && authors.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-10 w-full border border-white/60 bg-[#1a1a1a] mt-1 max-h-48 overflow-y-auto"
            >
              {authors
                .filter((a) => a.name.toLowerCase().includes(authorName.toLowerCase()))
                .map((a) => (
                  <div
                    key={a.id}
                    className="px-4 py-2 hover:bg-[#8a2be2]/20 cursor-pointer"
                    onClick={() => {
                      setAuthorName(a.name)
                      setSelectedAuthor(a)
                      setShowSuggestions(false)
                    }}
                  >
                    {a.name}
                  </div>
                ))}
            </div>
          )}
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
          <Button onClick={handleSave} disabled={creating}  variant="outline">
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {creating ? "Creating..." : "Create Article"}
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push("/admin/articles")}
            disabled={creating}
            className="ml-auto"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
