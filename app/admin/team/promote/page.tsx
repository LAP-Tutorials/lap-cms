"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { httpsCallable } from "firebase/functions"
import { AlertTriangle, Loader2, Search, ShieldCheck, UserCircle } from "lucide-react"
import { Breadcrumb } from "@/components/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { functions } from "@/lib/firebase"

interface ReaderCandidate {
  uid: string
  handle: string
  name: string
  email: string
  photoURL: string
}

export default function PromoteModeratorPage() {
  const { userRole, isLoading: authLoading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [candidates, setCandidates] = useState<ReaderCandidate[]>([])
  const [selectedUid, setSelectedUid] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [promoting, setPromoting] = useState(false)

  const canPromote = userRole === "super" || userRole === "admin"

  const loadCandidates = useCallback(async () => {
    if (!canPromote) return
    setLoading(true)
    try {
      const list = httpsCallable<
        Record<string, never>,
        { candidates: ReaderCandidate[] }
      >(functions, "listModeratorCandidates")
      const result = await list({})
      setCandidates(result.data.candidates)
    } catch (error: any) {
      toast({
        title: "Could not load readers",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [canPromote, toast])

  useEffect(() => {
    if (!authLoading) void loadCandidates()
  }, [authLoading, loadCandidates])

  const filteredCandidates = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return candidates
    return candidates.filter((candidate) =>
      [candidate.name, candidate.handle, candidate.email]
        .join(" ")
        .toLowerCase()
        .includes(term),
    )
  }, [candidates, query])

  const selected = candidates.find((candidate) => candidate.uid === selectedUid)

  const promote = async () => {
    if (!selected) return
    if (!window.confirm(`Promote @${selected.handle || selected.name} to moderator?`)) {
      return
    }

    setPromoting(true)
    try {
      const promoteReader = httpsCallable(functions, "promoteReaderToModerator")
      await promoteReader({ uid: selected.uid })
      toast({
        title: "Moderator added",
        description: `${selected.name} can now sign in to the CMS with their existing account.`,
        variant: "success",
      })
      router.push("/admin/team")
    } catch (error: any) {
      toast({
        title: "Could not promote reader",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
      setPromoting(false)
    }
  }

  if (authLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center">Loading…</div>
  }

  if (!canPromote) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="mb-4 h-10 w-10 text-[#8a2ae3]" />
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="mt-2 text-white/55">Only admins can promote readers.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Team", href: "/admin/team" },
            { label: "Promote Moderator" },
          ]}
        />
      </div>

      <main className="mx-auto max-w-4xl">
        <header className="border-b border-white/15 pb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#8a2ae3]">
            Existing reader
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Promote a moderator
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Their Docs login, handle, profile picture, and comments stay connected to the same account.
          </p>
        </header>

        <div className="border-x border-b border-white/15 p-4">
          <label htmlFor="reader-search" className="mb-2 block text-sm font-medium">
            Find a reader
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id="reader-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by handle or email"
              className="pl-10"
            />
          </div>
        </div>

        <section className="border-x border-b border-white/15">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-white/55">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading readers…
            </div>
          ) : filteredCandidates.length ? (
            <div className="divide-y divide-white/10">
              {filteredCandidates.map((candidate) => {
                const isSelected = candidate.uid === selectedUid
                return (
                  <button
                    key={candidate.uid}
                    type="button"
                    onClick={() => setSelectedUid(candidate.uid)}
                    className={`flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-white/[0.04] ${
                      isSelected ? "bg-[#8a2ae3]/10" : ""
                    }`}
                  >
                    {candidate.photoURL ? (
                      <img
                        src={candidate.photoURL}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <UserCircle className="h-11 w-11 shrink-0 text-white/35" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        @{candidate.handle || candidate.name}
                      </span>
                      <span className="block truncate text-sm text-white/45">
                        {candidate.email}
                      </span>
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                        isSelected
                          ? "border-[#8a2ae3] bg-[#8a2ae3]"
                          : "border-white/30"
                      }`}
                      aria-hidden="true"
                    >
                      {isSelected && <ShieldCheck className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="font-medium">No eligible readers found.</p>
              <p className="mt-1 text-sm text-white/45">
                Readers who are already team members are not shown here.
              </p>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-3 border-x border-b border-white/15 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/45">
            {selected
              ? `Selected: @${selected.handle || selected.name}`
              : "Select one reader to continue."}
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => router.push("/admin/team")}>
              Cancel
            </Button>
            <Button onClick={promote} disabled={!selected || promoting}>
              {promoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Promote to moderator
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
