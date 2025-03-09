"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { collection, setDoc, serverTimestamp, doc, getDocs } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";

// Type for an author document
interface Author {
  id: string;
  name: string;
  uid: string;
  // ... other fields if needed
}

// New article interface (fields to be stored in Firestore)
interface NewArticle {
  title: string;
  content: string;
  description: string;
  img: string;
  imgAlt: string;
  label: string;
  popularity: boolean;
  read: string;
  slug: string;
  authorName: string;
  authorUID: string;
  authorRef: any;
  createdAt: any;
  date: any;
}

export default function NewArticlePage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [img, setImg] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [label, setLabel] = useState("");
  const [popularity, setPopularity] = useState(false);
  const [readTime, setReadTime] = useState("");
  const [slug, setSlug] = useState("");

  // Author autocomplete state
  const [authorName, setAuthorName] = useState("");
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Markdown editor mode
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [previewHtml, setPreviewHtml] = useState("");

  const router = useRouter();

  // Fetch authors on mount
  useEffect(() => {
    const fetchAuthors = async () => {
      const snap = await getDocs(collection(db, "authors"));
      const docs = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Author[];
      setAuthors(docs);
    };
    fetchAuthors();
  }, []);

  // Auto-generate slug from title (if not manually modified)
  useEffect(() => {
      setSlug(title.toLowerCase().replace(/\s+/g, "-"));
    
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
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update markdown preview when in preview mode
  useEffect(() => {
    if (mode === "preview") {
      // For simplicity, we directly pass the content to ReactMarkdown.
      // If you want to sanitize, you could use marked + DOMPurify here.
      setPreviewHtml(content);
    }
  }, [content, mode]);

  const handleSave = async () => {
    if (!title || !content || !authorName) return;
    const user = auth.currentUser;
    if (!user) return;

    // Create new article ID
    const docId = uuidv4();
    const newArticle: NewArticle = {
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
    };

    await setDoc(doc(db, "articles", docId), newArticle);
    router.push("/admin/articles");
  };

  return (
    <div className="px-4 py-6 text-white ml-0 md:ml-4">
      <h1 className="text-subtitle font-bold mb-6 mt-5 md:mt-1">New Post</h1>

      {/* Title */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Title:</label>
        <input
          type="text"
          className="w-full p-2 border border-white"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Slug */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Slug:</label>
        <input
          type="text"
          className="w-full p-2 border border-white"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
      </div>

      {/* Author Name with Autocomplete */}
      <div className="mb-9 relative">
        <label className="block font-semibold mb-1">Author Name:</label>
        <input
          type="text"
          className="w-full p-2 border border-white"
          value={authorName}
          onChange={(e) => {
            setAuthorName(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
        />
        {showSuggestions && authors.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-10 w-full border border-white/60 mt-1 max-h-48 overflow-y-auto"
          >
            {authors
              .filter((a) =>
                a.name.toLowerCase().includes(authorName.toLowerCase())
              )
              .map((a) => (
                <div
                  key={a.id}
                  className="px-2 py-1 hover:bg-gray-200 cursor-pointer mb-1 ml-1"
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

      {/* Toggle Editor/Preview for Content */}
      <div className="mb-9">
        <div className="flex">
          <button
            onClick={() => setMode("write")}
            className={`px-4 py-2 font-semibold ${
              mode === "write"
                ? "border-b-2 border-purple-500 "
                : "text-white/70"
            }`}
          >
            Write
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`px-4 py-2 font-semibold ${
              mode === "preview"
                ? "border-b-2 border-purple-500 "
                : "text-white/70"
            }`}
          >
            Preview
          </button>
        </div>
        {mode === "write" && (
          <textarea
            className="w-full h-64 p-2 border border-white"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}
        {mode === "preview" && (
          <div className="p-4 border border-white markdown-body">
            <ReactMarkdown>{previewHtml}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Description:</label>
        <textarea
          className="w-full p-2 border border-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Image URL with Preview */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Image URL:</label>
        <input
          type="text"
          className="w-full p-2 border border-white"
          value={img}
          onChange={(e) => setImg(e.target.value)}
        />
        {img && (
          <div className="mt-2">
            <p className="font-semibold mb-1">Image Preview:</p>
            <img
              src={img}
              alt={imgAlt || "Image Preview"}
              className="max-h-64 object-contain"
            />
          </div>
        )}
      </div>

      {/* Image Alt */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Image Alt:</label>
        <input
          type="text"
          className="w-full p-2 border border-white"
          value={imgAlt}
          onChange={(e) => setImgAlt(e.target.value)}
        />
      </div>

      {/* Label */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Label:</label>
        <input
          type="text"
          className="w-full p-2 border border-white"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      {/* Popularity */}
      <div className="mb-9 flex items-center">
        <label className="block font-semibold mr-4">Popular:</label>
        <input
          type="checkbox"
          checked={popularity}
          onChange={(e) => setPopularity(e.target.checked)}
          className="h-5 w-5"
        />
      </div>

      {/* Read Time */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Read Time:</label>
        <input
          type="text"
          className="w-full p-2 border border-white"
          value={readTime}
          onChange={(e) => setReadTime(e.target.value)}
        />
      </div>

      {/* Action Button */}
      <button
        onClick={handleSave}
        className="bg-purple-600 px-9 py-3 text-white transition duration-300"
      >
        Publish
      </button>
    </div>
  );
}
