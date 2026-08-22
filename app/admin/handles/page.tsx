"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { httpsCallable } from "firebase/functions"
import { AlertTriangle, AtSign, Check, Loader2, Pencil, RefreshCw, Search, ShieldCheck, Trash2, UserRoundCog } from "lucide-react"
import { Breadcrumb } from "@/components/breadcrumb"
import { Button } from "@/components/ui/button"
import PageTitle from "@/components/PageTitle";
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { functions } from "@/lib/firebase"

interface HandleOwner {
  uid: string
  name: string
  email: string
  role: string
  handle: string
}

interface HandleReservation {
  key: string
  label: string
  ownerUid: string
  ownerName: string
  reason: string
  claimedHandles: string[]
}

interface HandleClaim {
  handle: string
  uid: string
  ownerName: string
  ownerRole: string
  reserved: boolean
}

interface HandleRegistry {
  ready: boolean
  owners: HandleOwner[]
  reservations: HandleReservation[]
  claims: HandleClaim[]
}

const emptyRegistry: HandleRegistry = {
  ready: false,
  owners: [],
  reservations: [],
  claims: [],
}

function cleanHandle(value: string) {
  return value
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 20)
}

export default function HandlesPage() {
  const { userRole, isLoading: authLoading } = useAuth()
  const { toast } = useToast()
  const [registry, setRegistry] = useState<HandleRegistry>(emptyRegistry)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState("")
  const [reservationHandle, setReservationHandle] = useState("")
  const [reservationOwnerUid, setReservationOwnerUid] = useState("")
  const [editingReservationKey, setEditingReservationKey] = useState<string | null>(null)
  const [accountUid, setAccountUid] = useState("")
  const [accountHandle, setAccountHandle] = useState("")
  const [officialOwner, setOfficialOwner] = useState("")
  const [registryView, setRegistryView] = useState<"reserved" | "taken">("reserved")
  const [registrySearch, setRegistrySearch] = useState("")

  const loadRegistry = useCallback(async () => {
    if (userRole !== "super") return
    setLoading(true)
    try {
      const list = httpsCallable<Record<string, never>, HandleRegistry>(
        functions,
        "listHandleRegistry",
      )
      const result = await list({})
      setRegistry(result.data)
    } catch (error: any) {
      toast({
        title: "Could not load handles",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast, userRole])

  useEffect(() => {
    if (!authLoading) void loadRegistry()
  }, [authLoading, loadRegistry])

  const staffOwners = useMemo(
    () => registry.owners.filter((owner) => owner.role !== "reader"),
    [registry.owners],
  )
  const filteredReservations = useMemo(() => {
    const term = registrySearch.trim().toLowerCase()
    if (!term) return registry.reservations
    return registry.reservations.filter((reservation) =>
      [reservation.label, reservation.key, reservation.ownerName]
        .join(" ")
        .toLowerCase()
        .includes(term),
    )
  }, [registry.reservations, registrySearch])
  const filteredClaims = useMemo(() => {
    const term = registrySearch.trim().toLowerCase()
    if (!term) return registry.claims
    return registry.claims.filter((claim) =>
      [claim.handle, claim.ownerName, claim.ownerRole]
        .join(" ")
        .toLowerCase()
        .includes(term),
    )
  }, [registry.claims, registrySearch])

  const saveReservation = async () => {
    if (!reservationHandle) return
    setBusyAction("reservation")
    try {
      const save = httpsCallable<
        { handle: string; ownerUid?: string },
        { key: string; handle: string; ownerUid?: string }
      >(functions, "upsertHandleReservation")
      await save({
        handle: reservationHandle,
        ownerUid: reservationOwnerUid || undefined,
      })
      const assignedOwner = registry.owners.find((o) => o.uid === reservationOwnerUid)
      toast({
        title: editingReservationKey ? "Reservation updated" : "Reservation saved",
        description: reservationOwnerUid
          ? `@${reservationHandle} is now assigned to ${assignedOwner?.name || "the selected user"}.`
          : `@${reservationHandle} is now protected.`,
        variant: "success",
      })
      setReservationHandle("")
      setReservationOwnerUid("")
      setEditingReservationKey(null)
      await loadRegistry()
    } catch (error: any) {
      toast({
        title: "Could not save reservation",
        description: error?.message || "Check the handle and try again.",
        variant: "destructive",
      })
    } finally {
      setBusyAction("")
    }
  }

  const cancelReservationEdit = () => {
    setReservationHandle("")
    setReservationOwnerUid("")
    setEditingReservationKey(null)
  }

  const removeReservation = async (reservation: HandleReservation) => {
    if (!window.confirm(`Remove the reservation for @${reservation.label}?`)) return
    setBusyAction(`remove:${reservation.key}`)
    try {
      const remove = httpsCallable(functions, "deleteHandleReservation")
      await remove({ key: reservation.key })
      toast({
        title: "Reservation removed",
        description: "An existing claimed handle was not changed.",
        variant: "success",
      })
      if (editingReservationKey === reservation.key) {
        cancelReservationEdit()
      }
      await loadRegistry()
    } catch (error: any) {
      toast({
        title: "Could not remove reservation",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setBusyAction("")
    }
  }

  const changeHandle = async () => {
    if (!accountUid || !accountHandle) return
    const owner = registry.owners.find((item) => item.uid === accountUid)
    if (!window.confirm(`Change ${owner?.name || "this account"} to @${accountHandle}?`)) {
      return
    }
    setBusyAction("handle")
    try {
      const setHandle = httpsCallable(functions, "setUserHandle")
      await setHandle({ uid: accountUid, handle: accountHandle })
      toast({
        title: "Handle updated",
        description: `${owner?.name || "The account"} now uses @${accountHandle}.`,
        variant: "success",
      })
      setAccountHandle("")
      await loadRegistry()
    } catch (error: any) {
      toast({
        title: "Could not update handle",
        description: error?.message || "That handle may be taken or reserved.",
        variant: "destructive",
      })
    } finally {
      setBusyAction("")
    }
  }

  const syncDefaults = async () => {
    if (!officialOwner) return
    setBusyAction("sync")
    try {
      const sync = httpsCallable<
        { officialOwnerUid: string },
        { reserved: number; updated: number; conflicts: string[]; ready: boolean }
      >(functions, "syncHandleReservations")
      const result = await sync({ officialOwnerUid: officialOwner })
      if (!result.data.ready) {
        throw new Error(result.data.conflicts.join(" ") || "Resolve the listed conflicts.")
      }
      toast({
        title: "Default reservations protected",
        description: `${result.data.reserved} reservations are active; ${result.data.updated || 0} labels were normalized.`,
        variant: "success",
      })
      await loadRegistry()
    } catch (error: any) {
      toast({
        title: "Could not protect defaults",
        description: error?.message || "Please resolve handle conflicts first.",
        variant: "destructive",
      })
    } finally {
      setBusyAction("")
    }
  }

  const editReservation = (reservation: HandleReservation) => {
    setReservationHandle(cleanHandle(reservation.label))
    setReservationOwnerUid(reservation.ownerUid || "")
    setEditingReservationKey(reservation.key)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const editClaim = (claim: HandleClaim) => {
    setAccountUid(claim.uid)
    setAccountHandle(claim.handle)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  if (authLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center">Loading…</div>
  }

  if (userRole !== "super") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="mb-4 h-10 w-10 text-[#8a2ae3]" />
        <h1 className="text-2xl font-bold">Superadmin access required</h1>
        <p className="mt-2 text-white/55">Only the superadmin can manage handle ownership.</p>
      </div>
    )
  }

  return (
    <main className="pt-12 sm:pt-6 md:pt-0">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={[{ label: "Dashboard", href: "/admin" }, { label: "Handles" }]} />
      </div>

      <div className="flex justify-between items-center mb-6">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/handles.svg"
          imgAlt="Handles"
        >
          Handles
        </PageTitle>
      </div>

      <div className="mx-auto max-w-[76rem]">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => void loadRegistry()} disabled={loading} className="border border-white/15 text-white/60 hover:bg-white/[0.06] hover:text-white">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <dl className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-white/15 py-4">
          <div className="flex items-center gap-2.5">
            <AtSign className="h-4 w-4 text-white/30" aria-hidden="true" />
            <dd className="font-mono text-sm font-semibold tabular-nums text-white/85">{registry.claims.length}</dd>
            <dt className="text-xs text-white/40">Taken</dt>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-white/30" aria-hidden="true" />
            <dd className="font-mono text-sm font-semibold tabular-nums text-white/85">{registry.reservations.length}</dd>
            <dt className="text-xs text-white/40">Reserved</dt>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`h-1.5 w-1.5 ${registry.ready ? "bg-emerald-300" : "bg-amber-300"}`} aria-hidden="true" />
            <dd className={`text-xs font-medium ${registry.ready ? "text-emerald-300" : "text-amber-300"}`}>
              {registry.ready ? "Claims active" : "Setup needed"}
            </dd>
          </div>
        </dl>

        <section className="grid gap-4 py-5 lg:grid-cols-2">
          <div className="border border-white/10 bg-white/[0.012] p-5">
            <div className="mb-5 flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-white/[0.05] text-[#8a2ae3]" aria-hidden="true">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-semibold">
                  {editingReservationKey ? "Edit reserved handle" : "Reserve a handle"}
                </h2>
                <p className="mt-0.5 text-sm text-white/45">
                  {editingReservationKey
                    ? "Update handle or change the assigned user."
                    : "Protect a name or assign it to a specific user."}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">@</span>
                <Input
                  value={reservationHandle}
                  onChange={(event) => setReservationHandle(cleanHandle(event.target.value))}
                  placeholder="reserved_name"
                  className="border-white/15 bg-white/[0.025] pl-8 focus-visible:ring-[#8a2ae3]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/50">Assign to user (optional):</label>
                <select
                  value={reservationOwnerUid}
                  onChange={(event) => setReservationOwnerUid(event.target.value)}
                  className="h-10 w-full border border-white/15 bg-[#151515] px-3 text-sm text-white outline-none transition-colors focus:border-[#8a2ae3] focus-visible:ring-2 focus-visible:ring-[#8a2ae3]"
                >
                  <option value="">Unassigned (Protected from all users)</option>
                  {registry.owners.map((owner) => (
                    <option key={owner.uid} value={owner.uid}>
                      {owner.name} · {owner.role}{owner.handle ? ` · @${owner.handle}` : " · no handle"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={saveReservation}
                  disabled={busyAction === "reservation" || reservationHandle.length < 3}
                  size="sm"
                >
                  {busyAction === "reservation" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingReservationKey ? "Update reservation" : "Save reservation"}
                </Button>
                {(editingReservationKey || reservationHandle || reservationOwnerUid) && (
                  <Button
                    onClick={cancelReservationEdit}
                    variant="ghost"
                    size="sm"
                    className="text-white/50 hover:text-white"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="border border-white/10 bg-white/[0.012] p-5">
            <div className="mb-5 flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-white/[0.05] text-[#8a2ae3]" aria-hidden="true">
                <UserRoundCog className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-semibold">Change an account handle</h2>
                <p className="mt-0.5 text-sm text-white/45">Correct a reader or staff handle.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-white/50">1. Select account:</label>
                <select
                  value={accountUid}
                  onChange={(event) => {
                    const uid = event.target.value
                    setAccountUid(uid)
                    setAccountHandle(registry.owners.find((owner) => owner.uid === uid)?.handle || "")
                  }}
                  className="h-10 w-full border border-white/15 bg-[#151515] px-3 text-sm text-white outline-none transition-colors focus:border-[#8a2ae3] focus-visible:ring-2 focus-visible:ring-[#8a2ae3]"
                >
                  <option value="">Choose account</option>
                  {registry.owners.map((owner) => (
                    <option key={owner.uid} value={owner.uid}>
                      {owner.name} · {owner.role}{owner.handle ? ` · @${owner.handle}` : " · no handle"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/50">2. Pick a reserved handle (optional):</label>
                <select
                  value={registry.reservations.some((r) => r.label === accountHandle) ? accountHandle : ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      setAccountHandle(cleanHandle(event.target.value))
                    }
                  }}
                  className="h-10 w-full border border-white/15 bg-[#151515] px-3 text-sm text-white outline-none transition-colors focus:border-[#8a2ae3] focus-visible:ring-2 focus-visible:ring-[#8a2ae3]"
                >
                  <option value="">-- Or choose from reserved handles --</option>
                  {registry.reservations.map((res) => (
                    <option key={res.key} value={res.label}>
                      @{res.label} ({res.claimedHandles.length ? "Claimed" : res.ownerUid ? `Assigned to ${res.ownerName}` : "Unassigned"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/50">3. Handle to apply:</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">@</span>
                  <Input
                    value={accountHandle}
                    onChange={(event) => setAccountHandle(cleanHandle(event.target.value))}
                    placeholder="new_handle"
                    className="border-white/15 bg-white/[0.025] pl-8 focus-visible:ring-[#8a2ae3]"
                  />
                </div>
              </div>

              <Button
                onClick={changeHandle}
                disabled={busyAction === "handle" || accountHandle.length < 3 || !accountUid}
                size="sm"
                className="mt-1"
              >
                {busyAction === "handle" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update handle
              </Button>
            </div>
          </div>
        </section>

        {!registry.ready && (
          <section className="border-l-2 border-amber-300 bg-amber-300/[0.05] p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-amber-200">Enable protected handle claims</h2>
                <p className="mt-1 text-sm text-white/55">
                  Choose the owner of the official L.A.P names to create the default reservations.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <select
                value={officialOwner}
                onChange={(event) => setOfficialOwner(event.target.value)}
                className="h-10 flex-1 border border-white/15 bg-[#151515] px-3 text-sm text-white outline-none focus:border-[#8a2ae3]"
              >
                <option value="">Choose official owner</option>
                {staffOwners.map((owner) => (
                  <option key={owner.uid} value={owner.uid}>{owner.name} · {owner.role}</option>
                ))}
              </select>
              <Button size="sm" onClick={syncDefaults} disabled={!officialOwner || busyAction === "sync"}>
                {busyAction === "sync" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Protect defaults
              </Button>
            </div>
          </section>
        )}

        <section className="sticky top-0 z-20 mt-3 flex flex-col gap-3 border-b border-white/15 bg-[#121212]/95 py-3 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full overflow-x-auto bg-white/[0.025] p-0.5 lg:w-auto">
            {(["reserved", "taken"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setRegistryView(view)}
                className={`inline-flex min-w-0 flex-1 shrink-0 items-center justify-center gap-2 px-3 py-2 text-xs font-medium capitalize transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a2ae3] active:translate-y-px lg:flex-none ${
                  registryView === view
                    ? "!bg-[#8a2ae3] !text-white"
                    : "text-white/50 hover:bg-white/5 hover:text-white"
                }`}
              >
                {view === "reserved" ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <AtSign className="h-3.5 w-3.5" aria-hidden="true" />}
                {view} ({view === "reserved" ? registry.reservations.length : registry.claims.length})
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              value={registrySearch}
              onChange={(event) => setRegistrySearch(event.target.value)}
              placeholder="Search handle or owner"
              className="h-10 border-white/15 bg-white/[0.025] pl-10 text-sm placeholder:text-white/30 focus-visible:ring-[#8a2ae3]"
            />
          </div>
        </section>

        <section className={registryView === "reserved" ? "mt-5" : "hidden"}>
          <div className="mb-4 flex items-end justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-[#8a2ae3]" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-semibold">Reserved handles</h2>
                <p className="mt-0.5 text-sm text-white/45">Protected names and who may claim them.</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto border border-white/10 bg-white/[0.01]">
            <table className="w-full min-w-[44rem] divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.025] text-left text-xs font-medium text-white/40">
                <tr>
                  <th className="w-1/4 px-4 py-3">Reservation</th>
                  <th className="w-1/4 px-4 py-3">Assigned to</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="w-28 px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredReservations.map((reservation) => (
                  <tr key={reservation.key} className="transition-colors duration-200 hover:bg-white/[0.025]">
                    <td className="px-4 py-3.5 font-semibold">@{reservation.label}</td>
                    <td className="px-4 py-3.5 text-white/75">{reservation.ownerName}</td>
                    <td className="px-4 py-3.5">
                      {reservation.claimedHandles.length ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-300">
                          <Check className="h-3.5 w-3.5" /> Claimed as @{reservation.claimedHandles.join(", @")}
                        </span>
                      ) : reservation.ownerUid ? (
                        <span className="inline-flex items-center gap-1.5 text-[#8a2ae3]">
                          <ShieldCheck className="h-3.5 w-3.5" /> Assigned to {reservation.ownerName}
                        </span>
                      ) : (
                        <span className="text-white/40">Protected (Unassigned)</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit reservation"
                          aria-label={`Edit @${reservation.label}`}
                          onClick={() => editReservation(reservation)}
                          className="h-8 w-8 text-white/40 hover:bg-white/[0.07] hover:text-white focus-visible:ring-[#8a2ae3]"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove reservation"
                          aria-label={`Remove @${reservation.label}`}
                          disabled={busyAction === `remove:${reservation.key}`}
                          onClick={() => void removeReservation(reservation)}
                          className="h-8 w-8 text-white/30 hover:bg-red-400/10 hover:text-red-300 focus-visible:ring-red-300"
                        >
                          {busyAction === `remove:${reservation.key}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredReservations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-white/45">
                      <Search className="mx-auto mb-3 h-5 w-5 text-white/20" />
                      No reserved handles match this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={registryView === "taken" ? "mt-5" : "hidden"}>
          <div className="mb-4 flex items-start gap-3">
            <AtSign className="mt-0.5 h-5 w-5 text-[#8a2ae3]" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-semibold">Taken handles</h2>
              <p className="mt-0.5 text-sm text-white/45">Handles currently attached to an account.</p>
            </div>
          </div>
          <div className="overflow-x-auto border border-white/10 bg-white/[0.01]">
            <table className="w-full min-w-[52rem] divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.025] text-left text-xs font-medium text-white/40">
                <tr>
                  <th className="w-1/4 px-4 py-3">Handle</th>
                  <th className="w-1/4 px-4 py-3">Account</th>
                  <th className="w-1/6 px-4 py-3">Type</th>
                  <th className="px-4 py-3">Protection</th>
                  <th className="w-24 px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredClaims.map((claim) => (
                  <tr key={claim.handle} className="transition-colors duration-200 hover:bg-white/[0.025]">
                    <td className="px-4 py-3.5 font-semibold">@{claim.handle}</td>
                    <td className="px-4 py-3.5 text-white/75">{claim.ownerName}</td>
                    <td className="px-4 py-3.5 capitalize text-white/50">{claim.ownerRole}</td>
                    <td className="px-4 py-3.5">{claim.reserved ? <span className="inline-flex items-center gap-1.5 text-[#8a2ae3]"><ShieldCheck className="h-3.5 w-3.5" /> Reserved</span> : <span className="text-white/40">Claimed</span>}</td>
                    <td className="px-4 py-3.5 text-right"><Button variant="ghost" size="icon" title="Change handle" aria-label={`Change @${claim.handle}`} onClick={() => editClaim(claim)} className="h-8 w-8 text-white/40 hover:bg-white/[0.07] hover:text-white focus-visible:ring-[#8a2ae3]"><Pencil className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
                {!loading && filteredClaims.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-white/45"><Search className="mx-auto mb-3 h-5 w-5 text-white/20" />No taken handles match this view.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
