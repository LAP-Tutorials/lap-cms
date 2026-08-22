"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, type Timestamp } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { CornerDownRight, ExternalLink, Eye, EyeOff, MessageSquare, Search, Send, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react"
import { db, functions } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Breadcrumb } from "@/components/breadcrumb"
import { MentionTextarea } from "@/components/mention-textarea"

type ModerationStatus = "visible" | "hidden"
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

function MentionText({ content }: { content: string }) {
  const nodes: ReactNode[] = []
  const mentionPattern = /(^|[^a-z0-9_.-])(@[a-z0-9_]{3,20})\b/gi
  let cursor = 0

  for (const match of content.matchAll(mentionPattern)) {
    const matchIndex = match.index ?? 0
    const mentionIndex = matchIndex + match[1].length
    if (mentionIndex > cursor) nodes.push(content.slice(cursor, mentionIndex))
    nodes.push(<span key={`${mentionIndex}-${match[2]}`} className="font-medium text-[#c084fc]">{match[2]}</span>)
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
  onStatusChange,
  onDelete,
}: {
  entry: ModeratedEntry
  busyId: string | null
  compact?: boolean
  contextOnly?: boolean
  onStatusChange: (entry: ModeratedEntry, status: ModerationStatus) => void
  onDelete: (entry: ModeratedEntry) => void
}) {
  const createdAt = entry.createdAt?.toDate()
  const isBusy = busyId === `${entry.kind}:${entry.id}`

  return (
    <div className={`grid gap-3 ${compact ? "py-4 sm:grid-cols-[2rem_minmax(0,1fr)] xl:grid-cols-[2rem_minmax(0,1fr)_auto]" : "py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] xl:grid-cols-[2.5rem_minmax(0,1fr)_auto]"}`}>
      <div className={`flex items-center justify-center overflow-hidden bg-white/[0.07] font-semibold uppercase text-white/55 ${compact ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`}>
        {entry.authorPhotoURL ? <img src={entry.authorPhotoURL} alt={`${entry.authorName}'s profile picture`} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : entry.authorName.charAt(0)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">@{entry.authorHandle || entry.authorName}</span>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-white/35">
            {entry.kind === "reply" ? <CornerDownRight className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
            {contextOnly ? "parent context" : entry.kind}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${entry.status === "visible" ? "text-emerald-300" : "text-amber-300"}`}>{entry.status}</span>
          <time className="font-mono text-[10px] text-white/30">{createdAt ? createdAt.toLocaleString() : "Pending timestamp"}{entry.edited ? " · edited" : ""}</time>
        </div>
        <p className={`mt-2 max-w-4xl whitespace-pre-wrap break-words leading-6 text-white/75 ${compact ? "text-[13px]" : "text-sm"}`}><MentionText content={entry.content} /></p>
        {entry.kind === "comment" ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/35">
            <span>{entry.articleTitle || entry.articleId}</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums"><ThumbsUp className="h-3 w-3" /> {entry.likeCount || 0}</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums"><ThumbsDown className="h-3 w-3" /> {entry.dislikeCount || 0}</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums"><CornerDownRight className="h-3 w-3" /> {entry.replyCount || 0}</span>
            {entry.articleSlug ? <Link href={`https://lap.onl/posts/${entry.articleSlug}#comments`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/60 transition-colors hover:text-white">Open post <ExternalLink className="h-3 w-3" /></Link> : null}
          </div>
        ) : null}
      </div>
      <div className="col-start-2 flex items-start gap-2 xl:col-start-3">
        <Button variant="ghost" size="icon" disabled={isBusy} title={entry.status === "visible" ? "Hide" : "Restore"} aria-label={entry.status === "visible" ? `Hide ${entry.kind}` : `Restore ${entry.kind}`} onClick={() => onStatusChange(entry, entry.status === "visible" ? "hidden" : "visible")} className="border border-white/10 text-white/55 hover:text-white">
          {entry.status === "visible" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" disabled={isBusy} title="Delete permanently" aria-label={`Delete ${entry.kind}`} onClick={() => onDelete(entry)} className="border border-white/10 text-white/40 hover:text-red-300"><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

export default function CommentsModerationPage() {
  const { user } = useAuth()
  const [comments, setComments] = useState<ModeratedEntry[]>([])
  const [replies, setReplies] = useState<ModeratedEntry[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | ModerationStatus>("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "comment" | "reply">("all")
  const [busyId, setBusyId] = useState<string | null>(null)
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
        const authorHandle = typeof authorSnapshot.data()?.handle === "string" ? authorSnapshot.data()?.handle : ""
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
            photoURL: typeof data.photoURL === "string" ? data.photoURL : "",
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
      } else {
        include = parentMatches || matchingReplies.length > 0
        shownReplies = matchingReplies
      }

      if (!include) return []
      const activityAt = Math.max(
        parent.createdAt?.toMillis() || 0,
        ...allReplies.map((reply) => reply.createdAt?.toMillis() || 0),
      )
      return [{ parent, replies: shownReplies, parentIsContext: !parentMatches, activityAt }]
    }).sort((left, right) => right.activityAt - left.activityAt)
  }, [comments, replies, searchTerm, statusFilter, typeFilter])

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
    const noun = entry.kind === "comment" ? "comment and its replies" : "reply"
    if (!window.confirm(`Delete this ${noun} permanently?`)) return
    setBusyId(`${entry.kind}:${entry.id}`)
    setError("")
    try {
      await deleteDoc(doc(db, entry.kind === "comment" ? "comments" : "commentReplies", entry.id))
    } catch (deleteError) {
      console.error("Unable to delete entry:", deleteError)
      setError(`The ${entry.kind} could not be deleted.`)
    } finally { setBusyId(null) }
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
    <main className="mx-auto min-h-screen max-w-[88rem] text-white">
      <Breadcrumb items={[{ label: "Dashboard", href: "/admin" }, { label: "Comments" }]} />

      <header className="mt-7 flex flex-col gap-4 border-b border-white/15 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#b782df]">Community moderation</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Discussion queue</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
            Review comments and replies in one feed. Hide abuse, restore good discussion, or remove it permanently.
          </p>
        </div>
        <p className="font-mono text-xs uppercase tracking-wider text-white/35">
          {shownEntryCount} shown / {allEntries.length} loaded
        </p>
      </header>

      <dl className="grid grid-cols-2 border-b border-white/15 lg:grid-cols-5">
        {[["Comments", comments.length], ["Replies", replies.length], ["Hidden", hiddenCount], ["Likes", totalLikes], ["Dislikes", totalDislikes]].map(([label, value], index) => (
          <div key={label} className={`px-4 py-4 ${index < 4 ? "border-r border-white/10" : ""}`}>
            <dt className="text-xs text-white/40">{label}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="sticky top-0 z-20 border-b border-white/15 bg-[#121212]/95 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search handle, article, or text" className="border-white/20 bg-transparent pl-10" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex border border-white/15" aria-label="Entry type">
              {(["all", "comment", "reply"] as const).map((type) => (
                <button key={type} type="button" onClick={() => setTypeFilter(type)} className={`px-3 py-2 text-xs font-medium capitalize transition-colors active:translate-y-px ${typeFilter === type ? "!bg-white !text-black" : "text-white/55 hover:bg-white/5 hover:text-white"}`}>
                  {type === "all" ? "All types" : `${type}s`}
                </button>
              ))}
            </div>
            <div className="flex border border-white/15" aria-label="Visibility">
              {(["all", "visible", "hidden"] as const).map((status) => (
                <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`px-3 py-2 text-xs font-medium capitalize transition-colors active:translate-y-px ${statusFilter === status ? "bg-[#9b5fc7] text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}>
                  {status === "all" ? "Any status" : status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error ? <p role="alert" className="border-b border-red-400/30 py-4 text-sm text-red-200">{error}</p> : null}
      {loading ? (
        <div className="divide-y divide-white/10" aria-label="Loading moderation queue">
          {[0, 1, 2, 3].map((item) => <div key={item} className="flex animate-pulse gap-4 py-6"><div className="h-10 w-10 bg-white/10" /><div className="flex-1 space-y-3"><div className="h-3 w-40 bg-white/10" /><div className="h-4 max-w-xl bg-white/[0.07]" /></div></div>)}
        </div>
      ) : null}
      {!loading && filteredThreads.length === 0 ? (
        <div className="border-b border-white/15 py-20 text-center"><MessageSquare className="mx-auto h-8 w-8 text-white/20" /><p className="mt-4 font-medium">Nothing matches this view.</p><p className="mt-1 text-sm text-white/40">Try a different search or filter.</p></div>
      ) : null}

      <section className="divide-y divide-white/15 pb-16" aria-label="Moderation results">
        {filteredThreads.map((thread) => (
          <article key={thread.parent.id} className="transition-colors hover:bg-white/[0.012]">
            <ModerationRow
              entry={thread.parent}
              busyId={busyId}
              contextOnly={thread.parentIsContext}
              onStatusChange={setEntryStatus}
              onDelete={removeEntry}
            />
            {thread.parent.status === "visible" ? (
              <div className="-mt-1 mb-4 ml-5 sm:ml-14">
                {replyingToId === thread.parent.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      void submitStaffReply(thread.parent)
                    }}
                    className="max-w-3xl border-l border-[#9b5fc7] pl-4"
                  >
                    <label htmlFor={`cms-reply-${thread.parent.id}`} className="sr-only">Reply to @{thread.parent.authorHandle || thread.parent.authorName}</label>
                    <MentionTextarea
                      id={`cms-reply-${thread.parent.id}`}
                      value={replyContent}
                      onChange={setReplyContent}
                      maxLength={MAX_REPLY_LENGTH}
                      rows={2}
                      autoFocus
                      placeholder={`Reply as @${replyProfile?.handle || "staff"}…`}
                      className="w-full resize-y border-0 border-b border-white/25 bg-transparent px-0 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[#9b5fc7] focus:ring-0"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-[10px] tabular-nums text-white/30">{replyContent.length}/{MAX_REPLY_LENGTH}</span>
                      <div className="flex items-center gap-4 text-xs font-semibold uppercase">
                        <button type="button" onClick={() => { setReplyingToId(null); setReplyContent("") }} className="text-white/45 transition-colors hover:text-white">Cancel</button>
                        <button type="submit" disabled={replyBusy || !replyContent.trim()} className="inline-flex items-center gap-2 text-[#c084fc] transition-colors hover:text-white disabled:opacity-35">
                          <Send className="h-3.5 w-3.5" /> {replyBusy ? "Posting…" : "Post reply"}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : replyProfile ? (
                  <button
                    type="button"
                    onClick={() => { setReplyingToId(thread.parent.id); setReplyContent("") }}
                    className="inline-flex items-center gap-2 border-b border-transparent pb-1 text-xs font-semibold uppercase text-white/45 transition-colors hover:border-[#9b5fc7] hover:text-white"
                  >
                    <CornerDownRight className="h-3.5 w-3.5" /> Reply as @{replyProfile.handle}
                  </button>
                ) : replyProfileLoaded ? (
                  <Link href="/admin/profile" className="border-b border-amber-300/40 pb-1 text-xs font-medium text-amber-200 transition-colors hover:border-amber-200">Set your profile handle to reply</Link>
                ) : null}
              </div>
            ) : null}
            {thread.replies.length > 0 ? (
              <div className="mb-5 ml-5 border-l border-[#9b5fc7]/40 pl-4 sm:ml-14 sm:pl-5">
                <p className="border-b border-white/10 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                  {thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}
                </p>
                <div className="divide-y divide-white/10">
                  {thread.replies.map((reply) => (
                    <ModerationRow
                      key={reply.id}
                      entry={reply}
                      busyId={busyId}
                      compact
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
    </main>
  )
}
