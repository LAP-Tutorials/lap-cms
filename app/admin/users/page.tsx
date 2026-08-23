"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore"
import {
  AtSign,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Eye,
  Mail,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
  Users,
  UserX,
} from "lucide-react"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Breadcrumb } from "@/components/breadcrumb"
import PageTitle from "@/components/PageTitle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { UserDetailsDialog } from "@/components/admin/user-details-dialog"

interface UserRecord {
  id: string
  uid?: string
  displayName?: string
  handle?: string
  email?: string
  photoURL?: string
  provider?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  [key: string]: unknown
}

interface AuthorRecord {
  id: string
  name?: string
  handle?: string
  email?: string
  role?: "super" | "admin" | "author" | "moderator"
  avatar?: string
  createdAt?: Timestamp
  created_at?: Timestamp
  [key: string]: unknown
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

type ProviderFilter = "all" | "google.com" | "password" | "staff"
type SortOrder = "newest" | "oldest" | "name"

export default function AdminUsersPage() {
  const searchParams = useSearchParams()
  const initialUserId = searchParams.get("id")
  const initialQuery = searchParams.get("q") || ""

  const { user, userRole, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && (userRole === "author" || userRole === "moderator")) {
      router.replace("/admin")
    }
  }, [userRole, isLoading, router])

  const [users, setUsers] = useState<UserRecord[]>([])
  const [authors, setAuthors] = useState<Record<string, AuthorRecord>>({})
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingAuthors, setLoadingAuthors] = useState(true)

  const [searchTerm, setSearchTerm] = useState(initialQuery)
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all")
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest")

  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId)
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(Boolean(initialUserId))

  if (isLoading || userRole === "author" || userRole === "moderator") {
    return null
  }

  // Load authors to identify staff accounts
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "authors"),
      (snapshot) => {
        const map: Record<string, AuthorRecord> = {}
        snapshot.docs.forEach((doc) => {
          map[doc.id] = { id: doc.id, ...doc.data() } as AuthorRecord
        })
        setAuthors(map)
        setLoadingAuthors(false)
      },
      (err) => {
        console.error("Error loading authors in users page:", err)
        setLoadingAuthors(false)
      },
    )
    return () => unsub()
  }, [])

  // Load users collection
  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as UserRecord[]
        setUsers(list)
        setLoadingUsers(false)
      },
      (err) => {
        console.error("Error loading users collection:", err)
        setLoadingUsers(false)
      },
    )
    return () => unsub()
  }, [])

  // Update selected user from query param if changed
  useEffect(() => {
    if (initialUserId) {
      setSelectedUserId(initialUserId)
      setIsDetailsOpen(true)
    }
  }, [initialUserId])

  // Combine and augment user list with author metadata
  const enrichedUsers = useMemo(() => {
    // Collect all unique user IDs
    const userMap = new Map<string, UserRecord>()
    users.forEach((u) => userMap.set(u.id, u))

    // Ensure all authors are also represented if not in users
    Object.entries(authors).forEach(([id, author]) => {
      if (!userMap.has(id)) {
        userMap.set(id, {
          id,
          uid: id,
          displayName: author.name,
          handle: author.handle,
          email: author.email,
          photoURL: author.avatar,
          provider: "staff",
        })
      }
    })

    return Array.from(userMap.values())
  }, [users, authors])

  // Filtered and sorted users
  const filteredUsers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()

    return enrichedUsers
      .filter((u) => {
        const author = authors[u.id]
        const role = author?.role

        // Provider filter
        if (providerFilter === "staff" && !role) return false
        if (
          providerFilter !== "all" &&
          providerFilter !== "staff" &&
          u.provider !== providerFilter
        ) {
          return false
        }

        // Search needle
        if (!needle) return true
        const matchString = [
          u.displayName,
          u.handle,
          u.email,
          u.id,
          author?.name,
          author?.handle,
          author?.role,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return matchString.includes(needle)
      })
      .sort((a, b) => {
        if (sortOrder === "name") {
          const nameA = (a.displayName || a.handle || "").toLowerCase()
          const nameB = (b.displayName || b.handle || "").toLowerCase()
          return nameA.localeCompare(nameB)
        }
        const getEffectiveDate = (u: UserRecord) => {
          const auth = authors[u.id]
          const authDate = auth?.role ? getAuthorDate(auth) : null
          const userDate = parseAnyDate(u.createdAt || u.updatedAt)
          const eff = authDate || userDate
          return eff?.getTime() || 0
        }
        if (sortOrder === "oldest") {
          return getEffectiveDate(a) - getEffectiveDate(b)
        }
        // newest default
        return getEffectiveDate(b) - getEffectiveDate(a)
      })
  }, [enrichedUsers, authors, searchTerm, providerFilter, sortOrder])

  // Key stats
  const totalCount = enrichedUsers.length
  const claimedHandlesCount = enrichedUsers.filter((u) => u.handle).length
  const googleUsersCount = enrichedUsers.filter(
    (u) => u.provider === "google.com",
  ).length
  const staffCount = Object.keys(authors).length

  const openUserDetails = (userId: string) => {
    setSelectedUserId(userId)
    setIsDetailsOpen(true)
  }

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Users" },
  ]

  const loading = loadingUsers || loadingAuthors

  return (
    <div className="w-full text-white">
      <div className="mb-2">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div className="mb-6 flex items-center justify-between">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/users.svg"
          imgAlt="Users"
        >
          Users
        </PageTitle>
      </div>

      {/* Summary KPI Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-white/50 mb-2">
            <span>Total Accounts</span>
            <Users className="h-4 w-4 text-[#8a2ae3]" />
          </div>
          <p className="font-mono text-3xl font-bold tabular-nums text-white">
            {loading ? "..." : totalCount}
          </p>
        </div>

        <div className="border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-white/50 mb-2">
            <span>Claimed Handles</span>
            <AtSign className="h-4 w-4 text-[#8a2ae3]" />
          </div>
          <p className="font-mono text-3xl font-bold tabular-nums text-white">
            {loading ? "..." : claimedHandlesCount}
          </p>
        </div>

        <div className="border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-white/50 mb-2">
            <span>Google Auth</span>
            <UserCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="font-mono text-3xl font-bold tabular-nums text-white">
            {loading ? "..." : googleUsersCount}
          </p>
        </div>

        <div className="border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-white/50 mb-2">
            <span>Team & Staff</span>
            <Shield className="h-4 w-4 text-[#f3c969]" />
          </div>
          <p className="font-mono text-3xl font-bold tabular-nums text-white">
            {loading ? "..." : staffCount}
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border border-white/10 bg-white/[0.02] p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users by name, handle, email, UID..."
            className="pl-9 bg-black/40 border-white/15 text-white placeholder:text-white/30 rounded-none focus-visible:ring-[#8a2ae3]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Provider Filter */}
          <div className="flex items-center gap-1 border border-white/15 bg-black/40 p-1 text-xs">
            {(
              [
                ["all", "All"],
                ["google.com", "Google"],
                ["password", "Password"],
                ["staff", "Staff"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setProviderFilter(key)}
                className={`px-2.5 py-1 uppercase font-mono tracking-wider transition-colors ${
                  providerFilter === key
                    ? "bg-[#8a2ae3] text-white font-semibold"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="border border-white/15 bg-black px-3 py-1.5 text-xs font-mono uppercase text-white/80 outline-none focus:border-[#8a2ae3]"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24 border border-white/10">
          <RefreshCw className="h-6 w-6 animate-spin text-[#8a2ae3] mr-3" />
          <span className="font-mono text-xs uppercase tracking-wider text-white/60">
            Loading reader profiles...
          </span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="py-20 text-center border border-white/10 bg-white/[0.01]">
          <p className="font-mono text-sm uppercase tracking-wider text-white/40 mb-2">
            No matching users found
          </p>
          <p className="text-xs text-white/30">
            Try adjusting your search criteria or filter options.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/5 font-mono text-xs uppercase tracking-wider text-white/60">
              <tr>
                <th className="p-4">User</th>
                <th className="p-4">Handle</th>
                <th className="p-4">Email</th>
                <th className="p-4">Role</th>
                <th className="p-4">Joined</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredUsers.map((item) => {
                const author = authors[item.id]
                const isStaff = Boolean(author?.role)
                const displayName = author?.name || item.displayName || "Reader"
                const handle = author?.handle || item.handle || ""
                const photoURL = author?.avatar || item.photoURL || ""

                return (
                  <tr
                    key={item.id}
                    onClick={() => openUserDetails(item.id)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                  >
                    {/* User Avatar + Name */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-white/20 bg-white/10 font-semibold uppercase text-white/60">
                          {photoURL ? (
                            <img
                              src={photoURL}
                              alt={displayName}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span>{displayName.charAt(0) || "?"}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold uppercase tracking-tight text-white group-hover:text-[#8a2ae3] transition-colors block truncate max-w-[200px]">
                            {displayName}
                          </span>
                          <span className="font-mono text-[11px] text-white/35 block truncate max-w-[200px]">
                            UID: {item.id.slice(0, 12)}…
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Handle */}
                    <td className="p-4">
                      {handle ? (
                        <span className="font-mono text-xs text-[#8a2ae3] font-medium">
                          @{handle}
                        </span>
                      ) : (
                        <span className="text-xs text-white/30 italic">
                          No handle
                        </span>
                      )}
                    </td>

                    {/* Email & Provider */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-white/80 font-mono text-xs truncate max-w-[220px]">
                          {item.email || "—"}
                        </span>
                        {item.provider === "google.com" ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-400 text-[10px] px-1.5 py-0"
                          >
                            Google
                          </Badge>
                        ) : item.provider === "password" ? (
                          <Badge
                            variant="outline"
                            className="border-white/20 text-white/50 text-[10px] px-1.5 py-0"
                          >
                            Password
                          </Badge>
                        ) : null}
                      </div>
                    </td>

                    {/* Role */}
                    <td className="p-4">
                      {author?.role === "super" ? (
                        <Badge
                          variant="outline"
                          className="bg-[#8a2ae3]/10 border-[#8a2ae3] text-[#8a2ae3] text-xs uppercase font-mono"
                        >
                          Super Admin
                        </Badge>
                      ) : author?.role === "admin" ? (
                        <Badge
                          variant="outline"
                          className="bg-[#8a2ae3]/10 border-[#8a2ae3] text-[#8a2ae3] text-xs uppercase font-mono"
                        >
                          Admin
                        </Badge>
                      ) : author?.role === "author" ? (
                        <Badge
                          variant="outline"
                          className="bg-[#f3c969]/10 border-[#f3c969] text-[#f3c969] text-xs uppercase font-mono"
                        >
                          Author
                        </Badge>
                      ) : author?.role === "moderator" ? (
                        <Badge
                          variant="outline"
                          className="bg-[#5eead4]/10 border-[#5eead4] text-[#5eead4] text-xs uppercase font-mono"
                        >
                          Moderator
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-white/20 text-white/60 text-xs uppercase font-mono"
                        >
                          Reader
                        </Badge>
                      )}
                    </td>

                    {/* Joined Date */}
                    <td className="p-4 font-mono text-xs text-white/50">
                      {(() => {
                        const authDate = isStaff ? getAuthorDate(author) : null
                        const userDate = parseAnyDate(item.createdAt || item.updatedAt)
                        const eff = isStaff ? (authDate || userDate) : (userDate || authDate)
                        if (eff) {
                          return eff.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        }
                        if (isStaff) {
                          return <span className="text-[#8a2ae3] font-semibold">Team Member</span>
                        }
                        return "—"
                      })()}
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          openUserDetails(item.id)
                        }}
                        className="text-white/60 hover:text-white hover:bg-white/10 text-xs font-mono uppercase"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* User Details Dialog */}
      <UserDetailsDialog
        userId={selectedUserId}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
      />
    </div>
  )
}
