"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import PageTitle from "@/components/PageTitle";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  uid: string;
  slug: string;
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
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/team.svg"
          imgAlt="Team"
        >
          Team
        </PageTitle>
      </div>
        {(currentUserRole === "super" || currentUserRole === "admin") && (
          <Link
            href="/admin/team/new"
            className="new-article-btn px-8 py-3 font-semibold inline-block ml-0 md:ml-4 mb-3"
          >
            + New Member
          </Link>
        )}
      <table className="w-full text-left mt-5 ml-0 md:ml-4">
        <thead>
          <tr>
            <th className="p-2">Name</th>
            <th className="p-2">Role</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {team.map((member) => (
            <tr key={member.id} className="border-b border-white/20">
              <td className="p-2 whitespace-nowrap">{member.name}</td>
              <td className="p-2 whitespace-nowrap">{member.role}</td>
              <td className="p-2 space-x-2 whitespace-nowrap pt-4 pb-4">
                <Link
                  href={`https://lap-docs.netlify.app/authors/${member.slug}`}
                  className="new-article-btn px-4 py-2 mr-4 transition duration-300"
                  target="_blank"
                  >View</Link>
                <Link
                  href={`/admin/team/${member.id}`}
                  className="new-article-btn px-4 py-2 mr-4 transition duration-300"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
