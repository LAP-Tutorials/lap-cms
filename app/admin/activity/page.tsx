"use client"

import { useState, useEffect, useMemo } from "react"
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import {
  History,
  Search,
  Filter,
  Download,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  FileText,
  MessageSquare,
  Users,
  AtSign,
  FolderOpen,
  User,
  KeyRound,
  Calendar,
  RefreshCw,
  Clock,
  Shield,
  Layers,
  ArrowUpDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Breadcrumb } from "@/components/breadcrumb"
import PageTitle from "@/components/PageTitle"
import type { AuditCategory, AuditLogEntry } from "@/lib/audit-logger"

const CATEGORY_ICONS: Record<AuditCategory | "all", React.ReactNode> = {
  all: <Layers className="h-4 w-4" />,
  articles: <FileText className="h-4 w-4 text-blue-400" />,
  comments: <MessageSquare className="h-4 w-4 text-purple-400" />,
  team: <Users className="h-4 w-4 text-emerald-400" />,
  handles: <AtSign className="h-4 w-4 text-amber-400" />,
  assets: <FolderOpen className="h-4 w-4 text-rose-400" />,
  profile: <User className="h-4 w-4 text-cyan-400" />,
  auth: <KeyRound className="h-4 w-4 text-indigo-400" />,
}

const CATEGORY_COLORS: Record<AuditCategory, string> = {
  articles: "bg-blue-500/10 text-blue-300 border-blue-500/25",
  comments: "bg-purple-500/10 text-purple-300 border-purple-500/25",
  team: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  handles: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  assets: "bg-rose-500/10 text-rose-300 border-rose-500/25",
  profile: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
  auth: "bg-indigo-500/10 text-indigo-300 border-indigo-500/25",
}

const ROLE_COLORS: Record<string, string> = {
  super: "bg-red-500/15 text-red-300 border-red-500/30",
  admin: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  author: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  moderator: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
}

