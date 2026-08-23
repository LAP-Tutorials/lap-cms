"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch, type Timestamp } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import {
  ArrowUpDown,
  AtSign,
  ChevronLeft,
  ChevronRight,
  Clock,
  CornerDownRight,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  ImageIcon,
  Languages,
  Loader2,
  MessageSquare,
  Pin,
  Search,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserCheck,
  Users,
  X as CloseIcon,
  ZoomIn,
} from "lucide-react"
import { db, functions, storage } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Breadcrumb } from "@/components/breadcrumb"
import PageTitle from "@/components/PageTitle"
import { MentionTextarea } from "@/components/mention-textarea"
import { UserDetailsDialog } from "@/components/admin/user-details-dialog"
import {
  sanitizeAndCompressImage,
  uploadSanitizedCommentImage,
  uploadMultipleSanitizedImages,
  deleteCommentImageSafe,
  deleteMultipleCommentImagesSafe,
  type SanitizedImageResult,
  type CommentImageAttachment,
} from "@/lib/image-sanitizer"
import {
  SUPPORTED_LANGUAGES,
  getDefaultTargetLanguage,
  setSavedTargetLanguage,
  getAutoTranslatePreference,
  setAutoTranslatePreference,
  translateCommentText,
  getLanguageName,
  type TranslationResult,
} from "@/lib/translator"

type ModerationStatus = "visible" | "hidden"
type CommentReaction = "like" | "dislike"
type ModeratedEntry = {
  id: string
  kind: "comment" | "reply"
  parentCommentId?: string
  articleId: string
  articleSlug: string
  articleTitle: string
  authorId: string
  authorName: string
  authorHandle?: string
  authorPhotoURL?: string
  content: string
  imageUrl?: string
  imageStoragePath?: string
  imageWidth?: number
  imageHeight?: number
  images?: CommentImageAttachment[]
  status: ModerationStatus
  createdAt?: Timestamp
  edited?: boolean
  likeCount?: number
  dislikeCount?: number
  replyCount?: number
  pinned?: boolean
  pinnedAt?: Timestamp
  pinnedBy?: string
}

type ModerationThread = {
  parent: ModeratedEntry
  replies: ModeratedEntry[]
  parentIsContext: boolean
  activityAt: number
}

type TypeFilter =
  | "all"
  | "comment"
  | "reply"
  | "mentions"
  | "unreplied"
  | "readers"
  | "staff"
  | "pinned"

type SortMode =
  | "activity"
  | "newest"
  | "oldest"
  | "unreplied"
  | "most_replies"
  | "pinned"

type StaffReplyProfile = {
  displayName: string
  handle: string
  photoURL: string
}

const MAX_REPLY_LENGTH = 2000

function contentMentionsHandle(content: string, handle?: string): boolean {
  if (!content || !handle) return false
  const targetHandle = handle.toLowerCase().replace(/^@+/, "").trim()
  if (!targetHandle) return false
  const pattern = new RegExp(`(^|[^a-z0-9_.-])@${targetHandle}(?![a-z0-9_-])`, "i")
  return pattern.test(content)
}

function MentionText({ content }: { content: string }) {
  const nodes: ReactNode[] = []
  const mentionPattern = /(^|[^a-z0-9_.-])(@[a-z0-9_-]{3,20})(?![a-z0-9_-])/gi
  let cursor = 0

  for (const match of content.matchAll(mentionPattern)) {
    const matchIndex = match.index ?? 0
    const mentionIndex = matchIndex + match[1].length
    if (mentionIndex > cursor) nodes.push(content.slice(cursor, mentionIndex))
    nodes.push(<span key={`${mentionIndex}-${match[2]}`} className="font-medium text-[#8a2ae3]">{match[2]}</span>)
    cursor = mentionIndex + match[2].length
  }
  if (cursor < content.length) nodes.push(content.slice(cursor))
  return <>{nodes}</>
}

function getEntryImages(item: ModeratedEntry): CommentImageAttachment[] {
  if (Array.isArray(item.images) && item.images.length > 0) {
    return item.images
  }
  if (item.imageUrl) {
    return [
      {
        url: item.imageUrl,
        storagePath: item.imageStoragePath || "",
        width: item.imageWidth,
        height: item.imageHeight,
        alt: `${item.authorName}'s attachment`,
      },
    ]
  }
  return []
}

function ImageAttachmentPreviews({
  images,
  onRemove,
  maxCount = 4,
}: {
  images: SanitizedImageResult[]
  onRemove: (index: number) => void
  maxCount?: number
}) {
  if (images.length === 0) return null
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      {images.map((img, idx) => (
        <div
          key={`${img.fileName}-${idx}`}
          className="group relative flex items-center gap-2 border border-white/20 bg-white/[0.04] p-1.5 pr-2 text-xs font-mono"
        >
          <img
            src={img.previewUrl}
            alt={img.fileName}
            className="h-10 w-10 border border-white/15 object-cover"
          />
          <div className="min-w-0 max-w-[120px]">
            <p className="truncate text-xs text-white/90">{img.fileName}</p>
            <p className="text-[10px] text-white/40">
              {(img.sizeBytes / 1024).toFixed(0)} KB · WebP
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="ml-1 flex h-5 w-5 items-center justify-center border border-white/20 text-white/70 transition-colors hover:bg-white hover:text-black"
            title="Remove image"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </div>
      ))}
      <span className="font-mono text-[11px] text-white/40">
        {images.length}/{maxCount}
      </span>
    </div>
  )
}

