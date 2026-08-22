"use client"

import { useEffect, useState } from "react"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { auth, db, storage } from "@/lib/firebase"
import {
  onAuthStateChanged,
  updatePassword,
  GoogleAuthProvider,
  linkWithPopup,
} from "firebase/auth"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import PageTitle from "@/components/PageTitle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Breadcrumb } from "@/components/breadcrumb"
import { Eye, EyeOff, Loader2, AlertTriangle, Plus, X, Camera } from "lucide-react"
import { FcGoogle } from "react-icons/fc"
import { AvatarCropper } from "@/components/profile/avatar-cropper"

interface ProfileData {
  avatar: string
  name: string
  city: string
  job: string
  biography: {
    body: string
    summary: string
  }
  socials: Record<string, string>
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>({
    avatar: "",
    name: "",
    city: "",
    job: "",
    biography: { body: "", summary: "" },
    socials: {},
  })

  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [socialPlatform, setSocialPlatform] = useState("")
  const [socialLink, setSocialLink] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [linkingGoogle, setLinkingGoogle] = useState(false)
  const [isGoogleLinked, setIsGoogleLinked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cropper state
  const [isCropperOpen, setIsCropperOpen] = useState(false)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const { toast } = useToast()
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
  ]

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true)
      setError(null)

      if (user) {
        // Check if Google is a linked provider
        const isLinked = user.providerData.some(
          (provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID
        )
        setIsGoogleLinked(isLinked)

        try {
          const ref = doc(db, "authors", user.uid)
          const snap = await getDoc(ref)

          if (snap.exists()) {
            const data = snap.data()
            setProfile({
              avatar: data.avatar || "",
              name: data.name || "",
              city: data.city || "",
              job: data.job || "",
              biography: data.biography || { body: "", summary: "" },
              socials: data.socials || {},
            })
          } else {
            setError("Profile not found")
          }
        } catch (err) {
          console.error("Error fetching profile:", err)
          setError("Failed to load profile data")
        } finally {
          setLoading(false)
        }
      } else {
        setError("Not authenticated")
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  const handleLinkGoogle = async () => {
    if (!auth.currentUser) {
      toast({
        title: "Not authenticated",
        description: "You must be logged in to link an account.",
        variant: "destructive",
      })
      return
    }

    setLinkingGoogle(true)
    const provider = new GoogleAuthProvider()

    try {
      await linkWithPopup(auth.currentUser, provider)
      setIsGoogleLinked(true)
      toast({
        title: "Account Linked",
        description: "Your Google account has been successfully linked.",
        variant: "success",
      })
    } catch (err: any) {
      console.error("Error linking Google account:", err)
      let description = "Failed to link Google account."
      if (err.code === "auth/credential-already-in-use") {
        description = "This Google account is already linked to another user."
      }
      toast({
        title: "Error",
        description,
        variant: "destructive",
      })
    } finally {
      setLinkingGoogle(false)
    }
  }

  const handleSave = async () => {
    if (!auth.currentUser) {
      toast({
        title: "Authentication error",
        description: "You must be logged in to update your profile",
        variant: "destructive",
      })
      return
    }

    setSaving(true)

    try {
      const ref = doc(db, "authors", auth.currentUser.uid)
      await updateDoc(ref, {
        avatar: profile.avatar,
        name: profile.name,
        city: profile.city,
        job: profile.job,
        biography: profile.biography,
        socials: profile.socials,
      })

      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated",
        variant: "success",
      })
    } catch (err) {
      console.error("Error updating profile:", err)
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!auth.currentUser || !password) {
      toast({
        title: "Error",
        description: "Please enter a new password",
        variant: "destructive",
      })
      return
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      })
      return
    }

    setChangingPassword(true)

    try {
      await updatePassword(auth.currentUser, password)
      toast({
        title: "Password updated",
        description: "Your password has been successfully changed",
        variant: "success",
      })
      setPassword("")
    } catch (err: any) {
      console.error("Error updating password:", err)
      toast({
        title: "Error",
        description: err.message || "Failed to update password",
        variant: "destructive",
      })
    } finally {
      setChangingPassword(false)
    }
  }

  const handleAddSocial = () => {
    if (!socialPlatform || !socialLink) {
      toast({
        title: "Missing information",
        description: "Please select a platform and enter a link",
        variant: "destructive",
      })
      return
    }

    setProfile({
      ...profile,
      socials: {
        ...profile.socials,
        [socialPlatform]: socialLink,
      },
    })

    setSocialPlatform("")
    setSocialLink("")

    toast({
      title: "Social link added",
      description: `Added ${socialPlatform} to your profile`,
      variant: "success",
    })
  }

  const handleRemoveSocial = (platform: string) => {
    const { [platform]: _, ...rest } = profile.socials
    setProfile({
      ...profile,
      socials: rest,
    })

    toast({
      title: "Social link removed",
      description: `Removed ${platform} from your profile`,
      variant: "default",
    })
  }

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedImageFile(e.target.files[0])
      setIsCropperOpen(true)
      // Reset input value to allow selecting the same file again
      e.target.value = ""
    }
  }

  const onCropComplete = async (croppedBlob: Blob) => {
    if (!auth.currentUser) return

    setUploadingAvatar(true)
    try {
      // Create a slug from the name for the file path
      const nameSlug = profile.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') || auth.currentUser.uid

      const storageRef = ref(storage, `avatars/team/${nameSlug}.webp`)
      const uploadTask = await uploadBytes(storageRef, croppedBlob)
      const downloadURL = await getDownloadURL(uploadTask.ref)

      setProfile((prev) => ({ ...prev, avatar: downloadURL }))
      
      // Auto-save the profile with new avatar
      const userRef = doc(db, "authors", auth.currentUser.uid)
      await updateDoc(userRef, { avatar: downloadURL })

      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated successfully",
        variant: "success",
      })
    } catch (error) {
      console.error("Error uploading avatar:", error)
      toast({
        title: "Error",
        description: "Failed to upload avatar",
        variant: "destructive",
      })
    } finally {
      setUploadingAvatar(false)
    }
  }

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Profile" },
  ]

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2ae3]"></div>
        <span className="ml-3">Loading profile...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-center min-h-[60vh] flex-col">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-white/70">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <PageTitle
        className="sr-only"
        imgSrc="/images/titles/profile.svg"
        imgAlt="Profile"
      >
        Profile
      </PageTitle>

      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left column - Avatar and basic info */}
          <div className="md:col-span-1">
            <div className="mb-6">
              <label className="block mb-2 font-medium">Avatar:</label>
              <div className="flex flex-col items-center space-y-4">
                <div className="relative group cursor-pointer">
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt="Avatar Preview"
                      className="w-40 h-40 object-cover border border-white/20 rounded-full"
                      onError={(e) => {
                        e.currentTarget.src =
                          "/placeholder.svg?height=160&width=160"
                      }}
                    />
                  ) : (
                    <div className="w-40 h-40 border border-white/20 flex items-center justify-center bg-white/5 rounded-full">
                      No Avatar
                    </div>
                  )}
                  
                  {/* Overlay for upload */}
                  <div 
                    className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => document.getElementById("avatar-upload")?.click()}
                  >
                    <Camera className="h-8 w-8 text-white mb-2" />
                    <span className="text-xs text-white uppercase font-bold tracking-wider">Change</span>
                  </div>

                  {uploadingAvatar && (
                     <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                     </div>
                  )}
                </div>

                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={onSelectFile}
                  className="hidden"
                />
                
                <p className="text-xs text-white/50 text-center">
                  Click on the image to update.<br/>
                  JPG, PNG or WEBP.
                </p>
              </div>
            </div>
          </div>

          {/* Right column - Profile details */}
          <div className="md:col-span-2">
            <div className="space-y-6">
              <div>
                <label className="block mb-2 font-medium">Name:</label>
                <Input
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">Country:</label>
                <Input
                  value={profile.city}
                  onChange={(e) =>
                    setProfile({ ...profile, city: e.target.value })
                  }
                  placeholder="Your country"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">Job:</label>
                <Input
                  value={profile.job}
                  onChange={(e) =>
                    setProfile({ ...profile, job: e.target.value })
                  }
                  placeholder="Your job title"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">Biography:</label>
                <Textarea
                  value={profile.biography.body}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      biography: { ...profile.biography, body: e.target.value },
                    })
                  }
                  placeholder="Your detailed biography"
                  className="min-h-[150px]"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">
                  Biography Summary:
                </label>
                <Textarea
                  value={profile.biography.summary}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      biography: {
                        ...profile.biography,
                        summary: e.target.value,
                      },
                    })
                  }
                  placeholder="A brief summary of your biography"
                />
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
            {Object.keys(profile.socials).length > 0 ? (
              <ul className="divide-y divide-white/10">
                {Object.entries(profile.socials).map(([platform, link]) => (
                  <li
                    key={platform}
                    className="flex justify-between items-center p-4 gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium capitalize block truncate">
                        {platform}
                      </span>
                      <a
                        href={link as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-white/60 hover:text-white truncate block"
                      >
                        {String(link)}
                      </a>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
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

        <div className="mt-8">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto"
            variant="outline"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>

        <hr className="my-10 border-white/10" />

        {/* Link Google Account Section */}
        <div className="max-w-md mb-10">
          <h2 className="text-xl font-bold mb-6">Link Accounts</h2>
          {isGoogleLinked ? (
            <Button variant="outline" disabled className="w-full">
              <FcGoogle className="mr-2 h-5 w-5" />
              Google Account Linked
            </Button>
          ) : (
            <Button
              onClick={handleLinkGoogle}
              disabled={linkingGoogle}
              variant="outline"
              className="w-full"
            >
              {linkingGoogle ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FcGoogle className="mr-2 h-5 w-5" />
              )}
              {linkingGoogle ? "Linking..." : "Link Google Account"}
            </Button>
          )}
        </div>

        {/* Change Password Section */}
        <div className="max-w-md">
          <h2 className="text-xl font-bold mb-6">Change Password</h2>

          <div className="mb-6">
            <label className="block mb-2 font-medium">New Password:</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-white/50 mt-1">
              Password must be at least 6 characters long
            </p>
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={changingPassword || !password}
            variant="outline"
          >
            {changingPassword && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {changingPassword ? "Updating..." : "Update Password"}
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
  )
}
