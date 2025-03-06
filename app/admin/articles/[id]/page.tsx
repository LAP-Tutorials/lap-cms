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
import ReactMarkdown from "react-markdown";

export default function EditArticlePage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [img, setImg] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [label, setLabel] = useState("");
  const [popularity, setPopularity] = useState(false);
  const [readTime, setReadTime] = useState("");

  const router = useRouter();
  const params = useParams();
  const { id } = params;

  useEffect(() => {
    const fetchArticle = async () => {
      const ref = doc(db, "articles", id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setTitle(data.title || "");
        setContent(data.content || "");
        setDescription(data.description || "");
        setImg(data.img || "");
        setImgAlt(data.imgAlt || "");
        setLabel(data.label || "");
        setPopularity(data.popularity || false);
        setReadTime(data.read || "");
      }
    };
    fetchArticle();
  }, [id]);

  const handleUpdate = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const ref = doc(db, "articles", id);
    await updateDoc(ref, {
      title,
      content,
      description,
      img,
      imgAlt,
      label,
      popularity,
      read: readTime,
      // do not update createdAt
      date: serverTimestamp(),
    });
    router.push("/admin/articles");
  };

  const handleDelete = async () => {
    const ref = doc(db, "articles", id);
    await deleteDoc(ref);
    router.push("/admin/articles");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit Article</h1>
      <div className="mb-4">
        <label className="block font-semibold mb-1">Title</label>
        <input
          type="text"
          className="w-full p-2 text-black"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      {/* ... same pattern as create page ... */}
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

      {/* ... the other fields for description, image, etc. ... */}

      <div className="flex gap-2">
        <button
          onClick={handleUpdate}
          className="bg-purple-600 px-4 py-2 rounded"
        >
          Update
        </button>
        <button
          onClick={handleDelete}
          className="bg-red-600 px-4 py-2 rounded"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
