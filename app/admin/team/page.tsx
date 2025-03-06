"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  uid: string;
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");

  useEffect(() => {
    const fetchRoleAndTeam = async (uid: string) => {
      const ref = doc(db, "authors", uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setCurrentUserRole(snap.data().role);
      }

      const teamSnap = await getDocs(collection(db, "authors"));
      const docs = teamSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TeamMember[];
      setTeam(docs);
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchRoleAndTeam(user.uid);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Team Members</h1>
        {(currentUserRole === "super" || currentUserRole === "admin") && (
          <Link
            href="/admin/team/new"
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded"
          >
            + New Member
          </Link>
        )}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="p-2">Name</th>
            <th className="p-2">Role</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {team.map((member) => (
            <tr key={member.id} className="border-b border-gray-700">
              <td className="p-2">{member.name}</td>
              <td className="p-2">{member.role}</td>
              <td className="p-2">
                <Link
                  href={`/admin/team/${member.id}`}
                  className="mr-2 text-blue-400 hover:underline"
                >
                  View/Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
