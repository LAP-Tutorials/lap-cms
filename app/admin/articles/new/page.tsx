// "use client";

// import { useState, useEffect, useRef, useCallback } from "react";
// import { useRouter } from "next/navigation";
// import { db, auth } from "@/lib/firebase";
// import {
//   collection,
//   setDoc,
//   serverTimestamp,
//   doc,
//   getDocs,
// } from "firebase/firestore";
// import { v4 as uuidv4 } from "uuid";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
// import { Checkbox } from "@/components/ui/checkbox";
// import { useToast } from "@/hooks/use-toast";
// import { Breadcrumb } from "@/components/breadcrumb";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { Loader2, Upload, ImageIcon, X } from "lucide-react";
// import { Switch } from "@/components/ui/switch";
// import { Label } from "@/components/ui/label";
// import { marked } from "marked";
// import DOMPurify from "dompurify";
// import { generateSlugFromTitle } from "@/lib/utils";

// import { MarkdownToolbar } from "@/components/markdown-toolbar";
// import { AssetManager } from "@/components/admin/assets/asset-manager";
// import { convertImageToWebP } from "@/lib/image-utils";
// import { useDropzone } from "react-dropzone";
// import { useAssets } from "@/hooks/use-assets";

// // Type for an author document
// interface Author {
//   id: string;
//   name: string;
//   uid: string;
// }

// export default function NewArticlePage() {
//   const [articleId] = useState(() => uuidv4());
//   const [title, setTitle] = useState("");
//   const [content, setContent] = useState("");
//   const [description, setDescription] = useState("");
//   const [img, setImg] = useState("");
//   const [imgAlt, setImgAlt] = useState("");
//   const [label, setLabel] = useState("");
//   const [popularity, setPopularity] = useState(false);
//   const [readTime, setReadTime] = useState("");
//   const [slug, setSlug] = useState("");
//   const [creating, setCreating] = useState(false);
//   const [isPublished, setIsPublished] = useState(false);
//   const [previewHtml, setPreviewHtml] = useState("");
//   const contentRef = useRef<HTMLTextAreaElement>(null!);

//   // Author autocomplete state
//   const [authorName, setAuthorName] = useState("");
//   const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null);
//   const [authors, setAuthors] = useState<Author[]>([]);
//   const [showSuggestions, setShowSuggestions] = useState(false);
//   const suggestionsRef = useRef<HTMLDivElement>(null);

//   const router = useRouter();
//   const { toast } = useToast();

//   // Use assets hook for uploading thumbnail
//   const { uploadAsset } = useAssets(`Articles/${articleId}`);

//   // Fetch authors on mount
//   useEffect(() => {
//     const fetchAuthors = async () => {
//       try {
//         const snap = await getDocs(collection(db, "authors"));
//         const docs = snap.docs.map((doc) => ({
//           id: doc.id,
//           ...doc.data(),
//         })) as Author[];
//         setAuthors(docs);
//       } catch (error) {
//         console.error("Error fetching authors:", error);
//         toast({
//           title: "Error",
//           description: "Failed to load authors",
//           variant: "destructive",
//         });
//       }
//     };
//     fetchAuthors();
//   }, [toast]);

//   // Auto-generate slug from title
//   useEffect(() => {
//     if (title) {
//       setSlug(generateSlugFromTitle(title));
//     }
//   }, [title]);

//   // Update selected author if input changes
//   useEffect(() => {
//     if (authorName.trim() === "") {
//       setSelectedAuthor(null);
//       return;
//     }
//     const match = authors.find((a) =>
//       a.name.toLowerCase().includes(authorName.toLowerCase())
//     );
//     if (match) {
//       setSelectedAuthor(match);
//     } else {
//       setSelectedAuthor(null);
//     }
//   }, [authorName, authors]);

//   // Hide suggestions on click outside
//   useEffect(() => {
//     const handleClickOutside = (event: MouseEvent) => {
//       if (
//         suggestionsRef.current &&
//         !suggestionsRef.current.contains(event.target as Node)
//       ) {
//         setShowSuggestions(false);
//       }
//     };
//     document.addEventListener("mousedown", handleClickOutside);
//     return () => document.removeEventListener("mousedown", handleClickOutside);
//   }, []);

