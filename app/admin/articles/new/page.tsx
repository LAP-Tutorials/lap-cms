"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";

export default function NewArticlePage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [img, setImg] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [label, setLabel] = useState("");
  const [popularity, setPopularity] = useState(false);
  const [readTime, setReadTime] = useState("");
  const router = useRouter();

  const handleSave = async () => {
    if (!title || !content) return;
    const user = auth.currentUser;
    if (!user) return;

    const docId = uuidv4();
    await setDoc(doc(db, "articles", docId), {
      title,
      content,
      description,
      img,
      imgAlt,
      label,
      popularity,
      read: readTime,
      slug: title.toLowerCase().replace(/\s+/g, "-"),
      authorName: user.displayName || "Unknown",
      authorUID: user.uid,
      createdAt: serverTimestamp(),
      date: serverTimestamp(),
    });

    router.push("/admin/articles");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">New Article</h1>
      <div className="mb-4">
        <label className="block font-semibold mb-1">Title</label>
        <input
          type="text"
          className="w-full p-2 text-black"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <label className="block font-semibold mb-1">Description</label>
        <textarea
          className="w-full p-2 text-black"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex gap-4 mb-4">
        <div className="w-1/2">
          <label className="block font-semibold mb-1">Content (Markdown)</label>
          <textarea
            className="w-full h-64 p-2 text-black"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div className="w-1/2 p-2 border border-gray-800 rounded">
          <label className="block font-semibold mb-1">Preview</label>
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block font-semibold mb-1">Image URL</label>
        <input
          type="text"
          className="w-full p-2 text-black"
          value={img}
          onChange={(e) => setImg(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <label className="block font-semibold mb-1">Image Alt</label>
        <input
          type="text"
          className="w-full p-2 text-black"
          value={imgAlt}
          onChange={(e) => setImgAlt(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <label className="block font-semibold mb-1">Label</label>
        <input
          type="text"
          className="w-full p-2 text-black"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={popularity}
            onChange={(e) => setPopularity(e.target.checked)}
          />
          Popular?
        </label>
      </div>

      <div className="mb-4">
        <label className="block font-semibold mb-1">Read Time</label>
        <input
          type="text"
          className="w-full p-2 text-black"
          value={readTime}
          onChange={(e) => setReadTime(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        className="bg-purple-600 px-4 py-2 rounded"
      >
        Publish
      </button>
    </div>
  );
}
