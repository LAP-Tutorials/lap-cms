"use client";

import { useEffect, useState, FormEvent } from "react";
import { onAuthStateChanged, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export default function NewTeamMemberPage() {
  const [role, setRole] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [job, setJob] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        avatar: "",
        biography: {
          body: "",
          summary: "",
        },
        slug: name.toLowerCase().replace(/\s+/g, "-"),
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
    <div>
      <h1 className="text-2xl font-bold mb-4">Create New Team Member</h1>
      <form onSubmit={handleCreate}>
        <div className="mb-4">
          <label className="block mb-1">Full Name</label>
          <input
            className="w-full p-2 text-black"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">City</label>
          <input
            className="w-full p-2 text-black"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Job</label>
          <input
            className="w-full p-2 text-black"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Role</label>
          <select
            className="w-full p-2 text-black"
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
          <label className="block mb-1">Email</label>
          <input
            type="email"
            className="w-full p-2 text-black"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Password</label>
          <input
            type="password"
            className="w-full p-2 text-black"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="bg-purple-600 px-4 py-2 rounded">
          Create
        </button>
      </form>
    </div>
  );
}
