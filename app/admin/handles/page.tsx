"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { httpsCallable } from "firebase/functions"
import { AlertTriangle, Check, KeyRound, Loader2, Pencil, RefreshCw, Search, Trash2 } from "lucide-react"
import { Breadcrumb } from "@/components/breadcrumb"
import { Button } from "@/components/ui/button"
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
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20)
}

export default function HandlesPage() {
  const { userRole, isLoading: authLoading } = useAuth()
  const { toast } = useToast()
  const [registry, setRegistry] = useState<HandleRegistry>(emptyRegistry)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState("")
  const [reservationHandle, setReservationHandle] = useState("")
  const [reservationOwner, setReservationOwner] = useState("")
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
    if (!reservationHandle || !reservationOwner) return
    setBusyAction("reservation")
    try {
      const save = httpsCallable(functions, "upsertHandleReservation")
      await save({ handle: reservationHandle, ownerUid: reservationOwner })
      toast({
        title: "Reservation saved",
        description: `@${reservationHandle} is protected for the selected account.`,
        variant: "success",
      })
      setReservationHandle("")
      setReservationOwner("")
      await loadRegistry()
    } catch (error: any) {
      toast({
        title: "Could not save reservation",
        description: error?.message || "Check the handle and owner.",
        variant: "destructive",
      })
    } finally {
      setBusyAction("")
    }
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
        { reserved: number; conflicts: string[]; ready: boolean }
      >(functions, "syncHandleReservations")
      const result = await sync({ officialOwnerUid: officialOwner })
      if (!result.data.ready) {
        throw new Error(result.data.conflicts.join(" ") || "Resolve the listed conflicts.")
      }
      toast({
        title: "Default reservations protected",
        description: `${result.data.reserved} reservations are active.`,
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
    setReservationOwner(reservation.ownerUid)
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
        <AlertTriangle className="mb-4 h-10 w-10 text-[#8a2be2]" />
        <h1 className="text-2xl font-bold">Superadmin access required</h1>
        <p className="mt-2 text-white/55">Only the superadmin can manage handle ownership.</p>
      </div>
    )
  }

  return (
    <main className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={[{ label: "Dashboard", href: "/admin" }, { label: "Handles" }]} />
      </div>

      <div className="mx-auto max-w-[88rem]">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.22em] text-[#b782df]">
              Identity registry
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Handles</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              Reserve protected names, see every claimed handle, and correct ownership when needed.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadRegistry()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        <dl className="grid grid-cols-2 border-b border-white/15 sm:grid-cols-3">
          <div className="border-r border-white/10 p-4">
            <dt className="text-xs text-white/40">Taken</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums">{registry.claims.length}</dd>
          </div>
          <div className="p-4 sm:border-r sm:border-white/10">
            <dt className="text-xs text-white/40">Reserved</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums">{registry.reservations.length}</dd>
          </div>
          <div className="col-span-2 border-t border-white/10 p-4 sm:col-span-1 sm:border-t-0">
            <dd className={`font-mono text-sm ${registry.ready ? "text-emerald-300" : "text-amber-300"}`}>
              {registry.ready ? "ACTIVE" : "SETUP NEEDED"}
            </dd>
            <dt className="mt-1 text-xs text-white/40">Reader claims</dt>
          </div>
        </dl>

        <section className="grid border-b border-white/15 lg:grid-cols-2">
          <div className="border-b border-white/15 p-5 lg:border-b-0 lg:border-r">
            <div className="mb-5 flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-[#a855f7]" />
              <div>
                <h2 className="font-bold">Reserve a handle</h2>
                <p className="text-sm text-white/45">Prevent anyone else from claiming this name.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">@</span>
                <Input
                  value={reservationHandle}
                  onChange={(event) => setReservationHandle(cleanHandle(event.target.value))}
                  placeholder="reserved_name"
                  className="pl-8"
                />
              </div>
              <select
                value={reservationOwner}
                onChange={(event) => setReservationOwner(event.target.value)}
                className="h-10 w-full border border-white bg-[#121212] px-3 text-sm text-white"
              >
                <option value="">Choose owner</option>
                {registry.owners.map((owner) => (
                  <option key={owner.uid} value={owner.uid}>
                    {owner.name} · {owner.role}{owner.handle ? ` · @${owner.handle}` : ""}
                  </option>
                ))}
              </select>
              <Button
                onClick={saveReservation}
                disabled={busyAction === "reservation" || reservationHandle.length < 3 || !reservationOwner}
              >
                {busyAction === "reservation" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save reservation
              </Button>
            </div>
          </div>

          <div className="p-5">
            <div className="mb-5 flex items-center gap-3">
              <Pencil className="h-5 w-5 text-[#a855f7]" />
              <div>
                <h2 className="font-bold">Change an account handle</h2>
                <p className="text-sm text-white/45">Superadmin correction for readers or staff.</p>
              </div>
            </div>
            <div className="space-y-3">
              <select
                value={accountUid}
                onChange={(event) => {
                  const uid = event.target.value
                  setAccountUid(uid)
                  setAccountHandle(registry.owners.find((owner) => owner.uid === uid)?.handle || "")
                }}
                className="h-10 w-full border border-white bg-[#121212] px-3 text-sm text-white"
              >
                <option value="">Choose account</option>
                {registry.owners.map((owner) => (
                  <option key={owner.uid} value={owner.uid}>
                    {owner.name} · {owner.role}{owner.handle ? ` · @${owner.handle}` : " · no handle"}
                  </option>
                ))}
              </select>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">@</span>
                <Input
                  value={accountHandle}
                  onChange={(event) => setAccountHandle(cleanHandle(event.target.value))}
                  placeholder="new_handle"
                  className="pl-8"
                />
              </div>
              <Button
                onClick={changeHandle}
                disabled={busyAction === "handle" || accountHandle.length < 3 || !accountUid}
              >
                {busyAction === "handle" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update handle
              </Button>
            </div>
          </div>
        </section>

        {!registry.ready && (
          <section className="border-x border-b border-amber-400/40 bg-amber-400/5 p-5">
            <h2 className="font-bold text-amber-300">Enable protected handle claims</h2>
            <p className="mt-1 text-sm text-white/55">
              Choose the owner of the official L.A.P names. This creates the default brand and team reservations.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <select
                value={officialOwner}
                onChange={(event) => setOfficialOwner(event.target.value)}
                className="h-10 flex-1 border border-white bg-[#121212] px-3 text-sm text-white"
              >
                <option value="">Choose official owner</option>
                {staffOwners.map((owner) => (
                  <option key={owner.uid} value={owner.uid}>{owner.name} · {owner.role}</option>
                ))}
              </select>
              <Button onClick={syncDefaults} disabled={!officialOwner || busyAction === "sync"}>
                {busyAction === "sync" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Protect defaults
              </Button>
            </div>
          </section>
        )}

        <section className="sticky top-0 z-20 mt-8 flex flex-col gap-3 border-b border-white/15 bg-[#121212]/95 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex border border-white/15">
            {(["reserved", "taken"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setRegistryView(view)}
                className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                  registryView === view
                    ? "bg-white text-black"
                    : "text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                {view} ({view === "reserved" ? registry.reservations.length : registry.claims.length})
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              value={registrySearch}
              onChange={(event) => setRegistrySearch(event.target.value)}
              placeholder="Search handle or owner"
              className="border-white/20 bg-transparent pl-10"
            />
          </div>
        </section>

        <section className={registryView === "reserved" ? "mt-6" : "hidden"}>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold">Reserved handles</h2>
              <p className="text-sm text-white/45">Protected names and the account allowed to claim them.</p>
            </div>
          </div>
          <div className="overflow-x-auto border border-white/15">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-white/45">
                <tr><th className="p-4">Reservation</th><th className="p-4">Owner</th><th className="p-4">Status</th><th className="p-4 text-right">Manage</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredReservations.map((reservation) => (
                  <tr key={reservation.key} className="hover:bg-white/[0.03]">
                    <td className="p-4"><span className="font-semibold">@{reservation.label}</span><span className="mt-1 block text-xs text-white/35">key: {reservation.key}</span></td>
                    <td className="p-4">{reservation.ownerName}</td>
                    <td className="p-4">{reservation.claimedHandles.length ? <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-3.5 w-3.5" /> Claimed as @{reservation.claimedHandles.join(", @")}</span> : <span className="text-white/45">Available for owner</span>}</td>
                    <td className="p-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Edit reservation" onClick={() => editReservation(reservation)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Remove reservation" disabled={busyAction === `remove:${reservation.key}`} onClick={() => void removeReservation(reservation)}>{busyAction === `remove:${reservation.key}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button></div></td>
                  </tr>
                ))}
                {!loading && filteredReservations.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-white/45">No reserved handles match this view.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className={registryView === "taken" ? "mt-6" : "hidden"}>
          <div className="mb-3">
            <h2 className="text-xl font-bold">Taken handles</h2>
            <p className="text-sm text-white/45">Every handle currently attached to an account.</p>
          </div>
          <div className="overflow-x-auto border border-white/15">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-white/45">
                <tr><th className="p-4">Handle</th><th className="p-4">Account</th><th className="p-4">Type</th><th className="p-4">Protection</th><th className="p-4 text-right">Manage</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredClaims.map((claim) => (
                  <tr key={claim.handle} className="hover:bg-white/[0.03]">
                    <td className="p-4 font-semibold">@{claim.handle}</td>
                    <td className="p-4">{claim.ownerName}</td>
                    <td className="p-4 capitalize text-white/60">{claim.ownerRole}</td>
                    <td className="p-4">{claim.reserved ? <span className="text-[#c084fc]">Reserved</span> : <span className="text-white/40">Claimed</span>}</td>
                    <td className="p-4 text-right"><Button variant="ghost" size="icon" title="Change handle" onClick={() => editClaim(claim)}><Pencil className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
                {!loading && filteredClaims.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-white/45">No taken handles match this view.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
