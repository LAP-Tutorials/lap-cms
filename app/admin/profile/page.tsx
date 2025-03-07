"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, updatePassword } from "firebase/auth";
import PageTitle from "@/components/PageTitle";

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>({});
  const [password, setPassword] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const ref = doc(db, "authors", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProfile(snap.data());
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!auth.currentUser) return;
    const ref = doc(db, "authors", auth.currentUser.uid);
    await updateDoc(ref, {
      name: profile.name,
      city: profile.city,
      job: profile.job,
      biography: profile.biography,
    });
    alert("Profile updated!");
  };

  const handleChangePassword = async () => {
    if (!auth.currentUser || !password) return;
    try {
      await updatePassword(auth.currentUser, password);
      alert("Password updated!");
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="ml-0 md:ml-3">
      <PageTitle
                className="sr-only"
                imgSrc="/images/titles/profile.svg"
                imgAlt="Profile"
              >
                Profile
              </PageTitle>
      <div className="mb-4">
        <label className="block mb-1">Name:</label>
        <input
          className="w-full p-2 border border-white"
          value={profile.name || ""}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">City:</label>
        <input
          className="w-full p-2 border border-white"
          value={profile.city || ""}
          onChange={(e) => setProfile({ ...profile, city: e.target.value })}
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Job:</label>
        <input
          className="w-full p-2 border border-white"
          value={profile.job || ""}
          onChange={(e) => setProfile({ ...profile, job: e.target.value })}
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Biography:</label>
        <textarea
          className="w-full p-2 border border-white"
          value={profile.biography?.body || ""}
          onChange={(e) =>
            setProfile({
              ...profile,
              biography: { ...profile.biography, body: e.target.value },
            })
          }
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Biography Summary:</label>
        <textarea
          className="w-full p-2 border border-white"
          value={profile.biography?.summary || ""}
          onChange={(e) =>
            setProfile({
              ...profile,
              biography: { ...profile.biography, summary: e.target.value },
            })
          }
        />
      </div>
      <button onClick={handleSave} className="bg-purple-600 px-4 py-2 mt-3">
        Save
      </button>

      <hr className="my-4 border-white/20" />

      <h2 className="text-xl font-bold mb-5 mt-3">Change Password</h2>
      <div className="mb-4">
        <label className="block mb-1">New Password:</label>
        <input
          type="password"
          className="w-full p-2 border border-white"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button
        onClick={handleChangePassword}
        className="px-4 py-2 mt-5"
      >
        Update Password
      </button>
    </div>
  );
}
