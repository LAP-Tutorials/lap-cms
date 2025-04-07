"use client"

import { useEffect, useState } from "react"
import { collection, getDocs } from "firebase/firestore"
import { db, auth } from "@/lib/firebase"
import Link from "next/link"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import PageTitle from "@/components/PageTitle"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Breadcrumb } from "@/components/breadcrumb"
import { Plus, Eye, Pencil, UserCircle } from "lucide-react"

interface TeamMember {
  id: string
  name: string
  role: string
  uid: string
  slug: string
  avatar?: string
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const fetchRoleAndTeam = async (uid: string) => {
      try {
        const ref = doc(db, "authors", uid)
        const snap = await getDoc(ref)

        if (snap.exists()) {
          setCurrentUserRole(snap.data().role)
        }

        const teamSnap = await getDocs(collection(db, "authors"))
        const docs = teamSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TeamMember[]

        setTeam(docs)
      } catch (error) {
        console.error("Error fetching team data:", error)
        toast({
          title: "Error",
          description: "Failed to load team members",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchRoleAndTeam(user.uid)
      } else {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [toast])

  const breadcrumbItems = [{ label: "Dashboard", href: "/admin" }, { label: "Team" }]

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div className="flex justify-between items-center mb-6">
        <PageTitle className="sr-only" imgSrc="/images/titles/team.svg" imgAlt="Team">
          Team
        </PageTitle>
      </div>

      {(currentUserRole === "super" || currentUserRole === "admin") && (
        <div className="mb-6">
          <Button asChild  variant="outline">
            <Link href="/admin/team/new">
              <Plus className="mr-2 h-4 w-4" /> New Member
            </Link>
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2be2]"></div>
          <span className="ml-3">Loading team members...</span>
        </div>
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded-none">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5">
              <tr>
                <th className="p-4 text-left font-medium text-white/70">Member</th>
                <th className="p-4 text-left font-medium text-white/70">Role</th>
                <th className="p-4 text-left font-medium text-white/70">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {team.map((member) => (
                <tr key={member.id} className="hover:bg-white/5">
                  <td className="p-4">
                    <div className="flex items-center space-x-3">
                      {member.avatar ? (
                        <img
                          src={member.avatar || "/placeholder.svg"}
                          alt={member.name}
                          className="w-10 h-10 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg?height=40&width=40"
                          }}
                        />
                      ) : (
                        <UserCircle className="w-10 h-10 text-white/50" />
                      )}
                      <span className="font-medium">{member.name}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-white/10 text-xs rounded-none">{member.role || "Member"}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={`https://lap-docs.netlify.app/team/${member.slug}`}
                          target="_blank"
                          title="View profile"
                        >
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Link>
                      </Button>

                      {currentUserRole !== "manager" && (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/admin/team/${member.id}`} title="Edit member">
                            <Pencil className="h-4 w-4 mr-1" /> Edit
                          </Link>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {team.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-white/50">
                    No team members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

