"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";

export default function EditNewsPage() {
  const [title, setTitle] = useState("");
  const [createdAt, setCreatedAt] = useState<any>(null);

  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    const fetchNews = async () => {
      const ref = doc(db, "news", params.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setTitle(data.title || "");
        setCreatedAt(data.createdAt || null);
      }
    };
    fetchNews();
  }, [params.id]);

  const handleUpdate = async () => {
    const ref = doc(db, "news", params.id);
    // Preserve existing createdAt
    await updateDoc(ref, {
      title,
      createdAt, // keep the old date
    });
    router.push("/admin/news");
  };

  const handleDelete = async () => {
    const ref = doc(db, "news", params.id);
    await deleteDoc(ref);
    router.push("/admin/news");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit News</h1>
      <div className="mb-4">
        <label className="block mb-1">Title</label>
        <input
          className="w-full p-2 text-black"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
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
