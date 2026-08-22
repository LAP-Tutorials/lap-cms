"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch, type Timestamp } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { AtSign, CornerDownRight, ExternalLink, Eye, EyeOff, MessageSquare, Search, Send, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react"
import { db, functions } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Breadcrumb } from "@/components/breadcrumb"
import PageTitle from "@/components/PageTitle"
import { MentionTextarea } from "@/components/mention-textarea"

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
  status: ModerationStatus
  createdAt?: Timestamp
  edited?: boolean
  likeCount?: number
  dislikeCount?: number
  replyCount?: number
}

type ModerationThread = {
  parent: ModeratedEntry
  replies: ModeratedEntry[]
  parentIsContext: boolean
  activityAt: number
}

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

function ModerationRow({
  entry,
  busyId,
  compact = false,
  contextOnly = false,
  canDelete = true,
  reaction,
  reactionBusyId,
  onReact,
  onStatusChange,
  onDelete,
}: {
  entry: ModeratedEntry
  busyId: string | null
  compact?: boolean
  contextOnly?: boolean
  canDelete?: boolean
  reaction?: CommentReaction
  reactionBusyId: string | null
  onReact?: (commentId: string, reaction: CommentReaction) => void
  onStatusChange: (entry: ModeratedEntry, status: ModerationStatus) => void
  onDelete: (entry: ModeratedEntry) => void
}) {
  const createdAt = entry.createdAt?.toDate()
  const isBusy = busyId === `${entry.kind}:${entry.id}`
  const isDeletedAuthor = entry.authorId === "deleted-user"
  const statusLabel = entry.status === "visible" ? "Visible" : "Hidden"

  return (
    <div className={`group grid items-start gap-3 ${compact ? "grid-cols-[2rem_minmax(0,1fr)] py-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto]" : "grid-cols-[2.5rem_minmax(0,1fr)] py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"}`}>
      <div className={`flex items-center justify-center overflow-hidden bg-white/[0.07] font-semibold uppercase text-white/55 ${compact ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`}>
        {isDeletedAuthor || entry.authorPhotoURL ? (
          <img
            src={isDeletedAuthor ? "/logos/LAP-Logo-Color.png" : entry.authorPhotoURL}
            alt={isDeletedAuthor ? "Deleted user profile picture" : `${entry.authorName}'s profile picture`}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : entry.authorName.charAt(0)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className={`${compact ? "text-sm" : "text-[15px]"} font-semibold ${isDeletedAuthor ? "text-white/55" : "text-white"}`}>
            {isDeletedAuthor ? "Deleted user" : `@${entry.authorHandle || entry.authorName}`}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-white/35">
            {entry.kind === "reply" ? <CornerDownRight className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
            {contextOnly ? "Parent comment" : entry.kind === "reply" ? "Reply" : "Comment"}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${entry.status === "visible" ? "text-emerald-300" : "text-amber-300"}`}>
            <span className={`h-1.5 w-1.5 ${entry.status === "visible" ? "bg-emerald-300" : "bg-amber-300"}`} aria-hidden="true" />
            {statusLabel}
          </span>
          <time className="text-[11px] tabular-nums text-white/30">
            {createdAt ? createdAt.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pending timestamp"}
            {entry.edited ? " · edited" : ""}
          </time>
        </div>
        <p className={`mt-2 max-w-3xl whitespace-pre-wrap break-words text-white/80 ${compact ? "text-sm leading-6" : "text-[15px] leading-7"}`}><MentionText content={entry.content} /></p>
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

type TypeFilter = "all" | "comment" | "reply" | "mentions"

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
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reactionBusyId, setReactionBusyId] = useState<string | null>(null)
  const [reactions, setReactions] = useState<Record<string, CommentReaction>>({})
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState("")
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyProfile, setReplyProfile] = useState<StaffReplyProfile | null>(null)
  const [replyProfileLoaded, setReplyProfileLoaded] = useState(false)

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
        (left, right) => (left.createdAt?.toMillis() || 0) - (right.createdAt?.toMillis() || 0),
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
    }).sort((left, right) => right.activityAt - left.activityAt)
  }, [comments, replies, searchTerm, statusFilter, typeFilter, replyProfile?.handle])

  const mentionsCount = useMemo(() => {
    const userHandle = replyProfile?.handle?.toLowerCase()
    if (!userHandle) return 0
    return allEntries.filter((entry) => contentMentionsHandle(entry.content, userHandle)).length
  }, [allEntries, replyProfile?.handle])

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
      if (entry.kind === "comment") {
        const batch = writeBatch(db)
        batch.delete(doc(db, "comments", entry.id))
        const repliesSnap = await getDocs(
          query(collection(db, "commentReplies"), where("parentCommentId", "==", entry.id))
        )
        repliesSnap.forEach((r) => batch.delete(r.ref))
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

  const submitStaffReply = async (parent: ModeratedEntry) => {
    const content = replyContent.trim()
    if (!user || !content || replyBusy) return
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
      await addDoc(collection(db, "commentReplies"), {
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
      })
      setReplyContent("")
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
          <div className="relative w-full xl:max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search comments" className="h-10 border-white/15 bg-white/[0.025] pl-10 text-sm placeholder:text-white/30 focus-visible:ring-[#8a2ae3]" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex w-full overflow-x-auto bg-white/[0.025] p-0.5 sm:w-auto" aria-label="Entry type">
              {(["all", "comment", "reply", "mentions"] as const).map((type) => (
                <button key={type} type="button" onClick={() => setTypeFilter(type)} className={`min-w-0 flex-1 shrink-0 px-3 py-2 text-xs font-medium capitalize transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a2ae3] active:translate-y-px sm:flex-none ${typeFilter === type ? "!bg-[#8a2ae3] !text-white" : "text-white/50 hover:bg-white/5 hover:text-white"}`}>
                  {type === "all" ? "All" : type === "reply" ? "Replies" : type === "mentions" ? "Mentions" : "Comments"}
                </button>
              ))}
            </div>
            <div className="flex w-full overflow-x-auto bg-white/[0.025] p-0.5 sm:w-auto" aria-label="Visibility">
              {(["all", "visible", "hidden"] as const).map((status) => (
                <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`min-w-0 flex-1 shrink-0 px-3 py-2 text-xs font-medium capitalize transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a2ae3] active:translate-y-px sm:flex-none ${statusFilter === status ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white"}`}>
                  {status === "all" ? "Any" : status}
                </button>
              ))}
            </div>
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
              reaction={reactions[thread.parent.id]}
              reactionBusyId={reactionBusyId}
              onReact={reactToComment}
              onStatusChange={setEntryStatus}
              onDelete={removeEntry}
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
                          if (!replyBusy && replyContent.trim()) {
                            void submitStaffReply(thread.parent)
                          }
                        }
                      }}
                      maxLength={MAX_REPLY_LENGTH}
                      rows={2}
                      autoFocus
                      placeholder={`Reply as @${replyProfile?.handle || "staff"}…`}
                      className="w-full resize-y border-0 border-b border-white/25 bg-transparent px-0 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[#8a2ae3] focus:ring-0"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-[10px] tabular-nums text-white/30">{replyContent.length}/{MAX_REPLY_LENGTH}</span>
                      <div className="flex items-center gap-4 text-xs font-semibold uppercase">
                        <button type="button" onClick={() => { setReplyingToId(null); setReplyContent("") }} className="text-white/45 transition-colors hover:text-white">Cancel</button>
                        <button type="submit" disabled={replyBusy || !replyContent.trim()} className="inline-flex items-center gap-2 text-[#8a2ae3] transition-colors hover:text-white disabled:opacity-35">
                          <Send className="h-3.5 w-3.5" /> {replyBusy ? "Posting…" : "Post reply"}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : replyProfile ? (
                  <button
                    type="button"
                    onClick={() => { setReplyingToId(thread.parent.id); setReplyContent("") }}
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
                      onStatusChange={setEntryStatus}
                      onDelete={removeEntry}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  )
}
