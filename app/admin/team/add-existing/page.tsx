"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, functions, storage } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Breadcrumb } from "@/components/breadcrumb";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserCircle,
  UserPlus,
  X,
} from "lucide-react";
import { generateSlugFromTitle, sanitizeUrl } from "@/lib/utils";

interface UserCandidate {
  uid: string;
  handle: string;
  name: string;
  email: string;
  photoURL: string;
  city?: string;
  bio?: string;
}

export default function AddExistingUserToTeamPage() {
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [candidates, setCandidates] = useState<UserCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<UserCandidate | null>(null);
  const [query, setQuery] = useState("");
  
  // Form fields for adding the member
  const [name, setName] = useState("");
  const [role, setRole] = useState("author");
  const [job, setJob] = useState("");
  const [city, setCity] = useState("");
  const [slug, setSlug] = useState("");
  const [avatar, setAvatar] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [showOnTeam, setShowOnTeam] = useState(true);
  const [biographySummary, setBiographySummary] = useState("");
  const [biographyBody, setBiographyBody] = useState("");
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [socialPlatform, setSocialPlatform] = useState("");
  const [socialLink, setSocialLink] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { toast } = useToast();

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

  const canAdd = currentUserRole === "super" || currentUserRole === "admin";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setError(null);

      if (user) {
        try {
          const snap = await getDoc(doc(db, "authors", user.uid));
          if (snap.exists()) {
            const role = snap.data().role;
            setCurrentUserRole(role);
            if (!["super", "admin"].includes(role)) {
              setError("You do not have permission to add team members.");
            }
          } else {
            setError("Staff profile not found.");
          }
        } catch (err) {
          console.error("Error checking permissions:", err);
          setError("Failed to verify staff permissions.");
        } finally {
          setLoading(false);
        }
      } else {
        setError("Not authenticated.");
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadCandidates = useCallback(async () => {
    if (!canAdd) return;
    setLoadingCandidates(true);
    try {
      const listFn = httpsCallable<
        Record<string, never>,
        { candidates: UserCandidate[] }
      >(functions, "listExistingUserCandidates");
      const res = await listFn({});
      setCandidates(res.data.candidates || []);
    } catch (err: any) {
      console.warn("Falling back to listModeratorCandidates:", err);
      try {
        const fallbackFn = httpsCallable<
          Record<string, never>,
          { candidates: UserCandidate[] }
        >(functions, "listModeratorCandidates");
        const res = await fallbackFn({});
        setCandidates(res.data.candidates || []);
      } catch (fallbackErr: any) {
        toast({
          title: "Could not load users",
          description: fallbackErr?.message || "Please refresh and try again.",
          variant: "destructive",
        });
      }
    } finally {
      setLoadingCandidates(false);
    }
  }, [canAdd, toast]);

  useEffect(() => {
    if (canAdd) {
      void loadCandidates();
    }
  }, [canAdd, loadCandidates]);

  const filteredCandidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter((c) =>
      [c.name, c.handle, c.email, c.city || ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [candidates, query]);

  const handleSelectCandidate = (candidate: UserCandidate) => {
    setSelectedCandidate(candidate);
    setName(candidate.name || "");
    setCity(candidate.city || "");
    setAvatar(candidate.photoURL || "");
    setImgAlt(candidate.name ? `Profile picture of ${candidate.name}` : "");
    const generatedSlug =
      candidate.handle ||
      (candidate.name
        ? generateSlugFromTitle(candidate.name)
        : candidate.uid.slice(0, 8));
    setSlug(generatedSlug);
    setRole("author");
    setShowOnTeam(true);
    setBiographyBody(candidate.bio || "");
    setBiographySummary("");
  };

  const handleClearSelection = () => {
    setSelectedCandidate(null);
    setName("");
    setJob("");
    setCity("");
    setSlug("");
    setAvatar("");
    setImgAlt("");
    setBiographySummary("");
    setBiographyBody("");
    setSocials({});
  };

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (newRole === "moderator") {
      setShowOnTeam(false);
    } else {
      setShowOnTeam(true);
    }
  };

  const handleAddSocial = () => {
    if (!socialPlatform || !socialLink) {
      toast({
        title: "Missing information",
        description: "Please select a platform and enter a URL.",
        variant: "destructive",
      });
      return;
    }

    setSocials({
      ...socials,
      [socialPlatform]: sanitizeUrl(socialLink),
    });

    setSocialPlatform("");
    setSocialLink("");
  };

  const handleRemoveSocial = (platform: string) => {
    const updated = { ...socials };
    delete updated[platform];
    setSocials(updated);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCandidate) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image size must be less than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadingImage(true);
    try {
      const storageRef = ref(
        storage,
        `authors/${selectedCandidate.uid}/${Date.now()}_${file.name}`
      );
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setAvatar(downloadURL);
      toast({
        title: "Avatar uploaded",
        description: "Profile picture uploaded successfully.",
        variant: "success",
      });
    } catch (err: any) {
      console.error("Error uploading image:", err);
      toast({
        title: "Upload failed",
        description: err.message || "Failed to upload image.",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;

    if (!name.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a name for the team member.",
        variant: "destructive",
      });
      return;
    }

    if (!role) {
      toast({
        title: "Missing role",
        description: "Please choose a team role.",
        variant: "destructive",
      });
      return;
    }

    if (role === "super" && currentUserRole !== "super") {
      toast({
        title: "Permission denied",
        description: "Only a Super Admin can assign the Super Admin role.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const addExisting = httpsCallable(functions, "addExistingUserToTeam");
      await addExisting({
        uid: selectedCandidate.uid,
        role,
        name: name.trim(),
        job: job.trim(),
        city: city.trim(),
        slug: slug.trim() || generateSlugFromTitle(name.trim()),
        avatar: avatar.trim(),
        imgAlt: imgAlt.trim() || `Profile picture of ${name.trim()}`,
        showOnTeam,
        biography: {
          summary: biographySummary.trim(),
          body: biographyBody.trim(),
        },
        socials,
      });

      toast({
        title: "Team member added",
        description: `${name} has been added to the team as ${role}.`,
        variant: "success",
      });

      router.push("/admin/team");
    } catch (err: any) {
      console.error("Error adding existing user to team:", err);
      toast({
        title: "Failed to add member",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
      setSaving(false);
    }
  };

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Team", href: "/admin/team" },
    { label: "Add Existing User" },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-[#8a2ae3]"></div>
        <span className="ml-3 font-mono text-sm">Verifying permissions…</span>
      </div>
    );
  }

  if (error || !canAdd) {
    return (
      <div className="px-4 py-6">
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertTriangle className="mb-4 h-12 w-12 text-[#8a2ae3]" />
          <h2 className="mb-2 text-xl font-bold">Access Denied</h2>
          <p className="text-white/70">{error || "You don't have permission to view this page."}</p>
          <Button onClick={() => router.push("/admin/team")} className="mt-6" variant="outline">
            Back to Team
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-2">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div className="mb-6 flex items-center justify-between">
        <PageTitle className="sr-only" imgSrc="/images/titles/team.svg" imgAlt="Add Existing User">
          Add Existing User to Team
        </PageTitle>
      </div>

      <div className="mb-8 border-b border-white/15 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">Add Existing User to Team</h1>
        <p className="mt-1 text-sm text-white/55">
          Promote or assign a team role to a reader who already has an account. No email or password is required.
        </p>
      </div>

      {!selectedCandidate ? (
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="border border-white/15 bg-white/[0.02] p-5">
            <label htmlFor="user-search" className="mb-2 block text-sm font-semibold uppercase tracking-wider text-white/80">
              Find an Existing Account
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <Input
                id="user-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, @handle, email, or city…"
                className="h-11 border-white/20 bg-black/50 pl-10 text-sm focus-visible:ring-[#8a2ae3]"
              />
            </div>
          </div>

          <div className="border border-white/15 bg-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-white/70">
                Registered Readers & Users ({filteredCandidates.length})
              </h2>
              {loadingCandidates && (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-white/40">
                  <Loader2 className="h-3 w-3 animate-spin text-[#8a2ae3]" /> Loading…
                </span>
              )}
            </div>

            {loadingCandidates && candidates.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[#8a2ae3]" />
                <span className="ml-3 font-mono text-sm text-white/50">Fetching user accounts…</span>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="py-16 text-center">
                <UserCircle className="mx-auto h-10 w-10 text-white/20" />
                <p className="mt-3 font-medium text-white/80">No unassigned users found</p>
                <p className="mt-1 text-xs text-white/40">
                  {query ? "Try a different search query." : "All registered users are already assigned to the team."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/10 max-h-[550px] overflow-y-auto">
                {filteredCandidates.map((candidate) => (
                  <div
                    key={candidate.uid}
                    onClick={() => handleSelectCandidate(candidate)}
                    className="group flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      {candidate.photoURL ? (
                        <img
                          src={candidate.photoURL}
                          alt={candidate.name}
                          referrerPolicy="no-referrer"
                          className="h-11 w-11 shrink-0 rounded-full border border-white/15 object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg?height=44&width=44";
                          }}
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#8a2ae3]/15 text-sm font-semibold uppercase text-white">
                          {candidate.name.charAt(0) || "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-white group-hover:text-[#8a2ae3] transition-colors">
                            {candidate.name}
                          </p>
                          {candidate.handle && (
                            <span className="font-mono text-xs text-[#8a2ae3]">
                              @{candidate.handle}
                            </span>
                          )}
                        </div>
                        <p className="truncate font-mono text-xs text-white/40">
                          {candidate.email || candidate.uid}
                        </p>
                        {candidate.city && (
                          <p className="text-[11px] text-white/30">{candidate.city}</p>
                        )}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-4 shrink-0 group-hover:border-[#8a2ae3] group-hover:text-[#8a2ae3]"
                    >
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Select
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-8">
          {/* Selected Account Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 border border-[#8a2ae3]/40 bg-[#8a2ae3]/[0.06] p-4 sm:p-5">
            <div className="flex items-center space-x-4">
              {selectedCandidate.photoURL ? (
                <img
                  src={selectedCandidate.photoURL}
                  alt={selectedCandidate.name}
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-full border-2 border-[#8a2ae3] object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#8a2ae3] bg-[#8a2ae3]/20 text-lg font-bold text-white">
                  {selectedCandidate.name.charAt(0) || "?"}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-lg">{selectedCandidate.name}</span>
                  {selectedCandidate.handle && (
                    <span className="font-mono text-xs text-[#8a2ae3]">@{selectedCandidate.handle}</span>
                  )}
                </div>
                <p className="font-mono text-xs text-white/50">{selectedCandidate.email || "No email"}</p>
                <p className="font-mono text-[10px] text-white/30 mt-0.5">UID: {selectedCandidate.uid}</p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearSelection}
              className="border-white/20 text-xs font-mono hover:bg-white/10"
            >
              <X className="mr-1.5 h-3.5 w-3.5" /> Choose Different User
            </Button>
          </div>

          <div className="border border-white/15 bg-black/40 p-6 space-y-6">
            <h2 className="text-base font-semibold uppercase tracking-wider text-white border-b border-white/10 pb-3">
              Team Member Configuration
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Name */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-white/70 mb-2">
                  Full Name *
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  className="border-white/20 bg-white/[0.02]"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-white/70 mb-2">
                  Team Role *
                </label>
                <Select value={role} onValueChange={handleRoleChange}>
                  <SelectTrigger className="border-white/20 bg-black text-white">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="border-white/20 bg-[#161616] text-white">
                    {currentUserRole === "super" && (
                      <SelectItem value="super" className="focus:bg-[#8a2ae3]">
                        Super Admin (Full root access)
                      </SelectItem>
                    )}
                    <SelectItem value="admin" className="focus:bg-[#8a2ae3]">
                      Admin (Manage posts & team)
                    </SelectItem>
                    <SelectItem value="author" className="focus:bg-[#8a2ae3]">
                      Author (Write & publish articles)
                    </SelectItem>
                    <SelectItem value="moderator" className="focus:bg-[#8a2ae3]">
                      Moderator (Moderate comments)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Job Title */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-white/70 mb-2">
                  Job Title
                </label>
                <Input
                  value={job}
                  onChange={(e) => setJob(e.target.value)}
                  placeholder="e.g. Senior Technical Writer"
                  className="border-white/20 bg-white/[0.02]"
                />
              </div>

              {/* City / Country */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-white/70 mb-2">
                  City / Country
                </label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. London, UK"
                  className="border-white/20 bg-white/[0.02]"
                />
              </div>

              {/* Slug / Handle */}
              <div className="md:col-span-2">
                <label className="block text-xs font-mono uppercase tracking-wider text-white/70 mb-2">
                  Profile URL Slug
                </label>
                <div className="flex gap-2">
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="e.g. john-doe"
                    className="border-white/20 bg-white/[0.02] font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSlug(generateSlugFromTitle(name || "member"))}
                    className="shrink-0"
                    title="Generate from name"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-white/40 font-mono">
                  Public profile URL: https://lap.onl/team/{slug || "slug"}
                </p>
              </div>
            </div>

            {/* Show on Public Team Page */}
            <div className="flex items-center space-x-3 rounded border border-white/10 bg-white/[0.02] p-4">
              <Checkbox
                id="showOnTeam"
                checked={showOnTeam}
                onCheckedChange={(checked) => setShowOnTeam(Boolean(checked))}
                className="border-white/30 data-[state=checked]:bg-[#8a2ae3] data-[state=checked]:border-[#8a2ae3]"
              />
              <div>
                <label htmlFor="showOnTeam" className="cursor-pointer text-sm font-medium text-white">
                  Show on Public Team Page
                </label>
                <p className="text-xs text-white/40">
                  When enabled, this member is displayed on the public docs /team showcase.
                </p>
              </div>
            </div>

            {/* Avatar & Photo */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">
                Profile Picture & Avatar
              </h3>
              
              <div className="flex flex-wrap items-center gap-5">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={imgAlt || name}
                    referrerPolicy="no-referrer"
                    className="h-20 w-20 rounded-full border-2 border-white/20 object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.svg?height=80&width=80";
                    }}
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/20 bg-white/5 text-2xl font-bold">
                    {name.charAt(0) || "?"}
                  </div>
                )}

                <div className="flex-1 space-y-2 min-w-[240px]">
                  <Input
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="Image URL (Google photo or custom URL)"
                    className="border-white/20 bg-white/[0.02] font-mono text-xs"
                  />
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 border border-white/20 px-3 py-1 text-xs font-mono text-white/80 hover:bg-white/10 transition-colors">
                      <Upload className="h-3.5 w-3.5" />
                      <span>{uploadingImage ? "Uploading…" : "Upload New Photo"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                        className="sr-only"
                      />
                    </label>
                    {selectedCandidate.photoURL && avatar !== selectedCandidate.photoURL && (
                      <button
                        type="button"
                        onClick={() => setAvatar(selectedCandidate.photoURL)}
                        className="text-xs font-mono text-[#8a2ae3] underline hover:text-white"
                      >
                        Reset to Google/Docs Photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-white/70 mb-2">
                  Image Alt Text
                </label>
                <Input
                  value={imgAlt}
                  onChange={(e) => setImgAlt(e.target.value)}
                  placeholder="e.g. Profile picture of John Doe"
                  className="border-white/20 bg-white/[0.02]"
                />
              </div>
            </div>

            {/* Biography */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">
                Biography
              </h3>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-white/70 mb-2">
                  Card Summary (Short)
                </label>
                <Textarea
                  value={biographySummary}
                  onChange={(e) => setBiographySummary(e.target.value)}
                  placeholder="A brief 1-2 sentence introduction displayed on team cards and article author summaries…"
                  rows={2}
                  className="border-white/20 bg-white/[0.02]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-white/70 mb-2">
                  Full Biography Body (Markdown supported)
                </label>
                <Textarea
                  value={biographyBody}
                  onChange={(e) => setBiographyBody(e.target.value)}
                  placeholder="Full background, areas of expertise, and story for their /team/[slug] page…"
                  rows={5}
                  className="border-white/20 bg-white/[0.02]"
                />
              </div>
            </div>

            {/* Social Links */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">
                Social Profiles & Links
              </h3>

              <div className="flex flex-wrap gap-2">
                <Select value={socialPlatform} onValueChange={setSocialPlatform}>
                  <SelectTrigger className="w-[140px] border-white/20 bg-black text-white text-xs font-mono uppercase">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent className="border-white/20 bg-[#161616] text-white">
                    {platforms.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs font-mono uppercase focus:bg-[#8a2ae3]">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={socialLink}
                  onChange={(e) => setSocialLink(e.target.value)}
                  placeholder="Profile URL (e.g. https://github.com/username)"
                  className="flex-1 min-w-[200px] border-white/20 bg-white/[0.02] text-xs font-mono"
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSocial}
                  className="shrink-0"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
                </Button>
              </div>

              {Object.keys(socials).length > 0 && (
                <div className="space-y-2 pt-2">
                  {Object.entries(socials).map(([platform, link]) => (
                    <div
                      key={platform}
                      className="flex items-center justify-between border border-white/10 bg-white/[0.02] p-2.5 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold uppercase text-[#8a2ae3]">{platform}:</span>
                        <span className="truncate text-white/70">{link}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSocial(platform)}
                        className="ml-2 text-red-400 hover:text-red-300"
                        title="Remove link"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#8a2ae3] px-6 text-white hover:bg-[#9d3df0]"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding to Team…
                </>
              ) : (
                <>
                  <UserCheck className="mr-2 h-4 w-4" /> Add {name || "User"} to Team
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/admin/team")}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
