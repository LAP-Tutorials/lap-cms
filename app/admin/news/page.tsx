"use client"

import { collection, getDocs, deleteDoc, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useEffect, useState } from "react"
import Link from "next/link"
import PageTitle from "@/components/PageTitle"
import { Button } from "@/components/ui/button"
import { Breadcrumb } from "@/components/breadcrumb"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"
import { Plus, Pencil, Trash2 } from "lucide-react"

interface NewsItem {
  id: string
  title: string
  createdAt?: any
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const fetchNews = async () => {
      setLoading(true)
      try {
        const snap = await getDocs(collection(db, "news"))
        const docs = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as NewsItem[]
        setNews(docs)
      } catch (error) {
        console.error("Error fetching news:", error)
        toast({
          title: "Error",
          description: "Failed to load news items",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }
    fetchNews()
  }, [toast])

  const confirmDelete = (newsId: string) => {
    if (window.confirm("Are you sure you want to delete this news item? This action cannot be undone.")) {
      handleDelete(newsId)
    }
  }

  const handleDelete = async (newsId: string) => {
    try {
      await deleteDoc(doc(db, "news", newsId))
      setNews((prevNews) => prevNews.filter((item) => item.id !== newsId))
      toast({
        title: "News deleted",
        description: "The news item has been permanently removed",
        variant: "success",
      })
    } catch (error) {
      console.error("Error deleting news:", error)
      toast({
        title: "Error",
        description: "Failed to delete news item",
        variant: "destructive",
      })
    }
  }

  const breadcrumbItems = [{ label: "Dashboard", href: "/admin" }, { label: "News" }]

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div className="flex justify-between items-center mb-6">
        <PageTitle className="sr-only" imgSrc="/images/titles/news.svg" imgAlt="News">
          News
        </PageTitle>
      </div>

      <div className="mb-6">
        <Button asChild variant="outline">
          <Link href="/admin/news/new">
            <Plus className="mr-2 h-4 w-4" /> New News Item
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2be2]"></div>
          <span className="ml-3">Loading news...</span>
        </div>
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded-none">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5">
              <tr>
                <th className="p-4 text-left font-medium text-white/70">Title</th>
                <th className="p-4 text-left font-medium text-white/70">Created</th>
                <th className="p-4 text-left font-medium text-white/70">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {news.map((item) => (
                <tr key={item.id} className="hover:bg-white/5">
                  <td className="p-4 font-medium">{item.title}</td>
                  <td className="p-4">{formatDate(item.createdAt?.toDate?.())}</td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/news/${item.id}`} title="Edit news">
                          <Pencil className="h-4 w-4 mr-1" /> Edit
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => confirmDelete(item.id)} title="Delete news">
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {news.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-white/50">
                    No news items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

