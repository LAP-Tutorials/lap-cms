"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { auth, db, functions, storage } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Breadcrumb } from "@/components/breadcrumb";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Plus,
  X,
  Camera,
} from "lucide-react";
import { sanitizeUrl } from "@/lib/utils";
import { AvatarCropper } from "@/components/profile/avatar-cropper";

interface Member {
  name: string;
  city: string;
  job: string;
  slug: string;
  avatar: string;
  imgAlt: string;
  socials: Record<string, string>;
  role?: string;
  promotedFromReader?: boolean;
}

export default function EditTeamMemberPage() {
  const [member, setMember] = useState<Member | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [avatarPreview, setAvatarPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cropper state
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = typeof params.id === "string" ? params.id : "";

  // Available social media platforms
  const platforms = [
    "twitter",
    "linkedin",
    "instagram",
    "github",
    "facebook",
    "youtube",
    "tiktok",
    "patreon",
    "link",
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const ref = doc(db, "authors", user.uid);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            setCurrentUserRole(snap.data().role);
          }
        } catch (err) {
          console.error("Error fetching user role:", err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchMember = async () => {
      setLoading(true);
      setError(null);

      if (!id) {
        setError("Invalid member ID");
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, "authors", id);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setMember(data as Member);
          setSocials(data.socials || {});
          setAvatarPreview(data.avatar || "");
        } else {
          setError("Member not found");
        }
      } catch (err) {
        console.error("Error fetching member:", err);
        setError("Failed to load member data");
      } finally {
        setLoading(false);
      }
    };

    fetchMember();
  }, [id]);

  const handleUpdate = async () => {
    if (!id) {
      toast({
        title: "Error",
        description: "No ID provided",
        variant: "destructive",
      });
      return;
    }

    if (!member) {
      toast({
        title: "Error",
        description: "No member data available",
        variant: "destructive",
      });
      return;
    }

    if (!member.name.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a name for the team member",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const ref = doc(db, "authors", id);
      await updateDoc(ref, {
        name: member.name,
        city: member.city,
        job: member.job,
        slug: member.slug,
        avatar: member.avatar,
        imgAlt: `${member.name} profile pic, a member of L.A.P`,
        socials: socials,
        // Only super can change role
        ...(currentUserRole === "super" && {
          role: member.role,
          showOnTeam: member.role !== "moderator",
        }),
      });

      toast({
        title: "Member updated",
        description: "Team member has been successfully updated",
        variant: "success",
      });

      router.push("/admin/team");
    } catch (error) {
      console.error("Error updating member:", error);
      toast({
        title: "Error",
        description: "Failed to update team member",
        variant: "destructive",
      });
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (currentUserRole !== "super") {
      toast({
        title: "Permission denied",
        description: "Only super admin can delete team members",
        variant: "destructive",
      });
      return;
    }

    setDeleting(true);
    try {
      const deleteTeamMember = httpsCallable<
        { uid: string },
        { uid: string; demoted: boolean }
      >(functions, "deleteTeamMember");
      const result = await deleteTeamMember({ uid: id });

      toast({
        title: result.data.demoted ? "Moderator removed" : "Member deleted",
        description: result.data.demoted
          ? "Their CMS access was removed. Their Docs reader account is still active."
          : "The member's profile and sign-in account were removed",
        variant: "success",
      });

      router.push("/admin/team");
    } catch (error) {
      console.error("Error deleting member:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete team member",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleAddSocial = () => {
    if (!socialPlatform || !socialLink) {
      toast({
        title: "Missing information",
        description: "Please select a platform and enter a link",
        variant: "destructive",
      });
      return;
    }

    setSocials({
      ...socials,
      [socialPlatform]: socialLink,
    });

    setSocialPlatform("");
    setSocialLink("");

    toast({
      title: "Social link added",
      description: `Added ${socialPlatform} to the member's profile`,
      variant: "success",
    });
  };

  const handleRemoveSocial = (platform: string) => {
    const updatedSocials = { ...socials };
    delete updatedSocials[platform];
    setSocials(updatedSocials);

    toast({
      title: "Social link removed",
      description: `Removed ${platform} from the member's profile`,
      variant: "default",
    });
  };

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedImageFile(e.target.files[0]);
      setIsCropperOpen(true);
      // Reset input value to allow selecting the same file again
      e.target.value = "";
    }
  };

  const onCropComplete = async (croppedBlob: Blob) => {
    if (!member) return;

    setUploadingAvatar(true);
    try {
      // Create a slug from the name for the file path
      const nameSlug =
        member.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "") || "unknown-member";

      const storageRef = ref(storage, `avatars/team/${nameSlug}.webp`);
      const uploadTask = await uploadBytes(storageRef, croppedBlob);
      const downloadURL = await getDownloadURL(uploadTask.ref);

      const newImgAlt = `${member.name} profile pic, a member of L.A.P`;

      // Update local state
      setMember((prev) =>
        prev ? { ...prev, avatar: downloadURL, imgAlt: newImgAlt } : null,
      );
      setAvatarPreview(downloadURL);

      // Auto-save to Firestore
      if (id) {
        const ref = doc(db, "authors", id);
        await updateDoc(ref, {
          avatar: downloadURL,
          imgAlt: newImgAlt,
        });
      }

      toast({
        title: "Avatar updated",
        description:
          "Your team member's profile picture has been updated successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast({
        title: "Error",
        description: "Failed to upload avatar",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Generate slug based on name
  const generateSlug = () => {
    if (member?.name) {
      const slug = member.name
        .toLowerCase()
        .replace(/[^\w ]+/g, "")
        .replace(/ +/g, "-");
      setMember({ ...member, slug });

      toast({
        title: "Slug generated",
        description: "Created slug from member name",
        variant: "default",
      });
    }
  };

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Team", href: "/admin/team" },
    { label: "Edit Member" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2be2]"></div>
        <span className="ml-3">Loading member data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-center min-h-[60vh] flex-col">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-white/70">{error}</p>
          <Button onClick={() => router.push("/admin/team")} className="mt-6">
            Back to Team
          </Button>
        </div>
      </div>
    );
  }

  if (!member) {
    return null;
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <h1 className="text-subtitle font-bold mb-8 mt-4">Edit Member</h1>

      <div className="max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left column - Avatar */}
          <div className="md:col-span-1">
            <div className="mb-6">
              <label className="block mb-2 font-medium">Avatar:</label>
              <div className="flex flex-col items-center space-y-4">
                <div className="relative group cursor-pointer">
                  <div className="w-40 h-40 rounded-none overflow-hidden flex items-center justify-center border border-white/20 relative">
                    {avatarPreview ? (
                      <img
                        src={sanitizeUrl(avatarPreview) || "/placeholder.svg"}
                        alt={member.imgAlt || member.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src =
                            "/placeholder.svg?height=160&width=160";
                        }}
                      />
                    ) : (
                      <div className="text-white/50">No Avatar</div>
                    )}

                    {/* Overlay for upload */}
                    <div
                      className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() =>
                        document.getElementById("avatar-upload")?.click()
                      }
                    >
                      <Camera className="h-8 w-8 text-white mb-2" />
                      <span className="text-xs text-white uppercase font-bold tracking-wider">
                        Change
                      </span>
                    </div>

                    {uploadingAvatar && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={onSelectFile}
                  className="hidden"
                />

                <p className="text-xs text-white/50 text-center">
                  Click on the image to update.
                  <br />
                  JPG, PNG or WEBP.
                </p>
              </div>
            </div>
          </div>

          {/* Right column - Member details */}
          <div className="md:col-span-2">
            <div className="space-y-6">
              <div>
                <label className="block mb-2 font-medium">Name:</label>
                <Input
                  value={member.name || ""}
                  onChange={(e) =>
                    setMember({ ...member, name: e.target.value })
                  }
                  placeholder="Member name"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">Slug:</label>
                <div className="flex gap-2">
                  <Input
                    value={member.slug || ""}
                    onChange={(e) =>
                      setMember({ ...member, slug: e.target.value })
                    }
                    placeholder="URL-friendly identifier"
                    className="flex-1"
                  />
                  <Button
                    onClick={generateSlug}
                    variant="outline"
                    title="Generate slug from name"
                    className="px-3"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-white/50 mt-1">
                  Used in profile URLs
                </p>
              </div>

              <div>
                <label className="block mb-2 font-medium">Country:</label>
                <Input
                  value={member.city || ""}
                  onChange={(e) =>
                    setMember({ ...member, city: e.target.value })
                  }
                  placeholder="Member country"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">Job:</label>
                <Input
                  value={member.job || ""}
                  onChange={(e) =>
                    setMember({ ...member, job: e.target.value })
                  }
                  placeholder="Member job title"
                />
              </div>

              {/* Role Selector (Super Admin Only) */}
              {currentUserRole === "super" && (
                <div>
                  <label className="block mb-2 font-medium">Role:</label>
                  <select
                    className="w-full p-2 border border-white bg-[#121212] text-white"
                    value={member.role || ""}
                    onChange={(e) =>
                      setMember({ ...member, role: e.target.value })
                    }
                  >
                    <option value="">Select role</option>
                    <option value="super">Super Admin</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="moderator">Moderator</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Social Media Section */}
        <div className="mt-8 border border-white/10 p-6">
          <h2 className="text-xl font-bold mb-4">Social Media</h2>

          {/* Add New Social */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="block mb-2 font-medium">Platform:</label>
              <select
                className="w-full p-2 border border-white bg-[#121212] text-white"
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
            </div>

            <div className="flex-1">
              <label className="block mb-2 font-medium">Link:</label>
              <Input
                value={socialLink}
                onChange={(e) => setSocialLink(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleAddSocial}
                className="h-10 whitespace-nowrap"
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-1" /> Add Link
              </Button>
            </div>
          </div>

          {/* Social Media List */}
          <div className="border border-white/10">
            {Object.keys(socials).length > 0 ? (
              <ul className="divide-y divide-white/10">
                {Object.entries(socials).map(([platform, link]) => (
                  <li
                    key={platform}
                    className="flex justify-between items-center p-4"
                  >
                    <div className="flex-1">
                      <span className="font-medium capitalize block">
                        {platform}
                      </span>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-white/60 hover:text-white truncate block max-w-xs"
                      >
                        {link}
                      </a>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleRemoveSocial(platform)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-white/50">
                No social media links added
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 mt-8">
          <Button onClick={handleUpdate} disabled={saving} variant="outline">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Updating..." : "Update Member"}
          </Button>

          {currentUserRole === "super" && (
            <Button
              variant="outline"
              className="border-red-500 text-red-500"
              onClick={() => {
                if (
                  window.confirm(
                    member.promotedFromReader
                      ? "Remove this member's CMS access? Their Docs reader account will remain active."
                      : "Delete this team member and their sign-in account? This action cannot be undone.",
                  )
                ) {
                  handleDelete();
                }
              }}
              disabled={saving || deleting}
            >
              {deleting
                ? "Removing..."
                : member.promotedFromReader
                  ? "Remove CMS Access"
                  : "Delete Member"}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => router.push("/admin/team")}
            disabled={saving}
            className="ml-auto"
          >
            Cancel
          </Button>
        </div>
      </div>
      <AvatarCropper
        isOpen={isCropperOpen}
        onClose={() => setIsCropperOpen(false)}
        imageFile={selectedImageFile}
        onCropComplete={onCropComplete}
      />
    </div>
  );
}
