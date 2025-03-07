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
      if (typeof params.id !== "string") {
        console.error("Invalid document ID");
        return;
      }
      const ref = doc(db, "news", params.id as string);
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
    if (typeof params.id !== "string") {
      console.error("Invalid document ID");
      return;
    }
    const ref = doc(db, "news", params.id as string);
    // Preserve existing createdAt
    await updateDoc(ref, {
      title,
      createdAt, // keep the old date
    });
    router.push("/admin/news");
  };

  const handleDelete = async () => {
    const ref = doc(db, "news", params.id as string);
    await deleteDoc(ref);
    router.push("/admin/news");
  };

  return (
    <div className="ml-0 md:ml-3">
      <h1 className="text-subtitle font-bold mb-6 mt-5 md:mt-1">Edit News</h1>
      <div className="mb-4">
        <label className="block mb-1">News:</label>
        <input
          className="w-full p-2 border border-white"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex gap-2 mt-9">
        <button
          onClick={handleUpdate}
          className="px-4 py-2"
        >
          Update
        </button>
        <button
          onClick={handleDelete}
          className="px-4 py-2"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
