"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Flame,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  UserX,
  X,
} from "lucide-react";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Breadcrumb } from "@/components/breadcrumb";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserDetailsDialog } from "@/components/admin/user-details-dialog";
import { ReasonCombobox } from "@/components/admin/reason-combobox";
import { logAuditActivity } from "@/lib/audit-logger";

type ReportType = "user" | "comment" | "reply";
type ReportStatus = "pending" | "action_taken" | "dismissed";
type ViolationReason =
  | "harassment"
  | "spam"
  | "hate_speech"
  | "inappropriate"
  | "impersonation"
  | "other";

const REASON_LABELS: Record<ViolationReason, string> = {
  harassment: "Harassment, Bullying, or Threats",
  spam: "Spam, Advertising, or Scams",
  hate_speech: "Hate Speech or Discrimination",
  inappropriate: "Inappropriate or Explicit Content",
  impersonation: "Impersonation or False Identity",
  other: "Other Policy Violation",
};

interface ReportDocument {
  id: string;
  type: ReportType;
  reportedUserId: string;
  reportedUserHandle: string;
  reportedUserName: string;
  reporterId: string;
  reporterHandle: string;
  reporterName: string;
  reason: ViolationReason;
  reasonLabel: string;
  details?: string;
  commentId?: string;
  parentCommentId?: string;
  commentContent?: string;
  articleId?: string;
  articleTitle?: string;
  articleSlug?: string;
  status: ReportStatus;
  createdAt?: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  actionTaken?: string;
  resolutionNotes?: string;
}

interface UserTargetDetails {
  uid: string;
  displayName?: string;
  handle?: string;
  email?: string;
  status?: string;
  warningCount?: number;
  lastWarningReason?: string;
  suspendedUntil?: Timestamp;
  suspensionReason?: string;
  bannedAt?: Timestamp;
  banReason?: string;
  lastIp?: string;
  lastDeviceLabel?: string;
  deviceHashes?: string[];
  fingerprintHashes?: string[];
}

