"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function EditTeamMemberPage() {
  const [member, setMember] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState("");
  const params = useParams();
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

  useEffect(() => {
    const fetchMember = async () => {
      const ref = doc(db, "authors", params.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setMember(snap.data());
      }
    };
    fetchMember();
  }, [params.id]);

  if (!member) {
    return <div>Loading...</div>;
  }

  const handleUpdate = async () => {
    const ref = doc(db, "authors", params.id);
    await updateDoc(ref, {
      name: member.name,
      city: member.city,
      job: member.job,
      // Only super can change role
      ...(currentUserRole === "super" && { role: member.role }),
    });
    router.push("/admin/team");
  };

  const handleDelete = async () => {
    if (currentUserRole !== "super") {
      alert("Only super admin can delete team members.");
      return;
    }
    const ref = doc(db, "authors", params.id);
    await deleteDoc(ref);
    router.push("/admin/team");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit Team Member</h1>
      <div className="mb-4">
        <label className="block mb-1">Name</label>
        <input
          className="w-full p-2 text-black"
          value={member.name}
          onChange={(e) => setMember({ ...member, name: e.target.value })}
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">City</label>
        <input
          className="w-full p-2 text-black"
          value={member.city}
          onChange={(e) => setMember({ ...member, city: e.target.value })}
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Job</label>
        <input
          className="w-full p-2 text-black"
          value={member.job}
          onChange={(e) => setMember({ ...member, job: e.target.value })}
        />
      </div>
      {currentUserRole === "super" && (
        <div className="mb-4">
          <label className="block mb-1">Role</label>
          <select
            className="w-full p-2 text-black"
            value={member.role}
            onChange={(e) => setMember({ ...member, role: e.target.value })}
          >
            <option value="super">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleUpdate}
          className="bg-purple-600 px-4 py-2 rounded"
        >
          Update
        </button>
        {currentUserRole === "super" && (
          <button
            onClick={handleDelete}
            className="bg-red-600 px-4 py-2 rounded"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
