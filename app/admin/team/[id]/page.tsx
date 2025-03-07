"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";

interface Member {
  name: string;
  city: string;
  job: string;
  slug: string;
  avatar: string;
  imgAlt: string;
  socials: Record<string, string>;
  role?: string;
}

export default function EditTeamMemberPage() {
  const [member, setMember] = useState<Member | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [avatarPreview, setAvatarPreview] = useState("");
  
  const params = useParams();
  const router = useRouter();
  
  // Available social media platforms
  const platforms = ["twitter", "linkedin", "instagram", "github", "facebook", "youtube"];
  
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
      if (params.id) {
        const ref = doc(db, "authors", params.id as string);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setMember(data as Member);
          setSocials(data.socials || {});
          setAvatarPreview(data.avatar || "");
        }
      }
    };
    fetchMember();
  }, [params.id]);
  
    const handleUpdate = async () => {
    if (!params.id) {
      console.error("No ID provided");
      return;
    }

    if (!member) {
      console.error("No member data available");
      return;
    }
    
    const ref = doc(db, "authors", params.id as string);
    await updateDoc(ref, {
      name: member.name,
      city: member.city,
      job: member.job,
      slug: member.slug,
      avatar: member.avatar,
      imgAlt: member.imgAlt,
      socials: socials,
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
    
    if (window.confirm("Are you sure you want to delete this team member?")) {
      const ref = doc(db, "authors", params.id as string);
      await deleteDoc(ref);
      router.push("/admin/team");
    }
  };
  
  const handleAddSocial = () => {
    if (!socialPlatform || !socialLink) return;
    
    setSocials({
      ...socials,
      [socialPlatform]: socialLink
    });
    
    // Reset fields
    setSocialPlatform("");
    setSocialLink("");
  };
  
  const handleRemoveSocial = (platform: string) => {
    const updatedSocials = { ...socials };
    delete updatedSocials[platform];
    setSocials(updatedSocials);
  };
  
  const handleAvatarChange = (e: { target: { value: any; }; }) => {
    const avatarUrl = e.target.value;
    if (member) {
      setMember({ ...member, avatar: avatarUrl });
    }
    setAvatarPreview(avatarUrl);
  };
  
  // Generate slug based on name
  const generateSlug = () => {
    if (member?.name) {
      const slug = member.name
        .toLowerCase()
        .replace(/[^\w ]+/g, '')
        .replace(/ +/g, '-');
      setMember({ ...member, slug });
    }
  };
  
  if (!member) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        {/* <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div> */}
        <span className="ml-3">Loading...</span>
      </div>
    );
  }
  
  return (
    <div className="px-4 py-6 text-white mx-auto">
      <h1 className="text-subtitle font-bold mb-10">Edit Member</h1>
      
      {/* Avatar Section */}
      <div className="mb-6">
        <label className="block mb-2 font-semibold">Avatar:</label>
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="w-32 h-32 rounded-full overflow-hidden flex items-center justify-center">
            {avatarPreview ? (
              <img 
                src={avatarPreview} 
                alt={member.imgAlt || member.name} 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-gray-400">No Avatar</div>
            )}
          </div>
          <div className="flex-1">
            <p className="mb-1">Image URL:</p>
            <input
              className="w-full p-2 border border-white mb-3"
              value={member.avatar || ""}
              onChange={handleAvatarChange}
              placeholder="Avatar URL"
            />
            <p className="mb-1">Image Alt:</p>
            <input
              className="w-full p-2 border border-white"
              value={member.imgAlt || ""}
              onChange={(e) => setMember({ ...member, imgAlt: e.target.value })}
              placeholder="Image Alt Text"
            />
          </div>
        </div>
      </div>
      
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block mb-1 font-semibold">Name:</label>
          <input
            className="w-full p-2 border border-white"
            value={member.name || ""}
            onChange={(e) => setMember({ ...member, name: e.target.value })}
          />
        </div>
        
        <div>
          <label className="block mb-1 font-semibold">Slug:</label>
          <div className="flex">
            <input
              className="w-full p-2 border border-white"
              value={member.slug || ""}
              onChange={(e) => setMember({ ...member, slug: e.target.value })}
            />
            <button
              onClick={generateSlug}
              className="px-3 border-r border-t border-b border-white"
              title="Generate slug from name"
            >
              ↻
            </button>
          </div>
        </div>
        
        <div>
          <label className="block mb-1 font-semibold">City:</label>
          <input
            className="w-full p-2  border border-white"
            value={member.city || ""}
            onChange={(e) => setMember({ ...member, city: e.target.value })}
          />
        </div>
        
        <div>
          <label className="block mb-1 font-semibold">Job:</label>
          <input
            className="w-full p-2 border border-white"
            value={member.job || ""}
            onChange={(e) => setMember({ ...member, job: e.target.value })}
          />
        </div>
      </div>
      
      {/* Role Selector (Super Admin Only) */}
      {currentUserRole === "super" && (
        <div className="mb-6">
          <label className="block mb-1 font-semibold">Role:</label>
          <select
            className="w-full p-2 border border-white"
            value={member.role || ""}
            onChange={(e) => setMember({ ...member, role: e.target.value })}
          >
            <option value="super">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
          </select>
        </div>
      )}
      
      {/* Social Media Section */}
      <div className="mb-6">
        <label className="block mb-2 font-semibold">Social Media:</label>
        
        {/* Add New Social */}
        <div className="flex mb-4 gap-2">
          <select
            className="p-2 border border-white"
            value={socialPlatform}
            onChange={(e) => setSocialPlatform(e.target.value)}
          >
            <option value="">Select Platform</option>
            {platforms.map(platform => (
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
            onClick={handleAddSocial}
            className="bg-purple-600 px-4 py-2"
          >
            Add
          </button>
        </div>
        
        {/* Social Media List */}
        {Object.keys(socials).length > 0 ? (
          <ul className="p-4">
            {Object.entries(socials).map(([platform, link]) => (
              <li key={platform} className="flex justify-between items-center py-2 border-b border-white last:border-0">
                <div>
                  <span className="font-medium capitalize">{platform}</span>
                  <a 
                    href={link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block text-sm text-gray-400 hover:text-purple-400 truncate max-w-xs"
                  >
                    {link}
                  </a>
                </div>
                <button
                  onClick={() => handleRemoveSocial(platform)}
                  className="p-2 px-3"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-center">
            No social media links added
          </div>
        )}
      </div>
      
      {/* Action Buttons */}
      <div className="flex gap-2 mt-6">
        <button
          onClick={handleUpdate}
          className="bg-purple-600 px-6 py-2 hover:bg-purple-700 transition"
        >
          Update
        </button>
        {currentUserRole === "super" && (
          <button
            onClick={handleDelete}
            className=" px-6 py-2 transition"
          >
            Delete
          </button>
        )}
        <button
          onClick={() => router.push("/admin/team")}
          className="px-6 py-2 transition ml-auto"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}