//   // Convert markdown to HTML for preview
//   useEffect(() => {
//     const generatePreview = async () => {
//       try {
//         marked.setOptions({
//           gfm: true,
//           breaks: true,
//         });
//         const rawHtml = await marked.parse(content);
//         const sanitized = DOMPurify.sanitize(rawHtml, {
//           ADD_TAGS: ["iframe"],
//           ADD_ATTR: [
//             "allow",
//             "allowfullscreen",
//             "frameborder",
//             "height",
//             "scrolling",
//             "src",
//             "width",
//           ],
//         });
//         setPreviewHtml(sanitized);
//       } catch (err) {
//         console.error("Error generating preview:", err);
//         setPreviewHtml("<p>Error generating preview</p>");
//       }
//     };

//     generatePreview();
//   }, [content]);

//   const handleMarkdownInsert = (textToInsert: string) => {
//     const textarea = contentRef.current;
//     if (!textarea) return;

//     const start = textarea.selectionStart;
//     const end = textarea.selectionEnd;
//     const newContent = `${content.substring(
//       0,
//       start
//     )}${textToInsert}${content.substring(end)}`;
//     setContent(newContent);

//     // Focus and set cursor position after the inserted text
//     setTimeout(() => {
//       textarea.focus();
//       const newCursorPosition = start + textToInsert.length;
//       textarea.setSelectionRange(newCursorPosition, newCursorPosition);
//     }, 0);
//   };

//   // Custom thumbnail uploader using dropzone
//   const { getRootProps, getInputProps, isDragActive } = useDropzone({
//     onDrop: async (acceptedFiles) => {
//       if (acceptedFiles.length === 0) return;
//       const file = acceptedFiles[0];
//       try {
//         toast({ title: "Processing thumbnail...", variant: "default" });

//         // Convert and Rename
//         const webpFile = await convertImageToWebP(file);
//         const thumbnailFile = new File([webpFile], "thumbnail.webp", {
//           type: "image/webp",
//         });

//         // Direct Upload using Firebase functions locally imported to ensure we get URL
//         const { ref, uploadBytes, getDownloadURL } = await import(
//           "firebase/storage"
//         );
//         const { storage } = await import("@/lib/firebase");

//         const storageRef = ref(storage, `Articles/${articleId}/thumbnail.webp`);
//         await uploadBytes(storageRef, thumbnailFile);
//         const url = await getDownloadURL(storageRef);

//         setImg(url);
//         const newAlt = `${title || "Article"} thumbnail`;
//         setImgAlt(newAlt);
//         toast({ title: "Thumbnail uploaded", variant: "success" });
//       } catch (e) {
//         console.error(e);
//         toast({ title: "Thumbnail failed", variant: "destructive" });
//       }
//     },
//     accept: { "image/*": [] },
//     maxFiles: 1,
//   });

//   const handleSave = async () => {
//     if (!title.trim()) {
//       toast({
//         title: "Missing title",
//         description: "Please enter a title for the article",
//         variant: "destructive",
//       });
//       return;
//     }

//     if (!content.trim()) {
//       toast({
//         title: "Missing content",
//         description: "Please enter content for the article",
//         variant: "destructive",
//       });
//       return;
//     }

//     if (!authorName.trim()) {
//       toast({
//         title: "Missing author",
//         description: "Please select an author for the article",
//         variant: "destructive",
//       });
//       return;
//     }

//     const user = auth.currentUser;
//     if (!user) {
//       toast({
//         title: "Authentication error",
//         description: "You must be logged in to create articles",
//         variant: "destructive",
//       });
//       return;
//     }

//     setCreating(true);

//     try {
//       // Create new article ID (use the one generated on mount)
//       await setDoc(doc(db, "articles", articleId), {
//         title,
//         content,
//         description,
//         img,
//         imgAlt,
//         label,
//         popularity,
//         read: readTime,
//         slug,
//         // Use selected author if available; otherwise fallback
//         authorName: selectedAuthor ? selectedAuthor.name : authorName,
//         authorUID: selectedAuthor ? selectedAuthor.uid : user.uid,
//         authorRef: selectedAuthor
//           ? doc(db, "authors", selectedAuthor.id)
//           : doc(db, "authors", user.uid),
//         createdAt: serverTimestamp(),
//         date: serverTimestamp(),
//         publish: false, // Default to draft
//       });

