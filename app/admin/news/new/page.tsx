"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "next/navigation";

export default function NewNewsPage() {
  const [title, setTitle] = useState("");
  const router = useRouter();

  const handleCreate = async () => {
    if (!title) return;
    const id = uuidv4();
    await setDoc(doc(db, "news", id), {
      title,
      createdAt: serverTimestamp(), // <-- important
    });
    router.push("/admin/news");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Create News</h1>
      <div className="mb-4">
        <label className="block mb-1">Title</label>
        <input
          className="w-full p-2 text-black"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <button
        onClick={handleCreate}
        className="bg-purple-600 px-4 py-2 rounded"
      >
        Create
      </button>
    </div>
  );
}