function CommentImagesGrid({
  images,
  author,
  onOpenLightbox,
}: {
  images: CommentImageAttachment[]
  author: string
  onOpenLightbox: (images: CommentImageAttachment[], index: number, author: string) => void
}) {
  if (!images || images.length === 0) return null
  const count = images.length

  if (count === 1) {
    return (
      <div className="mt-3 max-w-sm overflow-hidden border border-white/15 bg-white/[0.02]">
        <button
          type="button"
          onClick={() => onOpenLightbox(images, 0, author)}
          className="group relative block w-full text-left focus:outline-none"
          title="Click to zoom image"
        >
          <img
            src={images[0].url}
            alt={images[0].alt || `${author}'s attachment`}
            loading="lazy"
            decoding="async"
            className="max-h-56 w-full object-cover transition-opacity duration-300 group-hover:opacity-90"
          />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/80 px-1.5 py-0.5 text-[10px] font-mono uppercase text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-3 w-3 text-[#8a2ae3]" /> Zoom
          </span>
        </button>
      </div>
    )
  }

  if (count === 2) {
    return (
      <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
        {images.map((img, idx) => (
          <button
            key={img.url + idx}
            type="button"
            onClick={() => onOpenLightbox(images, idx, author)}
            className="group relative block h-36 w-full overflow-hidden border border-white/15 bg-black/40 text-left focus:outline-none"
            title={`View image ${idx + 1} of 2`}
          >
            <img
              src={img.url}
              alt={img.alt || `Attachment ${idx + 1}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-black/80 px-1 py-0.5 text-[9px] font-mono uppercase text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <ZoomIn className="h-2.5 w-2.5 text-[#8a2ae3]" /> Zoom
            </span>
          </button>
        ))}
      </div>
    )
  }

  if (count === 3) {
    return (
      <div className="mt-3 grid max-w-md grid-cols-3 gap-2">
        {images.map((img, idx) => (
          <button
            key={img.url + idx}
            type="button"
            onClick={() => onOpenLightbox(images, idx, author)}
            className="group relative block h-28 w-full overflow-hidden border border-white/15 bg-black/40 text-left focus:outline-none"
            title={`View image ${idx + 1} of 3`}
          >
            <img
              src={img.url}
              alt={img.alt || `Attachment ${idx + 1}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span className="absolute bottom-1 right-1 flex items-center bg-black/80 p-0.5 text-[9px] font-mono text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <ZoomIn className="h-2.5 w-2.5 text-[#8a2ae3]" />
            </span>
          </button>
        ))}
      </div>
    )
  }

  // 4 images: 2x2 grid
  return (
    <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
      {images.map((img, idx) => (
        <button
          key={img.url + idx}
          type="button"
          onClick={() => onOpenLightbox(images, idx, author)}
          className="group relative block h-28 w-full overflow-hidden border border-white/15 bg-black/40 text-left focus:outline-none"
          title={`View image ${idx + 1} of 4`}
        >
          <img
            src={img.url}
            alt={img.alt || `Attachment ${idx + 1}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute bottom-1 right-1 flex items-center bg-black/80 p-0.5 text-[9px] font-mono text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-2.5 w-2.5 text-[#8a2ae3]" />
          </span>
        </button>
      ))}
    </div>
  )
}

function ModerationRow({
  entry,
  busyId,
  compact = false,
  contextOnly = false,
  canDelete = true,
  canPin = false,
  reaction,
  reactionBusyId,
  translation,
  isTranslating = false,
  targetLangName,
  onTranslate,
  onReact,
  onStatusChange,
  onDelete,
  onTogglePin,
  onViewUser,
  onOpenLightbox,
}: {
  entry: ModeratedEntry
  busyId: string | null
  compact?: boolean
  contextOnly?: boolean
  canDelete?: boolean
  canPin?: boolean
  reaction?: CommentReaction
  reactionBusyId: string | null
  translation?: {
    translatedText: string
    sourceLang: string
    sourceLangName: string
    isSameLanguage: boolean
    isUnrecognizedLanguage?: boolean
    showingOriginal?: boolean
  }
  isTranslating?: boolean
  targetLangName?: string
  onTranslate?: (id: string, text: string) => void
  onReact?: (commentId: string, reaction: CommentReaction) => void
  onStatusChange: (entry: ModeratedEntry, status: ModerationStatus) => void
  onDelete: (entry: ModeratedEntry) => void
  onTogglePin?: (entry: ModeratedEntry) => void
  onViewUser?: (userId: string, initialData?: { name?: string; handle?: string; photoURL?: string }) => void
  onOpenLightbox?: (images: CommentImageAttachment[], index: number, author: string) => void
}) {
  const createdAt = entry.createdAt?.toDate()
  const isBusy = busyId === `${entry.kind}:${entry.id}`
  const isDeletedAuthor = entry.authorId === "deleted-user"
  const statusLabel = entry.status === "visible" ? "Visible" : "Hidden"
  const images = getEntryImages(entry)
  const authorDisplay = entry.authorHandle || entry.authorName

  return (
    <div className={`group grid items-start gap-3 ${compact ? "grid-cols-[2rem_minmax(0,1fr)] py-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto]" : "grid-cols-[2.5rem_minmax(0,1fr)] py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"}`}>
      <button
        type="button"
        onClick={() => onViewUser?.(entry.authorId, { name: entry.authorName, handle: entry.authorHandle, photoURL: entry.authorPhotoURL })}
        disabled={isDeletedAuthor}
        className={`flex items-center justify-center overflow-hidden bg-white/[0.07] font-semibold uppercase text-white/55 transition-all ${
          isDeletedAuthor ? "cursor-default" : "cursor-pointer hover:ring-2 hover:ring-[#8a2ae3] hover:scale-105"
        } ${compact ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`}
        title={isDeletedAuthor ? "Deleted user" : `View ${entry.authorName}'s details`}
      >
        {isDeletedAuthor || entry.authorPhotoURL ? (
          <img
            src={isDeletedAuthor ? "/logos/LAP-Logo-Color.png" : entry.authorPhotoURL}
            alt={isDeletedAuthor ? "Deleted user profile picture" : `${entry.authorName}'s profile picture`}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : entry.authorName.charAt(0)}
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {isDeletedAuthor ? (
            <span className={`${compact ? "text-sm" : "text-[15px]"} font-semibold text-white/55`}>
              Deleted user
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onViewUser?.(entry.authorId, { name: entry.authorName, handle: entry.authorHandle, photoURL: entry.authorPhotoURL })}
              className={`cursor-pointer text-left ${compact ? "text-sm" : "text-[15px]"} font-semibold text-white hover:text-[#8a2ae3] transition-colors focus:outline-none`}
              title={`View ${entry.authorName}'s details`}
            >
              @{entry.authorHandle || entry.authorName}
            </button>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] text-white/35">
            {entry.kind === "reply" ? <CornerDownRight className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
            {contextOnly ? "Parent comment" : entry.kind === "reply" ? "Reply" : "Comment"}
          </span>
          {entry.pinned && (
            <span className="inline-flex items-center gap-1 bg-[#8a2ae3]/20 text-[#c084fc] border border-[#8a2ae3]/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-sm">
              <Pin className="h-3 w-3 fill-current" /> Pinned
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${entry.status === "visible" ? "text-emerald-300" : "text-amber-300"}`}>
            <span className={`h-1.5 w-1.5 ${entry.status === "visible" ? "bg-emerald-300" : "bg-amber-300"}`} aria-hidden="true" />
            {statusLabel}
          </span>
          <time className="text-[11px] tabular-nums text-white/30">
            {createdAt ? createdAt.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pending timestamp"}
            {entry.edited ? " · edited" : ""}
          </time>
        </div>

        {entry.content?.trim() ? (
          <div>
            <p className={`mt-2 max-w-3xl whitespace-pre-wrap break-words text-white/80 ${compact ? "text-sm leading-6" : "text-[15px] leading-7"}`}>
              <MentionText
                content={
                  translation && !translation.showingOriginal
                    ? translation.translatedText
                    : entry.content
                }
              />
            </p>

            {/* Translation status for staff */}
            <div className="mt-1 flex items-center gap-2 font-mono text-[11px]">
              {isTranslating ? (
                <span className="inline-flex items-center gap-1 text-white/40">
                  <Loader2 className="h-2.5 w-2.5 animate-spin text-[#8a2ae3]" /> Translating…
                </span>
              ) : translation?.isSameLanguage ? (
                null
              ) : translation?.isUnrecognizedLanguage ? (
                <div className="inline-flex flex-wrap items-center gap-1.5 text-amber-300/85">
                  <span>⚠️ Could not identify language · Needs review</span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => onTranslate?.(entry.id, entry.content)}
                    className="underline hover:text-amber-200"
                  >
                    Retry
                  </button>
                </div>
              ) : translation ? (
                <div className="inline-flex flex-wrap items-center gap-1.5 text-white/50">
                  <span>
                    Translated from <strong className="text-[#8a2ae3]">{translation.sourceLangName}</strong>
                  </span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => onTranslate?.(entry.id, entry.content)}
                    className="underline hover:text-white"
                  >
                    {translation.showingOriginal ? "Show translation" : "Show original"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onTranslate?.(entry.id, entry.content)}
                  className="inline-flex items-center gap-1 text-white/35 transition-colors hover:text-[#8a2ae3]"
                  title={`Translate to ${targetLangName || "target language"}`}
                >
                  <Languages className="h-3 w-3" />
                  <span>Translate</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* Multi-Image Grid */}
        <CommentImagesGrid
          images={images}
          author={authorDisplay}
          onOpenLightbox={(imgs, idx, author) => onOpenLightbox?.(imgs, idx, author)}
        />

        {entry.kind === "comment" ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-white/40">
            <span className="max-w-xl truncate">{entry.articleTitle || entry.articleId}</span>
            <span className="h-3 w-px bg-white/15" aria-hidden="true" />
            {onReact ? (
              <>
                <button
                  type="button"
                  onClick={() => onReact(entry.id, "like")}
                  disabled={reactionBusyId === entry.id || entry.status !== "visible"}
                  aria-pressed={reaction === "like"}
                  aria-label={`Like comment. ${entry.likeCount || 0} likes`}
                  className={`inline-flex items-center gap-1.5 tabular-nums transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${reaction === "like" ? "text-[#8a2ae3]" : ""}`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> {entry.likeCount || 0}
                </button>
                <button
                  type="button"
                  onClick={() => onReact(entry.id, "dislike")}
                  disabled={reactionBusyId === entry.id || entry.status !== "visible"}
                  aria-pressed={reaction === "dislike"}
                  aria-label={`Dislike comment. ${entry.dislikeCount || 0} dislikes`}
                  className={`inline-flex items-center gap-1.5 tabular-nums transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${reaction === "dislike" ? "text-[#8a2ae3]" : ""}`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" /> {entry.dislikeCount || 0}
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 tabular-nums" title="Likes"><ThumbsUp className="h-3.5 w-3.5" /> {entry.likeCount || 0}</span>
                <span className="inline-flex items-center gap-1.5 tabular-nums" title="Dislikes"><ThumbsDown className="h-3.5 w-3.5" /> {entry.dislikeCount || 0}</span>
              </>
            )}
            <span className="inline-flex items-center gap-1.5 tabular-nums" title="Replies"><CornerDownRight className="h-3.5 w-3.5" /> {entry.replyCount || 0}</span>
            {entry.articleSlug ? <Link href={`https://lap.onl/posts/${entry.articleSlug}#comments`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/60 transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a2ae3]">Open post <ExternalLink className="h-3 w-3" /></Link> : null}
          </div>
        ) : null}
      </div>
      <div className="col-start-2 row-start-2 flex items-start justify-end gap-1 sm:col-start-3 sm:row-start-1">
        {canPin && entry.kind === "comment" && onTogglePin && (
          <Button
            variant="ghost"
            size="icon"
            disabled={isBusy}
            title={entry.pinned ? "Unpin comment" : "Pin comment to top of article"}
            aria-label={entry.pinned ? "Unpin comment" : "Pin comment"}
            onClick={() => onTogglePin(entry)}
            className={`h-8 w-8 transition-colors duration-200 ${
              entry.pinned
                ? "text-[#8a2ae3] bg-[#8a2ae3]/10 hover:bg-[#8a2ae3]/20"
                : "text-white/40 hover:bg-white/[0.07] hover:text-white"
            } focus-visible:ring-[#8a2ae3]`}
          >
            <Pin className={`h-4 w-4 ${entry.pinned ? "fill-current" : ""}`} />
          </Button>
        )}
        <Button variant="ghost" size="icon" disabled={isBusy} title={entry.status === "visible" ? "Hide" : "Restore"} aria-label={entry.status === "visible" ? `Hide ${entry.kind}` : `Restore ${entry.kind}`} onClick={() => onStatusChange(entry, entry.status === "visible" ? "hidden" : "visible")} className="h-8 w-8 text-white/40 transition-colors duration-200 hover:bg-white/[0.07] hover:text-white focus-visible:ring-[#8a2ae3]">
          {entry.status === "visible" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        {canDelete && (
          <Button variant="ghost" size="icon" disabled={isBusy} title="Delete permanently" aria-label={`Delete ${entry.kind}`} onClick={() => onDelete(entry)} className="h-8 w-8 text-white/30 transition-colors duration-200 hover:bg-red-400/10 hover:text-red-300 focus-visible:ring-red-300"><Trash2 className="h-4 w-4" /></Button>
        )}
      </div>
    </div>
  )
}

export default function CommentsModerationPage() {
  const { user, userRole } = useAuth()
  const [comments, setComments] = useState<ModeratedEntry[]>([])
  const [replies, setReplies] = useState<ModeratedEntry[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | ModerationStatus>("all")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [sortMode, setSortMode] = useState<SortMode>("activity")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reactionBusyId, setReactionBusyId] = useState<string | null>(null)
  const [reactions, setReactions] = useState<Record<string, CommentReaction>>({})
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState("")
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyProfile, setReplyProfile] = useState<StaffReplyProfile | null>(null)
  const [replyProfileLoaded, setReplyProfileLoaded] = useState(false)

  // Multi-image state
  const [replyImages, setReplyImages] = useState<SanitizedImageResult[]>([])
  const [replyImageProcessing, setReplyImageProcessing] = useState(false)
  const [replyImageError, setReplyImageError] = useState<string | null>(null)

  // Gallery Lightbox Modal state
  const [lightboxGallery, setLightboxGallery] = useState<{
    images: CommentImageAttachment[]
    currentIndex: number
    author: string
  } | null>(null)

  // Translation state for CMS
  const [targetLang, setTargetLang] = useState<string>(() => getDefaultTargetLanguage())
  const [autoTranslate, setAutoTranslate] = useState<boolean>(() => getAutoTranslatePreference())
  const [translations, setTranslations] = useState<
    Record<
      string,
      {
        translatedText: string
        sourceLang: string
        sourceLangName: string
        isSameLanguage: boolean
        isUnrecognizedLanguage?: boolean
        showingOriginal?: boolean
      }
    >
  >({})
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())

  const replyFileInputRef = useRef<HTMLInputElement>(null)

  const [selectedUserDetailsId, setSelectedUserDetailsId] = useState<string | null>(null)
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false)
  const [userDetailsInitial, setUserDetailsInitial] = useState<
    { name?: string; handle?: string; photoURL?: string } | undefined
  >()

  const openUserDetails = (
    userId: string,
    initial?: { name?: string; handle?: string; photoURL?: string },
  ) => {
    if (!userId || userId === "deleted-user") return
    setSelectedUserDetailsId(userId)
    setUserDetailsInitial(initial)
    setIsUserDetailsOpen(true)
  }

  const handleSelectReplyImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const maxAllowed = 4 - replyImages.length
    if (maxAllowed <= 0) {
      setReplyImageError("You can attach up to 4 images per reply.")
      if (e.target) e.target.value = ""
      return
    }
    const toProcess = files.slice(0, maxAllowed)
    setReplyImageProcessing(true)
    setReplyImageError(null)
    try {
      const sanitizedList = await Promise.all(
        toProcess.map((f) => sanitizeAndCompressImage(f))
      )
      setReplyImages((prev) => [...prev, ...sanitizedList])
    } catch (err: any) {
      setReplyImageError(err?.message || "Could not process image.")
    } finally {
      setReplyImageProcessing(false)
      if (e.target) e.target.value = ""
    }
  }

  const handleTargetLangChange = (newLang: string) => {
    setTargetLang(newLang)
    setSavedTargetLanguage(newLang)
    setTranslations({})
  }

  const handleToggleAutoTranslate = () => {
    const next = !autoTranslate
    setAutoTranslate(next)
    setAutoTranslatePreference(next)
    if (!next) {
      setTranslations({})
    }
  }

  const toggleTranslation = async (id: string, text: string) => {
    const existing = translations[id]
    if (existing) {
      setTranslations((prev) => ({
        ...prev,
        [id]: {
          ...existing,
          showingOriginal: !existing.showingOriginal,
        },
      }))
      return
    }

    if (translatingIds.has(id)) return
    setTranslatingIds((prev) => new Set(prev).add(id))
    try {
      const res = await translateCommentText(text, targetLang)
      setTranslations((prev) => ({
        ...prev,
        [id]: {
          translatedText: res.translatedText,
          sourceLang: res.detectedSourceLang,
          sourceLangName: res.sourceLangName,
          isSameLanguage: res.isSameLanguage,
          isUnrecognizedLanguage: res.isUnrecognizedLanguage,
          showingOriginal: false,
        },
      }))
    } finally {
      setTranslatingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Language detection & translation pipeline in CMS
  useEffect(() => {
    const all = [...comments, ...replies]
    const toCheck = all.filter(
      (entry) => entry.content?.trim() && !translations[entry.id] && !translatingIds.has(entry.id)
    )
    if (toCheck.length === 0) return

    void Promise.all(
      toCheck.slice(0, 15).map(async (entry) => {
        try {
          const res = await translateCommentText(entry.content, targetLang)
          setTranslations((prev) => ({
            ...prev,
            [entry.id]: {
              translatedText: res.translatedText,
              sourceLang: res.detectedSourceLang,
              sourceLangName: res.sourceLangName,
              isSameLanguage: res.isSameLanguage,
              isUnrecognizedLanguage: res.isUnrecognizedLanguage,
              showingOriginal: !autoTranslate,
            },
          }))
        } catch {}
      })
    )
  }, [autoTranslate, targetLang, comments, replies])

  useEffect(() => {
    if (!user) {
      setReplyProfile(null)
      setReplyProfileLoaded(true)
      return
    }

    let cancelled = false
    const loadReplyProfile = async () => {
      try {
        const authorSnapshot = await getDoc(doc(db, "authors", user.uid))
        const authorData = authorSnapshot.data()
        const authorHandle = typeof authorData?.handle === "string" ? authorData.handle : ""
        const authorName = typeof authorData?.name === "string" ? authorData.name : (user.displayName || "Staff")
        const authorPhoto = typeof authorData?.avatar === "string" ? authorData.avatar : (user.photoURL || "")

        if (authorHandle && !cancelled) {
          setReplyProfile({
            displayName: authorName,
            handle: authorHandle,
            photoURL: authorPhoto,
          })
        }

        let userSnapshot = await getDoc(doc(db, "users", user.uid))
        const current = userSnapshot.data()

        if ((!userSnapshot.exists() || !current?.handle || !current?.displayName) && authorHandle) {
          const syncProfile = httpsCallable<{ handle: string }, { handle: string }>(functions, "claimTeamHandle")
          await syncProfile({ handle: authorHandle })
          userSnapshot = await getDoc(doc(db, "users", user.uid))
        }

        const data = userSnapshot.data()
        if (!cancelled && userSnapshot.exists() && typeof data?.displayName === "string" && typeof data?.handle === "string" && data.handle) {
          setReplyProfile({
            displayName: data.displayName,
            handle: data.handle,
            photoURL: typeof data.photoURL === "string" ? data.photoURL : authorPhoto,
          })
        }
      } catch (profileError) {
        console.error("Unable to prepare the CMS comment profile:", profileError)
      } finally {
        if (!cancelled) setReplyProfileLoaded(true)
      }
    }

    void loadReplyProfile()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!user) {
      setReactions({})
      return
    }

    return onSnapshot(
      collection(db, "commentReactions", user.uid, "items"),
      (snapshot) => {
        const next: Record<string, CommentReaction> = {}
        snapshot.docs.forEach((reactionDoc) => {
          const type = reactionDoc.data().type
          if (type === "like" || type === "dislike") next[reactionDoc.id] = type
        })
        setReactions(next)
      },
      (reactionError) => {
        console.error("Unable to load staff comment reactions:", reactionError)
      },
    )
  }, [user])

  useEffect(() => {
    const stopComments = onSnapshot(
      query(collection(db, "comments"), orderBy("createdAt", "desc"), limit(250)),
      (snapshot) => {
        setComments(snapshot.docs.map((entry) => ({ id: entry.id, kind: "comment" as const, ...entry.data() })) as ModeratedEntry[])
        setCommentsLoaded(true)
      },
      (snapshotError) => {
        console.error("Unable to load comments:", snapshotError)
        setError("The moderation feed could not load. Check the deployed Firestore rules.")
        setCommentsLoaded(true)
      },
    )
    const stopReplies = onSnapshot(
      query(collection(db, "commentReplies"), orderBy("createdAt", "desc"), limit(250)),
      (snapshot) => {
        setReplies(snapshot.docs.map((entry) => ({ id: entry.id, kind: "reply" as const, ...entry.data() })) as ModeratedEntry[])
        setRepliesLoaded(true)
      },
      (snapshotError) => {
        console.error("Unable to load replies:", snapshotError)
        setError("Replies could not load. Check the deployed Firestore rules.")
        setRepliesLoaded(true)
      },
    )
    return () => { stopComments(); stopReplies() }
  }, [])

  const allEntries = useMemo(() => [...comments, ...replies], [comments, replies])

  const [staffUids, setStaffUids] = useState<Set<string>>(new Set())

  useEffect(() => {
    return onSnapshot(collection(db, "authors"), (snapshot) => {
      setStaffUids(new Set(snapshot.docs.map((doc) => doc.id)))
    })
  }, [])

  const filteredThreads = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    const userHandle = replyProfile?.handle?.toLowerCase()

    const matches = (entry: ModeratedEntry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false
      if (!needle) return true
      return [entry.authorName, entry.authorHandle, entry.articleTitle, entry.content]
        .join(" ").toLowerCase().includes(needle)
    }

    const repliesByParent = new Map<string, ModeratedEntry[]>()
    replies.forEach((reply) => {
      if (!reply.parentCommentId) return
      const current = repliesByParent.get(reply.parentCommentId) || []
      current.push(reply)
      repliesByParent.set(reply.parentCommentId, current)
    })

    return comments.flatMap<ModerationThread>((parent) => {
      const allReplies = (repliesByParent.get(parent.id) || []).sort(
        (left, right) => {
          const leftIsStaff = staffUids.has(left.authorId)
          const rightIsStaff = staffUids.has(right.authorId)
          if (leftIsStaff && !rightIsStaff) return -1
          if (!leftIsStaff && rightIsStaff) return 1
          return (left.createdAt?.toMillis() || 0) - (right.createdAt?.toMillis() || 0)
        },
      )
      const matchingReplies = allReplies.filter(matches)
      const parentMatches = matches(parent)
      let shownReplies: ModeratedEntry[] = []
      let include = false

      if (typeFilter === "comment") {
        include = parentMatches
      } else if (typeFilter === "reply") {
        include = matchingReplies.length > 0
        shownReplies = matchingReplies
      } else if (typeFilter === "unreplied") {
        include = parentMatches && allReplies.length === 0
        shownReplies = []
      } else if (typeFilter === "readers") {
        include = parentMatches && !staffUids.has(parent.authorId)
        shownReplies = matchingReplies
      } else if (typeFilter === "staff") {
        include = parentMatches && staffUids.has(parent.authorId)
        shownReplies = matchingReplies
      } else if (typeFilter === "pinned") {
        include = Boolean(parent.pinned) && (parentMatches || matchingReplies.length > 0)
        shownReplies = matchingReplies
      } else if (typeFilter === "mentions") {
        const parentMentionsMe = parentMatches && contentMentionsHandle(parent.content, userHandle)
        const repliesMentioningMe = matchingReplies.filter((reply) =>
          contentMentionsHandle(reply.content, userHandle)
        )
        if (parentMentionsMe || repliesMentioningMe.length > 0) {
          include = true
          shownReplies = matchingReplies
        }
      } else {
        include = parentMatches || matchingReplies.length > 0
        shownReplies = matchingReplies
      }

      if (!include) return []
      const activityAt = Math.max(
        parent.createdAt?.toMillis() || 0,
        ...allReplies.map((reply) => reply.createdAt?.toMillis() || 0),
      )
      const parentIsContext = typeFilter === "mentions"
        ? !contentMentionsHandle(parent.content, userHandle)
        : !parentMatches

      return [{ parent, replies: shownReplies, parentIsContext, activityAt }]
    }).sort((left, right) => {
      if (sortMode === "newest") {
        return (right.parent.createdAt?.toMillis() || 0) - (left.parent.createdAt?.toMillis() || 0)
      }
      if (sortMode === "oldest") {
        return (left.parent.createdAt?.toMillis() || 0) - (right.parent.createdAt?.toMillis() || 0)
      }
      if (sortMode === "most_replies") {
        return (right.replies.length || 0) - (left.replies.length || 0)
      }
      if (sortMode === "unreplied") {
        const leftUnreplied = left.replies.length === 0 ? 1 : 0
        const rightUnreplied = right.replies.length === 0 ? 1 : 0
        if (leftUnreplied !== rightUnreplied) return rightUnreplied - leftUnreplied
        return right.activityAt - left.activityAt
      }
      if (sortMode === "pinned") {
        if (left.parent.pinned && !right.parent.pinned) return -1
        if (!left.parent.pinned && right.parent.pinned) return 1
        return right.activityAt - left.activityAt
      }
      // Default: "activity" (Recent Activity: any new reply or comment bumps the thread to the top!)
      return right.activityAt - left.activityAt
    })
  }, [comments, replies, searchTerm, statusFilter, typeFilter, sortMode, replyProfile?.handle, staffUids])

  const mentionsCount = useMemo(() => {
    const userHandle = replyProfile?.handle?.toLowerCase()
    if (!userHandle) return 0
    return allEntries.filter((entry) => contentMentionsHandle(entry.content, userHandle)).length
  }, [allEntries, replyProfile?.handle])

  const unrepliedCount = useMemo(
    () => comments.filter((c) => (c.replyCount || 0) === 0).length,
    [comments],
  )

  const pinnedCount = useMemo(
    () => comments.filter((c) => Boolean(c.pinned)).length,
    [comments],
  )

  const readerCount = useMemo(
    () => comments.filter((c) => !staffUids.has(c.authorId)).length,
    [comments, staffUids],
  )

  const shownEntryCount = filteredThreads.reduce((total, thread) => total + 1 + thread.replies.length, 0)
  const hiddenCount = allEntries.filter((entry) => entry.status === "hidden").length
  const totalLikes = comments.reduce((total, comment) => total + (comment.likeCount || 0), 0)
  const totalDislikes = comments.reduce((total, comment) => total + (comment.dislikeCount || 0), 0)
  const loading = !commentsLoaded || !repliesLoaded

  const setEntryStatus = async (entry: ModeratedEntry, status: ModerationStatus) => {
    if (!user) return
    setBusyId(`${entry.kind}:${entry.id}`)
    setError("")
    try {
      await updateDoc(doc(db, entry.kind === "comment" ? "comments" : "commentReplies", entry.id), {
        status,
        moderatedAt: serverTimestamp(),
        moderatedBy: user.uid,
      })
    } catch (updateError) {
      console.error("Unable to moderate entry:", updateError)
      setError("The moderation change could not be saved.")
    } finally { setBusyId(null) }
  }

  const removeEntry = async (entry: ModeratedEntry) => {
    if (userRole === "moderator" && entry.authorId !== user?.uid) {
      setError("Moderators can only hide or restore comments, not delete them.")
      return
    }
    const noun = entry.kind === "comment" ? "comment and its replies" : "reply"
    if (!window.confirm(`Delete this ${noun} permanently?`)) return
    setBusyId(`${entry.kind}:${entry.id}`)
    setError("")
    try {
      // Clean up images
      if (entry.images && entry.images.length > 0) {
        void deleteMultipleCommentImagesSafe(storage, entry.images)
      } else if (entry.imageStoragePath) {
        void deleteCommentImageSafe(storage, entry.imageStoragePath)
      }

      if (entry.kind === "comment") {
        const batch = writeBatch(db)
        batch.delete(doc(db, "comments", entry.id))
        const repliesSnap = await getDocs(
          query(collection(db, "commentReplies"), where("parentCommentId", "==", entry.id))
        )
        repliesSnap.forEach((r) => {
          const rData = r.data()
          if (rData?.images && Array.isArray(rData.images)) {
            void deleteMultipleCommentImagesSafe(storage, rData.images)
          } else if (rData?.imageStoragePath) {
            void deleteCommentImageSafe(storage, rData.imageStoragePath)
          }
          batch.delete(r.ref)
        })
        await batch.commit()
      } else {
        await deleteDoc(doc(db, "commentReplies", entry.id))
      }
    } catch (deleteError) {
      console.error("Unable to delete entry:", deleteError)
      setError(`The ${entry.kind} could not be deleted.`)
    } finally { setBusyId(null) }
  }

  const reactToComment = async (commentId: string, reaction: CommentReaction) => {
    if (!user || reactionBusyId) return
    setReactionBusyId(commentId)
    setError("")
    try {
      const react = httpsCallable<
        { commentId: string; reaction: CommentReaction },
        { commentId: string; reaction: CommentReaction | null; likeCount: number; dislikeCount: number }
      >(functions, "reactToComment")
      const result = await react({ commentId, reaction })

      setReactions((current) => {
        const next = { ...current }
        if (result.data.reaction) next[commentId] = result.data.reaction
        else delete next[commentId]
        return next
      })
      setComments((current) => current.map((comment) => (
        comment.id === commentId
          ? { ...comment, likeCount: result.data.likeCount, dislikeCount: result.data.dislikeCount }
          : comment
      )))
    } catch (reactionError) {
      console.error("Unable to react to comment from the CMS:", reactionError)
      setError("Your reaction could not be saved.")
    } finally {
      setReactionBusyId(null)
    }
  }

  const togglePinEntry = async (entry: ModeratedEntry) => {
    if (entry.kind !== "comment" || (userRole !== "admin" && userRole !== "super")) return
    const newPinned = !entry.pinned
    const actionKey = `${entry.kind}:${entry.id}`
    setBusyId(actionKey)
    setError("")

    try {
      try {
        const togglePin = httpsCallable<{ commentId: string; pinned: boolean }>(
          functions,
          "togglePinComment"
        )
        await togglePin({ commentId: entry.id, pinned: newPinned })
      } catch (fnErr) {
        // Fallback to direct Firestore update
        const batch = writeBatch(db)
        if (newPinned) {
          comments.forEach((c) => {
            if (c.articleId === entry.articleId && c.pinned && c.id !== entry.id) {
              batch.update(doc(db, "comments", c.id), {
                pinned: false,
                pinnedAt: null,
                pinnedBy: null,
              })
            }
          })
          batch.update(doc(db, "comments", entry.id), {
            pinned: true,
            pinnedAt: serverTimestamp(),
            pinnedBy: user?.uid || "",
          })
        } else {
          batch.update(doc(db, "comments", entry.id), {
            pinned: false,
            pinnedAt: null,
            pinnedBy: null,
          })
        }
        await batch.commit()
      }

      setComments((current) =>
        current.map((c) => {
          if (c.id === entry.id) return { ...c, pinned: newPinned }
          if (newPinned && c.articleId === entry.articleId && c.pinned) {
            return { ...c, pinned: false }
          }
          return c
        })
      )
    } catch (err: any) {
      console.error("Error toggling pinned status:", err)
      setError(err?.message || "Failed to update pinned comment.")
    } finally {
      setBusyId(null)
    }
  }

  const submitStaffReply = async (parent: ModeratedEntry) => {
    const content = replyContent.trim()
    if (!user || (!content && replyImages.length === 0) || replyBusy) return
    if (!replyProfile) {
      setError("Set your CMS handle in Profile before replying.")
      return
    }
    if (parent.status !== "visible") {
      setError("Restore this comment before replying to it.")
      return
    }

    setReplyBusy(true)
    setError("")
    try {
      let uploadedImages: CommentImageAttachment[] = []
      if (replyImages.length > 0) {
        uploadedImages = await uploadMultipleSanitizedImages(storage, user.uid, replyImages)
      }

      const replyData: Record<string, any> = {
        parentCommentId: parent.id,
        articleId: parent.articleId,
        articleSlug: parent.articleSlug,
        articleTitle: parent.articleTitle,
        authorId: user.uid,
        authorName: replyProfile.displayName,
        authorHandle: replyProfile.handle,
        authorPhotoURL: replyProfile.photoURL,
        content,
        status: "visible",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        edited: false,
      }

      if (uploadedImages.length > 0) {
        replyData.images = uploadedImages
        replyData.imageUrl = uploadedImages[0].url
        replyData.imageStoragePath = uploadedImages[0].storagePath
        if (uploadedImages[0].width) replyData.imageWidth = uploadedImages[0].width
        if (uploadedImages[0].height) replyData.imageHeight = uploadedImages[0].height
      }

      await addDoc(collection(db, "commentReplies"), replyData)
      setReplyContent("")
      setReplyImages([])
      setReplyImageError(null)
      setReplyingToId(null)
    } catch (replyError) {
      console.error("Unable to post staff reply:", replyError)
      setError("The reply could not be posted. Check your profile handle and the deployed Firestore rules.")
    } finally {
      setReplyBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-[76rem] w-full min-w-0 text-white">
      <div className="mb-2">
        <Breadcrumb items={[{ label: "Dashboard", href: "/admin" }, { label: "Comments" }]} />
      </div>

      <div className="flex justify-between items-center mb-6">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/comments.svg"
          imgAlt="Comments"
        >
          Comments
        </PageTitle>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-white/15 py-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-7">
        {[
          { label: "Comments", value: comments.length, icon: MessageSquare },
          { label: "Replies", value: replies.length, icon: CornerDownRight },
          { label: "Unreplied", value: unrepliedCount, icon: HelpCircle },
          { label: "Pinned", value: pinnedCount, icon: Pin },
          { label: "Mentions", value: mentionsCount, icon: AtSign },
          { label: "Hidden", value: hiddenCount, icon: EyeOff },
          { label: "Likes", value: totalLikes, icon: ThumbsUp },
          { label: "Dislikes", value: totalDislikes, icon: ThumbsDown },
        ].map(({ label, value, icon: StatIcon }) => (
          <div key={label} className="flex items-center gap-2.5">
            <StatIcon className="h-3.5 w-3.5 text-white/30" aria-hidden="true" />
            <dd className="font-mono text-sm font-semibold tabular-nums text-white/85">{value}</dd>
            <dt className="text-xs text-white/40">{label}</dt>
          </div>
        ))}
      </dl>

      <section className="sticky top-0 z-20 border-b border-white/15 bg-[#121212]/95 py-3 backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by text, @handle, author, or article..."
              className="h-10 border-white/15 bg-white/[0.025] pl-10 text-sm placeholder:text-white/30 focus-visible:ring-[#8a2ae3]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Translation Settings for Staff */}
            <div className="flex items-center gap-2 border border-white/15 bg-black/60 px-2 py-1 text-xs font-mono">
              <div className="flex items-center gap-1 text-white/70">
                <Globe className="h-3.5 w-3.5 text-[#8a2ae3] shrink-0" />
                <Select value={targetLang} onValueChange={handleTargetLangChange}>
                  <SelectTrigger className="h-7 border-0 bg-transparent px-1.5 py-0 text-xs font-mono text-white focus:ring-0 focus:ring-offset-0 gap-1.5 hover:text-[#8a2ae3] min-w-[110px]">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 border border-white/20 bg-[#161616] text-white shadow-2xl z-50">
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <SelectItem
                        key={l.code}
                        value={l.code}
                        className="text-xs font-mono focus:bg-[#8a2ae3] focus:text-white cursor-pointer"
                      >
                        <span className="font-medium">{l.name}</span>
                        {l.nativeName && l.nativeName !== l.name ? (
                          <span className="ml-1.5 text-white/40 text-[10px]">({l.nativeName})</span>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-white/20">|</span>
              <label
                htmlFor="auto-translate-cms"
                className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-mono text-white/60 hover:text-white"
              >
                <Checkbox
                  id="auto-translate-cms"
                  checked={autoTranslate}
                  onCheckedChange={() => handleToggleAutoTranslate()}
                  className="h-3.5 w-3.5 rounded-none border border-white/30 data-[state=checked]:bg-[#8a2ae3] data-[state=checked]:border-[#8a2ae3] data-[state=checked]:text-white"
                />
                <span>Auto-translate</span>
              </label>
            </div>

            {/* Type Filters */}
            <div className="flex flex-wrap gap-1 bg-white/[0.025] p-1 border border-white/10" aria-label="Entry type">
              {(
                [
                  ["all", "All"],
                  ["comment", "Comments"],
                  ["reply", "Replies"],
                  ["unreplied", `Unreplied (${unrepliedCount})`],
                  ["readers", "Readers"],
                  ["staff", "Staff"],
                  ["pinned", `Pinned (${pinnedCount})`],
                  ["mentions", `Mentions (${mentionsCount})`],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`px-2.5 py-1 text-xs font-mono uppercase tracking-wider transition-colors duration-150 ${
                    typeFilter === type
                      ? "!bg-[#8a2ae3] !text-white font-semibold"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Visibility Filter */}
            <div className="flex bg-white/[0.025] p-1 border border-white/10" aria-label="Visibility">
              {(["all", "visible", "hidden"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 text-xs font-mono uppercase tracking-wider transition-colors duration-150 ${
                    statusFilter === status
                      ? "bg-white/15 text-white font-semibold"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {status === "all" ? "Any" : status}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <Select value={sortMode} onValueChange={(val) => setSortMode(val as SortMode)}>
              <SelectTrigger className="h-9 border border-white/15 bg-black px-3 py-1.5 text-xs font-mono uppercase text-white hover:border-[#8a2ae3] focus:ring-0 focus:ring-offset-0 gap-2 min-w-[170px]">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-[#8a2ae3] shrink-0" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="border border-white/20 bg-[#161616] text-white shadow-2xl z-50">
                <SelectItem value="activity" className="text-xs font-mono uppercase focus:bg-[#8a2ae3] focus:text-white cursor-pointer">
                  ⚡ Recent Activity
                </SelectItem>
                <SelectItem value="newest" className="text-xs font-mono uppercase focus:bg-[#8a2ae3] focus:text-white cursor-pointer">
                  🆕 Newest Comments
                </SelectItem>
                <SelectItem value="oldest" className="text-xs font-mono uppercase focus:bg-[#8a2ae3] focus:text-white cursor-pointer">
                  ⏳ Oldest Comments
                </SelectItem>
                <SelectItem value="unreplied" className="text-xs font-mono uppercase focus:bg-[#8a2ae3] focus:text-white cursor-pointer">
                  ❓ Unreplied First
                </SelectItem>
                <SelectItem value="pinned" className="text-xs font-mono uppercase focus:bg-[#8a2ae3] focus:text-white cursor-pointer">
                  📌 Pinned on Top
                </SelectItem>
                <SelectItem value="most_replies" className="text-xs font-mono uppercase focus:bg-[#8a2ae3] focus:text-white cursor-pointer">
                  💬 Most Replies
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
      <p className="text-xs tabular-nums text-white/35 pt-2">
        Showing <span className="font-medium text-white/65">{shownEntryCount}</span> of {allEntries.length}
      </p>

      {error ? <p role="alert" className="mt-4 border-l-2 border-red-300 bg-red-300/[0.06] px-4 py-3 text-sm text-red-200">{error}</p> : null}
      {loading ? (
        <div className="space-y-3 py-5" aria-label="Loading moderation queue">
          {[0, 1, 2].map((item) => <div key={item} className="flex animate-pulse gap-4 border border-white/10 px-5 py-6"><div className="h-10 w-10 bg-white/10" /><div className="flex-1 space-y-3"><div className="h-3 w-40 bg-white/10" /><div className="h-4 max-w-xl bg-white/[0.07]" /></div></div>)}
        </div>
      ) : null}
      {!loading && filteredThreads.length === 0 ? (
        <div className="border-b border-white/15 py-20 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-white/20" />
          <p className="mt-4 font-medium">
            {typeFilter === "mentions"
              ? replyProfile?.handle
                ? `No mentions found for @${replyProfile.handle}`
                : "Set your profile handle to view mentions"
              : "No comments found"}
          </p>
          <p className="mt-1 text-sm text-white/40">
            {typeFilter === "mentions" ? (
              replyProfile?.handle ? (
                "You haven't been tagged in any comments or replies matching your search/filters."
              ) : (
                <Link href="/admin/profile" className="text-[#8a2ae3] underline hover:text-white">
                  Go to Profile Settings to configure your handle
                </Link>
              )
            ) : (
              "Try another search or filter."
            )}
          </p>
        </div>
      ) : null}

      <section className="space-y-4 py-5 pb-16" aria-label="Moderation results">
        {filteredThreads.map((thread) => (
          <article key={thread.parent.id} className="border border-white/10 bg-white/[0.012] px-4 transition-colors duration-200 hover:border-white/15 sm:px-5">
            <ModerationRow
              entry={thread.parent}
              busyId={busyId}
              contextOnly={thread.parentIsContext}
              canDelete={userRole !== "moderator" || (Boolean(user?.uid) && thread.parent.authorId === user?.uid)}
              canPin={userRole === "admin" || userRole === "super"}
              reaction={reactions[thread.parent.id]}
              reactionBusyId={reactionBusyId}
              translation={translations[thread.parent.id]}
              isTranslating={translatingIds.has(thread.parent.id)}
              targetLangName={getLanguageName(targetLang)}
              onTranslate={toggleTranslation}
              onReact={reactToComment}
              onStatusChange={setEntryStatus}
              onDelete={removeEntry}
              onTogglePin={togglePinEntry}
              onViewUser={openUserDetails}
              onOpenLightbox={(imgs, idx, author) =>
                setLightboxGallery({ images: imgs, currentIndex: idx, author })
              }
            />
            {thread.parent.status === "visible" ? (
              <div className="-mt-1 mb-5 sm:ml-14">
                {replyingToId === thread.parent.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      void submitStaffReply(thread.parent)
                    }}
                    className="max-w-3xl border-l-2 border-[#8a2ae3] pl-4"
                  >
                    <label htmlFor={`cms-reply-${thread.parent.id}`} className="sr-only">Reply to @{thread.parent.authorHandle || thread.parent.authorName}</label>
                    <MentionTextarea
                      id={`cms-reply-${thread.parent.id}`}
                      value={replyContent}
                      onChange={setReplyContent}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault()
                          if (!replyBusy && (replyContent.trim() || replyImages.length > 0)) {
                            void submitStaffReply(thread.parent)
                          }
                        }
                      }}
                      maxLength={MAX_REPLY_LENGTH}
                      rows={2}
                      autoFocus
                      placeholder={`Reply as @${replyProfile?.handle || "staff"} or attach images…`}
                      className="w-full resize-y border-0 border-b border-white/25 bg-transparent px-0 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[#8a2ae3] focus:ring-0"
                    />

                    {/* Hidden file input for staff reply */}
                    <input
                      type="file"
                      multiple
                      ref={replyFileInputRef}
                      onChange={handleSelectReplyImages}
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.avif"
                      className="hidden"
                    />

                    {/* Image Previews */}
                    <ImageAttachmentPreviews
                      images={replyImages}
                      onRemove={(idx) =>
                        setReplyImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                      maxCount={4}
                    />

                    {replyImageProcessing ? (
                      <div className="mt-2 flex items-center gap-2 text-xs font-mono text-[#8a2ae3]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Optimizing & converting images…</span>
                      </div>
                    ) : null}

                    {replyImageError ? (
                      <p className="mt-2 text-xs font-mono text-red-300">{replyImageError}</p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => replyFileInputRef.current?.click()}
                          disabled={replyBusy || replyImageProcessing || replyImages.length >= 4}
                          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-white/50 transition-colors hover:text-white disabled:opacity-40"
                          title="Attach up to 4 images (JPEG, PNG, WebP, GIF, HEIC, AVIF)"
                        >
                          <ImageIcon className="h-3.5 w-3.5 text-[#8a2ae3]" />
                          <span>
                            {replyImages.length === 0
                              ? "Attach images"
                              : replyImages.length < 4
                              ? `Add image (${replyImages.length}/4)`
                              : "Max 4 images"}
                          </span>
                        </button>

                        <span className="font-mono text-[10px] tabular-nums text-white/30">{replyContent.length}/{MAX_REPLY_LENGTH}</span>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-semibold uppercase">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingToId(null)
                            setReplyContent("")
                            setReplyImages([])
                            setReplyImageError(null)
                          }}
                          className="text-white/45 transition-colors hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={replyBusy || replyImageProcessing || (!replyContent.trim() && replyImages.length === 0)}
                          className="inline-flex items-center gap-2 text-[#8a2ae3] transition-colors hover:text-white disabled:opacity-35"
                        >
                          <Send className="h-3.5 w-3.5" /> {replyBusy ? "Posting…" : "Post reply"}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : replyProfile ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToId(thread.parent.id)
                      setReplyContent("")
                      setReplyImages([])
                      setReplyImageError(null)
                    }}
                    className="inline-flex items-center gap-2 text-xs font-medium text-white/45 transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a2ae3]"
                  >
                    <CornerDownRight className="h-3.5 w-3.5" /> Reply as @{replyProfile.handle}
                  </button>
                ) : replyProfileLoaded ? (
                  <Link href="/admin/profile" className="border-b border-amber-300/40 pb-1 text-xs font-medium text-amber-200 transition-colors hover:border-amber-200">Set your profile handle to reply</Link>
                ) : null}
              </div>
            ) : null}
            {thread.replies.length > 0 ? (
              <div className="mb-5 border-l-2 border-[#8a2ae3]/35 bg-black/10 px-3 sm:ml-12 sm:px-5">
                <p className="border-b border-white/10 py-3 text-xs font-medium text-white/40">
                  {thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}
                </p>
                <div className="divide-y divide-white/10">
                  {thread.replies.map((reply) => (
                    <ModerationRow
                      key={reply.id}
                      entry={reply}
                      busyId={busyId}
                      compact
                      canDelete={userRole !== "moderator" || (Boolean(user?.uid) && reply.authorId === user?.uid)}
                      reactionBusyId={reactionBusyId}
                      translation={translations[reply.id]}
                      isTranslating={translatingIds.has(reply.id)}
                      targetLangName={getLanguageName(targetLang)}
                      onTranslate={toggleTranslation}
                      onStatusChange={setEntryStatus}
                      onDelete={removeEntry}
                      onViewUser={openUserDetails}
                      onOpenLightbox={(imgs, idx, author) =>
                        setLightboxGallery({ images: imgs, currentIndex: idx, author })
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <UserDetailsDialog
        userId={selectedUserDetailsId}
        isOpen={isUserDetailsOpen}
        initialData={userDetailsInitial}
        onClose={() => setIsUserDetailsOpen(false)}
      />

      {/* Gallery Lightbox Dialog */}
      {lightboxGallery && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6"
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightboxGallery(null)
            if (e.key === "ArrowLeft" && lightboxGallery.images.length > 1) {
              setLightboxGallery((prev) =>
                prev
                  ? {
                      ...prev,
                      currentIndex:
                        prev.currentIndex > 0
                          ? prev.currentIndex - 1
                          : prev.images.length - 1,
                    }
                  : null
              )
            }
            if (e.key === "ArrowRight" && lightboxGallery.images.length > 1) {
              setLightboxGallery((prev) =>
                prev
                  ? {
                      ...prev,
                      currentIndex:
                        prev.currentIndex < prev.images.length - 1
                          ? prev.currentIndex + 1
                          : 0,
                    }
                  : null
              )
            }
          }}
          tabIndex={-1}
        >
          <div
            className="fixed inset-0 bg-black/90 backdrop-blur-md transition-opacity"
            onClick={() => setLightboxGallery(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex max-h-[90vh] max-w-5xl w-full flex-col border border-white/20 bg-[#121212] p-4 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-white/50">Attachment by</span>
                  <span className="font-mono text-xs font-semibold text-[#8a2ae3]">
                    @{lightboxGallery.author}
                  </span>
                </div>
                {lightboxGallery.images.length > 1 ? (
                  <span className="border border-white/20 bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-white/70">
                    {lightboxGallery.currentIndex + 1} of {lightboxGallery.images.length}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setLightboxGallery(null)}
                className="flex h-7 w-7 items-center justify-center border border-white/20 text-white/70 transition-colors hover:bg-white hover:text-black"
                aria-label="Close image preview"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-auto py-2">
              {lightboxGallery.images.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxGallery((prev) =>
                      prev
                        ? {
                            ...prev,
                            currentIndex:
                              prev.currentIndex > 0
                                ? prev.currentIndex - 1
                                : prev.images.length - 1,
                          }
                        : null
                    )
                  }
                  className="absolute left-2 z-20 flex h-9 w-9 items-center justify-center border border-white/20 bg-black/70 text-white transition-colors hover:bg-white hover:text-black"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}

              <img
                src={lightboxGallery.images[lightboxGallery.currentIndex]?.url}
                alt={lightboxGallery.images[lightboxGallery.currentIndex]?.alt || "Attachment"}
                className="max-h-[72vh] w-auto max-w-full object-contain border border-white/10"
              />

              {lightboxGallery.images.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxGallery((prev) =>
                      prev
                        ? {
                            ...prev,
                            currentIndex:
                              prev.currentIndex < prev.images.length - 1
                                ? prev.currentIndex + 1
                                : 0,
                          }
                        : null
                    )
                  }
                  className="absolute right-2 z-20 flex h-9 w-9 items-center justify-center border border-white/20 bg-black/70 text-white transition-colors hover:bg-white hover:text-black"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