//       toast({
//         title: "Article created",
//         description: "Your article has been successfully created",
//         variant: "success",
//       });

//       router.push("/admin/articles");
//     } catch (error) {
//       console.error("Error creating article:", error);
//       toast({
//         title: "Error",
//         description: "Failed to create article",
//         variant: "destructive",
//       });
//       setCreating(false);
//     }
//   };

//   const breadcrumbItems = [
//     { label: "Dashboard", href: "/admin" },
//     { label: "Articles", href: "/admin/articles" },
//     { label: "New Article" },
//   ];

//   return (
//     <div className="px-4 py-6">
//       <div className="mb-2 mt-6 md:mt-0">
//         <Breadcrumb items={breadcrumbItems} />
//       </div>

//       <div className="flex flex-col lg:flex-row gap-8 mt-6 max-w-[1600px] mx-auto">
//         {/* === MAIN CONTENT AREA (Left) === */}
//         <div className="flex-1 w-full lg:w-3/4 space-y-6">
//           {/* Title Input - Large & Clean */}
//           <div className="group relative">
//             <input
//               type="text"
//               value={title}
//               onChange={(e) => setTitle(e.target.value)}
//               placeholder="Article Title"
//               className="w-full bg-transparent text-4xl md:text-5xl font-bold border-none outline-none placeholder:text-white/20 text-white leading-tight"
//             />
//           </div>

//           {/* Content Editor */}
//           <div className="min-h-[60vh] flex flex-col">
//             <Tabs defaultValue="write" className="w-full flex-1 flex flex-col">
//               <TabsList className="w-fit mb-4 bg-transparent p-0 gap-4">
//                 <TabsTrigger
//                   value="write"
//                   className="data-[state=active]:bg-transparent data-[state=active]:text-purple-400 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-purple-400 rounded-none px-0 pb-1"
//                 >
//                   Write
//                 </TabsTrigger>
//                 <TabsTrigger
//                   value="preview"
//                   className="data-[state=active]:bg-transparent data-[state=active]:text-purple-400 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-purple-400 rounded-none px-0 pb-1"
//                 >
//                   Preview
//                 </TabsTrigger>
//               </TabsList>

//               <TabsContent
//                 value="write"
//                 className="flex-1 flex flex-col mt-0 h-full relative group"
//               >
//                 <div className="sticky top-0 z-10 bg-[#0a0a0a] pb-2 pt-2">
//                   <MarkdownToolbar
//                     textareaRef={contentRef}
//                     onInsert={handleMarkdownInsert}
//                   />
//                 </div>
//                 <Textarea
//                   ref={contentRef}
//                   value={content}
//                   onChange={(e) => setContent(e.target.value)}
//                   placeholder="Type your story..."
//                   className="flex-1 min-h-[500px] text-lg leading-relaxed border-white/20 focus-visible:ring-0 focus-visible:border-white/20 resize-y p-6 font-[family-name:var(--font-fira-code)] bg-transparent placeholder:text-white/20"
//                 />
//               </TabsContent>

//               <TabsContent value="preview" className="mt-0">
//                 <div className="border border-white/20 rounded-md p-8 min-h-[500px] markdown-body bg-[#1A1A1A]">
//                   <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
//                 </div>
//               </TabsContent>
//             </Tabs>
//           </div>
//         </div>

//         {/* === SIDEBAR (Right) === */}
//         <div className="w-full lg:w-[350px] space-y-6 flex-shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto no-scrollbar">
//           {/* Actions Card */}
//           <div className="bg-[#1A1A1A] border border-white/20 p-5 rounded-xl space-y-4 shadow-lg">
//             <div className="flex items-center justify-between mb-2">
//               <h3 className="font-semibold text-white/90">Publishing</h3>
//               <span className="text-xs text-white/40 uppercase tracking-wider">
//                 Draft
//               </span>
//             </div>

//             <div className="space-y-3">
//               <Button
//                 onClick={handleSave}
//                 disabled={creating}
//                 variant="default"
//                 style={{ backgroundColor: "#8a2be2", color: "white" }}
//                 className="w-full font-medium rounded-md h-10"
//               >
//                 {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
//                 {creating ? "Creating..." : "Create Article"}
//               </Button>
//               <Button
//                 variant="secondary"
//                 onClick={() => router.push("/admin/articles")}
//                 disabled={creating}
//                 style={{ backgroundColor: "#333333", color: "white" }}
//                 className="w-full rounded-md h-10 hover:bg-[#444444]"
//               >
//                 Cancel
//               </Button>
//             </div>

