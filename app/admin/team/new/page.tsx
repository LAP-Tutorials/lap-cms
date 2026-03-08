"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
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
  UserCircle,
} from "lucide-react";
import { generateSlugFromTitle, sanitizeUrl } from "@/lib/utils";

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
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [socialPlatform, setSocialPlatform] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { toast } = useToast();

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
      setLoading(true);
      setError(null);

      if (user) {
        try {
          const ref = doc(db, "authors", user.uid);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            const role = snap.data().role;
            setCurrentUserRole(role);

            if (!["super", "admin"].includes(role)) {
              setError("You don't have permission to create team members");
            }
          } else {
            setError("User profile not found");
          }
        } catch (err) {
          console.error("Error fetching user role:", err);
          setError("Failed to verify permissions");
        } finally {
          setLoading(false);
        }
      } else {
        setError("Not authenticated");
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Auto-generate slug when name changes
  useEffect(() => {
    if (name) {
      setSlug(generateSlugFromTitle(name));
    }
  }, [name]);

  // Auto-generate imgAlt if name is entered but imgAlt is empty
  useEffect(() => {
    if (name && !imgAlt) {
      setImgAlt(`Profile picture of ${name}`);
    }
  }, [name, imgAlt]);

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

  const validateForm = () => {
    if (!name.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a name for the team member",
        variant: "destructive",
      });
      return false;
    }

    if (!email.trim()) {
      toast({
        title: "Missing email",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return false;
    }

    if (!password.trim() || password.length < 6) {
      toast({
        title: "Invalid password",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return false;
    }

    if (!role) {
      toast({
        title: "Missing role",
        description: "Please select a role for the team member",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    if (!["super", "admin"].includes(currentUserRole)) {
      toast({
        title: "Permission denied",
        description: "You don't have permission to create team members",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);

    try {
      // Create a new user in Firebase Auth
      const { user } = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
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
        socials, // Add the socials map
        createdAt: new Date().toISOString(),
        dateJoined: new Date(),
      });

      toast({
        title: "Member created",
        description: "New team member has been successfully created",
        variant: "success",
      });

      router.push("/admin/team");
    } catch (err: any) {
      console.error("Error creating team member:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to create team member",
        variant: "destructive",
      });
      setCreating(false);
    }
  };

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Team", href: "/admin/team" },
    { label: "New Member" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2be2]"></div>
        <span className="ml-3">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-center min-h-[60vh] flex-col">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-white/70">{error}</p>
          <Button onClick={() => router.push("/admin/team")} className="mt-6">
            Back to Team
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <h1 className="text-subtitle font-bold mb-8 mt-4">New Member</h1>

      <form onSubmit={handleCreate} className="max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left column - Avatar */}
          <div className="md:col-span-1">
            <div className="mb-6">
              <label className="block mb-2 font-medium">Avatar:</label>
              <div className="flex flex-col items-center space-y-4">
                <div className="w-40 h-40 rounded-none overflow-hidden flex items-center justify-center border border-white/20">
                  {avatar ? (
                    <img
                      src={sanitizeUrl(avatar) || "/placeholder.svg"}
                      alt={imgAlt || "Profile preview"}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src =
                          "/placeholder.svg?height=160&width=160";
                      }}
                    />
                  ) : (
                    <UserCircle className="w-20 h-20 text-white/50" />
                  )}
                </div>
                <Input
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="Avatar URL"
                  className="w-full"
                />
                <Input
                  value={imgAlt}
                  onChange={(e) => setImgAlt(e.target.value)}
                  placeholder="Image Alt Text"
                  className="w-full"
                />
                <p className="text-sm text-white/50 text-center">
                  Image alt text is used for accessibility
                </p>
              </div>
            </div>
          </div>

          {/* Right column - Member details */}
          <div className="md:col-span-2">
            <div className="space-y-6">
              <div>
                <label className="block mb-2 font-medium">
                  Full Name: <span className="text-red-500">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Member name"
                  required
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">Slug:</label>
                <div className="flex gap-2">
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="URL-friendly identifier"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => setSlug(generateSlugFromTitle(name))}
                    variant="outline"
                    title="Generate slug from name"
                    className="px-3"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-white/50 mt-1">
                  Auto-generated from name
                </p>
              </div>

              <div>
                <label className="block mb-2 font-medium">Country:</label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Member country"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">Job:</label>
                <Input
                  value={job}
                  onChange={(e) => setJob(e.target.value)}
                  placeholder="Member job title"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">
                  Role: <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full p-2 border border-white bg-[#121212] text-white"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                >
                  <option value="">Select role</option>
                  {currentUserRole === "super" && (
                    <option value="super">Super Admin</option>
                  )}
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                </select>
              </div>

              <div>
                <label className="block mb-2 font-medium">
                  Email: <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="member@example.com"
                  required
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">
                  Password: <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                />
                <p className="text-sm text-white/50 mt-1">
                  Password must be at least 6 characters long
                </p>
              </div>
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
                type="button"
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
                      type="button"
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
          <Button type="submit" disabled={creating} variant="outline">
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {creating ? "Creating..." : "Create Member"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (
                window.confirm(
                  "Are you sure you want to cancel? Any information you've entered will be lost.",
                )
              ) {
                router.push("/admin/team");
              }
            }}
            disabled={creating}
            className="ml-auto"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
