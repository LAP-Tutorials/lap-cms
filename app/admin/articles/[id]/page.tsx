"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  Timestamp,
  where,
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
import { formatDate, generateSlugFromTitle, sanitizeUrl } from "@/lib/utils";
import {
  Loader2,
  AlertTriangle,
  ImageIcon,
  Copy,
  Check,
  Save,
} from "lucide-react";
import { MarkdownToolbar } from "@/components/markdown-toolbar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AssetManager } from "@/components/admin/assets/asset-manager";
import { convertImageToWebP } from "@/lib/image-utils";
import { useDropzone } from "react-dropzone";
import { useAutosave } from "@/hooks/use-autosave";
import { format } from "date-fns";

export default function EditArticlePage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [img, setImg] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [date, setDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [popularity, setPopularity] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  // Track initial publish status to determine if we are publishing for the first time/re-publishing
  const [initialPublishStatus, setInitialPublishStatus] = useState(false);
  const [readTime, setReadTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Label autocomplete state
  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const [showLabelSuggestions, setShowLabelSuggestions] = useState(false);
  const labelSuggestionsRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const trimmedImg = img.trim();
  const thumbnailPreviewSrc = (() => {
    if (!trimmedImg) return "";
    if (trimmedImg.startsWith("/")) return trimmedImg;

    try {
      const parsed = new URL(trimmedImg);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch {
      return "";
    }

    return "";
  })();

  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { toast } = useToast();

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

        const { ref, uploadBytes, getDownloadURL } =
          await import("firebase/storage");
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
        toast({ title: "Thumbnail upload failed", variant: "destructive" });
      }
    },
    accept: { "image/*": [] },
    maxFiles: 1,
  });

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
                : "",
          );
          setDescription(data.description || "");
          setImg(data.img || "");
          setImgAlt(data.imgAlt || "");
          setLabel(data.label || "");
          setSlug(data.slug || "");
          setPopularity(data.popularity || false);
          setIsPublished(data.publish || false);
          setInitialPublishStatus(data.publish || false);
          setReadTime(data.read || "");
          setDate(data.date ? formatDate(data.date.toDate()) : "");

          if (data.scheduledPublishDate) {
            const d = data.scheduledPublishDate.toDate();
            // Adjust for local time input
            const offset = d.getTimezoneOffset() * 60000;
            const localDate = new Date(d.getTime() - offset);
            setScheduledDate(localDate.toISOString().slice(0, 16));
          } else {
            setScheduledDate("");
          }
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

  // Fetch existing labels from articles
  useEffect(() => {
    const fetchLabels = async () => {
      try {
        const snap = await getDocs(collection(db, "articles"));
        const labels = snap.docs
          .map((doc) => doc.data().label)
          .filter(
            (label): label is string =>
              typeof label === "string" && label.trim() !== "",
          );
        // Get unique labels
        const uniqueLabels = [...new Set(labels)].sort();
        setExistingLabels(uniqueLabels);
      } catch (error) {
        console.error("Error fetching labels:", error);
      }
    };
    fetchLabels();
  }, []);

  // Hide label suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        labelSuggestionsRef.current &&
        !labelSuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowLabelSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const saveToFirestore = useCallback(
    async (isManual: boolean = false) => {
      // Basic validation for manual save
      if (isManual) {
        if (!title || !content) {
          toast({
            title: "Missing fields",
            description: "Title and content are required",
            variant: "destructive",
          });
          throw new Error("Missing fields");
        }
      }

      const user = auth.currentUser;
      if (!user || !id) {
        if (isManual) {
          toast({
            title: "Authentication error",
            description: "You must be logged in to update articles",
            variant: "destructive",
          });
        }
        throw new Error("Authentication error");
      }

      // If autosaving and no content, skip (though usually edits have content)
      if (!isManual && !title && !content) return;

      const normalizedSlug = slug.trim();
      if (!normalizedSlug) {
        toast({
          title: "Missing slug",
          description: "Please enter a slug for the article",
          variant: "destructive",
        });
        throw new Error("Missing slug");
      }

      // ponytail: this prevents normal CMS duplicates; use slug claim documents if concurrent writers become common.
      const slugMatches = await getDocs(
        query(collection(db, "articles"), where("slug", "==", normalizedSlug)),
      );
      if (slugMatches.docs.some((item) => item.id !== id)) {
        toast({
          title: "Slug already in use",
          description: "Choose a different slug before saving this article",
          variant: "destructive",
        });
        throw new Error("Duplicate slug");
      }

      if (isManual) setSaving(true);

      try {
        const ref = doc(db, "articles", id as string);

        // Prepare update data
        const updateData: any = {
          title,
          content,
          description,
          img: sanitizeUrl(trimmedImg),
          imgAlt,
          label,
          slug: normalizedSlug,
          popularity,
          publish: isPublished,
          read: readTime,
          updatedAt: serverTimestamp(),
        };

        // If transition from draft to published, update the date
        if (isPublished && !initialPublishStatus) {
          updateData.date = serverTimestamp();
          // Update local state so we don't keep updating date on subsequent autosaves
          setInitialPublishStatus(true);
        }

        if (scheduledDate) {
          updateData.scheduledPublishDate = Timestamp.fromDate(
            new Date(scheduledDate),
          );
        } else {
          updateData.scheduledPublishDate = null;
        }

        await updateDoc(ref, updateData);

        if (isManual) {
          toast({
            title: "Article updated",
            description: "Your article has been successfully updated",
            variant: "success",
          });
          router.push("/admin/articles");
        }
      } catch (err) {
        console.error("Error updating article:", err);
        if (isManual) {
          toast({
            title: "Error",
            description: "Failed to update article",
            variant: "destructive",
          });
          setSaving(false);
        }
        throw err;
      }
    },
    [
      title,
      content,
      description,
      img,
      imgAlt,
      label,
      slug,
      popularity,
      isPublished,
      readTime,
      scheduledDate,
      initialPublishStatus,
      id,
      router,
      toast,
    ],
  );

  // Autosave
  const autosaveData = {
    title,
    content,
    description,
    img,
    imgAlt,
    label,
    slug,
    popularity,
    isPublished,
    readTime,
    scheduledDate,
  };

  const { status: saveStatus, lastSaved } = useAutosave({
    data: autosaveData,
    onSave: async () => {
      await saveToFirestore(false);
    },
    interval: 3000,
  });

  const handleManualSave = () => saveToFirestore(true);

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
      start,
    )}${textToInsert}${content.substring(end)}`;
    setContent(newContent);

    // Focus and set cursor position after the inserted text
    setTimeout(() => {
      textarea.focus();
      const newCursorPosition = start + textToInsert.length;
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newContent =
        content.substring(0, start) + "    " + content.substring(end);
      setContent(newContent);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 4, start + 4);
      }, 0);
    }
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

      <div className="flex justify-between items-center">
        <h1 className="text-subtitle font-bold mb-8 mt-4">Edit Article</h1>
      </div>

      <div className="max-w-4xl">
        {/* Article ID */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Article ID:</label>
          <div className="flex gap-2">
            <Input
              value={id}
              disabled
              className="w-full opacity-70 cursor-not-allowed font-mono bg-[#1a1a1a] border-white/20"
            />
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 border-white/20 hover:bg-white/10"
              onClick={() => {
                if (id) {
                  navigator.clipboard.writeText(id as string);
                  setCopied(true);
                  toast({
                    title: "Copied ID",
                    description: "Article ID copied to clipboard",
                    variant: "success",
                  });
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-sm text-white/50 mt-1">
            Unique identifier for this article
          </p>
        </div>

        {/* Title */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Title:</label>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSlug(generateSlugFromTitle(e.target.value));
            }}
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
          <Input
            value={date}
            disabled
            className="w-full opacity-70 cursor-not-allowed"
          />
          <p className="text-sm text-white/50 mt-1">
            Creation date cannot be modified
          </p>
        </div>

        {/* Scheduled Publish */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Scheduled Publish:</label>
          <div className="flex flex-col space-y-2">
            <Input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full bg-black/20 border-white/20"
            />
            <p className="text-sm text-white/50">
              If set, the article will automatically publish at this time.
              Standard publishing will be overridden.
            </p>
          </div>
        </div>

        {/* Toggle Editor/Preview/Assets for Content */}
        <div className="mb-6">
          <label className="block mb-3 font-medium text-lg">Content:</label>
          <Tabs defaultValue="write" className="w-full">
            <div className="overflow-x-auto">
              <TabsList className="w-max min-w-full mb-0 bg-[#1a1a1a] border border-white/20 rounded-b-none p-1 gap-1">
                <TabsTrigger
                  value="write"
                  className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 px-3 sm:px-4 py-2 transition-colors text-sm whitespace-nowrap"
                >
                  Write
                </TabsTrigger>
                <TabsTrigger
                  value="preview"
                  className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 px-3 sm:px-4 py-2 transition-colors text-sm whitespace-nowrap"
                >
                  Preview
                </TabsTrigger>
                <TabsTrigger
                  value="assets"
                  className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 px-3 sm:px-4 py-2 transition-colors text-sm whitespace-nowrap"
                >
                  Assets
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="write" className="mt-0">
              <div className="border border-white/20 overflow-hidden bg-[#0d0d0d]">
                <div className="bg-[#1a1a1a] border-b border-white/20 p-2">
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
                  onKeyDown={handleKeyDown}
                  placeholder="Write your article content in Markdown..."
                  className="min-h-[600px] font-mono bg-transparent border-none rounded-none focus-visible:ring-0 resize-y p-4 text-white/90 placeholder:text-white/30"
                />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="mt-0">
              <div className="border border-white/20 rounded-b-lg p-6 min-h-[600px] markdown-body overflow-auto bg-[#0d0d0d]">
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </TabsContent>
            <TabsContent value="assets" className="mt-0">
              <div className="border border-white/20 rounded-b-lg p-4 min-h-[600px] bg-[#0d0d0d]">
                <AssetManager rootPath={`Articles/${id}`} />
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

        {/* Thumbnail Upload */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">Thumbnail:</label>
          {img ? (
            <div className="relative">
              <img
                src={thumbnailPreviewSrc || "/placeholder.svg"}
                alt={imgAlt.trim() || "Thumbnail Preview"}
                className="max-h-64 object-contain border border-white/20 rounded-lg"
                onError={(e) => {
                  e.currentTarget.src = "/placeholder.svg?height=200&width=400";
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-red-400 hover:text-red-300"
                onClick={() => setImg("")}
              >
                Remove thumbnail
              </Button>
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                isDragActive
                  ? "border-[#8a2be2] bg-[#8a2be2]/10"
                  : "border-white/20 hover:border-white/40 hover:bg-white/5"
              }`}
            >
              <input {...getInputProps()} />
              <ImageIcon className="h-10 w-10 text-white/40 mx-auto mb-3" />
              <p className="text-sm text-white/60">
                Drag & drop an image or click to upload
              </p>
              <p className="text-xs text-white/40 mt-1">
                Will be converted to WebP
              </p>
            </div>
          )}
          <Input
            value={img}
            onChange={(e) => setImg(e.target.value)}
            placeholder="Or paste image URL"
            className="w-full mt-3"
          />
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

        {/* Label with Autocomplete */}
        <div className="mb-6 relative">
          <label className="block mb-2 font-medium">Label:</label>
          <Input
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setShowLabelSuggestions(true);
            }}
            onFocus={() => setShowLabelSuggestions(true)}
            placeholder="Select existing or type new label"
            className="w-full"
          />
          {showLabelSuggestions && existingLabels.length > 0 && (
            <div
              ref={labelSuggestionsRef}
              className="absolute z-10 w-full border border-white/60 bg-[#1a1a1a] mt-1 max-h-48 overflow-y-auto rounded-md"
            >
              {existingLabels
                .filter((l) => l.toLowerCase().includes(label.toLowerCase()))
                .map((l) => (
                  <div
                    key={l}
                    className="px-4 py-2 hover:bg-[#8a2be2]/20 cursor-pointer"
                    onClick={() => {
                      setLabel(l);
                      setShowLabelSuggestions(false);
                    }}
                  >
                    {l}
                  </div>
                ))}
            </div>
          )}
          <p className="text-sm text-white/50 mt-1">
            Select an existing label or type a new one
          </p>
        </div>

        {/* Publish Status & Autosave */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="publish-status"
              checked={isPublished}
              onCheckedChange={setIsPublished}
            />
            <Label htmlFor="publish-status">
              {isPublished ? "Published" : "Draft"}
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            {saveStatus === "saving" && (
              <span className="text-xs text-purple-400 flex items-center animate-pulse">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Saving...
              </span>
            )}
            {saveStatus === "saved" && lastSaved && (
              <span className="text-xs text-green-400 flex items-center">
                <Save className="h-3 w-3 mr-1" />
                Saved {format(lastSaved, "h:mm a")}
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-400">Save failed</span>
            )}
          </div>
        </div>

        {/* Popularity */}
        {/* <div className="mb-6 flex items-center space-x-2">
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
*/}
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
          <Button
            onClick={handleManualSave}
            disabled={saving}
            variant="outline"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Updating..." : "Update Article"}
          </Button>

          <Button
            variant="outline"
            className="border-red-500 text-red-500"
            onClick={() => {
              if (
                window.confirm(
                  "Are you sure you want to delete this article? This action cannot be undone.",
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
  );
}
