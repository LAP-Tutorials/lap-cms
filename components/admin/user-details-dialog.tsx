"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore"
import {
  AtSign,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Shield,
  User,
  X,
} from "lucide-react"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export type StaffRole = "super" | "admin" | "author" | "moderator"

interface UserDetailsDialogProps {
  userId: string | null
  isOpen: boolean
  onClose: () => void
  initialData?: {
    name?: string
    handle?: string
    photoURL?: string
  }
}

interface UserProfileDetails {
  uid: string
  displayName: string
  handle: string
  email: string
  photoURL: string
  provider?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  joinedDate?: Date | null
  role?: StaffRole
  bio?: string
  job?: string
  city?: string
  socials?: Record<string, string>
  commentsCount: number
  repliesCount: number
  recentComments: Array<{
    id: string
    articleTitle: string
    articleSlug: string
    content: string
    status: "visible" | "hidden"
    createdAt?: Timestamp
  }>
  recentReplies: Array<{
    id: string
    articleTitle: string
    articleSlug: string
    content: string
    status: "visible" | "hidden"
    createdAt?: Timestamp
  }>
}

const ROLE_BADGES: Record<StaffRole, { label: string; className: string }> = {
  super: { label: "Super Admin", className: "bg-[#8a2ae3]/15 text-[#8a2ae3] border-[#8a2ae3]/30" },
  admin: { label: "Admin", className: "bg-[#8a2ae3]/15 text-[#8a2ae3] border-[#8a2ae3]/30" },
  author: { label: "Author", className: "bg-[#f3c969]/15 text-[#f3c969] border-[#f3c969]/30" },
  moderator: { label: "Moderator", className: "bg-[#5eead4]/15 text-[#5eead4] border-[#5eead4]/30" },
}

function extractBioString(source: unknown): string {
  if (!source) return ""
  if (typeof source === "string") return source
  if (typeof source === "object" && source !== null) {
    const obj = source as Record<string, unknown>
    if (typeof obj.summary === "string" && obj.summary.trim()) return obj.summary
    if (typeof obj.body === "string" && obj.body.trim()) return obj.body
    if (typeof obj.bio === "string" && obj.bio.trim()) return obj.bio
  }
  return ""
}

function parseAnyDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  if (typeof value.toDate === "function") {
    try {
      const d = value.toDate()
      if (d instanceof Date && !isNaN(d.getTime())) return d
    } catch {
      // ignore
    }
  }

  if (typeof value === "object" && value !== null) {
    const sec = value.seconds ?? value._seconds
    if (typeof sec === "number") {
      return new Date(sec * 1000)
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d
  }

  return null
}

function getAuthorDate(author: any): Date | null {
  if (!author) return null
  const fields = [
    "createdAt",
    "created_at",
    "date",
    "joinedDate",
    "joined_date",
    "joinedAt",
    "joined_at",
    "timestamp",
    "updatedAt",
    "updated_at",
  ]
  for (const field of fields) {
    if (author[field] !== undefined && author[field] !== null) {
      const parsed = parseAnyDate(author[field])
      if (parsed) return parsed
    }
  }
  return null
}

