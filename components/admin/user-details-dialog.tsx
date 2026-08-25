"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
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
import { httpsCallable } from "firebase/functions"
import {
  AlertCircle,
  AlertTriangle,
  AtSign,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  RotateCcw,
  Shield,
  Sparkles,
  User,
  X,
} from "lucide-react"
import { db, functions } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ReasonCombobox } from "@/components/admin/reason-combobox"

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
  status?: string
  warningCount?: number
  lastWarnedAt?: Timestamp
  lastWarningReason?: string
  suspendedUntil?: Timestamp
  suspensionReason?: string
  bannedAt?: Timestamp
  banReason?: string
  lastIp?: string
  bannedIps?: string[]
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
  const { userRole } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [profile, setProfile] = useState<UserProfileDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"comments" | "replies">("comments")

  useEffect(() => {
    setMounted(true)
  }, [])

  // Moderation action states
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState("")
  const [actionSuccess, setActionSuccess] = useState("")
  const [isModerateFormOpen, setIsModerateFormOpen] = useState(false)
  const [moderateAction, setModerateAction] = useState<"warn" | "suspend" | "ban">("warn")
  const [moderateReason, setModerateReason] = useState<string>("Harassment or disrespectful behavior")
  const [moderateCustomMessage, setModerateCustomMessage] = useState("")
  const [moderateDurationDays, setModerateDurationDays] = useState("3")
  const [moderateAdditionalIps, setModerateAdditionalIps] = useState("")

  const canExecuteBan = userRole === "super" || userRole === "admin"
  const canModerate = userRole === "super" || userRole === "admin" || userRole === "moderator"

  useEffect(() => {
    if (!isOpen || !userId) {
      setProfile(null)
      setActionError("")
      setActionSuccess("")
      setIsModerateFormOpen(false)
      return
    }

    let isMounted = true
    setLoading(true)
    setActionError("")
    setActionSuccess("")
    setIsModerateFormOpen(false)

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
          status: userData?.status,
          warningCount: userData?.warningCount || 0,
          lastWarnedAt: userData?.lastWarnedAt,
          lastWarningReason: userData?.lastWarningReason,
          suspendedUntil: userData?.suspendedUntil,
          suspensionReason: userData?.suspensionReason,
          bannedAt: userData?.bannedAt,
          banReason: userData?.banReason,
          lastIp: userData?.lastIp,
          bannedIps: userData?.bannedIps,
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

  // ---------------------------------------------------------------------------
  // Action Handlers (Reversals & Direct Enforcement)
  // ---------------------------------------------------------------------------

  const handleUnbanUser = async () => {
    if (!profile) return
    if (!canExecuteBan) {
      setActionError("Only Super Admins and Admins can lift permanent bans.")
      return
    }

    const confirmMsg = `Lift permanent ban for @${profile.handle || profile.displayName}? This will re-enable their Firebase Auth account and unblock all blacklisted IP addresses.`
    if (!window.confirm(confirmMsg)) return

    setActionBusy(true)
    setActionError("")
    setActionSuccess("")

    try {
      const fn = httpsCallable<{ targetUid: string }, { success: boolean; unblockedIpsCount?: number; nextStatus?: string }>(
        functions,
        "unbanUser"
      )
      const res = await fn({ targetUid: profile.uid })
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              status: res.data?.nextStatus || ((prev.warningCount ?? 0) > 0 ? "warning" : "active"),
              bannedAt: undefined,
              banReason: undefined,
              suspendedUntil: undefined,
              suspensionReason: undefined,
            }
          : prev
      )
      setActionSuccess(
        `Permanent ban lifted for @${profile.handle || profile.displayName}. ${res.data?.unblockedIpsCount ?? 0} IP(s) unblocked.`
      )
    } catch (err: any) {
      console.error("Error unbanning user:", err)
      setActionError(err?.message || "Failed to lift permanent ban.")
    } finally {
      setActionBusy(false)
    }
  }

  const handleUnsuspendUser = async () => {
    if (!profile) return
    if (!canModerate) {
      setActionError("You do not have permission to modify suspensions.")
      return
    }

    setActionBusy(true)
    setActionError("")
    setActionSuccess("")

    try {
      const fn = httpsCallable<{ targetUid: string }, { success: boolean; nextStatus: string }>(
        functions,
        "unsuspendUser"
      )
      const res = await fn({ targetUid: profile.uid })
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              status: res.data?.nextStatus || "active",
              suspendedUntil: undefined,
              suspensionReason: undefined,
            }
          : prev
      )
      setActionSuccess(`Commenting suspension lifted early for @${profile.handle || profile.displayName}.`)
    } catch (err: any) {
      console.error("Error lifting suspension:", err)
      setActionError(err?.message || "Failed to lift suspension.")
    } finally {
      setActionBusy(false)
    }
  }

  const handleClearWarnings = async () => {
    if (!profile) return
    if (!canModerate) {
      setActionError("You do not have permission to clear warnings.")
      return
    }

    setActionBusy(true)
    setActionError("")
    setActionSuccess("")

    try {
      const fn = httpsCallable<{ targetUid: string }, { success: boolean; clearedCount: number; nextStatus: string }>(
        functions,
        "clearUserWarnings"
      )
      const res = await fn({ targetUid: profile.uid })
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              warningCount: 0,
              status: res.data?.nextStatus || "active",
              lastWarnedAt: undefined,
              lastWarningReason: undefined,
            }
          : prev
      )
      setActionSuccess(
        `Cleared ${res.data?.clearedCount ?? 0} warning(s) for @${profile.handle || profile.displayName}. Standing is now Good.`
      )
    } catch (err: any) {
      console.error("Error clearing warnings:", err)
      setActionError(err?.message || "Failed to clear warnings.")
    } finally {
      setActionBusy(false)
    }
  }

  const handleExecuteDirectModeration = async () => {
    if (!profile) return
    const effectiveReason = moderateReason.trim()

    if (!effectiveReason) {
      setActionError("Please select or enter a valid reason for this moderation action.")
      return
    }

    setActionBusy(true)
    setActionError("")
    setActionSuccess("")

    try {
      if (moderateAction === "warn") {
        const warnFn = httpsCallable(functions, "warnUser")
        await warnFn({
          targetUid: profile.uid,
          reason: effectiveReason,
          customMessage: moderateCustomMessage,
        })
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                warningCount: (prev.warningCount || 0) + 1,
                status: prev.status === "suspended" || prev.status === "banned" ? prev.status : "warning",
              }
            : prev
        )
        setActionSuccess(`Formal warning issued to @${profile.handle || profile.displayName}.`)
        setIsModerateFormOpen(false)
      } else if (moderateAction === "suspend") {
        const suspendFn = httpsCallable(functions, "suspendUser")
        await suspendFn({
          targetUid: profile.uid,
          durationDays: parseInt(moderateDurationDays, 10) || 3,
          reason: effectiveReason,
          customMessage: moderateCustomMessage,
        })
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                status: "suspended",
                suspensionReason: effectiveReason,
              }
            : prev
        )
        setActionSuccess(
          `Suspended @${profile.handle || profile.displayName} for ${moderateDurationDays} days.`
        )
        setIsModerateFormOpen(false)
      } else if (moderateAction === "ban") {
        if (!canExecuteBan) {
          setActionError("Only Super Admins and Admins can execute permanent bans.")
          return
        }
        const additionalIpsList = moderateAdditionalIps
          .split(/[,\s\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)

        const banFn = httpsCallable(functions, "banUser")
        const result = (await banFn({
          targetUid: profile.uid,
          reason: effectiveReason,
          customMessage: moderateCustomMessage,
          additionalIps: additionalIpsList,
        })) as { data?: { bannedIpsCount?: number } }

        setProfile((prev) =>
          prev
            ? {
                ...prev,
                status: "banned",
                banReason: effectiveReason,
              }
            : prev
        )
        setActionSuccess(
          `Permanently banned @${profile.handle || profile.displayName}. Blacklisted ${result.data?.bannedIpsCount ?? 1} IP(s).`
        )
        setIsModerateFormOpen(false)
      }
    } catch (err: any) {
      console.error("Error executing moderation action:", err)
      setActionError(err?.message || "Failed to execute action.")
    } finally {
      setActionBusy(false)
    }
  }

  if (!isOpen || !userId || !mounted) return null

  const isDeleted = userId === "deleted-user"
  const roleBadge = profile?.role ? ROLE_BADGES[profile.role] : null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-details-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative z-10 flex max-h-[94vh] sm:max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden border border-white/15 bg-[#121212] text-white shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 p-4 sm:p-6 gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 items-center justify-center overflow-hidden border border-white/20 bg-white/5">
              {profile?.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName || "User avatar"}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="h-6 w-6 sm:h-8 sm:w-8 text-white/40" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2
                  id="user-details-title"
                  className="text-base sm:text-xl font-bold uppercase tracking-tight text-white truncate max-w-[180px] sm:max-w-[360px]"
                >
                  {loading ? "Loading..." : profile?.displayName}
                </h2>
                {roleBadge ? (
                  <Badge variant="outline" className={`${roleBadge.className} text-[10px] sm:text-xs py-0.5`}>
                    <Shield className="mr-1 h-3 w-3" />
                    {roleBadge.label}
                  </Badge>
                ) : isDeleted ? (
                  <Badge variant="outline" className="border-white/20 text-white/40 text-[10px] sm:text-xs">
                    Deleted
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-white/20 text-white/70 text-[10px] sm:text-xs">
                    Reader
                  </Badge>
                )}
              </div>

              {profile?.handle ? (
                <p className="font-mono text-xs sm:text-sm font-semibold text-[#8a2ae3] truncate">
                  @{profile.handle}
                </p>
              ) : (
                <p className="text-[11px] sm:text-xs italic text-white/40">No handle claimed</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close user details"
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/20 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Alert Banners */}
          {actionSuccess && (
            <div className="border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionSuccess("")}
                className="text-emerald-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {actionError && (
            <div className="border border-red-500/30 bg-red-500/10 p-3 text-red-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionError("")}
                className="text-red-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Metadata Grid: Email, Provider, UID */}
          <div className="grid grid-cols-1 gap-2.5 sm:gap-3 rounded-none border border-white/10 bg-white/[0.02] p-3 sm:p-4 text-xs sm:grid-cols-2">
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
          <div className="grid grid-cols-2 gap-3 sm:gap-4 border border-white/10 bg-white/[0.02] p-3 sm:p-4 text-center">
            <div className="border-r border-white/10">
              <span className="text-[11px] sm:text-xs uppercase tracking-widest text-white/45 block mb-1">
                Comments
              </span>
              <span className="font-mono text-xl sm:text-3xl font-bold tabular-nums text-white">
                {loading ? "..." : profile?.commentsCount ?? 0}
              </span>
            </div>
            <div>
              <span className="text-[11px] sm:text-xs uppercase tracking-widest text-white/45 block mb-1">
                Replies
              </span>
              <span className="font-mono text-xl sm:text-3xl font-bold tabular-nums text-white">
                {loading ? "..." : profile?.repliesCount ?? 0}
              </span>
            </div>
          </div>

          {/* Moderation & Trust Card */}
          <div className="border border-white/10 bg-white/[0.02] p-3 sm:p-4 text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono uppercase tracking-wider text-white/50 font-semibold flex items-center gap-1.5 text-[11px] sm:text-xs">
                <Shield className="h-3.5 w-3.5 text-[#8a2ae3]" />
                Moderation & Account Standing
              </span>
              {profile?.handle && (
                <Link
                  href={`/admin/reports?q=${encodeURIComponent(profile.handle)}`}
                  className="text-[#8a2ae3] hover:underline flex items-center gap-1 font-mono text-[11px]"
                >
                  View Reports
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              <div>
                <span className="text-white/40 block mb-0.5">Account Status</span>
                <span className="font-mono font-semibold uppercase text-xs">
                  {profile?.status === "banned" ? (
                    <span className="text-red-400">⛔ Permanently Banned</span>
                  ) : profile?.status === "suspended" ? (
                    <span className="text-orange-400">🚫 Suspended</span>
                  ) : profile?.status === "warning" || (profile?.warningCount ?? 0) > 0 ? (
                    <span className="text-amber-300">⚠️ Warned ({profile?.warningCount} warnings)</span>
                  ) : (
                    <span className="text-emerald-400">✅ Good Standing</span>
                  )}
                </span>
              </div>

              <div>
                <span className="text-white/40 block mb-0.5">Recorded IP Address</span>
                <span className="font-mono text-white/80 text-xs">
                  {profile?.lastIp || "None recorded"}
                </span>
              </div>

              {profile?.suspendedUntil && (
                <div className="sm:col-span-2 bg-orange-500/10 border border-orange-500/30 p-2.5 text-orange-200 text-xs">
                  <span className="font-semibold block">Suspended Privileges:</span>
                  <span>Until {profile.suspendedUntil.toDate?.()?.toLocaleString() || "Active suspension"}</span>
                  {profile.suspensionReason && (
                    <span className="block italic mt-0.5">&ldquo;{profile.suspensionReason}&rdquo;</span>
                  )}
                </div>
              )}

              {profile?.bannedAt && (
                <div className="sm:col-span-2 bg-red-600/10 border border-red-600/30 p-2.5 text-red-200 text-xs">
                  <span className="font-semibold block">Permanent Ban Active:</span>
                  <span>Banned on {profile.bannedAt.toDate?.()?.toLocaleString()}</span>
                  {profile.banReason && (
                    <span className="block italic mt-0.5">&ldquo;{profile.banReason}&rdquo;</span>
                  )}
                </div>
              )}
            </div>

            {/* Moderation Controls / Reversal Buttons */}
            {!profile?.role && canModerate && (
              <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
                {/* 1. Unban Button */}
                {profile?.status === "banned" && (
                  <Button
                    size="sm"
                    disabled={actionBusy || !canExecuteBan}
                    onClick={handleUnbanUser}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[11px] h-8 sm:h-7 px-2.5"
                    title={!canExecuteBan ? "Only Super Admins & Admins can unban" : "Unban user & clear blacklisted IPs"}
                  >
                    {actionBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    Unban User & Clear IPs
                  </Button>
                )}

                {/* 2. Lift Suspension Button */}
                {(profile?.status === "suspended" || profile?.suspendedUntil) && (
                  <Button
                    size="sm"
                    disabled={actionBusy}
                    onClick={handleUnsuspendUser}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[11px] h-8 sm:h-7 px-2.5"
                  >
                    {actionBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Lift Suspension
                  </Button>
                )}

                {/* 3. Clear Warnings Button */}
                {((profile?.warningCount ?? 0) > 0 || profile?.status === "warning") && (
                  <Button
                    size="sm"
                    disabled={actionBusy}
                    onClick={handleClearWarnings}
                    className="bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-500/40 font-mono text-[11px] h-8 sm:h-7 px-2.5"
                  >
                    {actionBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    Clear Warnings ({profile?.warningCount || 0})
                  </Button>
                )}

                {/* 4. Enforce / Moderate Action toggle */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsModerateFormOpen(!isModerateFormOpen)}
                  className="border-white/20 text-white hover:bg-white/10 font-mono text-[11px] h-8 sm:h-7 px-2.5 ml-auto"
                >
                  <Shield className="h-3 w-3 mr-1 text-[#8a2ae3]" />
                  {isModerateFormOpen ? "Close Panel" : "Moderate..."}
                </Button>
              </div>
            )}

            {/* Direct Moderation Panel */}
            {isModerateFormOpen && !profile?.role && canModerate && (
              <div className="mt-3 p-3 bg-black/60 border border-white/15 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-xs text-white/90">
                    Apply Action to @{profile?.handle || profile?.displayName}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setModerateAction("warn")}
                    className={`p-2.5 border text-left text-xs transition-all ${
                      moderateAction === "warn"
                        ? "border-amber-500 bg-amber-500/10 text-amber-300"
                        : "border-white/10 bg-white/[0.02] text-white/60 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      1. Issue Warning
                    </div>
                    <span className="text-[10px] text-white/40 block mt-0.5">Warning Record</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModerateAction("suspend")}
                    className={`p-2.5 border text-left text-xs transition-all ${
                      moderateAction === "suspend"
                        ? "border-orange-500 bg-orange-500/10 text-orange-300"
                        : "border-white/10 bg-white/[0.02] text-white/60 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Clock className="h-3.5 w-3.5" />
                      2. Suspend
                    </div>
                    <span className="text-[10px] text-white/40 block mt-0.5">Lock Comments</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModerateAction("ban")}
                    className={`p-2.5 border text-left text-xs transition-all ${
                      moderateAction === "ban"
                        ? "border-red-600 bg-red-600/10 text-red-300"
                        : "border-white/10 bg-white/[0.02] text-white/60 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Ban className="h-3.5 w-3.5" />
                      3. Ban & Blacklist
                    </div>
                    <span className="text-[10px] text-white/40 block mt-0.5">
                      {canExecuteBan ? "Perm Ban & IP" : "Admin Only"}
                    </span>
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  {moderateAction === "suspend" && (
                    <div>
                      <label className="font-mono text-white/60 block mb-1">Duration</label>
                      <Select value={moderateDurationDays} onValueChange={setModerateDurationDays}>
                        <SelectTrigger className="border-white/15 bg-black/60 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#181818] border-white/20 text-white">
                          <SelectItem value="1">24 Hours (1 Day)</SelectItem>
                          <SelectItem value="3">3 Days (Standard)</SelectItem>
                          <SelectItem value="7">7 Days (1 Week)</SelectItem>
                          <SelectItem value="14">14 Days (2 Weeks)</SelectItem>
                          <SelectItem value="30">30 Days (1 Month)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <label className="font-mono text-white/60 block mb-1">Reason</label>
                    <ReasonCombobox
                      value={moderateReason}
                      onChange={setModerateReason}
                      placeholder="Select preset or type custom reason..."
                    />
                  </div>

                  <div>
                    <label className="font-mono text-white/60 block mb-1">Custom Notice to Reader (Optional)</label>
                    <Textarea
                      value={moderateCustomMessage}
                      onChange={(e) => setModerateCustomMessage(e.target.value)}
                      placeholder="Optional message explaining rule breach..."
                      className="bg-black/60 border-white/15 text-xs placeholder:text-white/30"
                      rows={2}
                    />
                  </div>

                  {moderateAction === "ban" && (
                    <div>
                      <label className="font-mono text-white/60 block mb-1">Additional IP Addresses (Optional)</label>
                      <Input
                        value={moderateAdditionalIps}
                        onChange={(e) => setModerateAdditionalIps(e.target.value)}
                        placeholder="Comma or space separated IPs"
                        className="bg-black/60 border-white/15 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsModerateFormOpen(false)}
                    className="border-white/20 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={actionBusy || (moderateAction === "ban" && !canExecuteBan)}
                    onClick={handleExecuteDirectModeration}
                    className={`text-xs font-semibold ${
                      moderateAction === "warn"
                        ? "bg-amber-600 hover:bg-amber-500 text-white"
                        : moderateAction === "suspend"
                        ? "bg-orange-600 hover:bg-orange-500 text-white"
                        : "bg-red-600 hover:bg-red-500 text-white"
                    }`}
                  >
                    {actionBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Shield className="h-3.5 w-3.5 mr-1" />
                    )}
                    Confirm {moderateAction.toUpperCase()}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Bio / Staff Details if available */}
          {profile?.bio && (
            <div className="border-l-2 border-[#8a2ae3] pl-3 py-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-white/40 block mb-1">
                Bio / Biography
              </span>
              <p className="text-xs sm:text-sm font-light text-white/80 leading-relaxed">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Activity History Tabs */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-2 mb-3 sm:mb-4 gap-2">
              <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("comments")}
                  className={`text-xs uppercase font-semibold tracking-wider pb-2 border-b-2 transition-colors shrink-0 ${
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
                  className={`text-xs uppercase font-semibold tracking-wider pb-2 border-b-2 transition-colors shrink-0 ${
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
                  className="text-xs font-mono uppercase text-[#8a2ae3] hover:underline flex items-center gap-1 self-start sm:self-auto"
                >
                  Moderate all
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* List */}
            {activeTab === "comments" ? (
              <div className="space-y-2.5 sm:space-y-3">
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
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <span className="font-semibold text-white/80 truncate">
                          {item.articleTitle}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            item.status === "visible"
                              ? "border-emerald-500/30 text-emerald-400 text-[10px] shrink-0"
                              : "border-orange-500/30 text-orange-400 text-[10px] shrink-0"
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
              <div className="space-y-2.5 sm:space-y-3">
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
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <span className="font-semibold text-white/80 truncate">
                          {item.articleTitle}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            item.status === "visible"
                              ? "border-emerald-500/30 text-emerald-400 text-[10px] shrink-0"
                              : "border-orange-500/30 text-orange-400 text-[10px] shrink-0"
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
        <div className="border-t border-white/10 p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs text-white/40 bg-white/[0.01]">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
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
            className="border-white/20 text-white hover:bg-white hover:text-black text-xs w-full sm:w-auto"
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
