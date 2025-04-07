"use client"

import { collection, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import Link from "next/link"
import { useEffect, useState } from "react"
import PageTitle from "@/components/PageTitle"
import { ArrowUp, ArrowDown, Search, Eye, Pencil, Trash2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Breadcrumb } from "@/components/breadcrumb"
import { formatDate } from "@/lib/utils"

interface Article {
  id: string
  title: string
  authorName: string
  createdAt?: any
  publish: boolean
  img: string
  slug: string
  label: string
}

type SortField = "title" | "authorName" | "createdAt" | "publish" | "label"

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [loading, setLoading] = useState(true)
  // Remove these state variables as they're no longer needed
  // const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // const [articleToDelete, setArticleToDelete] = useState<string | null>(null)

  const { toast } = useToast()

  // Toggle the publish status
  const togglePublish = async (articleId: string, currentStatus: boolean) => {
    try {
      const articleRef = doc(db, "articles", articleId)
      await updateDoc(articleRef, { publish: !currentStatus })

      setArticles((prevArticles) =>
        prevArticles.map((article) => (article.id === articleId ? { ...article, publish: !currentStatus } : article)),
      )

      toast({
        title: "Status updated",
        description: `Article is now ${!currentStatus ? "published" : "unpublished"}`,
        variant: "success",
      })
    } catch (error) {
      console.error("Error updating publish status:", error)
      toast({
        title: "Error",
        description: "Failed to update article status",
        variant: "destructive",
      })
    }
  }

  // Replace the confirmDelete function with this version that uses window.confirm
  const confirmDelete = (articleId: string) => {
    if (window.confirm("Are you sure you want to delete this article? This action cannot be undone.")) {
      deleteArticle(articleId)
    }
  }

  // Update the deleteArticle function to accept the articleId parameter
  const deleteArticle = async (articleId: string) => {
    try {
      await deleteDoc(doc(db, "articles", articleId))

      setArticles((prevArticles) => prevArticles.filter((article) => article.id !== articleId))

      toast({
        title: "Article deleted",
        description: "The article has been permanently removed",
        variant: "success",
      })
    } catch (error) {
      console.error("Error deleting article:", error)
      toast({
        title: "Error",
        description: "Failed to delete article",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    const fetchArticles = async () => {
      setLoading(true)
      try {
        const snap = await getDocs(collection(db, "articles"))
        const docs = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Article[]
        setArticles(docs)
      } catch (error) {
        console.error("Error fetching articles:", error)
        toast({
          title: "Error",
          description: "Failed to load articles",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }
    fetchArticles()
  }, [toast])

  // Sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  // Filter and sort articles
  const filteredArticles = articles
    .filter((article) => {
      const term = searchTerm.toLowerCase()
      return (
        article.title?.toLowerCase().includes(term) ||
        article.authorName?.toLowerCase().includes(term) ||
        article.label?.toLowerCase().includes(term)
      )
    })
    .sort((a, b) => {
      if (!sortField) return 0

      let aVal: any = a[sortField]
      let bVal: any = b[sortField]

      if (sortField === "createdAt") {
        aVal = aVal?.toDate?.() ?? new Date(0)
        bVal = bVal?.toDate?.() ?? new Date(0)
      }

      if (sortField === "publish") {
        aVal = aVal ? 1 : 0
        bVal = bVal ? 1 : 0
      }

      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase()
        bVal = bVal.toLowerCase()
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1
      return 0
    })

  // Render sort icons for the active column
  const renderSortIcon = (field: SortField) => {
    if (sortField === field) {
      return sortOrder === "asc" ? (
        <ArrowUp className="inline ml-1 h-4 w-4" />
      ) : (
        <ArrowDown className="inline ml-1 h-4 w-4" />
      )
    }
    return null
  }

  const breadcrumbItems = [{ label: "Dashboard", href: "/admin" }, { label: "Articles" }]

  return (
    <div className="min-h-screen text-white overflow-x-hidden w-full">
      {/* Header */}
      <div className="w-full px-4 pt-4 md:pt-0">
        <div className="mb-2 mt-6 md:mt-0">
          <Breadcrumb items={breadcrumbItems} />
        </div>

        <div className="mt-4">
          <PageTitle className="sr-only" imgSrc="/images/titles/posts.svg" imgAlt="Dashboard">
            L.A.P CMS
          </PageTitle>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6">
          <Button asChild className="w-full sm:w-auto" variant="outline">
            <Link href="/admin/articles/new">
              <Plus className="mr-2 h-4 w-4" /> New Post
            </Link>
          </Button>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64 md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
            <Input
              type="text"
              placeholder="Search articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Scrollable table area */}
      <div className="px-4 pb-4 mt-6">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2be2]"></div>
            <span className="ml-3">Loading articles...</span>
          </div>
        ) : (
          <div className="overflow-x-auto border border-white/10 rounded-none">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="p-4 text-left font-medium text-white/70 whitespace-nowrap">Image</th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("title")}
                  >
                    Title {renderSortIcon("title")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("label")}
                  >
                    Label {renderSortIcon("label")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("authorName")}
                  >
                    Author {renderSortIcon("authorName")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("createdAt")}
                  >
                    Created {renderSortIcon("createdAt")}
                  </th>
                  <th
                    className="p-4 text-left font-medium text-white/70 cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("publish")}
                  >
                    Status {renderSortIcon("publish")}
                  </th>
                  <th className="p-4 text-left font-medium text-white/70 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredArticles.map((article) => (
                  <tr key={article.id} className="hover:bg-white/5">
                    {/* Thumbnail */}
                    <td className="p-4 whitespace-nowrap">
                      <div className="w-16 h-16 overflow-hidden">
                        <img
                          src={article.img || "/placeholder.svg?height=64&width=64"}
                          alt={article.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg?height=64&width=64"
                          }}
                        />
                      </div>
                    </td>
                    {/* Title */}
                    <td className="p-4 whitespace-nowrap font-medium">{article.title}</td>
                    {/* Label */}
                    <td className="p-4 whitespace-nowrap">
                      <span className="px-2 py-1 bg-white/10 text-xs rounded-none">
                        {article.label || "Uncategorized"}
                      </span>
                    </td>
                    {/* Author */}
                    <td className="p-4 whitespace-nowrap">{article.authorName}</td>
                    {/* Created Date */}
                    <td className="p-4 whitespace-nowrap">{formatDate(article.createdAt?.toDate?.())}</td>
                    {/* Publish Toggle */}
                    <td className="p-4 whitespace-nowrap">
                      <Button
                        onClick={() => togglePublish(article.id, article.publish)}
                        variant={article.publish ? "default" : "secondary"}
                        size="sm"
                      >
                        {article.publish ? "Published" : "Draft"}
                      </Button>
                    </td>
                    {/* Actions */}
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Button asChild size="icon" variant="ghost">
                          <Link
                            href={`https://lap-docs.netlify.app/posts/${article.slug}`}
                            target="_blank"
                            title="View article"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild size="icon" variant="ghost">
                          <Link href={`/admin/articles/${article.id}`} title="Edit article">
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => confirmDelete(article.id)}
                          title="Delete article"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredArticles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-white/50">
                      {searchTerm ? "No matching articles found." : "No articles found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Remove the ConfirmDialog component at the bottom of the component */}
      {/* <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Article"
        description="Are you sure you want to delete this article? This action cannot be undone."
        onConfirm={deleteArticle}
        confirmText="Delete"
        variant="destructive"
      /> */}
    </div>
  )
}