export function UserDetailsDialog({
  userId,
  isOpen,
  onClose,
  initialData,
}: UserDetailsDialogProps) {
  const [profile, setProfile] = useState<UserProfileDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"comments" | "replies">("comments")

  useEffect(() => {
    if (!isOpen || !userId) {
      setProfile(null)
      return
    }

    let isMounted = true
    setLoading(true)

    const fetchUserDetails = async () => {
      try {
        const userRef = doc(db, "users", userId)
        const authorRef = doc(db, "authors", userId)
        const commentsRef = collection(db, "comments")
        const repliesRef = collection(db, "commentReplies")

        const [
          userSnap,
          authorSnap,
          commentsCountSnap,
          repliesCountSnap,
          recentCommentsSnap,
          recentRepliesSnap,
        ] = await Promise.all([
          getDoc(userRef).catch(() => null),
          getDoc(authorRef).catch(() => null),
          getCountFromServer(query(commentsRef, where("authorId", "==", userId))).catch(() => ({
            data: () => ({ count: 0 }),
          })),
          getCountFromServer(query(repliesRef, where("authorId", "==", userId))).catch(() => ({
            data: () => ({ count: 0 }),
          })),
          getDocs(
            query(
              commentsRef,
              where("authorId", "==", userId),
              limit(50),
            ),
          ).catch((err) => {
            console.error("Error fetching user comments in modal:", err)
            return null
          }),
          getDocs(
            query(
              repliesRef,
              where("authorId", "==", userId),
              limit(50),
            ),
          ).catch((err) => {
            console.error("Error fetching user replies in modal:", err)
            return null
          }),
        ])

        if (!isMounted) return

        const userData = userSnap?.data()
        const authorData = authorSnap?.data()

        const role = authorData?.role as StaffRole | undefined

        const recentComments = (
          recentCommentsSnap?.docs.map((docSnap) => {
            const data = docSnap.data()
            return {
              id: docSnap.id,
              articleTitle: data.articleTitle || "Untitled Article",
              articleSlug: data.articleSlug || "",
              content: data.content || "",
              status: (data.status as "visible" | "hidden") || "visible",
              createdAt: data.createdAt,
            }
          }) || []
        )
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
          .slice(0, 15)

        const recentReplies = (
          recentRepliesSnap?.docs.map((docSnap) => {
            const data = docSnap.data()
            return {
              id: docSnap.id,
              articleTitle: data.articleTitle || "Untitled Article",
              articleSlug: data.articleSlug || "",
              content: data.content || "",
              status: (data.status as "visible" | "hidden") || "visible",
              createdAt: data.createdAt,
            }
          }) || []
        )
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
          .slice(0, 15)

        const bioString = extractBioString(authorData?.biography || authorData?.bio)
        const authDate = role ? getAuthorDate(authorData) : null
        const userDate = parseAnyDate(userData?.createdAt || userData?.updatedAt)
        const effectiveJoinedDate = role ? (authDate || userDate) : (userDate || authDate)

        const details: UserProfileDetails = {
          uid: userId,
          displayName:
            authorData?.name || userData?.displayName || initialData?.name || "Reader",
          handle: authorData?.handle || userData?.handle || initialData?.handle || "",
          email: userData?.email || authorData?.email || "",
          photoURL:
            authorData?.avatar || userData?.photoURL || initialData?.photoURL || "",
          provider: userData?.provider,
          createdAt:
            authorData?.createdAt ||
            authorData?.created_at ||
            (role ? undefined : userData?.createdAt),
          updatedAt: userData?.updatedAt,
          joinedDate: effectiveJoinedDate,
          role,
          bio: bioString,
          job: authorData?.job,
          city: authorData?.city,
          socials: authorData?.socials,
          commentsCount: commentsCountSnap.data().count,
          repliesCount: repliesCountSnap.data().count,
          recentComments,
          recentReplies,
        }

        setProfile(details)
      } catch (err) {
        console.error("Error loading user profile details in CMS:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void fetchUserDetails()

    return () => {
      isMounted = false
    }
  }, [isOpen, userId, initialData])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (!isOpen || !userId) return null

  const isDeleted = userId === "deleted-user"
  const roleBadge = profile?.role ? ROLE_BADGES[profile.role] : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden border border-white/15 bg-[#121212] text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-white/20 bg-white/5">
              {profile?.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName || "User avatar"}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="h-8 w-8 text-white/40" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="user-details-title"
                  className="text-xl font-bold uppercase tracking-tight text-white"
                >
                  {loading ? "Loading..." : profile?.displayName}
                </h2>
                {roleBadge ? (
                  <Badge variant="outline" className={roleBadge.className}>
                    <Shield className="mr-1 h-3 w-3" />
                    {roleBadge.label}
                  </Badge>
                ) : isDeleted ? (
                  <Badge variant="outline" className="border-white/20 text-white/40">
                    Deleted
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-white/20 text-white/70">
                    Reader
                  </Badge>
                )}
              </div>

              {profile?.handle ? (
                <p className="font-mono text-sm font-semibold text-[#8a2ae3]">
                  @{profile.handle}
                </p>
              ) : (
                <p className="text-xs italic text-white/40">No handle claimed</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close user details"
            className="flex h-8 w-8 items-center justify-center border border-white/20 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata Grid: Email, Provider, UID */}
          <div className="grid grid-cols-1 gap-3 rounded-none border border-white/10 bg-white/[0.02] p-4 text-xs sm:grid-cols-2">
            <div>
              <span className="text-white/40 block mb-0.5">Email</span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium text-white truncate">
                  {profile?.email || "No email stored"}
                </span>
                {profile?.email && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.email, "email")}
                    className="text-white/40 hover:text-white transition-colors"
                    title="Copy email"
                  >
                    {copiedField === "email" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div>
              <span className="text-white/40 block mb-0.5">Authentication Provider</span>
              <span className="font-mono font-medium uppercase text-white/80">
                {profile?.provider === "google.com"
                  ? "Google Sign-In"
                  : profile?.provider === "password"
                  ? "Email / Password"
                  : profile?.role
                  ? "Staff Account"
                  : "Standard"}
              </span>
            </div>

            <div className="sm:col-span-2 border-t border-white/10 pt-2.5">
              <span className="text-white/40 block mb-0.5">User ID (UID)</span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-white/70 break-all">
                  {profile?.uid}
                </span>
                {profile?.uid && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.uid, "uid")}
                    className="text-white/40 hover:text-white transition-colors"
                    title="Copy UID"
                  >
                    {copiedField === "uid" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Activity Statistics Summary */}
          <div className="grid grid-cols-2 gap-4 border border-white/10 bg-white/[0.02] p-4 text-center">
            <div className="border-r border-white/10">
              <span className="text-xs uppercase tracking-widest text-white/45 block mb-1">
                Comments
              </span>
              <span className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-white">
                {loading ? "..." : profile?.commentsCount ?? 0}
              </span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-white/45 block mb-1">
                Replies
              </span>
              <span className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-white">
                {loading ? "..." : profile?.repliesCount ?? 0}
              </span>
            </div>
          </div>

          {/* Bio / Staff Details if available */}
          {profile?.bio && (
            <div className="border-l-2 border-[#8a2ae3] pl-3 py-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-white/40 block mb-1">
                Bio / Biography
              </span>
              <p className="text-sm font-light text-white/80 leading-relaxed">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Activity History Tabs */}
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-4">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab("comments")}
                  className={`text-xs uppercase font-semibold tracking-wider pb-2 border-b-2 transition-colors ${
                    activeTab === "comments"
                      ? "border-[#8a2ae3] text-white"
                      : "border-transparent text-white/40 hover:text-white"
                  }`}
                >
                  Recent Comments ({profile?.recentComments.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("replies")}
                  className={`text-xs uppercase font-semibold tracking-wider pb-2 border-b-2 transition-colors ${
                    activeTab === "replies"
                      ? "border-[#8a2ae3] text-white"
                      : "border-transparent text-white/40 hover:text-white"
                  }`}
                >
                  Recent Replies ({profile?.recentReplies.length || 0})
                </button>
              </div>

              {profile?.handle && (
                <Link
                  href={`/admin/comments?q=${encodeURIComponent(profile.handle)}`}
                  className="text-xs font-mono uppercase text-[#8a2ae3] hover:underline flex items-center gap-1"
                >
                  Moderate all
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* List */}
            {activeTab === "comments" ? (
              <div className="space-y-3">
                {profile?.recentComments.length === 0 ? (
                  <p className="text-xs text-white/40 py-4 text-center">
                    No comments posted yet.
                  </p>
                ) : (
                  profile?.recentComments.map((item) => (
                    <div
                      key={item.id}
                      className="border border-white/5 bg-white/[0.01] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-white/80 truncate">
                          {item.articleTitle}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            item.status === "visible"
                              ? "border-emerald-500/30 text-emerald-400 text-[10px]"
                              : "border-orange-500/30 text-orange-400 text-[10px]"
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-white/70 line-clamp-2">{item.content}</p>
                      <span className="text-[10px] text-white/30 mt-1.5 block font-mono">
                        {item.createdAt?.toDate?.()?.toLocaleDateString() || "Recent"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {profile?.recentReplies.length === 0 ? (
                  <p className="text-xs text-white/40 py-4 text-center">
                    No replies posted yet.
                  </p>
                ) : (
                  profile?.recentReplies.map((item) => (
                    <div
                      key={item.id}
                      className="border border-white/5 bg-white/[0.01] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-white/80 truncate">
                          {item.articleTitle}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            item.status === "visible"
                              ? "border-emerald-500/30 text-emerald-400 text-[10px]"
                              : "border-orange-500/30 text-orange-400 text-[10px]"
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-white/70 line-clamp-2">{item.content}</p>
                      <span className="text-[10px] text-white/30 mt-1.5 block font-mono">
                        {item.createdAt?.toDate?.()?.toLocaleDateString() || "Recent"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 p-4 flex items-center justify-between text-xs text-white/40 bg-white/[0.01]">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {profile?.role
                ? profile?.joinedDate
                  ? `Team Member since ${profile.joinedDate.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}`
                  : "L.A.P Team Member"
                : profile?.joinedDate
                ? `Joined ${profile.joinedDate.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                    day: "numeric",
                  })}`
                : "Community Member"}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-white/20 text-white hover:bg-white hover:text-black text-xs"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
