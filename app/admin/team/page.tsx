"use client";
import { orderBy } from "firebase/firestore";
import Link from "next/link";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";

import { Breadcrumb } from "@/components/breadcrumb";
import { Plus, Eye, Pencil, UserCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePaginatedCollection } from "@/hooks/use-firestore-query";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  uid: string;
  slug: string;
  avatar?: string;
}

export default function TeamPage() {
  const { userRole } = useAuth();
  // Use the paginated collection hook with sorting by name
  const {
    items: team,
    loading,
    hasMore,
    loadMore,
  } = usePaginatedCollection("authors", 20, [orderBy("name", "asc")]);

  const breadcrumbItems = [
    { label: "Dashboard", href: "/admin" },
    { label: "Team" },
  ];

  return (
    <div className="px-4 py-6">
      <div className="mb-2 mt-6 md:mt-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div className="flex justify-between items-center mb-6">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/team.svg"
          imgAlt="Team"
        >
          Team
        </PageTitle>
      </div>

      {(userRole === "super" || userRole === "admin") && (
        <div className="mb-6">
          <Button asChild variant="outline">
            <Link href="/admin/team/new">
              <Plus className="mr-2 h-4 w-4" /> New Member
            </Link>
          </Button>
        </div>
      )}

      {loading && team.length === 0 ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#8a2ae3]"></div>
          <span className="ml-3">Loading team members...</span>
        </div>
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded-none">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5">
              <tr>
                <th className="p-4 text-left font-medium text-white/70">
                  Member
                </th>
                <th className="p-4 text-left font-medium text-white/70">
                  Role
                </th>
                <th className="p-4 text-left font-medium text-white/70">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {team.map((member) => {
                const teamMember = member as TeamMember;
                return (
                  <tr key={teamMember.id} className="hover:bg-white/5">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        {teamMember.avatar ? (
                          <img
                            src={teamMember.avatar || "/placeholder.svg"}
                            alt={teamMember.name}
                            className="w-10 h-10 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src =
                                "/placeholder.svg?height=40&width=40";
                            }}
                          />
                        ) : (
                          <UserCircle className="w-10 h-10 text-white/50" />
                        )}
                        <span className="font-medium">{teamMember.name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-white/10 text-xs rounded-none">
                        {teamMember.role || "Member"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            href={`https://lap-docs.netlify.app/team/${teamMember.slug}`}
                            target="_blank"
                            title="View profile"
                          >
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Link>
                        </Button>

                        {userRole !== "manager" && (
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              href={`/admin/team/${teamMember.id}`}
                              title="Edit member"
                            >
                              <Pencil className="h-4 w-4 mr-1" /> Edit
                            </Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center mt-4">
          <Button onClick={loadMore} variant="outline" disabled={loading}>
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-[#8a2ae3] mr-2"></div>
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
