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
    <div className="ml-0 md:ml-3">
      <h1 className="text-subtitle font-bold mb-6 mt-5 md:mt-1">Create News</h1>
      <div className="mb-4">
        <label className="block mb-1">News:</label>
        <input
          className="w-full p-2 border border-white"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <button
        onClick={handleCreate}
        className="px-4 py-2 mt-9"
      >
        Create
      </button>
    </div>
  );
}