export default function ReportsManagementPage() {
  const { user, userRole, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [reports, setReports] = useState<ReportDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>(
    "pending",
  );
  const [typeFilter, setTypeFilter] = useState<"all" | ReportType>("all");
  const [reasonFilter, setReasonFilter] = useState<"all" | ViolationReason>(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Active Report Action Modal State
  const [selectedReport, setSelectedReport] = useState<ReportDocument | null>(
    null,
  );
  const [targetUser, setTargetUser] = useState<UserTargetDetails | null>(null);
  const [targetUserLoading, setTargetUserLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "warn" | "suspend" | "ban" | "restore" | "dismiss"
  >("warn");

  // Form states for enforcement
  const [warnReason, setWarnReason] = useState<string>(
    "Harassment or disrespectful behavior",
  );
  const [warnCustomMessage, setWarnCustomMessage] = useState("");
  const [suspendDays, setSuspendDays] = useState("3");
  const [suspendReason, setSuspendReason] = useState(
    "Repeated off-topic disruption or trolling",
  );
  const [suspendCustomMessage, setSuspendCustomMessage] = useState("");
  const [banReason, setBanReason] = useState(
    "Severe or repeated Community Guidelines violations",
  );
  const [banCustomMessage, setBanCustomMessage] = useState("");
  const [dismissNotes, setDismissNotes] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Profile Dialog modal state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);

  // Real-time Firestore Reports subscription
  useEffect(() => {
    if (!user) {
      setReports([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ReportDocument[];
        setReports(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading reports:", err);
        setError("Failed to load moderation reports.");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  // If URL has ?reportId=... or ?filter=...
  useEffect(() => {
    const filterParam = searchParams.get("filter");
    if (
      filterParam === "all" ||
      filterParam === "pending" ||
      filterParam === "action_taken" ||
      filterParam === "dismissed"
    ) {
      setStatusFilter(filterParam);
    }
  }, [searchParams]);

  // Fetch target user data when modal opens
  useEffect(() => {
    if (!selectedReport?.reportedUserId) {
      setTargetUser(null);
      return;
    }

    let isMounted = true;
    setTargetUserLoading(true);

    async function loadUserData() {
      try {
        const userDoc = await getDoc(
          doc(db, "users", selectedReport!.reportedUserId),
        );
        if (userDoc.exists() && isMounted) {
          setTargetUser({
            uid: userDoc.id,
            ...userDoc.data(),
          } as UserTargetDetails);
        } else if (isMounted) {
          setTargetUser(null);
        }
      } catch (err) {
        console.error("Error fetching target user data:", err);
      } finally {
        if (isMounted) setTargetUserLoading(false);
      }
    }

    void loadUserData();

    return () => {
      isMounted = false;
    };
  }, [selectedReport]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      // Status
      if (statusFilter !== "all" && report.status !== statusFilter)
        return false;

      // Target Type
      if (typeFilter !== "all" && report.type !== typeFilter) return false;

      // Reason
      if (reasonFilter !== "all" && report.reason !== reasonFilter)
        return false;

      // Search Query
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        const matchesHandle =
          report.reportedUserHandle?.toLowerCase().includes(queryLower) ||
          report.reportedUserName?.toLowerCase().includes(queryLower);
        const matchesReporter =
          report.reporterHandle?.toLowerCase().includes(queryLower) ||
          report.reporterName?.toLowerCase().includes(queryLower);
        const matchesReason =
          report.reasonLabel?.toLowerCase().includes(queryLower) ||
          report.reason?.toLowerCase().includes(queryLower);
        const matchesDetails = report.details
          ?.toLowerCase()
          .includes(queryLower);
        const matchesContent = report.commentContent
          ?.toLowerCase()
          .includes(queryLower);
        const matchesArticle = report.articleTitle
          ?.toLowerCase()
          .includes(queryLower);

        if (
          !matchesHandle &&
          !matchesReporter &&
          !matchesReason &&
          !matchesDetails &&
          !matchesContent &&
          !matchesArticle
        ) {
          return false;
        }
      }

      return true;
    });
  }, [reports, statusFilter, typeFilter, reasonFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    return {
      total: reports.length,
      pending: reports.filter((r) => r.status === "pending").length,
      resolved: reports.filter((r) => r.status === "action_taken").length,
      dismissed: reports.filter((r) => r.status === "dismissed").length,
    };
  }, [reports]);

  const canExecuteBan = userRole === "super" || userRole === "admin";

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  const handleIssueWarning = async () => {
    if (!selectedReport) return;
    const effectiveReason = warnReason.trim();
    if (!effectiveReason) {
      setError("Please select or enter a valid warning reason.");
      return;
    }

    setActionBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const warnUserFn = httpsCallable(functions, "warnUser");
      await warnUserFn({
        targetUid: selectedReport.reportedUserId,
        reason: effectiveReason,
        customMessage: warnCustomMessage,
        reportId: selectedReport.id,
        commentId: selectedReport.commentId,
        commentType: selectedReport.type === "reply" ? "reply" : "comment",
      });

      setSuccessMessage(
        `Formal warning issued to @${selectedReport.reportedUserHandle} and content hidden.`,
      );
      setSelectedReport(null);
    } catch (err: any) {
      console.error("Error issuing warning:", err);
      setError(err?.message || "Failed to issue warning.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleSuspendUser = async () => {
    if (!selectedReport) return;
    const effectiveReason = suspendReason.trim();
    if (!effectiveReason) {
      setError("Please select or enter a valid suspension reason.");
      return;
    }

    setActionBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const suspendUserFn = httpsCallable(functions, "suspendUser");
      await suspendUserFn({
        targetUid: selectedReport.reportedUserId,
        durationDays: parseInt(suspendDays, 10) || 3,
        reason: effectiveReason,
        customMessage: suspendCustomMessage,
        reportId: selectedReport.id,
        commentId: selectedReport.commentId,
        commentType: selectedReport.type === "reply" ? "reply" : "comment",
      });

      setSuccessMessage(
        `Suspended @${selectedReport.reportedUserHandle} for ${suspendDays} days.`,
      );
      setSelectedReport(null);
    } catch (err: any) {
      console.error("Error suspending user:", err);
      setError(err?.message || "Failed to suspend user.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleBanUser = async () => {
    if (!selectedReport) return;
    if (!canExecuteBan) {
      setError(
        "Moderators do not have permission to execute permanent bans. Please escalate to an Admin.",
      );
      return;
    }

    const effectiveReason = banReason.trim();
    if (!effectiveReason) {
      setError("Please select or enter a valid ban reason.");
      return;
    }

    const confirmMsg = `Are you sure you want to PERMANENTLY BAN @${selectedReport.reportedUserHandle}? This will revoke their auth account, lock their handle, block recorded browser installations, and flag matching fingerprints for review.`;
    if (!window.confirm(confirmMsg)) return;

    setActionBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const banUserFn = httpsCallable(functions, "banUser");
      const result = (await banUserFn({
        targetUid: selectedReport.reportedUserId,
        reason: effectiveReason,
        customMessage: banCustomMessage,
        reportId: selectedReport.id,
        commentId: selectedReport.commentId,
        commentType: selectedReport.type === "reply" ? "reply" : "comment",
      })) as {
        data?: {
          blockedDevicesCount?: number;
          flaggedFingerprintsCount?: number;
        };
      };

      setSuccessMessage(
        `Permanently banned @${selectedReport.reportedUserHandle}. Blocked ${result.data?.blockedDevicesCount ?? 0} device(s) and flagged ${result.data?.flaggedFingerprintsCount ?? 0} browser fingerprint risk signal(s). Shared networks remain unaffected.`,
      );
      setSelectedReport(null);
    } catch (err: any) {
      console.error("Error banning user:", err);
      setError(err?.message || "Failed to permanently ban user.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDismissReport = async () => {
    if (!selectedReport || !user) return;
    setActionBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const resolveReport = httpsCallable(functions, "resolveReport");
      await resolveReport({
        reportId: selectedReport.id,
        action: "dismiss",
        notes: dismissNotes || "Dismissed by staff review",
      });

      setSuccessMessage(
        `Report against @${selectedReport.reportedUserHandle} dismissed.`,
      );
      setSelectedReport(null);
    } catch (err: any) {
      console.error("Error dismissing report:", err);
      setError(err?.message || "Failed to dismiss report.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnbanReportedUser = async () => {
    if (!selectedReport) return;
    if (!canExecuteBan) {
      setError("Only Super Admins and Admins can lift permanent bans.");
      return;
    }

    const confirmMsg = `Lift permanent ban for @${selectedReport.reportedUserHandle}? This will re-enable their auth account and release device and browser-fingerprint blocks owned by this account.`;
    if (!window.confirm(confirmMsg)) return;

    setActionBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const fn = httpsCallable<
        { targetUid: string },
        {
          success: boolean;
          unblockedDevicesCount?: number;
          clearedFingerprintsCount?: number;
          nextStatus?: string;
        }
      >(functions, "unbanUser");
      const res = await fn({ targetUid: selectedReport.reportedUserId });
      setTargetUser((prev) =>
        prev
          ? {
              ...prev,
              status: res.data?.nextStatus || "active",
              bannedAt: undefined,
              banReason: undefined,
            }
          : null,
      );
      setSuccessMessage(
        `Permanent ban lifted for @${selectedReport.reportedUserHandle}. ${res.data?.unblockedDevicesCount ?? 0} device(s) released and ${res.data?.clearedFingerprintsCount ?? 0} fingerprint risk signal(s) cleared.`,
      );
    } catch (err: any) {
      console.error("Error unbanning user:", err);
      setError(err?.message || "Failed to lift permanent ban.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnsuspendReportedUser = async () => {
    if (!selectedReport) return;
    setActionBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const fn = httpsCallable<
        { targetUid: string },
        { success: boolean; nextStatus: string }
      >(functions, "unsuspendUser");
      const res = await fn({ targetUid: selectedReport.reportedUserId });
      setTargetUser((prev) =>
        prev
          ? {
              ...prev,
              status: res.data?.nextStatus || "active",
              suspendedUntil: undefined,
              suspensionReason: undefined,
            }
          : null,
      );
      setSuccessMessage(
        `Commenting suspension lifted early for @${selectedReport.reportedUserHandle}.`,
      );
    } catch (err: any) {
      console.error("Error lifting suspension:", err);
      setError(err?.message || "Failed to lift suspension.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleClearReportedUserWarnings = async () => {
    if (!selectedReport) return;
    setActionBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const fn = httpsCallable<
        { targetUid: string },
        { success: boolean; clearedCount: number; nextStatus: string }
      >(functions, "clearUserWarnings");
      const res = await fn({ targetUid: selectedReport.reportedUserId });
      setTargetUser((prev) =>
        prev
          ? {
              ...prev,
              warningCount: 0,
              status: res.data?.nextStatus || "active",
              lastWarnedAt: undefined,
              lastWarningReason: undefined,
            }
          : null,
      );
      setSuccessMessage(
        `Cleared ${res.data?.clearedCount ?? 0} warning(s) for @${selectedReport.reportedUserHandle}.`,
      );
    } catch (err: any) {
      console.error("Error clearing warnings:", err);
      setError(err?.message || "Failed to clear warnings.");
    } finally {
      setActionBusy(false);
    }
  };

  const openUserDetails = (uid: string) => {
    setSelectedUserId(uid);
    setIsUserDetailsOpen(true);
  };

  return (
    <div className="w-full pb-16 text-white">
      <div className="mb-2">
        <Breadcrumb items={[{ label: "Reports", href: "/admin/reports" }]} />
      </div>

      <div className="mb-4">
        <PageTitle
          className="sr-only"
          imgSrc="/images/titles/reports.svg"
          imgAlt="Reports"
        >
          Reports
        </PageTitle>
      </div>

      <div className="mb-6">
        <Link href="/admin/comments">
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-white/15 bg-black/40 text-xs font-mono uppercase text-white hover:border-[#8a2ae3] hover:text-white"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-2 text-[#8a2ae3]" />
            Comments Feed
          </Button>
        </Link>
      </div>

      {error ? (
        <div className="mb-6 flex items-center justify-between border-l-4 border-red-500 bg-red-500/10 p-4 text-sm text-red-200">
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            className="text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-6 flex items-center justify-between border-l-4 border-emerald-500 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage("")}
            className="text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`border p-4 text-left transition-all ${
            statusFilter === "all"
              ? "border-[#8a2ae3] bg-[#8a2ae3]/10"
              : "border-white/10 bg-white/[0.02] hover:border-white/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-white/50">
              All Reports
            </span>
            <Shield className="h-4 w-4 text-white/40" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono">{metrics.total}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("pending")}
          className={`border p-4 text-left transition-all ${
            statusFilter === "pending"
              ? "border-red-500 bg-red-500/10"
              : "border-white/10 bg-white/[0.02] hover:border-white/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-red-400 font-semibold">
              Pending Action
            </span>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-red-300">
            {metrics.pending}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("action_taken")}
          className={`border p-4 text-left transition-all ${
            statusFilter === "action_taken"
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-white/10 bg-white/[0.02] hover:border-white/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-emerald-400 font-semibold">
              Action Taken
            </span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-emerald-300">
            {metrics.resolved}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("dismissed")}
          className={`border p-4 text-left transition-all ${
            statusFilter === "dismissed"
              ? "border-white/40 bg-white/10"
              : "border-white/10 bg-white/[0.02] hover:border-white/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-white/50">
              Dismissed
            </span>
            <CheckCircle2 className="h-4 w-4 text-white/40" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono">
            {metrics.dismissed}
          </p>
        </button>
      </div>

      {/* Filter and Search Controls */}
      <div className="mb-6 border border-white/10 bg-white/[0.015] p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports by user handle, reporter, reason, or content..."
              className="pl-9 h-10 border-white/15 bg-black/60 text-xs font-mono text-white placeholder:text-white/30 focus:border-[#8a2ae3]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Target Type Filter */}
            <Select
              value={typeFilter}
              onValueChange={(val) => setTypeFilter(val as any)}
            >
              <SelectTrigger className="h-10 border-white/15 bg-black/60 text-xs font-mono text-white min-w-[130px]">
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent className="border-white/20 bg-[#161616] text-white">
                <SelectItem value="all" className="text-xs font-mono">
                  All Targets
                </SelectItem>
                <SelectItem value="comment" className="text-xs font-mono">
                  Comments
                </SelectItem>
                <SelectItem value="reply" className="text-xs font-mono">
                  Replies
                </SelectItem>
                <SelectItem value="user" className="text-xs font-mono">
                  User Profiles
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Violation Reason Filter */}
            <Select
              value={reasonFilter}
              onValueChange={(val) => setReasonFilter(val as any)}
            >
              <SelectTrigger className="h-10 border-white/15 bg-black/60 text-xs font-mono text-white min-w-[160px]">
                <SelectValue placeholder="Reason" />
              </SelectTrigger>
              <SelectContent className="border-white/20 bg-[#161616] text-white max-h-72">
                <SelectItem value="all" className="text-xs font-mono">
                  All Reasons
                </SelectItem>
                <SelectItem value="harassment" className="text-xs font-mono">
                  Harassment & Bullying
                </SelectItem>
                <SelectItem value="spam" className="text-xs font-mono">
                  Spam & Scams
                </SelectItem>
                <SelectItem value="hate_speech" className="text-xs font-mono">
                  Hate Speech
                </SelectItem>
                <SelectItem value="inappropriate" className="text-xs font-mono">
                  Inappropriate Content
                </SelectItem>
                <SelectItem value="impersonation" className="text-xs font-mono">
                  Impersonation
                </SelectItem>
                <SelectItem value="other" className="text-xs font-mono">
                  Other Violations
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Reset */}
            {(typeFilter !== "all" ||
              reasonFilter !== "all" ||
              searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTypeFilter("all");
                  setReasonFilter("all");
                  setSearchQuery("");
                }}
                className="h-10 text-xs font-mono text-white/50 hover:text-white"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Status Tab Buttons */}
        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {(
            [
              ["all", "All Reports"],
              ["pending", `Pending Action (${metrics.pending})`],
              ["action_taken", `Resolved (${metrics.resolved})`],
              ["dismissed", `Dismissed (${metrics.dismissed})`],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                statusFilter === val
                  ? val === "pending" && metrics.pending > 0
                    ? "bg-red-600 text-white font-semibold"
                    : "bg-[#8a2ae3] text-white font-semibold"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Reports Feed List */}
      <div className="space-y-4">
        <p className="text-xs tabular-nums text-white/40">
          Showing{" "}
          <span className="font-semibold text-white/70">
            {filteredReports.length}
          </span>{" "}
          of {reports.length} reports
        </p>

        {loading ? (
          <div className="space-y-3 py-8">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse border border-white/10 bg-white/[0.02]"
              />
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="border border-white/10 bg-white/[0.01] py-16 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-emerald-400/40" />
            <p className="mt-4 font-semibold text-white/80">
              No reports found matching your criteria
            </p>
            <p className="mt-1 text-xs text-white/40">
              {statusFilter === "pending"
                ? "All clear! There are no pending reports requiring action."
                : "Try adjusting your filters or search query."}
            </p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const createdAtDate = report.createdAt?.toDate
              ? report.createdAt.toDate()
              : null;
            const isPending = report.status === "pending";

            return (
              <article
                key={report.id}
                className={`border transition-all duration-200 ${
                  isPending
                    ? "border-red-500/30 bg-red-500/[0.02] hover:border-red-500/50"
                    : report.status === "action_taken"
                      ? "border-emerald-500/20 bg-emerald-500/[0.01] hover:border-emerald-500/30"
                      : "border-white/10 bg-white/[0.01] hover:border-white/15"
                }`}
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 border-b border-white/10 pb-5">
                    {/* Reason, Target Type, and Reported User */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-semibold uppercase tracking-wider ${
                            isPending
                              ? "bg-red-500/20 text-red-300 border border-red-500/40"
                              : report.status === "action_taken"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-white/10 text-white/70 border border-white/20"
                          }`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {report.reasonLabel ||
                            REASON_LABELS[report.reason] ||
                            report.reason}
                        </span>

                        <span className="text-xs font-mono uppercase text-white/50 bg-black/40 border border-white/10 px-2 py-1">
                          {report.type === "user"
                            ? "User Profile"
                            : report.type === "reply"
                              ? "Reply"
                              : "Comment"}
                        </span>

                        {report.actionTaken && (
                          <span className="text-xs font-mono uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1">
                            Action: {report.actionTaken.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
                        <span>
                          Reported User:{" "}
                          <button
                            type="button"
                            onClick={() =>
                              openUserDetails(report.reportedUserId)
                            }
                            className="font-semibold text-white underline hover:text-[#8a2ae3]"
                          >
                            @
                            {report.reportedUserHandle ||
                              report.reportedUserName}
                          </button>
                        </span>
                        <span>•</span>
                        <span>
                          Reporter:{" "}
                          <strong className="text-white/80">
                            @{report.reporterHandle}
                          </strong>
                        </span>
                        <span>•</span>
                        <span className="font-mono text-white/40">
                          {createdAtDate
                            ? createdAtDate.toLocaleString()
                            : "Recently"}
                        </span>
                      </div>
                    </div>

                    {/* Action Trigger Button */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        onClick={() => {
                          setSelectedReport(report);
                          setActiveTab(isPending ? "warn" : "dismiss");
                        }}
                        className={`h-9 text-xs font-mono uppercase tracking-wider font-semibold ${
                          isPending
                            ? "bg-red-600 text-white hover:bg-red-500"
                            : "border border-white/20 bg-white/5 text-white hover:bg-white/10"
                        }`}
                      >
                        {isPending ? (
                          <>
                            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                            Take Action
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View Record
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Reporter Note */}
                  {report.details && (
                    <div className="mt-4 bg-black/40 border border-white/10 p-4 text-xs text-white/80">
                      <p className="font-mono text-[10px] uppercase text-white/40 mb-0.5">
                        Reporter Context Note:
                      </p>
                      <p className="italic leading-relaxed">
                        &ldquo;{report.details}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Comment / Reply Content Snippet */}
                  {report.commentContent && (
                    <div className="mt-4 border-l-2 border-red-500/50 bg-black/30 px-4 py-3 text-xs text-white/90">
                      <p className="font-mono text-[10px] uppercase text-white/40 mb-1">
                        Reported Content Snippet:
                      </p>
                      <p className="whitespace-pre-wrap font-sans leading-relaxed">
                        {report.commentContent}
                      </p>
                      {report.articleTitle && (
                        <p className="mt-2 text-[11px] text-white/40">
                          Article:{" "}
                          <span className="text-[#8a2ae3]">
                            {report.articleTitle}
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Resolution Notes for Resolved/Dismissed */}
                  {report.resolutionNotes && (
                    <div className="mt-4 border-t border-white/10 pt-4 text-xs text-white/50 font-mono">
                      Resolution Note:{" "}
                      <span className="text-white/80">
                        {report.resolutionNotes}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Enforcement & Action Modal Dialog */}
      {mounted &&
        selectedReport &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto"
          >
            <div className="w-full max-w-3xl max-h-[94vh] sm:max-h-[92vh] overflow-y-auto border border-white/20 bg-[#141414] shadow-2xl text-white my-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/15 bg-black/60 px-4 sm:px-6 py-3.5 sm:py-4 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-400" />
                  <h3 className="font-semibold text-sm sm:text-base">
                    Community Moderation & Enforcement
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="text-white/40 hover:text-white transition-colors p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* Target User & Violation Overview Card */}
                <div className="border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-white/40 block">
                        Reported Reader
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          openUserDetails(selectedReport.reportedUserId)
                        }
                        className="text-base font-bold hover:text-[#8a2ae3] underline flex items-center gap-1.5 mt-0.5"
                      >
                        @{selectedReport.reportedUserHandle}
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {targetUserLoading ? (
                        <span className="text-xs font-mono text-white/40">
                          Loading user history…
                        </span>
                      ) : targetUser ? (
                        <>
                          <span className="text-xs font-mono px-2 py-0.5 bg-white/10 border border-white/20">
                            Status:{" "}
                            <strong className="uppercase">
                              {targetUser.status || "active"}
                            </strong>
                          </span>
                          {(targetUser.warningCount ?? 0) > 0 && (
                            <span className="text-xs font-mono px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Warnings: {targetUser.warningCount}
                            </span>
                          )}
                          {targetUser.lastDeviceLabel && (
                            <span className="text-xs font-mono px-2 py-0.5 bg-red-500/10 text-red-300 border border-red-500/30">
                              Device: {targetUser.lastDeviceLabel}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-white/40">
                          Profile not loaded
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-white/40 block font-mono text-[10px] uppercase">
                        Reason for Report
                      </span>
                      <strong className="text-red-300">
                        {selectedReport.reasonLabel}
                      </strong>
                    </div>
                    <div>
                      <span className="text-white/40 block font-mono text-[10px] uppercase">
                        Reported By
                      </span>
                      <span className="font-mono text-white/90">
                        @{selectedReport.reporterHandle}
                      </span>
                    </div>
                    {selectedReport.articleTitle && (
                      <div className="sm:col-span-2">
                        <span className="text-white/40 block font-mono text-[10px] uppercase">
                          Associated Article
                        </span>
                        <span className="text-white/80">
                          {selectedReport.articleTitle}
                        </span>
                      </div>
                    )}
                    {selectedReport.commentContent && (
                      <div className="sm:col-span-2 border-l-2 border-red-500 bg-black/40 p-2.5">
                        <span className="text-white/40 block font-mono text-[10px] uppercase mb-1">
                          Infringing Comment:
                        </span>
                        <p className="italic text-white/90 whitespace-pre-wrap">
                          {selectedReport.commentContent}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Tabs Selector */}
                <div className="flex flex-wrap items-center gap-3 overflow-x-auto border-b border-white/10 pb-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("warn")}
                    className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 font-semibold transition-all shrink-0 ${
                      activeTab === "warn"
                        ? "border-amber-400 text-amber-300 bg-amber-500/10"
                        : "border-transparent text-white/50 hover:text-white"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    1. Formal Warning
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("suspend")}
                    className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 font-semibold transition-all shrink-0 ${
                      activeTab === "suspend"
                        ? "border-orange-500 text-orange-300 bg-orange-500/10"
                        : "border-transparent text-white/50 hover:text-white"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    2. Suspend (1-30d)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("ban")}
                    className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 font-semibold transition-all shrink-0 ${
                      activeTab === "ban"
                        ? "border-red-500 text-red-300 bg-red-500/10"
                        : "border-transparent text-white/50 hover:text-white"
                    }`}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    3. Permanent Ban
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("restore")}
                    className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 font-semibold transition-all shrink-0 ${
                      activeTab === "restore"
                        ? "border-emerald-500 text-emerald-300 bg-emerald-500/10"
                        : "border-transparent text-white/50 hover:text-white"
                    }`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reversal / Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("dismiss")}
                    className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 font-semibold transition-all shrink-0 ${
                      activeTab === "dismiss"
                        ? "border-white/50 text-white bg-white/10"
                        : "border-transparent text-white/40 hover:text-white"
                    }`}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Dismiss Report
                  </button>
                </div>

                {/* TAB 1: FORMAL WARNING */}
                {activeTab === "warn" && (
                  <div className="border border-amber-500/30 bg-amber-500/[0.02] p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        Tier 1: Issue Formal Warning & Hide Content
                      </h4>
                      <p className="text-xs text-white/60 mt-1">
                        Increments the user&apos;s warning strike counter, sends
                        an in-app notice, and hides the reported comment.
                        Account privileges remain active.
                      </p>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="font-mono text-white/60 block mb-1">
                          Warning Category / Reason
                        </label>
                        <ReasonCombobox
                          value={warnReason}
                          onChange={setWarnReason}
                          placeholder="Select preset or type custom reason..."
                        />
                      </div>

                      <div>
                        <label className="font-mono text-white/60 block mb-1">
                          Custom Warning Notice to User (Optional)
                        </label>
                        <Textarea
                          value={warnCustomMessage}
                          onChange={(e) => setWarnCustomMessage(e.target.value)}
                          placeholder="Explain specifically what rule was breached and how to comply with Community Guidelines..."
                          className="bg-black/60 border-white/15 text-xs placeholder:text-white/30"
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedReport(null)}
                        className="border-white/20 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={actionBusy}
                        onClick={handleIssueWarning}
                        className="bg-amber-600 text-white hover:bg-amber-500 text-xs font-semibold"
                      >
                        {actionBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                        )}
                        Confirm & Issue Warning
                      </Button>
                    </div>
                  </div>
                )}

                {/* TAB 2: SUSPEND USER */}
                {activeTab === "suspend" && (
                  <div className="border border-orange-500/30 bg-orange-500/[0.02] p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-orange-300 flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        Tier 2: Commenting Suspension & Content Removal
                      </h4>
                      <p className="text-xs text-white/60 mt-1">
                        Temporarily locks the reader from commenting, replying,
                        or voting for the specified duration. The infringing
                        comment will be hidden.
                      </p>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="font-mono text-white/60 block mb-1">
                          Suspension Duration
                        </label>
                        <Select
                          value={suspendDays}
                          onValueChange={setSuspendDays}
                        >
                          <SelectTrigger className="border-white/15 bg-black/60 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#181818] border-white/20 text-white">
                            <SelectItem value="1">24 Hours (1 Day)</SelectItem>
                            <SelectItem value="3">
                              3 Days (Recommended for repeat warnings)
                            </SelectItem>
                            <SelectItem value="7">7 Days (1 Week)</SelectItem>
                            <SelectItem value="14">
                              14 Days (2 Weeks)
                            </SelectItem>
                            <SelectItem value="30">
                              30 Days (1 Month)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="font-mono text-white/60 block mb-1">
                          Suspension Rationale / Reason
                        </label>
                        <ReasonCombobox
                          value={suspendReason}
                          onChange={setSuspendReason}
                          placeholder="Select preset or type custom reason..."
                        />
                      </div>

                      <div>
                        <label className="font-mono text-white/60 block mb-1">
                          Message to Suspended Reader (Optional)
                        </label>
                        <Textarea
                          value={suspendCustomMessage}
                          onChange={(e) =>
                            setSuspendCustomMessage(e.target.value)
                          }
                          placeholder="Explain the suspension rationale and when privileges will be restored..."
                          className="bg-black/60 border-white/15 text-xs placeholder:text-white/30"
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedReport(null)}
                        className="border-white/20 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={actionBusy}
                        onClick={handleSuspendUser}
                        className="bg-orange-600 text-white hover:bg-orange-500 text-xs font-semibold"
                      >
                        {actionBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 mr-1" />
                        )}
                        Suspend for {suspendDays} Days
                      </Button>
                    </div>
                  </div>
                )}

                {/* TAB 3: permanent account and device block */}
                {activeTab === "ban" && (
                  <div className="border border-red-600/40 bg-red-600/[0.03] p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-red-400 flex items-center gap-1.5">
                        <Ban className="h-4 w-4" />
                        Tier 3: Permanent Account & Device Block
                      </h4>
                      <p className="text-xs text-white/60 mt-1">
                        Permanently disables the reader&apos;s Firebase Auth
                        account, locks their handle, and blocks recorded browser
                        installations. Matching fingerprints and network IPs
                        remain corroborating investigation signals, not sole
                        proof.
                      </p>
                    </div>

                    {!canExecuteBan ? (
                      <div className="border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3">
                        <Lock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-amber-300 font-semibold mb-1">
                            Restricted Permission
                          </strong>
                          Moderators do not have permission to execute permanent
                          account or device blocks. If this account requires a
                          permanent ban, please leave a note on this report and
                          escalate to an Admin or Super Admin.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="font-mono text-white/60 block mb-1">
                            Permanent Ban Reason
                          </label>
                          <ReasonCombobox
                            value={banReason}
                            onChange={setBanReason}
                            placeholder="Select preset or type custom reason..."
                          />
                        </div>

                        <div className="bg-black/40 border border-white/10 p-3 space-y-1">
                          <span className="text-[10px] font-mono uppercase text-white/40 block">
                            Target Identification:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-white/80">
                            <div>
                              UID:{" "}
                              <code className="text-white/60 text-[11px]">
                                {selectedReport.reportedUserId}
                              </code>
                            </div>
                            <div>
                              Handle:{" "}
                              <strong className="text-white">
                                @{selectedReport.reportedUserHandle}
                              </strong>
                            </div>
                            {targetUser?.email && (
                              <div>
                                Email:{" "}
                                <strong className="text-white">
                                  {targetUser.email}
                                </strong>
                              </div>
                            )}
                            <div>
                              Network signal (not blocked):{" "}
                              {targetUser?.lastIp ? (
                                <strong className="text-white/70 font-mono">
                                  {targetUser.lastIp}
                                </strong>
                              ) : (
                                <span className="text-white/40">
                                  No IP on file
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-white/55">
                          Recorded identity signals:{" "}
                          {targetUser?.deviceHashes?.length || 0} device(s),{" "}
                          {targetUser?.fingerprintHashes?.length || 0}{" "}
                          fingerprint(s). Shared café, school, office, and
                          carrier networks will not be blocked.
                        </div>

                        <div>
                          <label className="font-mono text-white/60 block mb-1">
                            Final Notice to Banned User (Optional)
                          </label>
                          <Textarea
                            value={banCustomMessage}
                            onChange={(e) =>
                              setBanCustomMessage(e.target.value)
                            }
                            placeholder="State final explanation for permanent removal..."
                            className="bg-black/60 border-white/15 text-xs placeholder:text-white/30"
                            rows={2}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedReport(null)}
                        className="border-white/20 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={actionBusy || !canExecuteBan}
                        onClick={handleBanUser}
                        className="bg-red-600 text-white hover:bg-red-500 text-xs font-semibold"
                      >
                        {actionBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Ban className="h-3.5 w-3.5 mr-1" />
                        )}
                        Permanently Ban & Blacklist IP
                      </Button>
                    </div>
                  </div>
                )}

                {/* TAB 4: REVERSAL & CLEAR CONTROLS */}
                {activeTab === "restore" && (
                  <div className="border border-emerald-500/30 bg-emerald-500/[0.02] p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
                        <RotateCcw className="h-4 w-4" />
                        Restore Account Standing & Reversal
                      </h4>
                      <p className="text-xs text-white/60 mt-1">
                        Quickly lift suspensions, unban accounts, or clear
                        warnings directly for @
                        {selectedReport.reportedUserHandle}.
                      </p>
                    </div>

                    <div className="border border-white/10 bg-black/40 p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Current Status:</span>
                        <Badge
                          variant="outline"
                          className={
                            targetUser?.status === "banned"
                              ? "border-red-500/40 text-red-300"
                              : targetUser?.status === "suspended" ||
                                  targetUser?.suspendedUntil
                                ? "border-orange-500/40 text-orange-300"
                                : (targetUser?.warningCount ?? 0) > 0 ||
                                    targetUser?.status === "warning"
                                  ? "border-amber-500/40 text-amber-300"
                                  : "border-emerald-500/40 text-emerald-300"
                          }
                        >
                          {targetUser?.status === "banned"
                            ? "Permanently Banned"
                            : targetUser?.status === "suspended" ||
                                targetUser?.suspendedUntil
                              ? "Suspended"
                              : (targetUser?.warningCount ?? 0) > 0 ||
                                  targetUser?.status === "warning"
                                ? `Warned (${targetUser?.warningCount || 0})`
                                : "Good Standing"}
                        </Badge>
                      </div>

                      {targetUser?.lastIp && (
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">
                            Network signal (not blocked):
                          </span>
                          <span className="font-mono text-white/90">
                            {targetUser.lastIp}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-1">
                      {/* Unban Action */}
                      <div className="flex items-center justify-between p-2.5 border border-white/10 bg-white/[0.02]">
                        <div>
                          <span className="font-semibold text-xs text-white block">
                            Unban Account & Devices
                          </span>
                          <span className="text-[10px] text-white/40">
                            Re-enables login and releases device blocks owned by
                            this account.
                          </span>
                        </div>
                        <Button
                          size="sm"
                          disabled={actionBusy || !canExecuteBan}
                          onClick={handleUnbanReportedUser}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 font-mono"
                          title={
                            !canExecuteBan
                              ? "Only Super Admins and Admins can unban"
                              : "Unban user"
                          }
                        >
                          {actionBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Unban Account
                        </Button>
                      </div>

                      {/* Lift Suspension */}
                      <div className="flex items-center justify-between p-2.5 border border-white/10 bg-white/[0.02]">
                        <div>
                          <span className="font-semibold text-xs text-white block">
                            Lift Suspension Early
                          </span>
                          <span className="text-[10px] text-white/40">
                            Restores commenting privileges immediately.
                          </span>
                        </div>
                        <Button
                          size="sm"
                          disabled={actionBusy}
                          onClick={handleUnsuspendReportedUser}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 font-mono"
                        >
                          {actionBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          Lift Suspension
                        </Button>
                      </div>

                      {/* Clear Warnings */}
                      <div className="flex items-center justify-between p-2.5 border border-white/10 bg-white/[0.02]">
                        <div>
                          <span className="font-semibold text-xs text-white block">
                            Clear All Warnings
                          </span>
                          <span className="text-[10px] text-white/40">
                            Resets warning count to 0 and restores Good
                            Standing.
                          </span>
                        </div>
                        <Button
                          size="sm"
                          disabled={actionBusy}
                          onClick={handleClearReportedUserWarnings}
                          className="bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-500/40 text-xs h-7 font-mono"
                        >
                          {actionBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Clear Warnings
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedReport(null)}
                        className="border-white/20 text-xs"
                      >
                        Close Drawer
                      </Button>
                    </div>
                  </div>
                )}

                {/* TAB 5: DISMISS REPORT */}
                {activeTab === "dismiss" && (
                  <div className="border border-white/15 bg-white/[0.02] p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-white/90 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        Dismiss Report (No Violation Found)
                      </h4>
                      <p className="text-xs text-white/60 mt-1">
                        Archives this report without taking punitive action
                        against the reported reader.
                      </p>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="font-mono text-white/60 block mb-1">
                          Dismissal Note / Rationale
                        </label>
                        <Input
                          value={dismissNotes}
                          onChange={(e) => setDismissNotes(e.target.value)}
                          maxLength={1000}
                          placeholder="e.g., Reviewed content - does not violate community guidelines."
                          className="bg-black/60 border-white/15 text-xs placeholder:text-white/30"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedReport(null)}
                        className="border-white/20 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={actionBusy}
                        onClick={handleDismissReport}
                        className="bg-white/15 text-white hover:bg-white/25 text-xs font-semibold"
                      >
                        {actionBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        Confirm Dismissal
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* User Details Dialog */}
      <UserDetailsDialog
        userId={selectedUserId}
        isOpen={isUserDetailsOpen}
        onClose={() => {
          setIsUserDetailsOpen(false);
          setSelectedUserId(null);
        }}
      />
    </div>
  );
}
