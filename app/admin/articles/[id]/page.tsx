"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Breadcrumb } from "@/components/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, sanitizeUrl } from "@/lib/utils";
import { Loader2, AlertTriangle, ImageIcon, X } from "lucide-react";
import { MarkdownToolbar } from "@/components/markdown-toolbar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AssetManager } from "@/components/admin/assets/asset-manager";
import { convertImageToWebP } from "@/lib/image-utils";
import { useDropzone } from "react-dropzone";
import { useAssets } from "@/hooks/use-assets";

export default function EditArticlePage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [img, setImg] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [date, setDate] = useState("");
  const [popularity, setPopularity] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [readTime, setReadTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { toast } = useToast();

  // Use assets hook for uploading thumbnail
  // The path logic assumes asset manager handles "Articles/[id]" logic.
  // We will use direct uploads here similar to New page for Thumbnail
  const { uploadAsset } = useAssets(`Articles/${id}`);

  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);

      try {
        const ref = doc(db, "articles", id);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setTitle(data.title || "");
          setContent(
            typeof data.content === "string"
              ? data.content
              : data.content
              ? JSON.stringify(data.content, null, 2)
              : ""
          );
          setDescription(data.description || "");
          setImg(data.img || "");
          setImgAlt(data.imgAlt || "");
          setLabel(data.label || "");
          setSlug(data.slug || "");
          setPopularity(data.popularity || false);
          setIsPublished(data.publish || false);
          setReadTime(data.read || "");
          setDate(data.date ? formatDate(data.date.toDate()) : "");
        } else {
          setError("Article not found");
        }
      } catch (err) {
        console.error("Error fetching article:", err);
        setError("Failed to load article");
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [id]);

  const handleUpdate = async () => {
    if (!title || !content) {
      toast({
        title: "Missing fields",
        description: "Title and content are required",
        variant: "destructive",
      });
      return;
    }

    const user = auth.currentUser;
    if (!user || !id) {
      toast({
        title: "Authentication error",
        description: "You must be logged in to update articles",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const ref = doc(db, "articles", id);
      await updateDoc(ref, {
        title,
        content,
        description,
        img,
        imgAlt,
        label,
        slug,
        popularity,
        publish: isPublished,
        read: readTime,
        updatedAt: serverTimestamp(),
        // Don't update date to keep it uneditable
      });

      toast({
        title: "Article updated",
        description: "Your article has been successfully updated",
        variant: "success",
      });

      router.push("/admin/articles");
    } catch (err) {
      console.error("Error updating article:", err);
      toast({
        title: "Error",
        description: "Failed to update article",
        variant: "destructive",
      });
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      if (!id) return;
      const ref = doc(db, "articles", id);
      await deleteDoc(ref);

      toast({
        title: "Article deleted",
        description: "The article has been permanently removed",
        variant: "success",
      });

      router.push("/admin/articles");
    } catch (err) {
      console.error("Error deleting article:", err);
      toast({
        title: "Error",
        description: "Failed to delete article",
        variant: "destructive",
      });
    }
  };

  const handleMarkdownInsert = (textToInsert: string) => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = `${content.substring(
      0,
      start
    )}${textToInsert}${content.substring(end)}`;
    setContent(newContent);

    // Focus and set cursor position after the inserted text
    setTimeout(() => {
      textarea.focus();
      const newCursorPosition = start + textToInsert.length;
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
    }, 0);
  };

  // Convert markdown to HTML using Marked and sanitize it with DOMPurify
  useEffect(() => {
    const generatePreview = async () => {
      try {
        marked.setOptions({
          gfm: true,
          breaks: true,
        });
        const rawHtml = await marked.parse(content);
        const sanitized = DOMPurify.sanitize(rawHtml, {
          ADD_TAGS: ["iframe"],
          ADD_ATTR: [
            "allow",
            "allowfullscreen",
            "frameborder",
            "height",
            "scrolling",
            "src",
            "width",
          ],
        });
        setPreviewHtml(sanitized);
      } catch (err) {
        console.error("Error generating preview:", err);
        setPreviewHtml("<p>Error generating preview</p>");
      }
    };

    generatePreview();
  }, [content]);

  // Custom thumbnail uploader using dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      try {
        toast({ title: "Processing thumbnail...", variant: "default" });

        const webpFile = await convertImageToWebP(file);
        const thumbnailFile = new File([webpFile], "thumbnail.webp", {
          type: "image/webp",
        });

        const { ref, uploadBytes, getDownloadURL } = await import(
          "firebase/storage"
        );
        const { storage } = await import("@/lib/firebase");

        const storageRef = ref(storage, `Articles/${id}/thumbnail.webp`);
        await uploadBytes(storageRef, thumbnailFile);
        const url = await getDownloadURL(storageRef);

        setImg(url);
        const newAlt = `${title || "Article"} thumbnail`;
        setImgAlt(newAlt);
        toast({ title: "Thumbnail uploaded", variant: "success" });
      } catch (e) {
        console.error(e);
        toast({ title: "Thumbnail failed", variant: "destructive" });
      }
    },
    accept: { "image/*": [] },
    maxFiles: 1,
  });

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Articles", href: "/admin/articles" },
    { label: "Edit Article" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2be2]"></div>
        <span className="ml-3">Loading article...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-center min-h-[60vh] flex-col">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-white/70">{error}</p>
          <Button
            onClick={() => router.push("/admin/articles")}
            className="mt-6"
          >
            Back to Articles
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 mt-6 max-w-[1600px] mx-auto">
        {/* === MAIN CONTENT AREA (Left) === */}
        <div className="flex-1 w-full lg:w-3/4 space-y-6">
          {/* Title Input - Large & Clean */}
          <div className="group relative">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article Title"
              className="w-full bg-transparent text-4xl md:text-5xl font-bold border-none outline-none placeholder:text-white/20 text-white leading-tight"
            />
          </div>

          {/* Content Editor */}
          <div className="min-h-[60vh] flex flex-col">
            <Tabs defaultValue="write" className="w-full flex-1 flex flex-col">
              <TabsList className="w-fit mb-4 bg-transparent p-0 gap-4">
                <TabsTrigger
                  value="write"
                  className="data-[state=active]:bg-transparent data-[state=active]:text-purple-400 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-purple-400 rounded-none px-0 pb-1"
                >
                  Write
                </TabsTrigger>
                <TabsTrigger
                  value="preview"
                  className="data-[state=active]:bg-transparent data-[state=active]:text-purple-400 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-purple-400 rounded-none px-0 pb-1"
                >
                  Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="write"
                className="flex-1 flex flex-col mt-0 h-full relative group"
              >
                <div className="sticky top-0 z-10 bg-[#0a0a0a] pb-2 pt-2">
                  <MarkdownToolbar
                    textareaRef={
                      contentRef as React.RefObject<HTMLTextAreaElement>
                    }
                    onInsert={handleMarkdownInsert}
                  />
                </div>
                <Textarea
                  ref={contentRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tell your story..."
                  className="flex-1 min-h-[600px] text-lg leading-relaxed border-none focus-visible:ring-0 focus-visible:border-none resize-y p-6 font-[family-name:var(--font-fira-code)] bg-transparent placeholder:text-white/20"
                />
              </TabsContent>

              <TabsContent value="preview" className="mt-0">
                <div className="border border-white/10 rounded-md p-8 min-h-[500px] markdown-body bg-[#1A1A1A]">
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* === SIDEBAR (Right) === */}
        <div className="w-full lg:w-[350px] space-y-6 flex-shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto no-scrollbar">
          {/* Actions Card */}
          <div className="bg-[#1A1A1A] border border-white/10 p-5 rounded-xl space-y-4 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white/90">Publishing</h3>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                  className="data-[state=checked]:bg-[#8a2be2] data-[state=unchecked]:bg-zinc-600 border border-white/20"
                />
                <Label
                  htmlFor="publish-status"
                  className="text-xs uppercase tracking-wider text-white/60"
                >
                  {isPublished ? "Published" : "Draft"}
                </Label>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleUpdate}
                disabled={saving}
                variant="default"
                style={{ backgroundColor: "#8a2be2", color: "white" }}
                className="w-full font-medium rounded-md h-10"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? "Updating..." : "Update Article"}
              </Button>
              <Button
                variant="destructive"
                style={{ backgroundColor: "#dc2626", color: "white" }}
                className="w-full rounded-md h-10"
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to delete this article? This action cannot be undone."
                    )
                  ) {
                    handleDelete();
                  }
                }}
                disabled={saving}
              >
                Delete Article
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push("/admin/articles")}
                disabled={saving}
                style={{ backgroundColor: "#333333", color: "white" }}
                className="w-full rounded-md h-10 hover:bg-[#444444]"
              >
                Cancel
              </Button>
            </div>

            <div className="h-px bg-white/10 my-4" />

            {/* Thumbnail Uploader */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/70">Thumbnail</h3>
                {img && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-[#f87171] hover:text-[#fca5a5] p-0 hover:bg-transparent"
                    onClick={() => setImg("")}
                  >
                    Remove
                  </Button>
                )}
              </div>

              {img ? (
                <div className="relative aspect-video rounded-lg overflow-hidden border border-white/10 group bg-black/50">
                  <img
                    src={img}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                    isDragActive
                      ? "border-[#8a2be2] bg-[#8a2be2]/10"
                      : "border-white/10 hover:border-white/30 hover:bg-white/5"
                  }`}
                >
                  <input {...getInputProps()} />
                  <ImageIcon className="h-8 w-8 text-white/40 mx-auto mb-2" />
                  <p className="text-xs text-white/50">
                    Drag & drop or click to upload
                  </p>
                </div>
              )}
              <Input
                value={img}
                onChange={(e) => setImg(e.target.value)}
                placeholder="Or paste image URL"
                className="h-8 text-xs bg-black/20 border-white/10"
              />
            </div>

            <div className="h-px bg-white/10 my-4" />

            {/* Metadata Fields */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Slug
                </label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="article-slug"
                  className="bg-black/20 border-white/10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Description
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Short description..."
                  className="bg-black/20 border-white/10 min-h-[80px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Label
                </label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Category"
                  className="bg-black/20 border-white/10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Read Time
                </label>
                <Input
                  value={readTime}
                  onChange={(e) => setReadTime(e.target.value)}
                  placeholder="5 min read"
                  className="bg-black/20 border-white/10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Created Date
                </label>
                <Input
                  value={date}
                  disabled
                  className="bg-black/20 border-white/10 opacity-50 cursor-not-allowed"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="popularity"
                  checked={popularity}
                  onCheckedChange={(c) => setPopularity(c as boolean)}
                  className="border-white/20 data-[state=checked]:bg-[#8a2be2] data-[state=checked]:border-[#8a2be2]"
                />
                <label
                  htmlFor="popularity"
                  className="text-sm cursor-pointer text-white/80 select-none"
                >
                  Mark as Popular
                </label>
              </div>
            </div>
          </div>

          {/* Asset Manager Accordion */}
          <div className="bg-[#1A1A1A] border border-white/10 rounded-xl overflow-hidden shadow-lg">
            <div className="p-4 bg-white/5 border-b border-white/5 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-purple-500" />
              <h3 className="font-semibold text-white/90 text-sm">
                Asset Library
              </h3>
            </div>
            <div className="p-2">
              <AssetManager rootPath={`Articles/${id}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
