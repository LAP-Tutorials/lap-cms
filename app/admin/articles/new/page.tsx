"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  setDoc,
  serverTimestamp,
  doc,
  getDocs,
  Timestamp,
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Breadcrumb } from "@/components/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ImageIcon, Save } from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { generateSlugFromTitle, sanitizeText } from "@/lib/utils";
import { MarkdownToolbar } from "@/components/markdown-toolbar";
import { AssetManager } from "@/components/admin/assets/asset-manager";
import { convertImageToWebP } from "@/lib/image-utils";
import { useDropzone } from "react-dropzone";
import { useAutosave } from "@/hooks/use-autosave";
import { format } from "date-fns";

// Type for an author document
interface Author {
  id: string;
  name: string;
  uid: string;
}

export default function NewArticlePage() {
  // Generate article ID on mount for asset uploads
  const [articleId] = useState(() => {
    const { v4: uuidv4 } = require("uuid");
    return uuidv4();
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [img, setImg] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [label, setLabel] = useState("");
  const [popularity, setPopularity] = useState(false);
  const [readTime, setReadTime] = useState("");
  const [slug, setSlug] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const contentRef = useRef<HTMLTextAreaElement>(null!);

  // Author autocomplete state
  const [authorName, setAuthorName] = useState("");
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Label autocomplete state
  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const [showLabelSuggestions, setShowLabelSuggestions] = useState(false);
  const labelSuggestionsRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
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

        const storageRef = ref(storage, `Articles/${articleId}/thumbnail.webp`);
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

  // Fetch authors on mount
  useEffect(() => {
    const fetchAuthors = async () => {
      try {
        const snap = await getDocs(collection(db, "authors"));
        const docs = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Author[];
        setAuthors(docs);
      } catch (error) {
        console.error("Error fetching authors:", error);
        toast({
          title: "Error",
          description: "Failed to load authors",
          variant: "destructive",
        });
      }
    };
    fetchAuthors();
  }, [toast]);

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

  // Auto-generate slug from title
  useEffect(() => {
    if (title) {
      setSlug(generateSlugFromTitle(title));
    }
  }, [title]);

  // Update selected author if input changes
  useEffect(() => {
    if (authorName.trim() === "") {
      setSelectedAuthor(null);
      return;
    }
    const match = authors.find((a) =>
      a.name.toLowerCase().includes(authorName.toLowerCase()),
    );

    if (match) {
      setSelectedAuthor(match);
    } else {
      setSelectedAuthor(null);
    }
  }, [authorName, authors]);

  // Hide suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
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

  // Convert markdown to HTML for preview
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

  const saveToFirestore = useCallback(
    async (isManual: boolean = false) => {
      // Basic validation for manual save
      if (isManual) {
        if (!title.trim()) {
          toast({
            title: "Missing title",
            description: "Please enter a title for the article",
            variant: "destructive",
          });
          throw new Error("Missing title");
        }
        if (!content.trim()) {
          toast({
            title: "Missing content",
            description: "Please enter content for the article",
            variant: "destructive",
          });
          throw new Error("Missing content");
        }
        if (!authorName.trim()) {
          toast({
            title: "Missing author",
            description: "Please select an author for the article",
            variant: "destructive",
          });
          throw new Error("Missing author");
        }
      }

      const user = auth.currentUser;
      if (!user) {
        if (isManual) {
          toast({
            title: "Authentication error",
            description: "You must be logged in to create articles",
            variant: "destructive",
          });
        }
        throw new Error("Not authenticated");
      }

      // If we are autosaving but there's no title, we can't really save a meaningful draft or slug
      if (!isManual && !title.trim() && !content.trim()) {
        return;
      }

      if (isManual) setCreating(true);

      try {
        const articleData: any = {
          title,
          content,
          description,
          img,
          imgAlt,
          label,
          popularity,
          read: readTime,
          slug,
          authorName: selectedAuthor ? selectedAuthor.name : authorName,
          authorUID: selectedAuthor ? selectedAuthor.uid : user.uid,
          authorRef: selectedAuthor
            ? doc(db, "authors", selectedAuthor.id)
            : doc(db, "authors", user.uid),

          // Set createdAt/date if not exists (merge will keep existing)
          // Actually serverTimestamp() will always update.
          // For autosave (draft), we want to set createdAt once.
          // For now, we will just set updatedAt.
          // Original code set `createdAt` and `date`.
          updatedAt: serverTimestamp(),
          publish: isPublished,
        };

        // If it's the first save (no doc exists), we should set createdAt.
        // Since we don't know if doc exists without fetching, and we use setDoc with merge.
        // We can just set it.
        // Note: New Article Page - articleId is generated on client. Doc likely doesn't exist yet unless autosaved.
        // We can add createdAt only if we think it's new?
        // Let's just set it. Firestore serverTimestamp is fine.
        articleData.createdAt = serverTimestamp();
        articleData.date = serverTimestamp();

        if (scheduledDate) {
          articleData.scheduledPublishDate = Timestamp.fromDate(
            new Date(scheduledDate),
          );
        } else {
          articleData.scheduledPublishDate = null;
        }

        await setDoc(doc(db, "articles", articleId), articleData, {
          merge: true,
        });

        if (isManual) {
          toast({
            title: "Article created",
            description: "Your article has been successfully created",
            variant: "success",
          });
          router.push("/admin/articles");
        }
      } catch (error) {
        console.error("Error creating article:", error);
        if (isManual) {
          toast({
            title: "Error",
            description: "Failed to create article",
            variant: "destructive",
          });
          setCreating(false);
        }
        throw error;
      }
    },
    [
      title,
      content,
      description,
      img,
      imgAlt,
      label,
      popularity,
      readTime,
      slug,
      authorName,
      selectedAuthor,
      isPublished,
      scheduledDate,
      articleId,
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
    popularity,
    readTime,
    slug,
    authorName,
    isPublished,
    scheduledDate,
  };

  const { status: saveStatus, lastSaved } = useAutosave({
    data: autosaveData,
    onSave: async () => {
      if (title || content) {
        await saveToFirestore(false);
      }
    },
    interval: 3000,
  });

  const handleManualSave = () => saveToFirestore(true);

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Articles", href: "/admin/articles" },
    { label: "New Article" },
  ];

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
          <p className="text-sm text-white/50 mt-1">
            Auto-generated from title
          </p>
        </div>

        {/* Author Name with Autocomplete */}
        <div className="mb-6 relative">
          <label className="block mb-2 font-medium">Author:</label>
          <Input
            value={authorName}
            onChange={(e) => {
              setAuthorName(e.target.value);
              setShowSuggestions(true);
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
                .filter((a) =>
                  a.name.toLowerCase().includes(authorName.toLowerCase()),
                )
                .map((a) => (
                  <div
                    key={a.id}
                    className="px-4 py-2 hover:bg-[#8a2be2]/20 cursor-pointer"
                    onClick={() => {
                      setAuthorName(a.name);
                      setSelectedAuthor(a);
                      setShowSuggestions(false);
                    }}
                  >
                    {a.name}
                  </div>
                ))}
            </div>
          )}
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
                    textareaRef={contentRef}
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
                <AssetManager rootPath={`Articles/${articleId}`} />
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
                src={
                  img &&
                  (img.startsWith("http://") ||
                    img.startsWith("https://") ||
                    img.startsWith("/"))
                    ? img
                    : "/placeholder.svg"
                }
                alt={sanitizeText(imgAlt) || "Thumbnail Preview"}
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
            </p>
          </div>
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

        {/* Action buttons */}
        <div className="flex flex-wrap gap-4 mt-8">
          <Button
            onClick={handleManualSave}
            disabled={creating}
            variant="outline"
          >
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
  );
}