//             <div className="h-px bg-white/10 my-4" />

//             {/* Thumbnail Uploader */}
//             <div className="space-y-3">
//               <div className="flex items-center justify-between">
//                 <h3 className="text-sm font-medium text-white/70">Thumbnail</h3>
//                 {img && (
//                   <Button
//                     variant="ghost"
//                     size="sm"
//                     className="h-6 text-xs text-[#f87171] hover:text-[#fca5a5] p-0 hover:bg-transparent"
//                     onClick={() => setImg("")}
//                   >
//                     Remove
//                   </Button>
//                 )}
//               </div>

//               {img ? (
//                 <div className="relative aspect-video rounded-lg overflow-hidden border border-white/20 group bg-black/50">
//                   <img
//                     src={img}
//                     alt="Thumbnail"
//                     className="w-full h-full object-cover"
//                   />
//                 </div>
//               ) : (
//                 <div
//                   {...getRootProps()}
//                   className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
//                     isDragActive
//                       ? "border-[#8a2be2] bg-[#8a2be2]/10"
//                       : "border-white/20 hover:border-white/30 hover:bg-white/5"
//                   }`}
//                 >
//                   <input {...getInputProps()} />
//                   <ImageIcon className="h-8 w-8 text-white/40 mx-auto mb-2" />
//                   <p className="text-xs text-white/50">
//                     Drag & drop or click to upload
//                   </p>
//                 </div>
//               )}
//               {/* Fallback URL input */}
//               <Input
//                 value={img}
//                 onChange={(e) => setImg(e.target.value)}
//                 placeholder="Or paste image URL"
//                 className="h-8 text-xs bg-black/20 border-white/20"
//               />
//             </div>

//             <div className="h-px bg-white/10 my-4" />

//             {/* Metadata Fields */}
//             <div className="space-y-4">
//               <div className="space-y-1.5">
//                 <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
//                   Slug
//                 </label>
//                 <Input
//                   value={slug}
//                   onChange={(e) => setSlug(e.target.value)}
//                   placeholder="article-slug"
//                   className="bg-black/20 border-white/20"
//                 />
//               </div>

//               <div className="space-y-1.5 relative">
//                 <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
//                   Author
//                 </label>
//                 <Input
//                   value={authorName}
//                   onChange={(e) => {
//                     setAuthorName(e.target.value);
//                     setShowSuggestions(true);
//                   }}
//                   onFocus={() => setShowSuggestions(true)}
//                   placeholder="Select author"
//                   className="bg-black/20 border-white/20"
//                 />
//                 {showSuggestions && authors.length > 0 && (
//                   <div
//                     ref={suggestionsRef}
//                     className="absolute z-20 w-full border border-white/20 bg-[#252525] mt-1 max-h-48 overflow-y-auto rounded-md shadow-xl"
//                   >
//                     {authors
//                       .filter((a) =>
//                         a.name.toLowerCase().includes(authorName.toLowerCase())
//                       )
//                       .map((a) => (
//                         <div
//                           key={a.id}
//                           className="px-3 py-2 hover:bg-[#8a2be2]/20 cursor-pointer text-sm transition-colors"
//                           onClick={() => {
//                             setAuthorName(a.name);
//                             setSelectedAuthor(a);
//                             setShowSuggestions(false);
//                           }}
//                         >
//                           {a.name}
//                         </div>
//                       ))}
//                   </div>
//                 )}
//               </div>

//               <div className="space-y-1.5">
//                 <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
//                   Description
//                 </label>
//                 <Textarea
//                   value={description}
//                   onChange={(e) => setDescription(e.target.value)}
//                   rows={3}
//                   placeholder="Short description..."
//                   className="bg-black/20 border-white/20 min-h-[80px]"
//                 />
//               </div>

//               <div className="space-y-1.5">
//                 <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
//                   Label
//                 </label>
//                 <Input
//                   value={label}
//                   onChange={(e) => setLabel(e.target.value)}
//                   placeholder="Category"
//                   className="bg-black/20 border-white/20"
//                 />
//               </div>