export default function ActivityLogPage() {
  const { user, userRole, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedActor, setSelectedActor] = useState<string>("all")
  const [timeRange, setTimeRange] = useState<string>("all")
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [maxLogs, setMaxLogs] = useState(250)

  // Redirect if not super admin
  useEffect(() => {
    if (!authLoading && userRole && userRole !== "super") {
      router.replace("/admin")
    }
  }, [authLoading, userRole, router])

  // Real-time listener for audit logs
  useEffect(() => {
    if (userRole !== "super") return

    setLoading(true)
    const logsQuery = query(
      collection(db, "auditLogs"),
      orderBy("timestamp", "desc"),
      limit(maxLogs)
    )

    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => {
        const list: AuditLogEntry[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            timestamp: data.timestamp,
            actorUid: data.actorUid || "",
            actorName: data.actorName || "Unknown Staff",
            actorHandle: data.actorHandle || "",
            actorEmail: data.actorEmail || "",
            actorRole: data.actorRole || "staff",
            actorPhotoURL: data.actorPhotoURL || "",
            action: data.action || "",
            category: data.category || "articles",
            details: data.details || "",
            targetId: data.targetId || "",
            targetTitle: data.targetTitle || "",
            metadata: data.metadata || {},
          }
        })
        setLogs(list)
        setLoading(false)
      },
      (error) => {
        console.error("Error subscribing to audit logs:", error)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [userRole, maxLogs])

  // Get distinct actors for filter dropdown
  const distinctActors = useMemo(() => {
    const actorMap = new Map<string, { uid: string; name: string; handle: string; role: string }>()
    logs.forEach((log) => {
      if (log.actorUid && !actorMap.has(log.actorUid)) {
        actorMap.set(log.actorUid, {
          uid: log.actorUid,
          name: log.actorName,
          handle: log.actorHandle,
          role: log.actorRole,
        })
      }
    })
    return Array.from(actorMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [logs])

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Category filter
      if (selectedCategory !== "all" && log.category !== selectedCategory) {
        return false
      }

      // Actor filter
      if (selectedActor !== "all" && log.actorUid !== selectedActor) {
        return false
      }

      // Time range filter
      if (timeRange !== "all") {
        const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date()
        const now = new Date()
        if (timeRange === "today") {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          if (logDate < startOfToday) return false
        } else if (timeRange === "7days") {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          if (logDate < sevenDaysAgo) return false
        } else if (timeRange === "30days") {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          if (logDate < thirtyDaysAgo) return false
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim()
        const matchDetails = log.details.toLowerCase().includes(queryLower)
        const matchActorName = log.actorName.toLowerCase().includes(queryLower)
        const matchActorHandle = log.actorHandle.toLowerCase().includes(queryLower)
        const matchActorEmail = log.actorEmail.toLowerCase().includes(queryLower)
        const matchTarget = (log.targetTitle || "").toLowerCase().includes(queryLower)
        const matchAction = log.action.toLowerCase().includes(queryLower)
        return (
          matchDetails ||
          matchActorName ||
          matchActorHandle ||
          matchActorEmail ||
          matchTarget ||
          matchAction
        )
      }

      return true
    })
  }, [logs, selectedCategory, selectedActor, timeRange, searchQuery])

  // Stats
  const stats = useMemo(() => {
    const total = logs.length
    const now = new Date()
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const recent24hCount = logs.filter((log) => {
      const d = log.timestamp?.toDate ? log.timestamp.toDate() : null
      return d && d >= past24h
    }).length

    const actorActionCounts = new Map<string, { name: string; count: number }>()
    logs.forEach((log) => {
      const curr = actorActionCounts.get(log.actorUid) || { name: log.actorName, count: 0 }
      curr.count++
      actorActionCounts.set(log.actorUid, curr)
    })

    let topActor = "None"
    let topCount = 0
    actorActionCounts.forEach((val) => {
      if (val.count > topCount) {
        topCount = val.count
        topActor = val.name
      }
    })

    return {
      total,
      recent24hCount,
      topActor,
      topCount,
    }
  }, [logs])

  // Export handlers
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2))
    const downloadAnchor = document.createElement("a")
    downloadAnchor.setAttribute("href", dataStr)
    downloadAnchor.setAttribute("download", `lap-audit-logs-${new Date().toISOString().split("T")[0]}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const handleExportCSV = () => {
    const headers = ["Timestamp", "Actor Name", "Actor Handle", "Actor Role", "Actor Email", "Category", "Action", "Details", "Target Title", "Target ID"]
    const rows = filteredLogs.map((log) => [
      log.timestamp?.toDate ? log.timestamp.toDate().toISOString() : "",
      `"${(log.actorName || "").replace(/"/g, '""')}"`,
      `"${(log.actorHandle || "").replace(/"/g, '""')}"`,
      log.actorRole,
      log.actorEmail,
      log.category,
      log.action,
      `"${(log.details || "").replace(/"/g, '""')}"`,
      `"${(log.targetTitle || "").replace(/"/g, '""')}"`,
      log.targetId,
    ])

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const downloadAnchor = document.createElement("a")
    downloadAnchor.setAttribute("href", encodedUri)
    downloadAnchor.setAttribute("download", `lap-audit-logs-${new Date().toISOString().split("T")[0]}.csv`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Activity Log" },
  ]

  if (authLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48 bg-white/10" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24 bg-white/10" />
          <Skeleton className="h-24 bg-white/10" />
          <Skeleton className="h-24 bg-white/10" />
        </div>
        <Skeleton className="h-96 bg-white/10" />
      </div>
    )
  }

  if (userRole !== "super") {
    return null
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div>
        <Breadcrumb items={breadcrumbItems} />
      </div>
      <PageTitle
               className="sr-only"
               imgSrc="/images/titles/activity.svg"
               imgAlt="Dashboard"
             >
               Activity
             </PageTitle>

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6">
        

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs h-9"
          >
            <Download className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            disabled={filteredLogs.length === 0}
            className="border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs h-9"
          >
            <Download className="mr-1.5 h-3.5 w-3.5 text-blue-400" /> Export JSON
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-white/10 bg-[#141414] p-4.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Total Actions Recorded</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-white">{stats.total}</span>
            <span className="text-xs text-white/40 font-mono">Live Stream</span>
          </div>
        </div>

        <div className="border border-white/10 bg-[#141414] p-4.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Actions (Past 24 Hours)</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-[#8a2ae3]">{stats.recent24hCount}</span>
            <span className="text-xs text-emerald-400 font-medium">Active</span>
          </div>
        </div>

        <div className="border border-white/10 bg-[#141414] p-4.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Most Active Contributor</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-base font-bold text-white truncate max-w-[180px]">{stats.topActor}</span>
            <span className="text-xs text-white/40">{stats.topCount} actions</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="border border-white/10 bg-[#141414] p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actions, handles, titles..."
              className="pl-9 bg-white/5 border-white/15 text-white placeholder:text-white/35 text-xs h-9 rounded-none focus-visible:ring-[#8a2ae3]"
            />
          </div>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="bg-white/5 border-white/15 text-white text-xs h-9 rounded-none focus:ring-0">
              <div className="flex items-center gap-2 truncate">
                {CATEGORY_ICONS[selectedCategory as AuditCategory] || <Layers className="h-4 w-4" />}
                <SelectValue placeholder="All Categories" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-[#181818] border-white/15 text-white rounded-none">
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="articles">Articles</SelectItem>
              <SelectItem value="comments">Comments & Moderation</SelectItem>
              <SelectItem value="team">Team Members</SelectItem>
              <SelectItem value="handles">Handles</SelectItem>
              <SelectItem value="assets">Assets & Files</SelectItem>
              <SelectItem value="profile">Profile & Settings</SelectItem>
              <SelectItem value="auth">Authentication</SelectItem>
            </SelectContent>
          </Select>

          {/* Staff Member Filter */}
          <Select value={selectedActor} onValueChange={setSelectedActor}>
            <SelectTrigger className="bg-white/5 border-white/15 text-white text-xs h-9 rounded-none focus:ring-0">
              <div className="flex items-center gap-2 truncate">
                <Users className="h-4 w-4 text-white/50" />
                <SelectValue placeholder="All Staff Members" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-[#181818] border-white/15 text-white rounded-none">
              <SelectItem value="all">All Staff Members</SelectItem>
              {distinctActors.map((actor) => (
                <SelectItem key={actor.uid} value={actor.uid}>
                  {actor.name} (@{actor.handle}) &bull; {actor.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Time Range */}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="bg-white/5 border-white/15 text-white text-xs h-9 rounded-none focus:ring-0">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-white/50" />
                <SelectValue placeholder="Time Range" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-[#181818] border-white/15 text-white rounded-none">
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today Only</SelectItem>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active Filter summary & Reset */}
        {(searchQuery || selectedCategory !== "all" || selectedActor !== "all" || timeRange !== "all") && (
          <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
            <span className="text-white/60">
              Showing <strong className="text-white">{filteredLogs.length}</strong> of {logs.length} logged events
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("")
                setSelectedCategory("all")
                setSelectedActor("all")
                setTimeRange("all")
              }}
              className="text-[#8a2ae3] hover:text-[#a044f5] hover:bg-transparent p-0 h-auto font-medium"
            >
              Reset Filters
            </Button>
          </div>
        )}
      </div>

      {/* Activity Log Feed */}
      <div className="border border-white/10 bg-[#141414]">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Event Stream</h2>
          <span className="text-xs text-white/40 font-mono">
            {filteredLogs.length} event{filteredLogs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="divide-y divide-white/10 p-4 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 py-3 animate-pulse">
                <div className="h-10 w-10 bg-white/10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/15 w-1/3" />
                  <div className="h-3 bg-white/10 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="divide-y divide-white/10">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id
              const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : null
              const dateStr = logDate
                ? logDate.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Just now"

              const categoryBadge = CATEGORY_COLORS[log.category] || "bg-white/10 text-white/70 border-white/15"
              const roleBadge = ROLE_COLORS[log.actorRole] || "bg-white/10 text-white/70 border-white/15"
              const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0

              return (
                <div
                  key={log.id}
                  className={`p-4 transition-colors hover:bg-white/[0.02] ${
                    isExpanded ? "bg-white/[0.03]" : ""
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left: Actor info + Action summary */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {log.actorPhotoURL ? (
                        <img
                          src={log.actorPhotoURL}
                          alt="Actor Avatar"
                          className="h-10 w-10 rounded-full object-cover border border-white/15 shrink-0 mt-0.5"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg?height=40&width=40"
                          }}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 text-xs shrink-0 font-bold mt-0.5">
                          {(log.actorName || "S").slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        {/* Actor Name, Handle, Role, Category */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-white text-sm">
                            {log.actorName}
                          </span>
                          {log.actorHandle && (
                            <span className="text-xs text-white/45 font-mono">
                              @{log.actorHandle}
                            </span>
                          )}
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border ${roleBadge}`}>
                            {log.actorRole}
                          </span>
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border flex items-center gap-1 ${categoryBadge}`}>
                            {CATEGORY_ICONS[log.category]}
                            {log.category}
                          </span>
                        </div>

                        {/* Action Details */}
                        <p className="text-xs text-white/85 mt-1 leading-relaxed font-normal">
                          {log.details}
                        </p>

                        {/* Target Entity / Action Code */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-0.5 border border-white/10 rounded">
                            {log.action}
                          </span>
                          {log.targetTitle && (
                            <span className="text-xs text-white/60 truncate max-w-sm">
                              Target: <strong className="text-white/85 font-medium">{log.targetTitle}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Timestamp & Expand Toggle */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-1.5 text-xs text-white/45 font-mono">
                        <Clock className="h-3.5 w-3.5 text-white/35" />
                        <span>{dateStr}</span>
                      </div>

                      {hasMetadata && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="text-xs text-white/50 hover:text-white hover:bg-white/10 h-7 px-2"
                        >
                          {isExpanded ? (
                            <>
                              <span>Hide Details</span>
                              <ChevronDown className="ml-1 h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              <span>Inspect Payload</span>
                              <ChevronRight className="ml-1 h-3.5 w-3.5" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded JSON Payload Box */}
                  {isExpanded && hasMetadata && (
                    <div className="mt-3.5 pt-3 border-t border-white/10 pl-13">
                      <div className="bg-[#0c0c0c] border border-white/10 p-3 rounded font-mono text-xs text-white/80 overflow-x-auto">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 font-sans font-semibold">
                          Recorded Metadata & Payload
                        </p>
                        <pre className="text-[11px] text-emerald-400/90 whitespace-pre-wrap">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-16 text-center">
            <History className="h-10 w-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm font-medium text-white/70">No activity logs found</p>
            <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
              No events matched your filter criteria or no actions have been logged in the current window.
            </p>
          </div>
        )}

        {/* Load More Button */}
        {filteredLogs.length >= maxLogs && (
          <div className="p-4 border-t border-white/10 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMaxLogs((prev) => prev + 250)}
              className="border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs"
            >
              Load Older Activities (+250)
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
