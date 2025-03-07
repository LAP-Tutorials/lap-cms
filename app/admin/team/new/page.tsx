"use client";

import { useEffect, useState, FormEvent } from "react";
import { onAuthStateChanged, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";

export default function NewTeamMemberPage() {
  const [role, setRole] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [job, setJob] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [avatar, setAvatar] = useState("");
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const ref = doc(db, "authors", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setCurrentUserRole(snap.data().role);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Auto-generate slug when name changes
  useEffect(() => {
    setSlug(name.toLowerCase().replace(/\s+/g, "-"));
  }, [name]);

  // Auto-generate imgAlt if name is entered but imgAlt is empty
  useEffect(() => {
    if (name && !imgAlt) {
      setImgAlt(`Profile picture of ${name}`);
    }
  }, [name, imgAlt]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();

    if (!["super", "admin"].includes(currentUserRole)) {
      alert("Not authorized");
      return;
    }

    try {
      // Create a new user in Firebase Auth
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      const newUid = user.uid;

      // Create the doc in authors collection
      await setDoc(doc(db, "authors", newUid), {
        uid: newUid,
        name,
        city,
        job,
        role, // "admin" or "manager" etc.
        avatar: avatar,
        imgAlt: imgAlt,
        biography: {
          body: "",
          summary: "",
        },
        slug: slug,
        createdAt: new Date().toISOString(),
        dateJoined: new Date(),
      });

      router.push("/admin/team");
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (!["super", "admin"].includes(currentUserRole)) {
    return <div>Access Denied</div>;
  }

  return (
    <div className="ml-0 md:ml-3">
      <h1 className="text-subtitle font-bold mb-10 mt-10 md:mt-2">New Member</h1>
      <form onSubmit={handleCreate}>
        <div className="mb-4">
          <label className="block mb-1">Full Name:</label>
          <input
            className="w-full p-2 border border-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Slug:</label>
          <input
            className="w-full p-2 border border-white"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <p className="text-xs text-gray-500">URL-friendly identifier (auto-generated from name)</p>
        </div>
        <div className="mb-4">
          <label className="block mb-1">Avatar URL:</label>
          <input
            className="w-full p-2 border border-white"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://example.com/avatar.jpg"
          />
          <p className="text-xs text-gray-500">Link to profile image</p>
        </div>
        
        {avatar && (
          <div className="mb-4">
            <label className="block mb-1">Image Preview:</label>
            <div className="relative h-40 w-40 border border-gray-300 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={avatar} 
                alt={imgAlt || "Profile preview"} 
                className="object-cover w-full h-full"
                onError={(e) => {
                  e.currentTarget.src = "https://via.placeholder.com/150?text=Invalid+Image";
                }}
              />
            </div>
          </div>
        )}
        
        <div className="mb-4">
          <label className="block mb-1">Image Alt Text:</label>
          <input
            className="w-full p-2 border border-white"
            value={imgAlt}
            onChange={(e) => setImgAlt(e.target.value)}
            placeholder="Brief description of the profile image"
          />
          <p className="text-xs text-gray-500">For accessibility purposes</p>
        </div>
        <div className="mb-4">
          <label className="block mb-1">City:</label>
          <input
            className="w-full p-2 border border-white"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Job:</label>
          <input
            className="w-full p-2 border border-white"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Role:</label>
          <select
            className="w-full p-2 border border-white"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          >
            <option value="">Select role</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="block mb-1">Email:</label>
          <input
            type="email"
            className="w-full p-2 border border-white"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Password:</label>
          <input
            type="password"
            className="w-full p-2 border border-white"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="bg-purple-600 px-4 py-2 mt-9">
          Create
        </button>
      </form>
    </div>
  );
}