//               <div className="space-y-1.5">
//                 <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
//                   Read Time
//                 </label>
//                 <Input
//                   value={readTime}
//                   onChange={(e) => setReadTime(e.target.value)}
//                   placeholder="5 min read"
//                   className="bg-black/20 border-white/20"
//                 />
//               </div>

//               <div className="flex items-center space-x-2 pt-2">
//                 <Switch
//                   id="publish-status"
//                   checked={isPublished}
//                   onCheckedChange={setIsPublished}
//                   className="data-[state=checked]:bg-[#8a2be2] data-[state=unchecked]:bg-zinc-600 border border-white/20"
//                 />
//                 <label
//                   htmlFor="publish-status"
//                   className="text-sm cursor-pointer text-white/80 select-none"
//                 >
//                   Publish Article
//                 </label>
//               </div>

//               <div className="flex items-center space-x-2 pt-2">
//                 <Checkbox
//                   id="popularity"
//                   checked={popularity}
//                   onCheckedChange={(c) => setPopularity(c as boolean)}
//                   className="border-white/20 data-[state=checked]:bg-[#8a2be2] data-[state=checked]:border-[#8a2be2]"
//                 />
//                 <label
//                   htmlFor="popularity"
//                   className="text-sm cursor-pointer text-white/80 select-none"
//                 >
//                   Mark as Popular
//                 </label>
//               </div>
//             </div>
//           </div>

//           {/* Asset Manager Accordion */}
//           <div className="bg-[#1A1A1A] border border-white/20 rounded-xl overflow-hidden shadow-lg">
//             <div className="p-4 bg-white/5 border-b border-white/5 flex items-center gap-2">
//               <div className="h-2 w-2 rounded-full bg-purple-500" />
//               <h3 className="font-semibold text-white/90 text-sm">
//                 Asset Library
//               </h3>
//             </div>
//             <div className="p-2">
//               <AssetManager rootPath={`Articles/${articleId}`} />
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

"use client";

import { useState, useEffect, useRef } from "react";
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
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Breadcrumb } from "@/components/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ImageIcon } from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { generateSlugFromTitle, sanitizeUrl } from "@/lib/utils";
import { MarkdownToolbar } from "@/components/markdown-toolbar";
import { AssetManager } from "@/components/admin/assets/asset-manager";
import { convertImageToWebP } from "@/lib/image-utils";
import { useDropzone } from "react-dropzone";

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

        const { ref, uploadBytes, getDownloadURL } = await import(
          "firebase/storage"
        );
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
              typeof label === "string" && label.trim() !== ""
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
      a.name.toLowerCase().includes(authorName.toLowerCase())
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

  const handleSave = async () => {
    if (!title.trim()) {
      toast({
        title: "Missing title",
        description: "Please enter a title for the article",
        variant: "destructive",
      });
      return;
    }

    if (!content.trim()) {
      toast({
        title: "Missing content",
        description: "Please enter content for the article",
        variant: "destructive",
      });
      return;
    }

    if (!authorName.trim()) {
      toast({
        title: "Missing author",
        description: "Please select an author for the article",
        variant: "destructive",
      });
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast({
        title: "Authentication error",
        description: "You must be logged in to create articles",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);

    try {
      // Use the pre-generated article ID for consistency with asset uploads
      await setDoc(doc(db, "articles", articleId), {
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
        authorRef: selectedAuthor
          ? doc(db, "authors", selectedAuthor.id)
          : doc(db, "authors", user.uid),

        createdAt: serverTimestamp(),
        date: serverTimestamp(),
        publish: false, // Default to draft
        scheduledPublishDate: scheduledDate
          ? Timestamp.fromDate(new Date(scheduledDate))
          : null,
      });

      toast({
        title: "Article created",
        description: "Your article has been successfully created",
        variant: "success",
      });

      router.push("/admin/articles");
    } catch (error) {
      console.error("Error creating article:", error);
      toast({
        title: "Error",
        description: "Failed to create article",
        variant: "destructive",
      });
      setCreating(false);
    }
  };

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
                  a.name.toLowerCase().includes(authorName.toLowerCase())
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
                src={sanitizeUrl(img) || "/placeholder.svg"}
                alt={imgAlt || "Thumbnail Preview"}
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

        {/* Action buttons */}
        <div className="flex flex-wrap gap-4 mt-8">
          <Button onClick={handleSave} disabled={creating} variant="outline">
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
