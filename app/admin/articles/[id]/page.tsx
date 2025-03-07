"use client";

import { useState, useEffect } from "react";
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
  const [readTime, setReadTime] = useState("");

  // "write" or "preview" mode for toggling
  const [mode, setMode] = useState<"write" | "preview">("write");

  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) return;
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
        setReadTime(data.read || "");
        setDate(data.date ? data.date.toDate().toLocaleString() : "");
      }
    };
    fetchArticle();
  }, [id]);

  const handleUpdate = async () => {
    const user = auth.currentUser;
    if (!user || !id) return;
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
      read: readTime,
      // Don't update date to keep it uneditable
    });
    router.push("/admin/articles");
  };

  const handleDelete = async () => {
    if (!id) return;
    const ref = doc(db, "articles", id);
    await deleteDoc(ref);
    router.push("/admin/articles");
  };

  // Convert markdown to HTML using Marked and sanitize it with DOMPurify
  const getSanitizedHtml = async (mdContent: string) => {
    marked.setOptions({
      gfm: true,
      breaks: true,
    });
    const rawHtml = await marked.parse(mdContent);
    return DOMPurify.sanitize(rawHtml);
  };

  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => {
    if (mode === "preview") {
      const generatePreview = async () => {
        const sanitized = await getSanitizedHtml(content);
        setPreviewHtml(sanitized);
      };
      generatePreview();
    }
  }, [content, mode]);

  return (
    <div className="px-4 py-6 text-white ml-0 md:ml-4">
      <h1 className="text-subtitle font-bold mb-6 mt-5 md:mt-1">Edit Article</h1>
      
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

      {/* Date (uneditable) */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Date:</label>
        <input
          type="text"
          className="w-full p-2 border border-white cursor-not-allowed"
          value={date}
          disabled
        />
      </div>

      {/* Toggle Editor/Preview for Content */}
      <div className="mb-9">
        <div className="flex">
          <button
            onClick={() => setMode("write")}
            className={`px-4 py-2 font-semibold ${
              mode === "write"
                ? "border-b-2 border-purple-500"
                : "text-white/70"
            }`}
          >
            Write
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`px-4 py-2 font-semibold ${
              mode === "preview"
                ? "border-b-2 border-purple-500"
                : "text-white/70"
            }`}
          >
            Preview
          </button>
        </div>
        {mode === "write" && (
          <textarea
            className="w-full h-96 p-2 border border-white"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}
        {mode === "preview" && (
          <div className="mt-2 p-4 border border-white markdown-body">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        )}
      </div>

      {/* Description */}
      <div className="mb-9">
        <label className="block font-semibold mb-1">Description:</label>
        <textarea
          className="w-full p-2 h-30 border border-white"
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

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleUpdate}
          className="px-9 py-3 text-white transition duration-300"
        >
          Update
        </button>
        <button
          onClick={handleDelete}
          className="px-9 py-3 text-white transition duration-300"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
