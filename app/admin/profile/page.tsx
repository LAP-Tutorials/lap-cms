"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, updatePassword } from "firebase/auth";
import PageTitle from "@/components/PageTitle";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>({
    biography: { body: "", summary: "" },
    socials: {},
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [socialPlatform, setSocialPlatform] = useState("");
  const [socialLink, setSocialLink] = useState("");

  const platforms = ["twitter", "linkedin", "instagram", "github", "facebook", "youtube", "tiktok", "patreon", "link"];

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
      avatar: profile.avatar,
      name: profile.name,
      city: profile.city,
      job: profile.job,
      biography: profile.biography,
      socials: profile.socials,
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

  const handleAddSocial = () => {
    if (socialPlatform && socialLink) {
      setProfile({
        ...profile,
        socials: {
          ...profile.socials,
          [socialPlatform]: socialLink,
        },
      });
      setSocialPlatform("");
      setSocialLink("");
    }
  };

  const handleRemoveSocial = (platform: string) => {
    const { [platform]: _, ...rest } = profile.socials;
    setProfile({
      ...profile,
      socials: rest,
    });
  };

  return (
    <div className="ml-0 md:ml-3 mt-10 md:-mt-8">
      <PageTitle
        className="sr-only"
        imgSrc="/images/titles/profile.svg"
        imgAlt="Profile"
      >
        Profile
      </PageTitle>

      {/* Avatar Preview */}
      <div className="mb-4">
        <label className="block mb-1">Avatar:</label>
        <input
          className="w-full p-2 border border-white"
          value={profile.avatar || ""}
          onChange={(e) => setProfile({ ...profile, avatar: e.target.value })}
        />
        {profile.avatar && (
          <img
            src={profile.avatar}
            alt="Avatar Preview"
            className="mt-2 max-h-32 object-cover"
          />
        )}
      </div>

      <div className="mb-4">
        <label className="block mb-1">Name:</label>
        <input
          className="w-full p-2 border border-white"
          value={profile.name || ""}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Country:</label>
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

      {/* Social Media Section */}
      <div className="mb-6 border border-white p-4">
        <label className="block mb-2 font-semibold">Social Media:</label>

        {/* Add New Social */}
        <div className="flex mb-4 gap-2">
          <select
            className="p-2 border border-white"
            value={socialPlatform}
            onChange={(e) => setSocialPlatform(e.target.value)}
          >
            <option value="">Select Platform</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </option>
            ))}
          </select>
          <input
            className="flex-1 p-2 border border-white"
            value={socialLink}
            onChange={(e) => setSocialLink(e.target.value)}
            placeholder="https://..."
          />
          <button
            type="button"
            onClick={handleAddSocial}
            className="bg-purple-600 px-4 py-2"
          >
            Add
          </button>
        </div>

        {/* Social Media List */}
        {Object.keys(profile.socials).length > 0 ? (
          <ul className="p-4">
            {Object.entries(profile.socials).map(([platform, link]) => (
              <li
                key={platform}
                className="flex justify-between items-center py-2 border-b border-white last:border-0"
              >
                <div>
                  <span className="font-medium capitalize">{platform}</span>
                  <a
                    href={link as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-gray-400 hover:text-purple-400 truncate max-w-xs"
                  >
                    {String(link)}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSocial(platform)}
                  className="p-2 px-3"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-center">No social media links added</div>
        )}
      </div>

      <button onClick={handleSave} className="bg-purple-600 px-4 py-2 mt-3">
        Save
      </button>

      <hr className="my-4 border-white/20" />

      <h2 className="text-xl font-bold mb-5 mt-3">Change Password</h2>
      <div className="mb-4 relative">
        <label className="block mb-1">New Password:</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            className="block w-full p-3 pr-10 text-white border border-white outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div
            className="absolute inset-y-0 right-0 flex items-center px-3 cursor-pointer border border-white"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
          </div>
        </div>
      </div>
      <button onClick={handleChangePassword} className="px-4 py-2 mt-5">
        Update Password
      </button>
    </div>
  );
}
