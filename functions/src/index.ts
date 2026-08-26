import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentWritten,
  onDocumentWrittenWithAuthContext,
} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { defineBoolean, defineSecret } from "firebase-functions/params";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import * as JSZip from "jszip";
// import { google } from "googleapis";
// remove dotenv import as firebase loads .env automatically
// import * as dotenv from "dotenv";

// dotenv.config();

// Ensure Firebase Admin is initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Lazy initialization of Firebase Admin
let db: admin.firestore.Firestore | null = null;
function getDb() {
  if (!db) {
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    db = admin.firestore();
  }
  return db;
}

async function mutateDocumentsInChunks(
  snapshots: admin.firestore.DocumentSnapshot[],
  mutate: (
    batch: admin.firestore.WriteBatch,
    snapshot: admin.firestore.DocumentSnapshot
  ) => void
) {
  for (let offset = 0; offset < snapshots.length; offset += 400) {
    const batch = getDb().batch();
    snapshots.slice(offset, offset + 400).forEach((snapshot) => {
      mutate(batch, snapshot);
    });
    await batch.commit();
  }
}

// Lazy initialization to prevent global scope crashes
let analyticsDataClient: BetaAnalyticsDataClient | null = null;

function getAnalyticsClient() {
  if (!analyticsDataClient) {
    analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GA_CLIENT_EMAIL,
        private_key: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
    });
  }
  return analyticsDataClient;
}

const CONTENT_STAFF_ROLES = ["author", "admin", "super"];
const RESERVABLE_TEAM_ROLES = ["moderator", ...CONTENT_STAFF_ROLES];
const OFFICIAL_HANDLE_KEYS = [
  "lap",
  "lapdocs",
  "laptutorials",
  "lapain",
  "arclapain",
];
const TEAM_HANDLE_PATTERN = /^[a-z0-9_-]{3,20}$/;
const DEVICE_ID_PATTERN = /^[a-zA-Z0-9_-]{20,128}$/;
const ACTIVE_ACCOUNT_STATUSES = new Set(["active", "warning"]);
const REPORT_REASONS = new Set([
  "harassment",
  "hate_speech",
  "spam",
  "inappropriate",
  "impersonation",
  "other",
]);
const DEVICE_FINGERPRINT_PEPPER = defineSecret("DEVICE_FINGERPRINT_PEPPER");
const ENFORCE_APP_CHECK = defineBoolean("ENFORCE_APP_CHECK", { default: false });
const FINGERPRINT_KEY_VERSION = "v1";

// The runtime accepts Firebase parameter expressions here even though the
// current TypeScript declaration still narrows this option to a plain boolean.
setGlobalOptions({ enforceAppCheck: ENFORCE_APP_CHECK as unknown as boolean });

function normalizeDeviceId(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return DEVICE_ID_PATTERN.test(candidate) ? candidate : "";
}

function hashDeviceId(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeFingerprint(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const text = (key: string, max: number) =>
    typeof source[key] === "string" ? source[key].trim().slice(0, max) : "";
  const number = (key: string, max: number) => {
    const candidate = Number(source[key]);
    return Number.isFinite(candidate) ? Math.max(0, Math.min(max, Math.round(candidate))) : 0;
  };
  const normalized = {
    userAgent: text("userAgent", 300),
    platform: text("platform", 80),
    language: text("language", 30),
    timezone: text("timezone", 80),
    screen: text("screen", 40),
    hardwareConcurrency: number("hardwareConcurrency", 128),
    deviceMemory: number("deviceMemory", 128),
    touchPoints: number("touchPoints", 64),
  };
  return normalized.userAgent && normalized.platform && normalized.timezone
    ? normalized
    : null;
}

function hashFingerprint(
  value: ReturnType<typeof normalizeFingerprint>,
  pepper: string
) {
  if (!value) return "";
  return createHmac("sha256", pepper)
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function normalizeDeviceLabel(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120)
    : "Unknown browser";
}

function getRequestIp(rawRequest: { ip?: string; headers?: Record<string, unknown> }) {
  const normalized = String(rawRequest.ip || "").replace(/^::ffff:/, "").trim();
  return isIP(normalized) ? normalized : "";
}

const CMS_CALLABLE_ORIGINS = new Set(["https://cms.lap.onl"]);

function getRequestOrigin(rawRequest: { headers?: Record<string, unknown> }) {
  const value = rawRequest.headers?.origin ?? rawRequest.headers?.Origin;
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function isStaffAuthorRole(role: unknown) {
  return typeof role === "string" && RESERVABLE_TEAM_ROLES.includes(role);
}

function isAccountAllowedToParticipate(data: admin.firestore.DocumentData | undefined) {
  if (!data) return false;
  if (data.status === "banned" || data.bannedAt != null) return false;
  const suspendedUntil = data.suspendedUntil;
  const suspensionActive =
    suspendedUntil instanceof admin.firestore.Timestamp &&
    suspendedUntil.toMillis() > Date.now();
  if (suspensionActive) return false;
  return ACTIVE_ACCOUNT_STATUSES.has(data.status || "active") ||
    (data.status === "suspended" && suspendedUntil instanceof admin.firestore.Timestamp);
}

function isActiveReaderAccount(data: admin.firestore.DocumentData | undefined) {
  return Boolean(
    data &&
    data.status !== "banned" &&
    data.bannedAt == null &&
    ACTIVE_ACCOUNT_STATUSES.has(data.status || "active")
  );
}

function isEligibleReaderForTeam(data: admin.firestore.DocumentData | undefined) {
  return Boolean(
    isActiveReaderAccount(data) &&
    !(typeof data?.staffRole === "string" && data.staffRole.length > 0)
  );
}

function safePublicProfile(data: admin.firestore.DocumentData | undefined) {
  return {
    uid: typeof data?.uid === "string" ? data.uid : "",
    displayName: typeof data?.displayName === "string" ? data.displayName : "Reader",
    handle: typeof data?.handle === "string" ? data.handle : "",
    photoURL: typeof data?.photoURL === "string" ? data.photoURL : "",
    createdAt: data?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function sanitizePublicSocials(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 12)) {
    const key = rawKey.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(key) || typeof rawValue !== "string") continue;
    try {
      const parsed = new URL(rawValue.trim());
      if (parsed.protocol === "https:" && parsed.username === "" && parsed.password === "") {
        result[key] = parsed.toString().slice(0, 1000);
      }
    } catch {
      // Invalid and non-HTTPS social links are intentionally omitted publicly.
    }
  }
  return result;
}

function shouldPublishAuthor(data: admin.firestore.DocumentData | undefined) {
  return Boolean(
    data && ["super", "admin", "author", "moderator"].includes(data.role)
  );
}

function safePublicAuthor(data: admin.firestore.DocumentData | undefined, uid: string) {
  const publicKeys = [
    "name", "handle", "job", "city", "avatar", "imgAlt", "imageAlt", "slug",
    "biography", "bio", "socials", "role", "showOnTeam", "createdAt",
    "created_at", "updatedAt", "updated_at",
  ];
  const profile: Record<string, unknown> = { uid };
  for (const key of publicKeys) {
    if (data?.[key] !== undefined) profile[key] = data[key];
  }
  profile.socials = sanitizePublicSocials(data?.socials);
  profile.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  return profile;
}

async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  message: string
) {
  const ref = getDb().collection("rateLimits").doc(key);
  await getDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Date.now();
    const data = snapshot.data();
    const windowStart = data?.windowStart instanceof admin.firestore.Timestamp
      ? data.windowStart.toMillis()
      : 0;
    const inWindow = now - windowStart < windowMs;
    const count = inWindow ? Number(data?.count) || 0 : 0;
    if (count >= limit) {
      throw new HttpsError("resource-exhausted", message);
    }
    transaction.set(ref, {
      count: count + 1,
      windowStart: admin.firestore.Timestamp.fromMillis(inWindow ? windowStart : now),
      expiresAt: admin.firestore.Timestamp.fromMillis(now + windowMs * 2),
    });
  });
}

function normalizeTeamHandle(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "_")
    : "";
}

function getCommenterIdentity(
  author: admin.firestore.DocumentSnapshot,
  user: admin.firestore.DocumentSnapshot,
  action: "comments" | "replies"
) {
  const authorData = author.data() || {};
  const userData = user.data() || {};
  const isStaff =
    author.exists && RESERVABLE_TEAM_ROLES.includes(authorData.role);
  if (!isStaff && (!user.exists || !isAccountAllowedToParticipate(userData))) {
    throw new HttpsError(
      "permission-denied",
      action === "replies"
        ? "This account cannot post replies."
        : "This account cannot post comments."
    );
  }
  const handle = normalizeTeamHandle(
    isStaff ? authorData.handle || userData.handle : userData.handle
  );
  if (!handle) {
    throw new HttpsError(
      "failed-precondition",
      isStaff
        ? "Set your team handle in the CMS before commenting."
        : action === "replies"
          ? "Set your handle before replying."
          : "Set your handle before commenting."
    );
  }
  return {
    handle,
    name: String(
      (isStaff
        ? authorData.name || userData.displayName
        : userData.displayName) || handle
    ),
    photoURL: String(
      (isStaff
        ? authorData.avatar || authorData.photoURL || userData.photoURL
        : userData.photoURL) || ""
    ),
  };
}

export const syncPublicReaderProfile = onDocumentWritten(
  { document: "users/{userId}", region: "europe-west1" },
  async (event) => {
    const publicRef = getDb().collection("publicProfiles").doc(event.params.userId);
    const after = event.data?.after;
    if (!after?.exists) {
      await publicRef.delete().catch((error) => {
        if ((error as { code?: number }).code !== 5) throw error;
      });
      return;
    }
    const data = after.data();
    if (!data) return;
    if (!event.data?.before.exists) {
      await getDb().collection("riskAttestations").doc(event.params.userId).delete().catch((error) => {
        if ((error as { code?: number }).code !== 5) throw error;
      });
    }
    if (data.status === "banned" || data.bannedAt != null) {
      await publicRef.set({
        uid: event.params.userId,
        displayName: "Unavailable user",
        handle: data.handle || "",
        photoURL: "",
        createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }
    await publicRef.set(safePublicProfile({ ...data, uid: event.params.userId }));
  }
);

export const syncPublicAuthorProfile = onDocumentWritten(
  { document: "authors/{userId}", region: "europe-west1" },
  async (event) => {
    const publicRef = getDb().collection("publicAuthors").doc(event.params.userId);
    const after = event.data?.after;
    if (!after?.exists) {
      await publicRef.delete().catch((error) => {
        if ((error as { code?: number }).code !== 5) throw error;
      });
      return;
    }
    const data = after.data();
    if (!shouldPublishAuthor(data)) {
      await publicRef.delete().catch((error) => {
        if ((error as { code?: number }).code !== 5) throw error;
      });
      return;
    }
    await publicRef.set(safePublicAuthor(data, event.params.userId));
  }
);

export const issueDeviceIdentity = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    const deviceId = randomBytes(32).toString("base64url");
    const deviceHash = hashDeviceId(deviceId);
    const clientIp = getRequestIp(request.rawRequest);
    if (clientIp) {
      await enforceRateLimit(
        `device_issue_${hashDeviceId(clientIp)}`,
        1000,
        60 * 60_000,
        "Too many browser identities were requested from this network. Please try again later."
      );
    }
    await getDb().collection("deviceIdentityRegistry").doc(deviceHash).create({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60_000),
      ...(clientIp ? { issuedNetworkHash: hashDeviceId(clientIp) } : {}),
    });
    return { deviceId };
  }
);

export const backfillPublicProfiles = onCall(
  { region: "europe-west1", minInstances: 0, timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const caller = await getDb().collection("authors").doc(request.auth.uid).get();
    if (!caller.exists || !["admin", "super"].includes(caller.data()?.role)) {
      throw new HttpsError("permission-denied", "Only administrators can backfill public profiles.");
    }
    const [users, authors] = await Promise.all([
      getDb().collection("users").get(),
      getDb().collection("authors").get(),
    ]);
    for (let offset = 0; offset < users.docs.length; offset += 400) {
      const batch = getDb().batch();
      users.docs.slice(offset, offset + 400).forEach((snapshot) => {
        const data = snapshot.data();
        const publicRef = getDb().collection("publicProfiles").doc(snapshot.id);
        batch.set(publicRef, data.status === "banned" || data.bannedAt != null
          ? {
              uid: snapshot.id,
              displayName: "Unavailable user",
              handle: data.handle || "",
              photoURL: "",
              createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }
          : safePublicProfile({ ...data, uid: snapshot.id }));
      });
      await batch.commit();
    }
    for (let offset = 0; offset < authors.docs.length; offset += 400) {
      const batch = getDb().batch();
      authors.docs.slice(offset, offset + 400).forEach((snapshot) => {
        const publicRef = getDb().collection("publicAuthors").doc(snapshot.id);
        if (shouldPublishAuthor(snapshot.data())) {
          batch.set(publicRef, safePublicAuthor(snapshot.data(), snapshot.id));
        } else {
          batch.delete(publicRef);
        }
      });
      await batch.commit();
    }
    return { updatedReaders: users.size, updatedAuthors: authors.size };
  }
);

type BanSignalCollection = "bannedDevices" | "bannedFingerprints";

type BanSignalAssociation = {
  targetUid: string;
  targetHandle: string;
  reason: string;
  blockedBy: string;
  label?: string;
  blockedAt: admin.firestore.Timestamp;
};

function getActiveBanTargetUids(
  data: admin.firestore.DocumentData | undefined
) {
  const targetUids = new Set<string>();
  if (Array.isArray(data?.targetUids)) {
    data.targetUids.forEach((value: unknown) => {
      if (typeof value === "string" && value) targetUids.add(value);
    });
  }
  // Legacy signal documents had a single owner. Reading it here makes the
  // schema backward-compatible; the next add/remove transaction migrates it.
  if (typeof data?.targetUid === "string" && data.targetUid) {
    targetUids.add(data.targetUid);
  }
  return targetUids;
}

function getActiveBanAssociations(
  data: admin.firestore.DocumentData | undefined
) {
  const associations: Record<string, BanSignalAssociation> = {};
  if (
    data?.activeAssociations &&
    typeof data.activeAssociations === "object" &&
    !Array.isArray(data.activeAssociations)
  ) {
    Object.entries(data.activeAssociations).forEach(([uid, value]) => {
      if (!uid || !value || typeof value !== "object") return;
      const association = value as Partial<BanSignalAssociation>;
      associations[uid] = {
        targetUid: uid,
        targetHandle:
          typeof association.targetHandle === "string"
            ? association.targetHandle
            : "reader",
        reason:
          typeof association.reason === "string"
            ? association.reason
            : "Community Guidelines violation",
        blockedBy:
          typeof association.blockedBy === "string"
            ? association.blockedBy
            : "system",
        ...(typeof association.label === "string"
          ? { label: association.label }
          : {}),
        blockedAt:
          association.blockedAt instanceof admin.firestore.Timestamp
            ? association.blockedAt
            : admin.firestore.Timestamp.now(),
      };
    });
  }

  const legacyUid = typeof data?.targetUid === "string" ? data.targetUid : "";
  if (legacyUid && !associations[legacyUid]) {
    associations[legacyUid] = {
      targetUid: legacyUid,
      targetHandle:
        typeof data?.targetHandle === "string" ? data.targetHandle : "reader",
      reason:
        typeof data?.reason === "string"
          ? data.reason
          : "Community Guidelines violation",
      blockedBy:
        typeof data?.blockedBy === "string" ? data.blockedBy : "system",
      ...(typeof data?.label === "string" ? { label: data.label } : {}),
      blockedAt:
        data?.blockedAt instanceof admin.firestore.Timestamp
          ? data.blockedAt
          : admin.firestore.Timestamp.now(),
    };
  }
  getActiveBanTargetUids(data).forEach((uid) => {
    if (associations[uid]) return;
    const latest =
      data?.latestAssociation &&
      typeof data.latestAssociation === "object" &&
      data.latestAssociation.targetUid === uid
        ? (data.latestAssociation as Partial<BanSignalAssociation>)
        : {};
    associations[uid] = {
      targetUid: uid,
      targetHandle:
        typeof latest.targetHandle === "string" ? latest.targetHandle : "reader",
      reason:
        typeof latest.reason === "string"
          ? latest.reason
          : "Community Guidelines violation",
      blockedBy:
        typeof latest.blockedBy === "string" ? latest.blockedBy : "system",
      ...(typeof latest.label === "string" ? { label: latest.label } : {}),
      blockedAt:
        latest.blockedAt instanceof admin.firestore.Timestamp
          ? latest.blockedAt
          : admin.firestore.Timestamp.now(),
    };
  });
  return associations;
}

function hasActiveBanSignal(
  snapshot: admin.firestore.DocumentSnapshot | null
) {
  return Boolean(snapshot?.exists && getActiveBanTargetUids(snapshot.data()).size > 0);
}

async function addBanSignalAssociation(params: {
  collection: BanSignalCollection;
  signalHash: string;
  targetUid: string;
  targetHandle: string;
  reason: string;
  blockedBy: string;
  label?: string;
}) {
  const firestore = getDb();
  const signalRef = firestore.collection(params.collection).doc(params.signalHash);
  await firestore.runTransaction(async (transaction) => {
    const signal = await transaction.get(signalRef);
    const signalData = signal.data();
    const targetUids = getActiveBanTargetUids(signalData);
    const activeAssociations = getActiveBanAssociations(signalData);
    const now = admin.firestore.Timestamp.now();
    const association: BanSignalAssociation = {
      targetUid: params.targetUid,
      targetHandle: params.targetHandle,
      reason: params.reason,
      blockedBy: params.blockedBy,
      ...(params.label ? { label: params.label } : {}),
      blockedAt: now,
    };
    targetUids.add(params.targetUid);
    activeAssociations[params.targetUid] = association;

    transaction.set(
      signalRef,
      {
        [params.collection === "bannedDevices"
          ? "deviceHash"
          : "fingerprintHash"]: params.signalHash,
        ...(params.collection === "bannedFingerprints"
          ? { fingerprintKeyVersion: FINGERPRINT_KEY_VERSION }
          : {}),
        ...(params.collection === "bannedDevices"
          ? { label: params.label || signalData?.label || "Unknown browser" }
          : {}),
        targetUids: [...targetUids],
        activeAssociations,
        firstBlockedAt:
          signalData?.firstBlockedAt || signalData?.blockedAt || now,
        latestAssociation: association,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Remove the ambiguous single-account schema as part of every write.
        targetUid: admin.firestore.FieldValue.delete(),
        targetHandle: admin.firestore.FieldValue.delete(),
        reason: admin.firestore.FieldValue.delete(),
        blockedBy: admin.firestore.FieldValue.delete(),
        blockedAt: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
  });
}

async function removeBanSignalAssociation(params: {
  collection: BanSignalCollection;
  signalHash: string;
  targetUid: string;
}) {
  const firestore = getDb();
  const signalRef = firestore.collection(params.collection).doc(params.signalHash);
  return firestore.runTransaction(async (transaction) => {
    const signal = await transaction.get(signalRef);
    if (!signal.exists) return { associationRemoved: false, signalDeleted: false };

    const targetUids = getActiveBanTargetUids(signal.data());
    const activeAssociations = getActiveBanAssociations(signal.data());
    if (!targetUids.delete(params.targetUid)) {
      return { associationRemoved: false, signalDeleted: false };
    }
    delete activeAssociations[params.targetUid];

    if (targetUids.size === 0) {
      transaction.delete(signalRef);
      return { associationRemoved: true, signalDeleted: true };
    }

    const remainingAssociations = Object.values(activeAssociations);
    transaction.set(
      signalRef,
      {
        targetUids: [...targetUids],
        activeAssociations,
        latestAssociation:
          remainingAssociations[remainingAssociations.length - 1] ||
          admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        targetUid: admin.firestore.FieldValue.delete(),
        targetHandle: admin.firestore.FieldValue.delete(),
        reason: admin.firestore.FieldValue.delete(),
        blockedBy: admin.firestore.FieldValue.delete(),
        blockedAt: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
    return { associationRemoved: true, signalDeleted: false };
  });
}

async function recordRiskAlert(params: {
  riskType: "fingerprint_match" | "blocked_device_match";
  observedUid: string;
  observedHandle: string;
  deviceHash: string;
  deviceLabel: string;
  signalHash: string;
  matchedTargetUids: string[];
  clientIp: string;
  accessBlocked: boolean;
}) {
  const firestore = getDb();
  const alertId = createHash("sha256")
    .update(
      `${params.riskType}:${params.observedUid}:${params.signalHash}`,
      "utf8"
    )
    .digest("hex");
  const alertRef = firestore.collection("riskAlerts").doc(alertId);
  const shouldNotify = await firestore.runTransaction(async (transaction) => {
    const alert = await transaction.get(alertRef);
    const existingTargets = Array.isArray(alert.data()?.matchedTargetUids)
      ? alert.data()!.matchedTargetUids.filter(
          (value: unknown): value is string => typeof value === "string"
        )
      : [];
    transaction.set(
      alertRef,
      {
        type: params.riskType,
        status: "open",
        observedUid: params.observedUid,
        observedHandle: params.observedHandle,
        deviceHash: params.deviceHash,
        deviceLabel: params.deviceLabel,
        ...(params.riskType === "fingerprint_match"
          ? { fingerprintHash: params.signalHash }
          : { blockedDeviceHash: params.signalHash }),
        matchedTargetUids: [
          ...new Set([...existingTargets, ...params.matchedTargetUids]),
        ],
        ...(params.clientIp ? { lastObservedIp: params.clientIp } : {}),
        ...(!alert.exists
          ? { firstSeenAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        occurrenceCount: admin.firestore.FieldValue.increment(1),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60_000),
      },
      { merge: true }
    );
    return !alert.exists || !alert.data()?.notificationDeliveredAt;
  });

  if (!shouldNotify) return;
  try {
    const staff = await firestore
      .collection("authors")
      .where("role", "in", ["super", "admin", "moderator"])
      .get();
    if (staff.empty) {
      logger.warn("Device risk alert has no moderation recipients", {
        alertId,
        observedUid: params.observedUid,
      });
      return;
    }

    for (let offset = 0; offset < staff.docs.length; offset += 400) {
      const batch = firestore.batch();
      staff.docs.slice(offset, offset + 400).forEach((staffMember) => {
        const notificationRef = firestore
          .collection("users")
          .doc(staffMember.id)
          .collection("notifications")
          .doc(`risk-${alertId}`);
        batch.set(notificationRef, {
          userId: staffMember.id,
          type: "user_report",
          title:
            params.riskType === "fingerprint_match"
              ? "Security review: browser fingerprint match"
              : "Security review: blocked browser installation used",
          message:
            params.riskType === "fingerprint_match"
              ? `@${params.observedHandle || "reader"} matched a fingerprint associated with a banned account. Access was not automatically blocked because browser fingerprints can collide or be spoofed.`
              : `@${params.observedHandle || "reader"} used an exact browser installation associated with a banned account. ${params.accessBlocked ? "The reader session was blocked without banning the account." : "The vetted staff session was allowed under the staff bypass and requires review."}`,
          link: `/admin/users?id=${encodeURIComponent(params.observedUid)}`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          metadata: {
            riskAlertId: alertId,
            observedUid: params.observedUid,
            observedHandle: params.observedHandle,
            riskType: params.riskType,
          },
        });
      });
      await batch.commit();
    }
    await alertRef.set(
      {
        notificationDeliveredAt: admin.firestore.FieldValue.serverTimestamp(),
        notificationRecipientCount: staff.size,
      },
      { merge: true }
    );
  } catch (error) {
    // The durable alert remains without notificationDeliveredAt, so a later
    // sync retries delivery without turning this non-blocking signal into a ban.
    logger.error("Unable to deliver device risk notifications", {
      alertId,
      observedUid: params.observedUid,
      error,
    });
  }
}

export const checkDeviceRisk = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    const deviceId = normalizeDeviceId(request.data?.deviceId);
    if (!deviceId) {
      throw new HttpsError("invalid-argument", "A valid browser installation ID is required.");
    }
    const deviceHash = hashDeviceId(deviceId);
    const [registeredDevice, blockedDevice] = await Promise.all([
      getDb().collection("deviceIdentityRegistry").doc(deviceHash).get(),
      getDb().collection("bannedDevices").doc(deviceHash).get(),
    ]);
    if (!registeredDevice.exists) {
      throw new HttpsError("failed-precondition", "This browser identity must be issued by the server.");
    }
    const blocked = hasActiveBanSignal(blockedDevice);
    return {
      blocked,
      reason: blocked
        ? "This browser installation has been blocked for Community Guidelines violations."
        : "",
    };
  }
);

export const syncUserRisk = onCall(
  {
    region: "europe-west1",
    minInstances: 0,
    secrets: [DEVICE_FINGERPRINT_PEPPER],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const deviceId = normalizeDeviceId(request.data?.deviceId);
    if (!deviceId) {
      throw new HttpsError("invalid-argument", "A valid browser installation ID is required.");
    }

    const uid = request.auth.uid;
    const deviceHash = hashDeviceId(deviceId);
    const fingerprintHash = hashFingerprint(
      normalizeFingerprint(request.data?.fingerprint),
      DEVICE_FINGERPRINT_PEPPER.value()
    );
    const deviceLabel = normalizeDeviceLabel(request.data?.deviceLabel);
    const clientIp = getRequestIp(request.rawRequest);
    const firestore = getDb();
    const [registeredDevice, blockedDevice, blockedFingerprint, staffDoc, userDoc, knownDevice] = await Promise.all([
      firestore.collection("deviceIdentityRegistry").doc(deviceHash).get(),
      firestore.collection("bannedDevices").doc(deviceHash).get(),
      fingerprintHash
        ? firestore.collection("bannedFingerprints").doc(fingerprintHash).get()
        : Promise.resolve(null),
      firestore.collection("authors").doc(uid).get(),
      firestore.collection("users").doc(uid).get(),
      firestore.collection("users").doc(uid).collection("devices").doc(deviceHash).get(),
    ]);

    if (!registeredDevice.exists) {
      throw new HttpsError("failed-precondition", "This browser identity must be issued by the server.");
    }

    const now = admin.firestore.Timestamp.now();
    const userData = userDoc.data() || {};
    const isStaffAccount =
      staffDoc.exists && RESERVABLE_TEAM_ROLES.includes(staffDoc.data()?.role);
    const accountIsPermanentlyBanned =
      !isStaffAccount &&
      userDoc.exists &&
      (userData.status === "banned" || userData.bannedAt != null);
    const blockedDeviceMatch = hasActiveBanSignal(blockedDevice);
    const blockedFingerprintMatch = hasActiveBanSignal(blockedFingerprint);
    const previousHashes = Array.isArray(userData.deviceHashes)
      ? userData.deviceHashes.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const previousIps = Array.isArray(userData.ipHistory)
      ? userData.ipHistory.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const previousFingerprints = Array.isArray(userData.fingerprintHashes)
      ? userData.fingerprintHashes.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const deviceHashes = [...new Set([...previousHashes, deviceHash])].slice(-10);
    const fingerprintHashes = fingerprintHash
      ? [...new Set([...previousFingerprints, fingerprintHash])].slice(-10)
      : previousFingerprints.slice(-10);
    const ipHistory = clientIp
      ? [...new Set([...previousIps, clientIp])].slice(-10)
      : previousIps.slice(-10);

    const batch = firestore.batch();
    if (userDoc.exists) {
      batch.set(userDoc.ref, {
        deviceHashes,
        fingerprintHashes,
        fingerprintKeyVersion: FINGERPRINT_KEY_VERSION,
        lastDeviceHash: deviceHash,
        lastDeviceLabel: deviceLabel,
        ...(fingerprintHash ? { lastFingerprintHash: fingerprintHash } : {}),
        ...(blockedDeviceMatch ? {
          deviceRiskMatch: true,
          deviceRiskMatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        } : {}),
        ...(blockedFingerprintMatch ? {
          fingerprintRiskMatch: true,
          fingerprintRiskMatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        } : {}),
        ...(clientIp ? { lastIp: clientIp, ipHistory } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      batch.set(firestore.collection("riskAttestations").doc(uid), {
        uid,
        deviceHash,
        ...(fingerprintHash ? { fingerprintHash } : {}),
        fingerprintKeyVersion: FINGERPRINT_KEY_VERSION,
        deviceRiskMatch: blockedDeviceMatch,
        fingerprintRiskMatch: blockedFingerprintMatch,
        verifiedAt: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 15 * 60_000),
      });
    }
    batch.set(
      userDoc.ref.collection("devices").doc(deviceHash),
      {
        deviceHash,
        ...(fingerprintHash ? { fingerprintHash } : {}),
        fingerprintKeyVersion: FINGERPRINT_KEY_VERSION,
        label: deviceLabel,
        ...(clientIp ? { lastIp: clientIp } : {}),
        ...(!knownDevice.exists
          ? { firstSeenAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
        lastSeenAt: now,
      },
      { merge: true }
    );
    batch.set(registeredDevice.ref, {
      lastSeenAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 90 * 24 * 60 * 60_000),
    }, { merge: true });
    await batch.commit();

    const staffData = staffDoc.data() || {};
    const observedHandle =
      (typeof userData.handle === "string" && userData.handle) ||
      (typeof staffData.handle === "string" && staffData.handle) ||
      (typeof staffData.name === "string" && staffData.name) ||
      "reader";

    // A permanently banned account cannot evade its ban by clearing site data
    // and receiving a fresh installation ID. Associate every newly observed
    // exact ID (and its fingerprint signal) with the existing ban before
    // returning the blocked response.
    if (accountIsPermanentlyBanned) {
      const banReason =
        typeof userData.banReason === "string" && userData.banReason
          ? userData.banReason
          : "Community Guidelines violation";
      const bannedBy =
        typeof userData.bannedBy === "string" && userData.bannedBy
          ? userData.bannedBy
          : "system";
      await Promise.all([
        addBanSignalAssociation({
          collection: "bannedDevices",
          signalHash: deviceHash,
          targetUid: uid,
          targetHandle: observedHandle,
          reason: banReason,
          blockedBy: bannedBy,
        }),
        ...(fingerprintHash
          ? [
              addBanSignalAssociation({
                collection: "bannedFingerprints" as const,
                signalHash: fingerprintHash,
                targetUid: uid,
                targetHandle: observedHandle,
                reason: banReason,
                blockedBy: bannedBy,
              }),
            ]
          : []),
      ]);
      await userDoc.ref.set(
        {
          bannedDeviceHashes: admin.firestore.FieldValue.arrayUnion(deviceHash),
          ...(fingerprintHash
            ? {
                bannedFingerprintHashes:
                  admin.firestore.FieldValue.arrayUnion(fingerprintHash),
              }
            : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return {
        blocked: true,
        reason: "This account has been permanently blocked for Community Guidelines violations.",
        riskFlagged: blockedFingerprintMatch,
        riskReason: blockedFingerprintMatch ? "fingerprint_match" : "",
      };
    }

    if (blockedFingerprintMatch && fingerprintHash) {
      await recordRiskAlert({
        riskType: "fingerprint_match",
        observedUid: uid,
        observedHandle,
        deviceHash,
        deviceLabel,
        signalHash: fingerprintHash,
        matchedTargetUids: [...getActiveBanTargetUids(blockedFingerprint?.data())],
        clientIp,
        accessBlocked: blockedDeviceMatch && !isStaffAccount,
      });
    }

    if (blockedDeviceMatch) {
      await recordRiskAlert({
        riskType: "blocked_device_match",
        observedUid: uid,
        observedHandle,
        deviceHash,
        deviceLabel,
        signalHash: deviceHash,
        matchedTargetUids: [...getActiveBanTargetUids(blockedDevice.data())],
        clientIp,
        accessBlocked: !isStaffAccount,
      });
    }

    // Exact installation matches block reader sessions, but never mutate or
    // disable an otherwise innocent account. A shared computer can legitimately
    // be used by more than one person. Staff accounts remain exempt from reader
    // moderation by design; staff compromise/offboarding uses the team controls.
    if (blockedDeviceMatch && !isStaffAccount) {
      return {
        blocked: true,
        reason: "This browser installation has been blocked for Community Guidelines violations.",
        riskFlagged: blockedFingerprintMatch,
        riskReason: blockedFingerprintMatch ? "fingerprint_match" : "blocked_device",
      };
    }

    return {
      blocked: false,
      riskFlagged: blockedFingerprintMatch || blockedDeviceMatch,
      riskReason: blockedFingerprintMatch
        ? "fingerprint_match"
        : blockedDeviceMatch
          ? "staff_device_bypass"
          : "",
      staffBypass: isStaffAccount && blockedDeviceMatch,
    };
  }
);

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        const cleanItem = stripUndefinedDeep(item);
        if (cleanItem !== undefined) sanitized[key] = cleanItem;
      }
      return sanitized;
    }
  }
  return value;
}

function isSystemAuditActor(actorUid: string, authType?: string) {
  return (
    authType === "service_account" ||
    authType === "system" ||
    authType === "api_key" ||
    /gserviceaccount\.com$/i.test(actorUid)
  );
}

function pickAuditName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickAuditHandle(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/^@/, "") : "";
}

async function writeServerAuditLog(params: {
  actorUid: string;
  action: string;
  category: "articles" | "comments" | "team" | "handles" | "assets" | "auth" | "profile";
  details: string;
  targetId?: string;
  targetTitle?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  authType?: string;
  actorHint?: {
    name?: string;
    handle?: string;
    role?: string;
    email?: string;
    photoURL?: string;
  };
}) {
  const firestore = getDb();
  const hint = params.actorHint || {};
  let actorName = "";
  let actorHandle = "";
  let actorRole = "";
  let actorEmail = "";
  let actorPhotoURL = "";

  if (isSystemAuditActor(params.actorUid, params.authType)) {
    actorName = "System";
    actorRole = "system";
    actorEmail = params.actorUid.includes("@") ? params.actorUid : "";
  } else {
    try {
      const [authorDoc, userDoc, authUser] = await Promise.all([
        firestore.collection("authors").doc(params.actorUid).get(),
        firestore.collection("users").doc(params.actorUid).get(),
        admin.auth().getUser(params.actorUid).catch(() => null),
      ]);
      const authorData = authorDoc.exists ? authorDoc.data() : undefined;
      const userData = userDoc.exists ? userDoc.data() : undefined;
      actorName =
        pickAuditName(authorData?.name) ||
        pickAuditName(userData?.staffName) ||
        pickAuditName(userData?.displayName) ||
        pickAuditName(authUser?.displayName) ||
        pickAuditName(hint.name) ||
        pickAuditName(authUser?.email?.split("@")[0]) ||
        params.actorUid;
      actorHandle =
        pickAuditHandle(authorData?.handle) ||
        pickAuditHandle(userData?.handle) ||
        pickAuditHandle(hint.handle) ||
        pickAuditHandle(authUser?.email?.split("@")[0]) ||
        "";
      actorRole =
        pickAuditHandle(authorData?.role) ||
        pickAuditHandle(hint.role) ||
        (authorDoc.exists ? "staff" : "user");
      actorEmail =
        authUser?.email ||
        pickAuditName(userData?.email) ||
        pickAuditName(hint.email) ||
        "";
      actorPhotoURL =
        pickAuditName(authorData?.avatar) ||
        pickAuditName(userData?.photoURL) ||
        authUser?.photoURL ||
        pickAuditName(hint.photoURL) ||
        "";
    } catch (e) {
      logger.warn("Could not enrich server audit log actor details:", e);
      actorName = pickAuditName(hint.name) || params.actorUid;
      actorHandle = pickAuditHandle(hint.handle) || "";
      actorRole = pickAuditHandle(hint.role) || "user";
      actorEmail = pickAuditName(hint.email) || "";
    }
  }

  const auditData = stripUndefinedDeep({
      actorUid: params.actorUid,
      actorName,
      actorHandle,
      actorEmail,
      actorRole,
      actorPhotoURL,
      action: params.action,
      category: params.category,
      details: params.details,
      targetId: params.targetId || "",
      targetTitle: params.targetTitle || "",
      metadata: params.metadata || {},
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60_000),
    }) as admin.firestore.DocumentData;

  if (params.idempotencyKey) {
    const auditId = createHash("sha256")
      .update(params.idempotencyKey, "utf8")
      .digest("hex");
    await firestore.collection("auditLogs").doc(auditId).set(auditData);
  } else {
    await firestore.collection("auditLogs").add(auditData);
  }
}

function changedTopLevelKeys(
  before: admin.firestore.DocumentData | undefined,
  after: admin.firestore.DocumentData | undefined
) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])).slice(0, 50);
}

async function auditAuthenticatedClientWrite(params: {
  eventId: string;
  actorUid?: string;
  authType?: string;
  collection: string;
  documentId: string;
  category: "articles" | "comments" | "team" | "profile";
  before: admin.firestore.DocumentData | undefined;
  after: admin.firestore.DocumentData | undefined;
}) {
  if (!params.actorUid) return;
  const operation = !params.before ? "create" : !params.after ? "delete" : "update";
  const snapshot = params.after || params.before;
  const actorHint =
    params.documentId === params.actorUid
      ? {
          name: pickAuditName(snapshot?.name) || pickAuditName(snapshot?.displayName) || pickAuditName(snapshot?.staffName),
          handle: pickAuditHandle(snapshot?.handle),
          role: pickAuditHandle(snapshot?.role),
          email: pickAuditName(snapshot?.email),
          photoURL: pickAuditName(snapshot?.avatar) || pickAuditName(snapshot?.photoURL),
        }
      : undefined;
  await writeServerAuditLog({
    actorUid: params.actorUid,
    authType: params.authType,
    actorHint,
    action: `${params.collection}.${operation}`,
    category: params.category,
    details: `${operation} ${params.collection} record ${params.documentId}`,
    targetId: params.documentId,
    targetTitle:
      params.after?.title || params.before?.title ||
      params.after?.name || params.before?.name || params.documentId,
    metadata: {
      source: "authenticated_firestore_write",
      changedFields: changedTopLevelKeys(params.before, params.after),
    },
    idempotencyKey: `firestore:${params.eventId}`,
  });
}

export const auditClientArticleWrite = onDocumentWrittenWithAuthContext(
  { document: "articles/{documentId}", region: "europe-west1" },
  async (event) => auditAuthenticatedClientWrite({
    eventId: event.id,
    actorUid: event.authId,
    authType: event.authType,
    collection: "article",
    documentId: event.params.documentId,
    category: "articles",
    before: event.data?.before.exists ? event.data.before.data() : undefined,
    after: event.data?.after.exists ? event.data.after.data() : undefined,
  })
);

export const auditClientArticleTrashWrite = onDocumentWrittenWithAuthContext(
  { document: "articleTrash/{documentId}", region: "europe-west1" },
  async (event) => auditAuthenticatedClientWrite({
    eventId: event.id,
    actorUid: event.authId,
    authType: event.authType,
    collection: "article_trash",
    documentId: event.params.documentId,
    category: "articles",
    before: event.data?.before.exists ? event.data.before.data() : undefined,
    after: event.data?.after.exists ? event.data.after.data() : undefined,
  })
);

export const auditClientAuthorWrite = onDocumentWrittenWithAuthContext(
  { document: "authors/{documentId}", region: "europe-west1" },
  async (event) => auditAuthenticatedClientWrite({
    eventId: event.id,
    actorUid: event.authId,
    authType: event.authType,
    collection: "author_profile",
    documentId: event.params.documentId,
    category: "profile",
    before: event.data?.before.exists ? event.data.before.data() : undefined,
    after: event.data?.after.exists ? event.data.after.data() : undefined,
  })
);

export const auditClientCommentWrite = onDocumentWrittenWithAuthContext(
  { document: "comments/{documentId}", region: "europe-west1" },
  async (event) => auditAuthenticatedClientWrite({
    eventId: event.id,
    actorUid: event.authId,
    authType: event.authType,
    collection: "comment",
    documentId: event.params.documentId,
    category: "comments",
    before: event.data?.before.exists ? event.data.before.data() : undefined,
    after: event.data?.after.exists ? event.data.after.data() : undefined,
  })
);

export const auditClientReplyWrite = onDocumentWrittenWithAuthContext(
  { document: "commentReplies/{documentId}", region: "europe-west1" },
  async (event) => auditAuthenticatedClientWrite({
    eventId: event.id,
    actorUid: event.authId,
    authType: event.authType,
    collection: "comment_reply",
    documentId: event.params.documentId,
    category: "comments",
    before: event.data?.before.exists ? event.data.before.data() : undefined,
    after: event.data?.after.exists ? event.data.after.data() : undefined,
  })
);

export const auditClientReaderProfileWrite = onDocumentWrittenWithAuthContext(
  { document: "users/{documentId}", region: "europe-west1" },
  async (event) => auditAuthenticatedClientWrite({
    eventId: event.id,
    actorUid: event.authId,
    authType: event.authType,
    collection: "reader_profile",
    documentId: event.params.documentId,
    category: "profile",
    before: event.data?.before.exists ? event.data.before.data() : undefined,
    after: event.data?.after.exists ? event.data.after.data() : undefined,
  })
);




function getHandleReservationKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z]/g, "")
    : "";
}

function getConfusableBrandKey(value: unknown) {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/1/g, "l")
        .replace(/4/g, "a")
        .replace(/9/g, "p")
        .replace(/[^a-z]/g, "")
    : "";
}

function isProtectedBrandKey(value: string) {
  return /^(official|real|the|team|weare|my)?(lap|arclapain)/.test(value);
}

async function claimHandleForUser(
  uid: string,
  value: unknown,
  options: {
    allowChange?: boolean;
    allowUnassignedReservation?: boolean;
    requireTeamMember?: boolean;
    syncExistingComments?: boolean;
  } = {}
) {
  const firestore = getDb();
  const handle = normalizeTeamHandle(value);
  if (!TEAM_HANDLE_PATTERN.test(handle)) {
    throw new HttpsError(
      "invalid-argument",
      "Use 3-20 lowercase letters, numbers, hyphens, or underscores."
    );
  }

  const userRecord = await admin.auth().getUser(uid);
  const authorRef = firestore.collection("authors").doc(uid);
  const userRef = firestore.collection("users").doc(uid);
  const handleRef = firestore.collection("handles").doc(handle);
  const reservationKey = getHandleReservationKey(handle);
  const reservationRef = firestore
    .collection("handleReservations")
    .doc(reservationKey);

  await firestore.runTransaction(async (transaction) => {
    const [authorSnapshot, userSnapshot, handleSnapshot, reservationSnapshot] =
      await Promise.all([
        transaction.get(authorRef),
        transaction.get(userRef),
        transaction.get(handleRef),
        transaction.get(reservationRef),
      ]);

    const currentAuthorHandle = normalizeTeamHandle(
      authorSnapshot.data()?.handle
    );
    const currentPublicHandle = normalizeTeamHandle(userSnapshot.data()?.handle);
    const oldHandles = [...new Set([currentAuthorHandle, currentPublicHandle])]
      .filter((oldHandle) => oldHandle && oldHandle !== handle);

    // CRITICAL: All reads must happen before any writes in a Firestore transaction!
    const oldHandleSnapshots = await Promise.all(
      oldHandles.map((oldHandle) =>
        transaction.get(firestore.collection("handles").doc(oldHandle))
      )
    );

    if (
      options.requireTeamMember &&
      (!authorSnapshot.exists ||
        !RESERVABLE_TEAM_ROLES.includes(authorSnapshot.data()?.role))
    ) {
      throw new HttpsError(
        "permission-denied",
        "Only L.A.P team members can claim a team handle."
      );
    }

    if (
      !options.allowChange &&
      ((currentAuthorHandle && currentAuthorHandle !== handle) ||
        (currentPublicHandle && currentPublicHandle !== handle))
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Handles cannot be changed after account setup."
      );
    }

    if (handleSnapshot.exists && handleSnapshot.data()?.uid !== uid) {
      throw new HttpsError("already-exists", "That handle is already taken.");
    }

    const reservationOwnerUid = reservationSnapshot.data()?.ownerUid;
    const canAssignReservation =
      options.allowUnassignedReservation || reservationOwnerUid === uid;
    if (
      reservationSnapshot.exists &&
      reservationOwnerUid !== uid &&
      !canAssignReservation
    ) {
      throw new HttpsError(
        "already-exists",
        "That handle is reserved for another L.A.P team member."
      );
    }

    if (
      !reservationSnapshot.exists &&
      (isProtectedBrandKey(reservationKey) ||
        isProtectedBrandKey(getConfusableBrandKey(handle)))
    ) {
      throw new HttpsError(
        "permission-denied",
        "That official handle must be assigned through team handle reservations."
      );
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    if (reservationSnapshot.exists && options.allowUnassignedReservation) {
      transaction.set(
        reservationRef,
        { ownerUid: uid, updatedAt: timestamp },
        { merge: true }
      );
    }

    oldHandleSnapshots.forEach((snapshot) => {
      if (snapshot.exists && snapshot.data()?.uid === uid) {
        transaction.delete(snapshot.ref);
      }
    });

    if (authorSnapshot.exists && currentAuthorHandle !== handle) {
      transaction.set(authorRef, { handle }, { merge: true });
    }

    transaction.set(
      handleRef,
      {
        uid,
        ...(!handleSnapshot.exists ? { createdAt: timestamp } : {}),
        updatedAt: timestamp,
      },
      { merge: true }
    );

    const authorData = authorSnapshot.data();
    transaction.set(
      userRef,
      {
        uid,
        email: userRecord.email || "",
        displayName: handle,
        photoURL:
          (typeof authorData?.avatar === "string" && authorData.avatar) ||
          (typeof userSnapshot.data()?.photoURL === "string" &&
            userSnapshot.data()?.photoURL) ||
          userRecord.photoURL ||
          "",
        provider: userRecord.providerData[0]?.providerId || "password",
        handle,
        ...(authorSnapshot.exists
          ? {
              staffName:
                typeof authorData?.name === "string" ? authorData.name : handle,
              staffRole: authorData?.role,
            }
          : {}),
        ...(!userSnapshot.exists ? { createdAt: timestamp } : {}),
        updatedAt: timestamp,
      },
      { merge: true }
    );
  });

  await admin.auth().updateUser(uid, { displayName: handle });

  if (options.syncExistingComments) {
    try {
      const [author, comments, replies] = await Promise.all([
        firestore.collection("authors").doc(uid).get(),
        firestore.collection("comments").where("authorId", "==", uid).get(),
        firestore
          .collection("commentReplies")
          .where("authorId", "==", uid)
          .get(),
      ]);
      const authoredEntries = [...comments.docs, ...replies.docs];
      for (let offset = 0; offset < authoredEntries.length; offset += 400) {
        const batch = firestore.batch();
        authoredEntries.slice(offset, offset + 400).forEach((entry) => {
          batch.update(entry.ref, {
            authorHandle: handle,
            ...(!author.exists ? { authorName: handle } : {}),
          });
        });
        await batch.commit();
      }
    } catch (error) {
      logger.error("The handle changed, but older comments could not be synced", {
        uid,
        handle,
        error,
      });
    }
  }

  return handle;
}

async function claimTeamHandleForUser(uid: string, value: unknown) {
  return claimHandleForUser(uid, value, { requireTeamMember: true });
}

async function requireSuperAdmin(uid: string) {
  const caller = await getDb().collection("authors").doc(uid).get();
  if (!caller.exists || caller.data()?.role !== "super") {
    throw new HttpsError(
      "permission-denied",
      "Only a super admin can manage the handle registry."
    );
  }
}

export const syncTeamPublicProfile = onDocumentWritten(
  { document: "authors/{uid}", region: "europe-west1" },
  async (event) => {
    const authorSnapshot = event.data?.after;
    if (!authorSnapshot?.exists) return;

    const authorData = authorSnapshot.data();
    if (!authorData) return;
    if (!RESERVABLE_TEAM_ROLES.includes(authorData.role)) return;

    const handle = normalizeTeamHandle(authorData.handle);
    if (!handle) return;

    try {
      await claimTeamHandleForUser(event.params.uid, handle);
    } catch (error) {
      logger.error("Failed to sync the team member's public profile", {
        uid: event.params.uid,
        error,
      });
    }
  }
);

export const claimTeamHandle = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const handle = await claimTeamHandleForUser(
      request.auth.uid,
      request.data?.handle
    );
    return { handle };
  }
);

export const setUserHandle = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    await requireSuperAdmin(request.auth.uid);

    const targetUid = request.data?.uid;
    if (typeof targetUid !== "string" || !targetUid.trim()) {
      throw new HttpsError("invalid-argument", "Choose an account.");
    }

    const handle = await claimHandleForUser(targetUid, request.data?.handle, {
      allowChange: true,
      allowUnassignedReservation: true,
      syncExistingComments: true,
    });
    return { handle };
  }
);

export const listHandleRegistry = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    await requireSuperAdmin(request.auth.uid);

    const firestore = getDb();
    const [authors, users, handles, reservations, config] = await Promise.all([
      firestore.collection("authors").get(),
      firestore.collection("users").get(),
      firestore.collection("handles").get(),
      firestore.collection("handleReservations").get(),
      firestore.collection("handleConfig").doc("status").get(),
    ]);

    const reservationLabelUpdates = reservations.docs.flatMap((snapshot) => {
      const currentLabel = snapshot.data().label;
      const normalizedLabel =
        normalizeTeamHandle(currentLabel || snapshot.id) || snapshot.id;
      return normalizedLabel !== currentLabel
        ? [{ ref: snapshot.ref, label: normalizedLabel }]
        : [];
    });
    if (reservationLabelUpdates.length > 0) {
      const batch = firestore.batch();
      reservationLabelUpdates.forEach(({ ref, label }) => {
        batch.set(
          ref,
          {
            label,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: request.auth!.uid,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    const owners = new Map<
      string,
      { uid: string; name: string; email: string; role: string; handle: string }
    >();
    users.docs.forEach((snapshot) => {
      const data = snapshot.data();
      owners.set(snapshot.id, {
        uid: snapshot.id,
        name: data.staffName || data.displayName || data.email || snapshot.id,
        email: data.email || "",
        role: data.staffRole || "reader",
        handle: normalizeTeamHandle(data.handle),
      });
    });
    authors.docs.forEach((snapshot) => {
      const data = snapshot.data();
      const current = owners.get(snapshot.id);
      owners.set(snapshot.id, {
        uid: snapshot.id,
        name: data.name || current?.name || snapshot.id,
        email: current?.email || "",
        role: data.role || current?.role || "staff",
        handle:
          normalizeTeamHandle(data.handle) || normalizeTeamHandle(current?.handle),
      });
    });

    const claimedByKey = new Map<string, string[]>();
    const claims = handles.docs.map((snapshot) => {
      const uid = typeof snapshot.data().uid === "string" ? snapshot.data().uid : "";
      const key = getHandleReservationKey(snapshot.id);
      claimedByKey.set(key, [...(claimedByKey.get(key) || []), snapshot.id]);
      const owner = owners.get(uid);
      return {
        handle: snapshot.id,
        uid,
        ownerName: owner?.name || uid || "Unknown account",
        ownerRole: owner?.role || "reader",
        reserved: reservations.docs.some(
          (reservation) => reservation.id === key
        ),
      };
    });

    return {
      ready: config.data()?.ready === true,
      owners: [...owners.values()].sort((a, b) => a.name.localeCompare(b.name)),
      reservations: reservations.docs
        .map((snapshot) => {
          const data = snapshot.data();
          const owner = owners.get(data.ownerUid);
          return {
            key: snapshot.id,
            label: normalizeTeamHandle(data.label || snapshot.id) || snapshot.id,
            ownerUid: data.ownerUid || "",
            ownerName: owner?.name || data.ownerUid || "Unassigned",
            reason: data.reason || "manual",
            claimedHandles: claimedByKey.get(snapshot.id) || [],
          };
        })
        .sort((a, b) => a.key.localeCompare(b.key)),
      claims: claims.sort((a, b) => a.handle.localeCompare(b.handle)),
    };
  }
);

export const upsertHandleReservation = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    await requireSuperAdmin(request.auth.uid);

    const firestore = getDb();
    const handle = normalizeTeamHandle(request.data?.handle);
    if (!TEAM_HANDLE_PATTERN.test(handle)) {
      throw new HttpsError(
        "invalid-argument",
        "Use 3-20 lowercase letters, numbers, hyphens, or underscores."
      );
    }
    const key = getHandleReservationKey(handle);
    if (key.length < 3 || key.length > 20) {
      throw new HttpsError("invalid-argument", "That reservation is not valid.");
    }

    const requestedOwnerUid =
      typeof request.data?.ownerUid === "string"
        ? request.data.ownerUid.trim()
        : "";

    if (requestedOwnerUid) {
      const [userDoc, authorDoc] = await Promise.all([
        firestore.collection("users").doc(requestedOwnerUid).get(),
        firestore.collection("authors").doc(requestedOwnerUid).get(),
      ]);
      if (!userDoc.exists && !authorDoc.exists) {
        throw new HttpsError("not-found", "The selected user account does not exist.");
      }
    }

    await firestore.collection("handleReservations").doc(key).set(
      {
        ownerUid: requestedOwnerUid ? requestedOwnerUid : admin.firestore.FieldValue.delete(),
        label: handle,
        reason: "manual",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      },
      { merge: true }
    );

    await writeServerAuditLog({
      actorUid: request.auth.uid,
      action: "handle.reserve",
      category: "handles",
      details: `Updated reservation for handle @${handle}${requestedOwnerUid ? ` assigned to UID ${requestedOwnerUid}` : ""}`,
      targetId: key,
      targetTitle: `@${handle}`,
      metadata: { handle, key, ownerUid: requestedOwnerUid },
    });

    return { key, handle, ownerUid: requestedOwnerUid };
  }
);

export const deleteHandleReservation = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    await requireSuperAdmin(request.auth.uid);

    const key = getHandleReservationKey(request.data?.key);
    if (!key) {
      throw new HttpsError("invalid-argument", "Choose a reservation.");
    }
    await getDb().collection("handleReservations").doc(key).delete();

    await writeServerAuditLog({
      actorUid: request.auth.uid,
      action: "handle.unreserve",
      category: "handles",
      details: `Deleted handle reservation key ${key}`,
      targetId: key,
      targetTitle: key,
    });

    return { key };
  }
);

export const reactToComment = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to react to comments.");
    }

    const commentId = request.data?.commentId;
    const requestedReaction = request.data?.reaction;
    if (typeof commentId !== "string" || !commentId.trim()) {
      throw new HttpsError("invalid-argument", "A comment is required.");
    }
    if (!["like", "dislike"].includes(requestedReaction)) {
      throw new HttpsError("invalid-argument", "Choose like or dislike.");
    }

    const firestore = getDb();
    const accountRef = firestore.collection("users").doc(request.auth.uid);
    const commentRef = firestore.collection("comments").doc(commentId);
    const reactionRef = firestore
      .collection("commentReactions")
      .doc(request.auth.uid)
      .collection("items")
      .doc(commentId);

    return firestore.runTransaction(async (transaction) => {
      const [account, comment, reaction] = await Promise.all([
        transaction.get(accountRef),
        transaction.get(commentRef),
        transaction.get(reactionRef),
      ]);
      if (!account.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Complete your reader account before reacting to comments."
        );
      }
      if (!isAccountAllowedToParticipate(account.data())) {
        throw new HttpsError(
          "permission-denied",
          "Your account is not currently allowed to participate."
        );
      }
      if (!comment.exists || comment.data()?.status !== "visible") {
        throw new HttpsError("not-found", "That comment is not available.");
      }

      const previous = reaction.exists ? reaction.data()?.type : null;
      const next = previous === requestedReaction ? null : requestedReaction;
      let likeCount = Math.max(0, Number(comment.data()?.likeCount) || 0);
      let dislikeCount = Math.max(0, Number(comment.data()?.dislikeCount) || 0);

      if (previous === "like") likeCount = Math.max(0, likeCount - 1);
      if (previous === "dislike") dislikeCount = Math.max(0, dislikeCount - 1);
      if (next === "like") likeCount += 1;
      if (next === "dislike") dislikeCount += 1;

      transaction.update(commentRef, { likeCount, dislikeCount });
      if (next) {
        transaction.set(reactionRef, {
          commentId,
          articleId:
            typeof comment.data()?.articleId === "string"
              ? comment.data()?.articleId
              : "",
          type: next,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.delete(reactionRef);
      }

      return { commentId, reaction: next, likeCount, dislikeCount };
    });
  }
);

export const ensureCommentCounts = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }
    const firestore = getDb();
    const caller = await firestore.collection("authors").doc(request.auth.uid).get();
    if (!caller.exists || !["admin", "super"].includes(caller.data()?.role)) {
      throw new HttpsError("permission-denied", "Only administrators can migrate comment counts.");
    }
    const configRef = firestore.collection("commentConfig").doc("reactions");
    const config = await configRef.get();
    if (
      config.data()?.countsReady === true &&
      Number(config.data()?.schemaVersion) >= 2
    ) {
      return { updated: 0, ready: true };
    }

    const comments = await firestore.collection("comments").get();
    let updated = 0;
    for (let offset = 0; offset < comments.docs.length; offset += 400) {
      const batch = firestore.batch();
      comments.docs.slice(offset, offset + 400).forEach((comment) => {
        const data = comment.data();
        const missingLikes = typeof data.likeCount !== "number";
        const missingDislikes = typeof data.dislikeCount !== "number";
        const missingReplies = typeof data.replyCount !== "number";
        if (!missingLikes && !missingDislikes && !missingReplies) return;
        batch.set(
          comment.ref,
          {
            ...(missingLikes ? { likeCount: 0 } : {}),
            ...(missingDislikes ? { dislikeCount: 0 } : {}),
            ...(missingReplies ? { replyCount: 0 } : {}),
          },
          { merge: true }
        );
        updated += 1;
      });
      await batch.commit();
    }

    await configRef.set({
      countsReady: true,
      schemaVersion: 2,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { updated, ready: true };
  }
);

export const searchMentionHandles = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to tag another user.");
    }

    await enforceRateLimit(
      `mentions_${request.auth.uid}`,
      30,
      60_000,
      "Too many mention searches. Please wait a moment."
    );

    const prefix = normalizeTeamHandle(request.data?.prefix);
    if (!prefix || !/^[a-z0-9_-]{1,20}$/.test(prefix)) {
      return { suggestions: [] };
    }

    const firestore = getDb();
    const handles = await firestore
      .collection("handles")
      .orderBy(admin.firestore.FieldPath.documentId())
      .startAt(prefix)
      .endAt(`${prefix}\uf8ff`)
      .limit(12)
      .get();

    const suggestions = await Promise.all(
      handles.docs.map(async (handleDoc) => {
        const uid = handleDoc.data().uid;
        if (typeof uid !== "string" || uid === request.auth!.uid) return null;
        const [user, author] = await Promise.all([
          firestore.collection("users").doc(uid).get(),
          firestore.collection("authors").doc(uid).get(),
        ]);
        const userData = user.data();
        const authorData = author.data();
        if (!author.exists && !isAccountAllowedToParticipate(userData)) return null;
        return {
          handle: handleDoc.id,
          name:
            (typeof authorData?.name === "string" && authorData.name) ||
            (typeof userData?.staffName === "string" && userData.staffName) ||
            (typeof userData?.displayName === "string" && userData.displayName) ||
            `@${handleDoc.id}`,
          photoURL:
            (typeof authorData?.avatar === "string" && authorData.avatar) ||
            (typeof userData?.photoURL === "string" && userData.photoURL) ||
            "",
        };
      })
    );

    return {
      suggestions: suggestions
        .filter((suggestion) => suggestion !== null)
        .slice(0, 8),
    };
  }
);

async function deleteAccountData(uid: string, rejectPermanentBan = false) {
    const firestore = getDb();
    const userRef = firestore.collection("users").doc(uid);
    const authorRef = firestore.collection("authors").doc(uid);
    const reactionOwnerRef = firestore.collection("commentReactions").doc(uid);

    const [user, author, authUser] = await Promise.all([
      userRef.get(),
      authorRef.get(),
      admin.auth().getUser(uid).catch((error) => {
        if ((error as { code?: string }).code === "auth/user-not-found") {
          return null;
        }
        throw error;
      }),
    ]);
    const userData = user.data();
    const authorData = author.data();
    if (
      rejectPermanentBan &&
      (userData?.status === "banned" || userData?.bannedAt != null)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Permanently banned accounts cannot self-delete. Contact an administrator to appeal the ban."
      );
    }
    const retainedAuthorName =
      (typeof authorData?.name === "string" && authorData.name.trim()) ||
      (typeof userData?.staffName === "string" && userData.staffName.trim()) ||
      (typeof userData?.displayName === "string" &&
        userData.displayName.trim()) ||
      authUser?.displayName?.trim() ||
      authUser?.email?.split("@")[0]?.trim() ||
      "Deleted author";

    const [
      articles,
      trashedArticles,
      deletedTrash,
      comments,
      replies,
      moderatedComments,
      moderatedReplies,
      handles,
      ownedReservations,
      updatedReservations,
      promotedAuthors,
      reactions,
      devices,
      warnings,
      notifications,
    ] = await Promise.all([
      firestore.collection("articles").where("authorUID", "==", uid).get(),
      firestore
        .collection("articleTrash")
        .where("article.authorUID", "==", uid)
        .get(),
      firestore.collection("articleTrash").where("deletedBy", "==", uid).get(),
      firestore.collection("comments").where("authorId", "==", uid).get(),
      firestore.collection("commentReplies").where("authorId", "==", uid).get(),
      firestore.collection("comments").where("moderatedBy", "==", uid).get(),
      firestore
        .collection("commentReplies")
        .where("moderatedBy", "==", uid)
        .get(),
      firestore.collection("handles").where("uid", "==", uid).get(),
      firestore
        .collection("handleReservations")
        .where("ownerUid", "==", uid)
        .get(),
      firestore
        .collection("handleReservations")
        .where("updatedBy", "==", uid)
        .get(),
      firestore.collection("authors").where("promotedBy", "==", uid).get(),
      reactionOwnerRef.collection("items").get(),
      userRef.collection("devices").get(),
      userRef.collection("warnings").get(),
      userRef.collection("notifications").get(),
    ]);

    await mutateDocumentsInChunks(articles.docs, (batch, snapshot) => {
      const existingName = snapshot.data()?.authorName;
      batch.update(snapshot.ref, {
        authorName:
          typeof existingName === "string" && existingName.trim()
            ? existingName
            : retainedAuthorName,
        authorUID: admin.firestore.FieldValue.delete(),
        authorRef: admin.firestore.FieldValue.delete(),
      });
    });
    await mutateDocumentsInChunks(trashedArticles.docs, (batch, snapshot) => {
      const existingName = snapshot.data()?.article?.authorName;
      batch.update(snapshot.ref, {
        "article.authorName":
          typeof existingName === "string" && existingName.trim()
            ? existingName
            : retainedAuthorName,
        "article.authorUID": admin.firestore.FieldValue.delete(),
        "article.authorRef": admin.firestore.FieldValue.delete(),
      });
    });
    await mutateDocumentsInChunks(deletedTrash.docs, (batch, snapshot) => {
      batch.update(snapshot.ref, {
        deletedBy: admin.firestore.FieldValue.delete(),
      });
    });

    // Remove user-owned discussion images before anonymizing retained posts.
    // Work in small groups to avoid a burst of Storage requests on large accounts.
    const authoredDiscussion = [...comments.docs, ...replies.docs];
    for (let offset = 0; offset < authoredDiscussion.length; offset += 20) {
      await Promise.all(
        authoredDiscussion
          .slice(offset, offset + 20)
          .map((snapshot) => deleteCommentAttachments(snapshot.data()))
      );
    }

    const anonymizeDiscussion = (
      batch: admin.firestore.WriteBatch,
      snapshot: admin.firestore.DocumentSnapshot
    ) => {
      batch.update(snapshot.ref, {
        authorId: "deleted-user",
        authorName: "Deleted user",
        authorHandle: admin.firestore.FieldValue.delete(),
        authorPhotoURL: admin.firestore.FieldValue.delete(),
        images: admin.firestore.FieldValue.delete(),
        imageUrl: admin.firestore.FieldValue.delete(),
        imageStoragePath: admin.firestore.FieldValue.delete(),
        imageWidth: admin.firestore.FieldValue.delete(),
        imageHeight: admin.firestore.FieldValue.delete(),
      });
    };
    await mutateDocumentsInChunks(comments.docs, anonymizeDiscussion);
    await mutateDocumentsInChunks(replies.docs, anonymizeDiscussion);

    const removeModeratorReference = (
      batch: admin.firestore.WriteBatch,
      snapshot: admin.firestore.DocumentSnapshot
    ) => {
      batch.update(snapshot.ref, {
        moderatedBy: admin.firestore.FieldValue.delete(),
        moderatedAt: admin.firestore.FieldValue.delete(),
      });
    };
    await mutateDocumentsInChunks(
      moderatedComments.docs,
      removeModeratorReference
    );
    await mutateDocumentsInChunks(moderatedReplies.docs, removeModeratorReference);
    await mutateDocumentsInChunks(promotedAuthors.docs, (batch, snapshot) => {
      batch.update(snapshot.ref, {
        promotedBy: admin.firestore.FieldValue.delete(),
      });
    });

    await mutateDocumentsInChunks(handles.docs, (batch, snapshot) => {
      if (snapshot.data()?.status === "banned") return;
      batch.delete(snapshot.ref);
    });
    await mutateDocumentsInChunks(ownedReservations.docs, (batch, snapshot) => {
      batch.delete(snapshot.ref);
    });
    const ownedReservationIds = new Set(
      ownedReservations.docs.map((snapshot) => snapshot.id)
    );
    await mutateDocumentsInChunks(
      updatedReservations.docs.filter(
        (snapshot) => !ownedReservationIds.has(snapshot.id)
      ),
      (batch, snapshot) => {
        batch.update(snapshot.ref, {
          updatedBy: admin.firestore.FieldValue.delete(),
        });
      }
    );

    // Remove the user's vote and its public aggregate together so repeated
    // account deletion/recreation cannot inflate reaction totals.
    for (let offset = 0; offset < reactions.docs.length; offset += 200) {
      const slice = reactions.docs.slice(offset, offset + 200);
      const commentRefs = slice.map((snapshot) =>
        firestore.collection("comments").doc(
          typeof snapshot.data()?.commentId === "string"
            ? snapshot.data()!.commentId
            : snapshot.id
        )
      );
      const commentSnapshots = await firestore.getAll(...commentRefs);
      const batch = firestore.batch();
      slice.forEach((reaction, index) => {
        const type = reaction.data()?.type;
        if (commentSnapshots[index]?.exists && ["like", "dislike"].includes(type)) {
          batch.update(commentRefs[index], {
            [type === "like" ? "likeCount" : "dislikeCount"]:
              admin.firestore.FieldValue.increment(-1),
          });
        }
        batch.delete(reaction.ref);
      });
      await batch.commit();
    }
    await reactionOwnerRef.delete().catch((error) => {
      if ((error as { code?: number }).code !== 5) throw error;
    });
    for (const privateSubcollection of [devices, warnings, notifications]) {
      await mutateDocumentsInChunks(privateSubcollection.docs, (batch, snapshot) => {
        batch.delete(snapshot.ref);
      });
    }

    const configRef = firestore.collection("handleConfig").doc("status");
    const config = await configRef.get();
    if (config.data()?.updatedBy === uid) {
      await configRef.update({
        updatedBy: admin.firestore.FieldValue.delete(),
      });
    }

    const bucket = admin.storage().bucket();
    const storedAvatar =
      typeof authorData?.avatar === "string" ? authorData.avatar : "";
    const teamNameSlug = retainedAuthorName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    let legacyTeamAvatarPath = "";
    if (storedAvatar) {
      try {
        const avatarUrl = new URL(storedAvatar);
        const objectMarker = "/o/";
        const markerIndex = avatarUrl.pathname.indexOf(objectMarker);
        const objectPath =
          markerIndex >= 0
            ? decodeURIComponent(
                avatarUrl.pathname.slice(markerIndex + objectMarker.length)
              )
            : "";
        if (objectPath === `avatars/team/${teamNameSlug}.webp`) {
          legacyTeamAvatarPath = objectPath;
        }
      } catch {
        // A remote avatar URL is not owned by this Firebase Storage bucket.
      }
    }

    const storageCleanup: Promise<unknown>[] = [
      bucket.deleteFiles({ prefix: `users/${uid}/` }),
      bucket.deleteFiles({ prefix: `authors/${uid}/` }),
      bucket.file(`avatars/team/${uid}.webp`).delete({ ignoreNotFound: true }),
    ];
    if (legacyTeamAvatarPath) {
      storageCleanup.push(
        bucket.file(legacyTeamAvatarPath).delete({ ignoreNotFound: true })
      );
    }

    try {
      await Promise.all(storageCleanup);
    } catch (error) {
      logger.error("Unable to remove account profile uploads", { uid, error });
      throw new HttpsError(
        "internal",
        "Your profile uploads could not be removed. Please try again."
      );
    }

    await Promise.all([userRef.delete(), authorRef.delete()]);
    const finalReactions = await reactionOwnerRef.collection("items").get();
    await mutateDocumentsInChunks(finalReactions.docs, (batch, snapshot) => {
      batch.delete(snapshot.ref);
    });
    await reactionOwnerRef.delete();

    if (authUser) {
      try {
        await admin.auth().deleteUser(uid);
      } catch (error) {
        logger.error("Account data was removed but Auth deletion failed", {
          uid,
          error,
        });
        throw new HttpsError(
          "internal",
          "Your profile was removed, but sign-in cleanup needs to be retried."
        );
      }
    }

}

export const deleteOwnAccount = onCall(
  {
    region: "europe-west1",
    minInstances: 0,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    if (request.data?.confirmation !== "DELETE") {
      throw new HttpsError(
        "invalid-argument",
        "Type DELETE to confirm account deletion."
      );
    }

    const author = await getDb().collection("authors").doc(request.auth.uid).get();
    if (isStaffAuthorRole(author.data()?.role)) {
      if (!CMS_CALLABLE_ORIGINS.has(getRequestOrigin(request.rawRequest))) {
        throw new HttpsError(
          "failed-precondition",
          "Staff accounts can only be deleted from the CMS."
        );
      }
    }

    await deleteAccountData(request.auth.uid, true);
    return { deleted: true };
  }
);

export const syncCommentReplyCount = onDocumentWritten(
  { document: "commentReplies/{replyId}", region: "europe-west1" },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const beforeData = before?.exists ? before.data() : undefined;
    const afterData = after?.exists ? after.data() : undefined;
    const beforeVisible = beforeData?.status === "visible" ? 1 : 0;
    const afterVisible = afterData?.status === "visible" ? 1 : 0;
    const delta = afterVisible - beforeVisible;
    const parentCommentId = afterData?.parentCommentId || beforeData?.parentCommentId;
    if (!delta || typeof parentCommentId !== "string") return;

    const commentRef = getDb().collection("comments").doc(parentCommentId);
    const eventRef = getDb().collection("triggerEvents").doc(event.id);
    await getDb().runTransaction(async (transaction) => {
      const [eventMarker, comment] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(commentRef),
      ]);
      if (eventMarker.exists) return;
      transaction.create(eventRef, {
        type: "reply_count",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60_000),
      });
      if (!comment.exists) return;
      const current = Math.max(0, Number(comment.data()?.replyCount) || 0);
      transaction.update(commentRef, { replyCount: Math.max(0, current + delta) });
    });
  }
);

function getCommentAttachmentPaths(data: admin.firestore.DocumentData | undefined) {
  const paths = new Set<string>();
  const authorId = typeof data?.authorId === "string" && /^[a-zA-Z0-9_-]+$/.test(data.authorId)
    ? data.authorId
    : "";
  if (typeof data?.imageStoragePath === "string") paths.add(data.imageStoragePath);
  if (Array.isArray(data?.images)) {
    data.images.forEach((image: unknown) => {
      if (
        image &&
        typeof image === "object" &&
        typeof (image as { storagePath?: unknown }).storagePath === "string"
      ) {
        paths.add((image as { storagePath: string }).storagePath);
      }
    });
  }
  return authorId
    ? [...paths].filter((path) =>
        new RegExp(`^comments/${authorId}/(?:[a-zA-Z0-9_-]{20,64}/[0-3]|[a-zA-Z0-9_-]+)\\.(webp|jpg)$`).test(path)
      )
    : [];
}

async function deleteCommentAttachments(data: admin.firestore.DocumentData | undefined) {
  const paths = getCommentAttachmentPaths(data);
  if (!paths.length) return;
  const bucket = admin.storage().bucket();
  await Promise.all(
    paths.map(async (path) => {
      const claimRef = getDb().collection("commentAttachmentClaims").doc(
        createHash("sha256").update(path, "utf8").digest("hex")
      );
      await Promise.all([
        bucket.file(path).delete({ ignoreNotFound: true }),
        claimRef.delete(),
      ]);
    })
  );
}

async function removeAttachmentsWhenHidden(
  before: admin.firestore.DocumentSnapshot | undefined,
  after: admin.firestore.DocumentSnapshot | undefined
) {
  if (!after?.exists || after.data()?.status !== "hidden") return;
  const data = after.data();
  const paths = getCommentAttachmentPaths(data);
  if (!paths.length) return;
  await deleteCommentAttachments(data);
  await after.ref.update({
    images: admin.firestore.FieldValue.delete(),
    imageUrl: admin.firestore.FieldValue.delete(),
    imageStoragePath: admin.firestore.FieldValue.delete(),
    imageWidth: admin.firestore.FieldValue.delete(),
    imageHeight: admin.firestore.FieldValue.delete(),
    attachmentsRemovedAt: admin.firestore.FieldValue.serverTimestamp(),
    attachmentsRemovedFromStatus:
      before?.exists && typeof before.data()?.status === "string"
        ? before.data()!.status
        : "unknown",
  });
}

export const cleanupHiddenCommentAttachments = onDocumentWritten(
  { document: "comments/{commentId}", region: "europe-west1" },
  async (event) => {
    await removeAttachmentsWhenHidden(event.data?.before, event.data?.after);
  }
);

export const cleanupHiddenReplyAttachments = onDocumentWritten(
  { document: "commentReplies/{replyId}", region: "europe-west1" },
  async (event) => {
    await removeAttachmentsWhenHidden(event.data?.before, event.data?.after);
  }
);

export const cleanupDeletedReplyAttachments = onDocumentDeleted(
  { document: "commentReplies/{replyId}", region: "europe-west1" },
  async (event) => {
    await deleteCommentAttachments(event.data?.data());
  }
);

export const removeRepliesWithComment = onDocumentDeleted(
  { document: "comments/{commentId}", region: "europe-west1" },
  async (event) => {
    await deleteCommentAttachments(event.data?.data());
    const firestore = getDb();
    const replies = await firestore
      .collection("commentReplies")
      .where("parentCommentId", "==", event.params.commentId)
      .get();
    for (let offset = 0; offset < replies.docs.length; offset += 400) {
      const batch = firestore.batch();
      replies.docs.slice(offset, offset + 400).forEach((reply) => {
        batch.delete(reply.ref);
      });
      await batch.commit();
    }
  }
);

// Property ID will be read inside the function

export const createTeamMember = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const caller = await getDb()
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    const callerRole = caller.data()?.role;

    if (!caller.exists || !["admin", "super"].includes(callerRole)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to create team members."
      );
    }

    const {
      name,
      email,
      password,
      role,
      city,
      job,
      avatar,
      imgAlt,
      slug,
      socials,
    } = request.data ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 6 ||
      typeof role !== "string" ||
      !RESERVABLE_TEAM_ROLES.includes(role)
    ) {
      throw new HttpsError("invalid-argument", "Invalid member details.");
    }

    if (role === "super" && callerRole !== "super") {
      throw new HttpsError(
        "permission-denied",
        "Only a super admin can create another super admin."
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const optionalString = (value: unknown) =>
      typeof value === "string" ? value : "";

    let targetUid = "";
    let isNewAuthUser = false;

    try {
      await admin.auth().getUserByEmail(cleanEmail);
      throw new HttpsError(
        "already-exists",
        "That email already belongs to an account. Use Add Existing User so their sign-in credentials remain unchanged."
      );
    } catch (err: any) {
      if (err instanceof HttpsError) throw err;
      if (err?.code !== "auth/user-not-found") {
        logger.error("Error looking up existing user by email", err);
        throw new HttpsError("internal", "Could not verify whether that email already exists.");
      }
    }

    const newUser = await admin
      .auth()
      .createUser({
        email: cleanEmail,
        password,
        displayName: cleanName,
      })
      .catch((error) => {
        logger.error("Failed to create Auth user", error);
        if (error?.code === "auth/email-already-exists") {
          throw new HttpsError(
            "already-exists",
            "That email already belongs to an account. Use Add Existing User so their sign-in credentials remain unchanged."
          );
        }
        throw new HttpsError("internal", "Failed to create the user account.");
      });

    targetUid = newUser.uid;
    isNewAuthUser = true;

    try {
      const firestore = getDb();
      const callerRef = firestore.collection("authors").doc(request.auth.uid);
      const userRef = firestore.collection("users").doc(targetUid);
      const authorRef = firestore.collection("authors").doc(targetUid);
      const finalAvatar = optionalString(avatar) || newUser.photoURL || "";
      const finalSlug =
        optionalString(slug) ||
        cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
      const authorData: Record<string, unknown> = {
        uid: targetUid,
        name: cleanName,
        city: optionalString(city),
        job: optionalString(job),
        role,
        showOnTeam: role !== "moderator",
        avatar: finalAvatar,
        imgAlt: optionalString(imgAlt) || `Profile picture of ${cleanName}`,
        biography: { body: "", summary: "" },
        slug: finalSlug,
        socials: sanitizePublicSocials(socials),
        createdAt: new Date().toISOString(),
        dateJoined: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.runTransaction(async (transaction) => {
        const [currentCaller, existingUserDoc, existingAuthorDoc] = await Promise.all([
          transaction.get(callerRef),
          transaction.get(userRef),
          transaction.get(authorRef),
        ]);
        const currentCallerRole = currentCaller.data()?.role;
        if (!currentCaller.exists || !["admin", "super"].includes(currentCallerRole)) {
          throw new HttpsError(
            "permission-denied",
            "You no longer have permission to create team members."
          );
        }
        if (role === "super" && currentCallerRole !== "super") {
          throw new HttpsError(
            "permission-denied",
            "Only a super admin can create another super admin."
          );
        }
        if (existingUserDoc.exists || existingAuthorDoc.exists) {
          throw new HttpsError(
            "already-exists",
            "That account already has application data. Use Add Existing User instead."
          );
        }
        transaction.create(authorRef, authorData);
      });

      await writeServerAuditLog({
        actorUid: request.auth.uid,
        action: "team.create_member",
        category: "team",
        details: `Created team member ${cleanName} as ${role}`,
        targetId: targetUid,
        targetTitle: cleanName,
        metadata: { role, slug: finalSlug },
      });
    } catch (error) {
      if (isNewAuthUser) {
        await getDb()
          .collection("authors")
          .doc(targetUid)
          .delete()
          .catch((cleanupError) => {
            logger.error("Failed to roll back author profile", cleanupError);
          });
        await admin.auth().deleteUser(targetUid).catch((cleanupError) => {
          logger.error("Failed to roll back Auth user", cleanupError);
        });
      }
      logger.error("Failed to create or update author profile", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to configure the team member profile.");
    }

    return { uid: targetUid };
  }
);

export const syncHandleReservations = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const firestore = getDb();
    const caller = await firestore
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    if (!caller.exists || caller.data()?.role !== "super") {
      throw new HttpsError(
        "permission-denied",
        "Only a super admin can reserve team handles."
      );
    }

    const officialOwnerUid = request.data?.officialOwnerUid;
    if (typeof officialOwnerUid !== "string" || !officialOwnerUid.trim()) {
      throw new HttpsError(
        "invalid-argument",
        "Choose the team member who owns the official L.A.P handles."
      );
    }
    const officialOwner = await firestore
      .collection("authors")
      .doc(officialOwnerUid)
      .get();
    if (
      !officialOwner.exists ||
      !CONTENT_STAFF_ROLES.includes(officialOwner.data()?.role)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Official handles must belong to an author, admin, or super admin."
      );
    }

    const configRef = firestore.collection("handleConfig").doc("status");
    await configRef.set(
      {
        ready: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      },
      { merge: true }
    );

    const [authorsSnapshot, handlesSnapshot, reservationsSnapshot] = await Promise.all([
      firestore.collection("authors").get(),
      firestore.collection("handles").get(),
      firestore.collection("handleReservations").get(),
    ]);
    const desired = new Map<
      string,
      { ownerUid: string; label: string; reason: string }
    >();
    const conflicts: string[] = [];
    const blockedKeys = new Set<string>();

    const addReservation = (
      key: string,
      ownerUid: string,
      label: string,
      reason: string
    ) => {
      if (key.length < 3 || key.length > 20) return;
      if (blockedKeys.has(key)) return;
      const existing = desired.get(key);
      if (existing && existing.ownerUid !== ownerUid) {
        conflicts.push(`${key}: requested by more than one team member`);
        desired.delete(key);
        blockedKeys.add(key);
        return;
      }
      desired.set(key, { ownerUid, label, reason });
    };

    OFFICIAL_HANDLE_KEYS.forEach((key) =>
      addReservation(key, officialOwnerUid, key, "official-brand")
    );
    authorsSnapshot.docs.forEach((authorDoc) => {
      const data = authorDoc.data();
      if (!RESERVABLE_TEAM_ROLES.includes(data.role)) return;
      const handle = normalizeTeamHandle(data.handle);
      if (!handle) return;
      const key = getHandleReservationKey(handle);
      addReservation(key, authorDoc.id, handle, "team-member");
    });

    const claimedOwners = new Map<string, Set<string>>();
    handlesSnapshot.docs.forEach((handleDoc) => {
      const key = getHandleReservationKey(handleDoc.id);
      const confusableKey = getConfusableBrandKey(handleDoc.id);
      const ownerUid = handleDoc.data().uid;
      if (!key || typeof ownerUid !== "string") return;
      if (
        (isProtectedBrandKey(key) || isProtectedBrandKey(confusableKey)) &&
        ownerUid !== officialOwnerUid
      ) {
        conflicts.push(
          `${handleDoc.id}: protected L.A.P handle is owned by another account`
        );
      }
      const owners = claimedOwners.get(key) || new Set<string>();
      owners.add(ownerUid);
      claimedOwners.set(key, owners);
    });

    const currentByKey = new Map(
      reservationsSnapshot.docs.map((snapshot) => [snapshot.id, snapshot]),
    );
    const batch = firestore.batch();
    let reserved = 0;
    let updated = 0;

    reservationsSnapshot.docs.forEach((snapshot) => {
      if (desired.has(snapshot.id)) return;
      const currentLabel = snapshot.data().label;
      const normalizedLabel =
        normalizeTeamHandle(currentLabel || snapshot.id) || snapshot.id;
      if (normalizedLabel === currentLabel) return;
      batch.set(
        snapshot.ref,
        {
          label: normalizedLabel,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: request.auth!.uid,
        },
        { merge: true }
      );
      updated += 1;
    });

    desired.forEach((reservation, key) => {
      const current = currentByKey.get(key);
      if (current?.exists && current.data()?.ownerUid !== reservation.ownerUid) {
        conflicts.push(`${key}: already reserved by another account`);
        return;
      }
      const claimants = claimedOwners.get(key);
      if (claimants && [...claimants].some((uid) => uid !== reservation.ownerUid)) {
        conflicts.push(`${key}: already claimed by another reader`);
        return;
      }

      batch.set(
        firestore.collection("handleReservations").doc(key),
        {
          ...reservation,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      reserved += 1;
      if (current?.data()?.label !== reservation.label) updated += 1;
    });

    if (conflicts.length > 0) {
      return { reserved: 0, conflicts: [...new Set(conflicts)], ready: false };
    }

    batch.set(
      configRef,
      {
        ready: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      },
      { merge: true }
    );
    await batch.commit();

    return { reserved, updated, conflicts: [], ready: true };
  }
);

export const listModeratorCandidates = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const firestore = getDb();
    const caller = await firestore
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    if (!caller.exists || !["admin", "super"].includes(caller.data()?.role)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to promote moderators."
      );
    }

    const [users, authors] = await Promise.all([
      firestore.collection("users").get(),
      firestore.collection("authors").get(),
    ]);
    const teamUids = new Set(authors.docs.map((snapshot) => snapshot.id));

    return {
      candidates: users.docs
        .filter((snapshot) =>
          !teamUids.has(snapshot.id) && isEligibleReaderForTeam(snapshot.data())
        )
        .map((snapshot) => {
          const data = snapshot.data();
          return {
            uid: snapshot.id,
            handle: normalizeTeamHandle(data.handle),
            name: data.displayName || data.handle || data.email || "Reader",
            email: data.email || "",
            photoURL: data.photoURL || "",
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
);

export const listExistingUserCandidates = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const firestore = getDb();
    const caller = await firestore
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    if (!caller.exists || !["admin", "super"].includes(caller.data()?.role)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to view user candidates."
      );
    }

    const [users, authors] = await Promise.all([
      firestore.collection("users").get(),
      firestore.collection("authors").get(),
    ]);
    const teamUids = new Set(authors.docs.map((snapshot) => snapshot.id));

    return {
      candidates: users.docs
        .filter((snapshot) =>
          !teamUids.has(snapshot.id) && isEligibleReaderForTeam(snapshot.data())
        )
        .map((snapshot) => {
          const data = snapshot.data();
          return {
            uid: snapshot.id,
            handle: normalizeTeamHandle(data.handle),
            name: data.displayName || data.handle || data.email || "User",
            email: data.email || "",
            photoURL: data.photoURL || "",
            city: data.city || "",
            bio: data.bio || "",
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
);

export const addExistingUserToTeam = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const firestore = getDb();
    const caller = await firestore
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    const callerRole = caller.data()?.role;

    if (!caller.exists || !["admin", "super"].includes(callerRole)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to add team members."
      );
    }

    const {
      uid,
      role,
      name,
      city,
      job,
      avatar,
      imgAlt,
      slug,
      socials,
      biography,
      showOnTeam,
    } = request.data ?? {};

    if (typeof uid !== "string" || !uid.trim()) {
      throw new HttpsError("invalid-argument", "Choose an account.");
    }

    if (
      typeof role !== "string" ||
      !RESERVABLE_TEAM_ROLES.includes(role)
    ) {
      throw new HttpsError("invalid-argument", "Choose a valid team role.");
    }

    if (role === "super" && callerRole !== "super") {
      throw new HttpsError(
        "permission-denied",
        "Only a super admin can assign the super admin role."
      );
    }

    const userRecord = await admin.auth().getUser(uid).catch(() => null);
    if (!userRecord) {
      throw new HttpsError("not-found", "That reader's sign-in account no longer exists.");
    }
    if (userRecord.disabled) {
      throw new HttpsError("failed-precondition", "That reader's sign-in account is disabled.");
    }

    const callerRef = firestore.collection("authors").doc(request.auth.uid);
    const userRef = firestore.collection("users").doc(uid);
    const authorRef = firestore.collection("authors").doc(uid);
    const optionalString = (val: unknown) => (typeof val === "string" ? val : "");
    let cleanName = "";
    let finalSlug = "";
    let userHandle = "";

    await firestore.runTransaction(async (transaction) => {
      const [currentCaller, userDoc, authorDoc] = await Promise.all([
        transaction.get(callerRef),
        transaction.get(userRef),
        transaction.get(authorRef),
      ]);
      const currentCallerRole = currentCaller.data()?.role;
      if (!currentCaller.exists || !["admin", "super"].includes(currentCallerRole)) {
        throw new HttpsError(
          "permission-denied",
          "You no longer have permission to add team members."
        );
      }
      if (role === "super" && currentCallerRole !== "super") {
        throw new HttpsError(
          "permission-denied",
          "Only a super admin can assign the super admin role."
        );
      }
      if (authorDoc.exists) {
        throw new HttpsError("already-exists", "That account is already a CMS team member.");
      }
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "That Docs reader profile no longer exists.");
      }

      const userData = userDoc.data() || {};
      if (
        (typeof userData.uid === "string" && userData.uid !== uid) ||
        !isEligibleReaderForTeam(userData)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Only an active reader account that is not already staff can be added to the team."
        );
      }

      cleanName =
        (typeof name === "string" && name.trim()) ||
        (typeof userData.displayName === "string" && userData.displayName.trim()) ||
        userRecord.displayName ||
        userData.handle ||
        userRecord.email?.split("@")[0] ||
        "Team Member";
      userHandle = normalizeTeamHandle(userData.handle);
      finalSlug =
        optionalString(slug) ||
        userHandle ||
        cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

      const authorData: Record<string, unknown> = {
        uid,
        name: cleanName,
        ...(userHandle ? { handle: userHandle } : {}),
        city: optionalString(city) || userData.city || "",
        job: optionalString(job) || "",
        role,
        showOnTeam: typeof showOnTeam === "boolean" ? showOnTeam : role !== "moderator",
        avatar: optionalString(avatar) || userData.photoURL || userRecord.photoURL || "",
        imgAlt: optionalString(imgAlt) || `Profile picture of ${cleanName}`,
        biography:
          typeof biography === "object" && biography !== null
            ? biography
            : { body: userData.bio || "", summary: "" },
        slug: finalSlug,
        socials: sanitizePublicSocials(socials),
        createdAt: userData.createdAt || new Date().toISOString(),
        dateJoined: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.create(authorRef, authorData);
      transaction.set(
        userRef,
        {
          staffName: cleanName,
          staffRole: role,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    await writeServerAuditLog({
      actorUid: request.auth.uid,
      action: "team.add_existing",
      category: "team",
      details: `Added user ${cleanName} to team as ${role}`,
      targetId: uid,
      targetTitle: cleanName,
      metadata: { role, slug: finalSlug, handle: userHandle },
    });

    return { uid, success: true };
  }
);

export const promoteReaderToModerator = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const uid = request.data?.uid;
    if (typeof uid !== "string" || !uid.trim()) {
      throw new HttpsError("invalid-argument", "Choose a reader account.");
    }

    const firestore = getDb();
    const caller = await firestore
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    if (!caller.exists || !["admin", "super"].includes(caller.data()?.role)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to promote moderators."
      );
    }

    const userRecord = await admin.auth().getUser(uid).catch(() => null);
    if (!userRecord) {
      throw new HttpsError("not-found", "That reader's sign-in account no longer exists.");
    }
    if (userRecord.disabled) {
      throw new HttpsError("failed-precondition", "That reader's sign-in account is disabled.");
    }

    const callerRef = firestore.collection("authors").doc(request.auth.uid);
    const userRef = firestore.collection("users").doc(uid);
    const authorRef = firestore.collection("authors").doc(uid);
    let promotedHandle = "";
    let promotedName = "";

    await firestore.runTransaction(async (transaction) => {
      const [currentCaller, user, author] = await Promise.all([
        transaction.get(callerRef),
        transaction.get(userRef),
        transaction.get(authorRef),
      ]);
      if (
        !currentCaller.exists ||
        !["admin", "super"].includes(currentCaller.data()?.role)
      ) {
        throw new HttpsError(
          "permission-denied",
          "You no longer have permission to promote moderators."
        );
      }
      if (!user.exists) {
        throw new HttpsError("not-found", "That Docs reader profile no longer exists.");
      }
      if (author.exists) {
        throw new HttpsError("already-exists", "That account is already a CMS team member.");
      }

      const data = user.data() || {};
      if (
        (typeof data.uid === "string" && data.uid !== uid) ||
        !isEligibleReaderForTeam(data)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Only an active reader account that is not already staff can be promoted."
        );
      }
      const handle = normalizeTeamHandle(data.handle);
      const name =
        (typeof data.displayName === "string" && data.displayName.trim()) ||
        handle ||
        userRecord.email?.split("@")[0] ||
        "Moderator";
      promotedHandle = handle;
      promotedName = name;
      const timestamp = admin.firestore.FieldValue.serverTimestamp();

      transaction.create(authorRef, {
        uid,
        name,
        handle,
        role: "moderator",
        showOnTeam: false,
        promotedFromReader: true,
        avatar:
          (typeof data.photoURL === "string" && data.photoURL) ||
          userRecord.photoURL ||
          "",
        imgAlt: `Profile picture of ${name}`,
        city: "",
        job: "Moderator",
        biography: { body: "", summary: "" },
        slug: handle,
        socials: {},
        createdAt: new Date().toISOString(),
        dateJoined: timestamp,
        promotedAt: timestamp,
        promotedBy: request.auth!.uid,
      });
      transaction.set(
        userRef,
        {
          staffName: name,
          staffRole: "moderator",
          updatedAt: timestamp,
        },
        { merge: true }
      );
    });

    await writeServerAuditLog({
      actorUid: request.auth.uid,
      action: "team.promote_moderator",
      category: "team",
      details: `Promoted reader @${promotedHandle || promotedName} to moderator`,
      targetId: uid,
      targetTitle: promotedName,
      metadata: { role: "moderator", handle: promotedHandle },
    });

    return { uid, role: "moderator" };
  }
);

export const deleteTeamMember = onCall(
  {
    region: "europe-west1",
    minInstances: 0,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const uid = request.data?.uid;
    if (typeof uid !== "string" || !uid.trim()) {
      throw new HttpsError("invalid-argument", "A member UID is required.");
    }

    if (uid === request.auth.uid) {
      throw new HttpsError(
        "failed-precondition",
        "You cannot delete your own account while signed in."
      );
    }

    const caller = await getDb()
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    const callerRole = caller.data()?.role;

    if (!caller.exists || !["super", "admin"].includes(callerRole)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to delete team members."
      );
    }

    const member = await getDb().collection("authors").doc(uid).get();
    if (!member.exists) {
      throw new HttpsError("not-found", "That team member no longer exists.");
    }

    const targetRole = member.data()?.role;
    if (callerRole === "admin" && (targetRole === "super" || targetRole === "admin")) {
      throw new HttpsError(
        "permission-denied",
        "Admins cannot delete other admins or super admins."
      );
    }

    await deleteAccountData(uid);

    await writeServerAuditLog({
      actorUid: request.auth.uid,
      action: "team.delete_member",
      category: "team",
      details: `Deleted team member ${member.data()?.name || uid} (${targetRole})`,
      targetId: uid,
      targetTitle: member.data()?.name || uid,
      metadata: { role: targetRole },
    });

    return { uid, deleted: true };
  }
);

export const updatePopularPosts = onSchedule(
  {
    schedule: "every day 00:00",
    region: "europe-west1",
  },
  async (event) => {
    logger.info("Starting updatePopularPosts function");

    const propertyId = process.env.GA_PROPERTY_ID;

    if (
      !propertyId ||
      !process.env.GA_CLIENT_EMAIL ||
      !process.env.GA_PRIVATE_KEY
    ) {
      logger.error("Missing Google Analytics credentials or Property ID");
      return;
    }

    try {
      // 1. Fetch Top 5 Viewed Articles from GA4 (Past 3 Days)
      const client = getAnalyticsClient();
      const [response] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: "30daysAgo",
            endDate: "today",
          },
        ],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        // Increase fetch limit to ensure we find enough articles even if top results are non-articles
        limit: 100,
      });

      const topSlugs: string[] = [];
      const rows = response.rows || [];

      logger.info(`Fetched ${rows.length} rows from Analytics`);

      // Log raw rows for debugging
      rows.forEach((row) => {
        logger.info(
          `Row: ${row.dimensionValues?.[0]?.value} - ${row.metricValues?.[0]?.value}`
        );
      });

      for (const row of rows) {
        const path = row.dimensionValues?.[0]?.value;
        // Check for both /articles/ and /posts/ to be safe, or just /posts/ based on logs.
        // Logs show: /posts/how-to-install-ani-cli
        if (
          path &&
          (path.startsWith("/articles/") || path.startsWith("/posts/"))
        ) {
          // Extract slug: /posts/my-slug -> my-slug
          const parts = path.split("/");
          // parts[0]="", parts[1]="posts"|"articles", parts[2]="slug"
          if (parts.length >= 3) {
            // Clean slug of any query params if they exist (though GA usually separates them)
            const slug = parts[2].split("?")[0];
            if (slug && !topSlugs.includes(slug)) {
              topSlugs.push(slug);
            }
          }
        }
        // Fetch more candidates (e.g. 20) to ensure we find 5 published ones
        // even if some top views are drafts
        if (topSlugs.length >= 20) break;
      }

      logger.info(
        `Identified Top ${topSlugs.length} Candidate Slugs: ${JSON.stringify(
          topSlugs
        )}`
      );

      // 2. Database Update Transaction/Batch
      const db = getDb();
      const batch = db.batch();

      // Step A: Reset ALL currently popular posts
      const currentPopularSnapshot = await db
        .collection("articles")
        .where("popularity", "==", true)
        .get();

      currentPopularSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          popularity: false,
          popularityRank: admin.firestore.FieldValue.delete(),
        });
      });

      logger.info(
        `Queued reset for ${currentPopularSnapshot.size} currently popular articles`
      );

      // Step B: Filter candidates for published status and pick top 5
      const finalPopularSlugs: string[] = [];

      if (topSlugs.length > 0) {
        // Firestore 'in' query limit is 10. We need to batch requests if we have > 10.
        const slugChunks = [];
        for (let i = 0; i < topSlugs.length; i += 10) {
          slugChunks.push(topSlugs.slice(i, i + 10));
        }

        const validDocsMap = new Map<
          string,
          admin.firestore.DocumentSnapshot
        >();

        for (const chunk of slugChunks) {
          const snapshot = await db
            .collection("articles")
            .where("slug", "in", chunk)
            .get();

          snapshot.docs.forEach((doc) => {
            validDocsMap.set(doc.data().slug, doc);
          });
        }

        // Iterate through original sorted topSlugs to maintain rank order
        let rankCounter = 1;
        for (const slug of topSlugs) {
          const doc = validDocsMap.get(slug);
          if (doc) {
            const data = doc.data();
            // ONLY allow if explicitly published
            if (data && data.publish === true) {
              batch.update(doc.ref, {
                popularity: true,
                popularityRank: rankCounter,
              });

              logger.info(
                `Marking doc ${doc.id} (slug: ${slug}) as popular (Rank: ${rankCounter})`
              );

              finalPopularSlugs.push(slug);
              rankCounter++;

              if (finalPopularSlugs.length >= 5) break;
            } else {
              logger.info(`Skipping popular candidate (Draft): ${slug}`);
            }
          }
        }

        if (finalPopularSlugs.length === 0) {
          logger.warn("No published articles found among top views.");
        } else {
          logger.info(
            `Final Top 5 Popular: ${JSON.stringify(finalPopularSlugs)}`
          );
        }
      } else {
        logger.warn("No top slugs found to mark as popular.");
      }

      await batch.commit();
      logger.info("Successfully updated popular posts.");

      // VERIFICATION STEP: Read back one of the docs to confirm
      if (topSlugs.length > 0) {
        const verifySnapshot = await db
          .collection("articles")
          .where("slug", "in", [topSlugs[0]])
          .get();
        verifySnapshot.docs.forEach((doc) => {
          logger.info(
            `VERIFICATION READ: Doc ${doc.id} (${
              doc.data().slug
            }) popularity is now: ${doc.data().popularity}`
          );
        });
      }
    } catch (error) {
      logger.error("Error in updatePopularPosts", error);
    }
  }
);

export const manageAssets = onCall(
  {
    region: "europe-west1",
    minInstances: 0,
    timeoutSeconds: 540, // Increase timeout for large folder operations
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const caller = await getDb()
      .collection("authors")
      .doc(request.auth.uid)
      .get();
    if (!caller.exists || !CONTENT_STAFF_ROLES.includes(caller.data()?.role)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to manage assets."
      );
    }
    const callerRole = caller.data()?.role;
    const isAssetAdmin = callerRole === "admin" || callerRole === "super";
    await enforceRateLimit(
      `assets_${request.auth.uid}`,
      30,
      60_000,
      "Too many asset operations. Please wait a minute and try again."
    );

    logger.info("Starting manageAssets function", {
      action: request.data?.action,
      itemsCount: request.data?.items?.length,
    });

    const { action, items, destPath, newName } = request.data || {};
    const supportedActions = new Set([
      "rename", "copy", "move", "delete", "downloadFolder",
      "downloadFile", "syncIndex",
    ]);
    if (typeof action !== "string" || !supportedActions.has(action)) {
      throw new HttpsError("invalid-argument", "Unknown asset action.");
    }
    if (action === "syncIndex" && !isAssetAdmin) {
      throw new HttpsError("permission-denied", "Only administrators can rebuild the asset index.");
    }

    // items should be an array of full storage paths, e.g. ["folder/file.png"]
    if (!Array.isArray(items) || (action !== "syncIndex" && items.length === 0) || items.length > 100) {
      throw new HttpsError(
        "invalid-argument",
        "Provide between 1 and 100 asset paths."
      );
    }

    const isSafeStoragePath = (value: unknown): value is string =>
      typeof value === "string" && value.length >= 1 && value.length <= 1024 &&
      !value.startsWith("/") && !value.endsWith("/") && !value.includes("//") &&
      !value.split("/").some((part) => part === "." || part === ".." || /[\r\n\0]/.test(part));
    if (action !== "syncIndex" && !items.every(isSafeStoragePath)) {
      throw new HttpsError("invalid-argument", "One or more asset paths are invalid.");
    }
    if (newName != null &&
      (typeof newName !== "string" || !newName.trim() || newName.length > 255 || /[\\/\r\n\0]/.test(newName))) {
      throw new HttpsError("invalid-argument", "The new asset name is invalid.");
    }
    if (destPath != null && destPath !== "" && !isSafeStoragePath(destPath)) {
      throw new HttpsError("invalid-argument", "The destination path is invalid.");
    }

    const storageBaseName = (path: string) =>
      path.replace(/\/+$/, "").split("/").pop() || "";
    let renameTargetPath: string | undefined;
    const derivedDestinationPaths: string[] = [];

    if (action === "rename") {
      if (items.length !== 1 || !newName) {
        throw new HttpsError(
          "invalid-argument",
          "Rename requires exactly 1 item and newName."
        );
      }
      const normalizedSource = items[0].replace(/\/+$/, "");
      const sourceParts = normalizedSource.split("/");
      sourceParts.pop();
      const parentPath = sourceParts.join("/");
      const derivedRenameTarget = parentPath ? `${parentPath}/${newName}` : newName;
      renameTargetPath = derivedRenameTarget;
      derivedDestinationPaths.push(derivedRenameTarget);
    } else if (action === "copy" || action === "move") {
      if (destPath === undefined || destPath === null) {
        throw new HttpsError(
          "invalid-argument",
          "Copy/Move requires destPath (can be empty string)."
        );
      }
      for (const sourcePath of items) {
        const sourceName = storageBaseName(sourcePath);
        derivedDestinationPaths.push(
          destPath ? `${destPath}/${sourceName}` : sourceName
        );
      }
    }

    if (!derivedDestinationPaths.every(isSafeStoragePath)) {
      throw new HttpsError("invalid-argument", "The derived destination path is invalid.");
    }

    if (!isAssetAdmin && action !== "syncIndex") {
      if (action === "rename" && /^Articles\/[^/]+\/?$/.test(items[0])) {
        throw new HttpsError(
          "permission-denied",
          "Authors cannot rename an article's top-level asset folder."
        );
      }
      const articleIds = new Set<string>();
      [...items, ...derivedDestinationPaths].forEach((path) => {
        const match = /^Articles\/([^/]+)(?:\/|$)/.exec(path);
        if (!match) {
          throw new HttpsError(
            "permission-denied",
            "Authors may manage only assets belonging to their own articles."
          );
        }
        articleIds.add(match[1]);
      });
      const ownership = await Promise.all(
        [...articleIds].map((articleId) => getDb().collection("articles").doc(articleId).get())
      );
      if (ownership.some((article) => !article.exists || article.data()?.authorUID !== request.auth!.uid)) {
        throw new HttpsError(
          "permission-denied",
          "Authors may manage only assets belonging to their own articles."
        );
      }
    }

    const bucket = admin.storage().bucket();
    const debugLogs: string[] = [];
    const log = (msg: string) => {
      debugLogs.push(msg);
      logger.info(msg);
    };

    const results = {
      success: 0,
      failure: 0,
      errors: [] as string[],
      logs: debugLogs,
    };

    log(`Starting action: ${action} on ${items.length} items`);

    try {
      if (action === "rename") {
        const srcPath = items[0];

        let isFolder = false;
        try {
          await bucket.file(srcPath).getMetadata();
        } catch (e: any) {
          if (e.code === 404) isFolder = true;
          else throw e;
        }

        if (!renameTargetPath) {
          throw new HttpsError("internal", "The rename destination was not resolved.");
        }
        const newPath = renameTargetPath;

        if (!isFolder) {
          await bucket.file(srcPath).move(newPath);
          log(`Renamed file ${srcPath} to ${newPath}`);
        } else {
          // Folder rename = move all files with prefix
          const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
          const [files] = await bucket.getFiles({ prefix });
          if (files.length > 500) {
            throw new HttpsError(
              "resource-exhausted",
              "Folders with more than 500 objects must be reorganized in smaller sections."
            );
          }
          log(
            `Renaming folder ${srcPath} to ${newPath}, found ${files.length} files`
          );

          for (const file of files) {
            const targetPath = file.name.replace(prefix, `${newPath}/`);
            await file.move(targetPath);
          }
        }
        results.success++;
      } else if (action === "copy" || action === "move") {
        for (const srcPath of items) {
          try {
            let isFolder = false;
            try {
              await bucket.file(srcPath).getMetadata();
            } catch (e: any) {
              if (e.code === 404) {
                isFolder = true;
              } else {
                throw e;
              }
            }

            if (!isFolder) {
              const fileName = srcPath.split("/").pop();
              if (!fileName) continue;
              const targetPath = destPath
                ? `${destPath}/${fileName}`
                : fileName;

              if (action === "copy") {
                await bucket.file(srcPath).copy(targetPath);
                log(`Copied ${srcPath} to ${targetPath}`);
              } else {
                await bucket.file(srcPath).move(targetPath);
                log(`Moved ${srcPath} to ${targetPath}`);
              }
              results.success++;
            } else {
              const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
              const [files] = await bucket.getFiles({ prefix });
              if (files.length > 500) {
                throw new HttpsError(
                  "resource-exhausted",
                  "Folders with more than 500 objects must be moved or copied in smaller sections."
                );
              }

              log(`Processing folder ${prefix}, found ${files.length} files`);

              for (const file of files) {
                const relativePath = file.name.slice(prefix.length);
                const targetPath = destPath
                  ? `${destPath}/${srcPath.split("/").pop()}/${relativePath}`
                  : `${srcPath.split("/").pop()}/${relativePath}`;

                if (action === "copy") {
                  await file.copy(targetPath);
                } else {
                  await file.move(targetPath);
                }
              }
              results.success++;
            }
          } catch (e) {
            const err = `Failed to ${action} ${srcPath}: ${e}`;
            logger.error(err);
            results.failure++;
            results.errors.push(err);
          }
        }
      } else if (action === "delete") {
        for (const srcPath of items) {
          // 1. CLEANUP INDEX FIRST
          try {
            const db = getDb();
            const indexRef = db.collection("assets_index");

            // Normalize path
            const normalizedPath = srcPath.replace(/\/$/, "");

            // Delete the folder/file doc itself
            const safeId = normalizedPath.replace(/\//g, "___");
            await indexRef.doc(safeId).delete();

            // Recursive delete of children using ID RANGE
            const startId = safeId + "___";
            const endId = safeId + "___\uf8ff";

            const allChildren = await indexRef
              .where(admin.firestore.FieldPath.documentId(), ">=", startId)
              .where(admin.firestore.FieldPath.documentId(), "<=", endId)
              .get();

            if (!allChildren.empty) {
              const BATCH_SIZE = 450;
              let batch = db.batch();
              let count = 0;
              let totalDeleted = 0;

              for (const doc of allChildren.docs) {
                batch.delete(doc.ref);
                count++;
                if (count >= BATCH_SIZE) {
                  await batch.commit();
                  batch = db.batch();
                  count = 0;
                }
                totalDeleted++;
              }

              if (count > 0) {
                await batch.commit();
              }
              log(
                `Recursively deleted ${totalDeleted} index entries for ${srcPath}`
              );
            }
          } catch (indexError: any) {
            const msg = `Failed to clean up index for ${srcPath}: ${indexError.message}`;
            logger.error(msg);
            results.errors.push(msg);
          }

          // 2. DELETE FROM STORAGE
          try {
            // Check if it's a file first and delete it
            try {
              await bucket.file(srcPath).delete();
              log(`Deleted file: ${srcPath}`);
            } catch (e: any) {
              if (e.code !== 404) {
                throw e;
              }
            }

            // Delete folder contents (Manual Iteration)
            const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;

            log(`Listing files for prefix: ${prefix}`);
            const [files] = await bucket.getFiles({ prefix });

            if (files.length > 0) {
              log(`Found ${files.length} items in ${srcPath}, deleting...`);

              const DELETE_BATCH = 50;
              for (let i = 0; i < files.length; i += DELETE_BATCH) {
                const chunk = files.slice(i, i + DELETE_BATCH);
                await Promise.all(
                  chunk.map((f) =>
                    f.delete().catch((e) => {
                      const err = `Failed to delete file ${f.name}: ${e.message}`;
                      logger.error(err);
                      results.errors.push(err);
                    })
                  )
                );
              }
              log(`Successfully deleted contents of ${srcPath}`);
            } else {
              log(`No files found under prefix ${prefix}`);
            }

            results.success++;
          } catch (e: any) {
            const err = `Failed to delete from storage ${srcPath}: ${e.message}`;
            logger.error(err);
            results.failure++;
            results.errors.push(err);
          }
        }
      } else if (action === "downloadFolder") {
        if (items.length !== 1) {
          throw new HttpsError(
            "invalid-argument",
            "Download folder requires exactly 1 item (folder path)."
          );
        }
        const srcPath = items[0];
        const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
        const [files] = await bucket.getFiles({ prefix });

        if (files.length > 100) {
          throw new HttpsError(
            "resource-exhausted",
            "Folders with more than 100 files must be downloaded in smaller sections."
          );
        }

        const totalBytes = files.reduce(
          (sum, file) => sum + (Number(file.metadata.size) || 0),
          0
        );
        if (totalBytes > 64 * 1024 * 1024) {
          throw new HttpsError(
            "resource-exhausted",
            "Folders larger than 64 MB must be downloaded in smaller sections."
          );
        }

        if (files.length === 0) {
          // It might be empty, just return empty zip? Or error?
          // Let's allow empty zip or just handle gracefully.
        }

        const zip = new JSZip();

        // JSZip buffers output, so bound both total size above and download
        // concurrency here to keep peak memory below the Function allocation.
        for (let offset = 0; offset < files.length; offset += 4) {
          await Promise.all(files.slice(offset, offset + 4).map(async (file) => {
            if (file.name.endsWith("/")) return; // Skip directories if listed
            try {
              const [content] = await file.download();
              const relativePath = file.name.slice(prefix.length);
              if (relativePath) {
                zip.file(relativePath, content);
              }
            } catch (e) {
              logger.error(`Failed to download file for zip: ${file.name}`, e);
            }
          }));
        }

        const zipContent = await zip.generateAsync({ type: "nodebuffer" });

        const fileName =
          srcPath.replace(/\/$/, "").split("/").pop() || "download";
        const tempFilePath = `temp_downloads/${fileName}-${Date.now()}.zip`;
        const tempFile = bucket.file(tempFilePath);

        await tempFile.save(zipContent, {
          contentType: "application/zip",
          metadata: {
            metadata: {
              tempDownload: "true", // Tag for cleanup lifecycle rules
            },
          },
        });

        const [url] = await tempFile.getSignedUrl({
          action: "read",
          expires: Date.now() + 15 * 60 * 1000, // 15 min
          version: "v4",
        });

        results.success++;
        return { ...results, downloadUrl: url };
      } else if (action === "downloadFile") {
        if (items.length !== 1) {
          throw new HttpsError(
            "invalid-argument",
            "Download file requires exactly 1 item (file path)."
          );
        }
        const srcPath = items[0];
        const file = bucket.file(srcPath);
        const [match] = await file.exists();
        if (!match) {
          throw new HttpsError("not-found", "File not found");
        }

        // Generate signed URL with response-content-disposition attachment
        // This forces the browser to download instead of open
        // Using v4 to avoid permission issues
        const [url] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 15 * 60 * 1000, // 15 min
          version: "v4",
          responseDisposition: "attachment",
        });

        results.success++;
        return { ...results, downloadUrl: url };
      } else if (action === "syncIndex") {
        // Manual Trigger for Asset Indexing
        // Replicating logic from syncAssetIndex

        const collectionRef = getDb().collection("assets_index");
        const [files] = await bucket.getFiles();
        logger.info(`Manual sync: Found ${files.length} files`);

        const BATCH_SIZE = 450;
        let batch = getDb().batch();
        let operationCount = 0;
        const currentSyncTime = admin.firestore.Timestamp.now();
        const processedFolders = new Set<string>();

        for (const file of files) {
          if (file.name.endsWith("/")) continue;

          const fileName = file.name.split("/").pop() || "";
          const safeId = file.name.replace(/\//g, "___"); // File ID
          const parentId = file.name.includes("/")
            ? file.name.substring(0, file.name.lastIndexOf("/"))
            : "";

          // Keywords
          const keywords = fileName
            .toLowerCase()
            .split(/[\s\-_.]+/)
            .filter((k) => k.length > 2);
          keywords.push(fileName.toLowerCase());

          batch.set(
            collectionRef.doc(safeId),
            {
              name: fileName,
              path: file.name,
              parentId: parentId,
              type: "file",
              size: file.metadata.size
                ? parseInt(String(file.metadata.size))
                : 0,
              mimeType: file.metadata.contentType || "application/octet-stream",
              updatedAt: file.metadata.updated || new Date().toISOString(),
              createdAt: file.metadata.timeCreated || new Date().toISOString(),
              lastSync: currentSyncTime,
              nameLower: fileName.toLowerCase(),
              keywords: keywords,
            },
            { merge: true }
          );
          operationCount++;

          // Folders
          let parentPath = parentId;
          while (parentPath) {
            if (!processedFolders.has(parentPath)) {
              processedFolders.add(parentPath);
              const safeFolderId = parentPath.replace(/\//g, "___");
              const folderName = parentPath.split("/").pop() || parentPath;
              const folderParentId = parentPath.includes("/")
                ? parentPath.substring(0, parentPath.lastIndexOf("/"))
                : "";

              batch.set(
                collectionRef.doc(safeFolderId),
                {
                  name: folderName,
                  path: parentPath,
                  parentId: folderParentId,
                  type: "folder",
                  size: 0,
                  mimeType: "application/vnd.google-apps.folder",
                  updatedAt: currentSyncTime.toDate().toISOString(),
                  createdAt: currentSyncTime.toDate().toISOString(),
                  lastSync: currentSyncTime,
                  nameLower: folderName.toLowerCase(),
                  keywords: [folderName.toLowerCase()],
                },
                { merge: true }
              );
              operationCount++;
            }
            parentPath = parentPath.includes("/")
              ? parentPath.substring(0, parentPath.lastIndexOf("/"))
              : "";

            if (operationCount >= BATCH_SIZE) {
              await batch.commit();
              batch = getDb().batch();
              operationCount = 0;
            }
          }

          if (operationCount >= BATCH_SIZE) {
            await batch.commit();
            batch = getDb().batch();
            operationCount = 0;
          }
        }

        if (operationCount > 0) {
          await batch.commit();
        }

        results.success = files.length;
        logger.info("Manual asset index sync complete");
      } else {
        throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
      }
    } catch (error) {
      logger.error("Global error in manageAssets", error);
      throw new HttpsError(
        "internal",
        "Internal error processing assets",
        error
      );
    }

    return results;
  }
);

export const updateYouTubeSubscribers = onSchedule(
  {
    schedule: "every 12 hours",
    region: "europe-west1",
  },
  async (event) => {
    logger.info("Starting updateYouTubeSubscribers function");

    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!channelId || !apiKey) {
      logger.error("Missing YouTube Channel ID or API Key");
      return;
    }

    try {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`;
      const response = await fetch(url);
      const data = (await response.json()) as any;

      if (data.items && data.items.length > 0) {
        const stats = data.items[0].statistics;
        const subscriberCount = parseInt(stats.subscriberCount, 10);
        const videoCount = parseInt(stats.videoCount, 10);
        const viewCount = parseInt(stats.viewCount, 10);

        const db = getDb();
        await db
          .collection("meta")
          .doc("stats")
          .set(
            {
              youtube: {
                subscriberCount,
                videoCount,
                viewCount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );

        logger.info(
          `Successfully updated YouTube stats: ${subscriberCount} subscribers`
        );
      } else {
        logger.warn("No YouTube channel data found for ID:", channelId);
      }
    } catch (error) {
      logger.error("Error fetching YouTube stats", error);
    }
  }
);

export const syncAssetIndex = onSchedule(
  {
    schedule: "every day 01:00",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    logger.info("Starting syncAssetIndex function");
    const bucket = admin.storage().bucket();
    const db = getDb();
    const collectionRef = db.collection("assets_index");

    try {
      // 1. Get all files
      const [files] = await bucket.getFiles();
      logger.info(`Found ${files.length} files in storage`);

      const BATCH_SIZE = 450;
      let batch = db.batch();
      let operationCount = 0;
      let totalBatches = 0;

      const currentSyncTime = admin.firestore.Timestamp.now();
      const processedFolders = new Set<string>();

      for (const file of files) {
        if (file.name.endsWith("/")) continue;

        // Process File
        const fileName = file.name.split("/").pop() || "";
        const safeId = file.name.replace(/\//g, "___");
        const parentId = file.name.includes("/")
          ? file.name.substring(0, file.name.lastIndexOf("/"))
          : "";

        // Generate simple keywords for search (name parts)
        const keywords = fileName
          .toLowerCase()
          .split(/[\s\-_.]+/)
          .filter((k) => k.length > 2);
        keywords.push(fileName.toLowerCase()); // full name

        batch.set(
          collectionRef.doc(safeId),
          {
            name: fileName,
            path: file.name,
            parentId: parentId, // Index parent folder path
            type: "file",
            size: file.metadata.size ? parseInt(String(file.metadata.size)) : 0,
            mimeType: file.metadata.contentType || "application/octet-stream",
            updatedAt: file.metadata.updated || new Date().toISOString(),
            createdAt: file.metadata.timeCreated || new Date().toISOString(),
            lastSync: currentSyncTime,
            nameLower: fileName.toLowerCase(),
            keywords: keywords,
          },
          { merge: true }
        );
        operationCount++;

        // Process Parent Folders
        // "a/b/c.jpg" -> process "a/b", then "a"
        let parentPath = parentId;
        while (parentPath) {
          if (!processedFolders.has(parentPath)) {
            processedFolders.add(parentPath);
            const safeFolderId = parentPath.replace(/\//g, "___");
            const folderName = parentPath.split("/").pop() || parentPath;
            const folderParentId = parentPath.includes("/")
              ? parentPath.substring(0, parentPath.lastIndexOf("/"))
              : "";

            batch.set(
              collectionRef.doc(safeFolderId),
              {
                name: folderName,
                path: parentPath,
                parentId: folderParentId, // Index parent of the folder
                type: "folder",
                size: 0, // Folders don't have intrinsic size in this model, or we aggregate later?
                // For stats, we sum files. For listing, we just need existence.
                mimeType: "application/vnd.google-apps.folder",
                updatedAt: currentSyncTime.toDate().toISOString(),
                createdAt: currentSyncTime.toDate().toISOString(),
                lastSync: currentSyncTime,
                nameLower: folderName.toLowerCase(),
                keywords: [folderName.toLowerCase()],
              },
              { merge: true }
            );
            operationCount++;
          }
          // Move up
          parentPath = parentPath.includes("/")
            ? parentPath.substring(0, parentPath.lastIndexOf("/"))
            : "";
          if (operationCount >= BATCH_SIZE) {
            await batch.commit();
            totalBatches++;
            batch = db.batch();
            operationCount = 0;
          }
        }

        if (operationCount >= BATCH_SIZE) {
          await batch.commit();
          totalBatches++;
          batch = db.batch();
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
        totalBatches++;
      }

      logger.info("Asset index sync complete");
    } catch (error) {
      logger.error("Error syncing asset index", error);
    }
  }
);

// Real-time Indexing Triggers
// Note: Requires "firebase-functions/v2/storage" import if using v2, but we use v1/v2 mixed.
// Let's use v2 storage triggers.
import {
  onObjectFinalized,
  onObjectDeleted,
} from "firebase-functions/v2/storage";

export const indexAssetOnUpload = onObjectFinalized(
  { region: "europe-west1" },
  async (event) => {
    const file = event.data;
    const db = getDb();
    const safeId = file.name.replace(/\//g, "___");
    const parentId = file.name.includes("/")
      ? file.name.substring(0, file.name.lastIndexOf("/"))
      : "";
    const fileName = file.name.split("/").pop() || "";

    // Keywords
    const keywords = fileName
      .toLowerCase()
      .split(/[\s\-_.]+/)
      .filter((k) => k.length > 2);
    keywords.push(fileName.toLowerCase());

    await db
      .collection("assets_index")
      .doc(safeId)
      .set(
        {
          name: fileName,
          path: file.name,
          parentId: parentId,
          items: [file.name],
          type: "file",
          size: file.size ? parseInt(String(file.size)) : 0,
          mimeType: file.contentType || "application/octet-stream",
          updatedAt: file.updated || new Date().toISOString(),
          createdAt: file.timeCreated || new Date().toISOString(),
          lastSync: admin.firestore.Timestamp.now(),
          nameLower: fileName.toLowerCase(),
          keywords: keywords,
        },
        { merge: true }
      );

    // Also ensure parent folder exists (simple check)
    if (parentId) {
      const safeFolderId = parentId.replace(/\//g, "___");
      const folderName = parentId.split("/").pop() || parentId;
      const folderParentId = parentId.includes("/")
        ? parentId.substring(0, parentId.lastIndexOf("/"))
        : "";

      // Upsert folder just in case
      await db
        .collection("assets_index")
        .doc(safeFolderId)
        .set(
          {
            name: folderName,
            path: parentId,
            parentId: folderParentId,
            type: "folder",
            mimeType: "application/vnd.google-apps.folder",
            updatedAt: new Date().toISOString(),
            lastSync: admin.firestore.Timestamp.now(),
            nameLower: folderName.toLowerCase(),
            keywords: [folderName.toLowerCase()],
          },
          { merge: true }
        );
    }

    logger.info(`Indexed new asset: ${file.name}`);
  }
);

export const removeAssetFromIndex = onObjectDeleted(
  { region: "europe-west1" },
  async (event) => {
    const file = event.data;
    const db = getDb();
    const safeId = file.name.replace(/\//g, "___");

    await db.collection("assets_index").doc(safeId).delete();
    logger.info(`Removed asset from index: ${file.name}`);
  }
);

export const checkScheduledPosts = onSchedule(
  {
    schedule: "every 1 hours",
    region: "europe-west1",
  },
  async (event) => {
    logger.info("Starting checkScheduledPosts function");
    const db = getDb();
    const now = admin.firestore.Timestamp.now();

    try {
      // Query for articles that are NOT published AND have a scheduled date in the past
      const snapshot = await db
        .collection("articles")
        .where("publish", "==", false)
        .where("scheduledPublishDate", "<=", now)
        .get();

      if (snapshot.empty) {
        logger.info("No scheduled posts found to publish.");
        return;
      }

      logger.info(`Found ${snapshot.size} scheduled posts to publish.`);

      await mutateDocumentsInChunks(snapshot.docs, (batch, doc) => {
        batch.update(doc.ref, {
          publish: true,
          date: doc.data()?.scheduledPublishDate || now, // Use scheduled time as publish time
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      logger.info(`Successfully published ${snapshot.size} articles.`);
    } catch (error) {
      logger.error("Error in checkScheduledPosts", error);
    }
  }
);

// ---------------------------------------------------------------------------
// NOTIFICATION SYSTEM TRIGGERS & HELPERS
// ---------------------------------------------------------------------------

function extractMentionHandles(text: string): string[] {
  if (typeof text !== "string") return [];
  const mentionPattern = /(?:^|[^a-z0-9_.-])@([a-z0-9_-]{3,20})/gi;
  const handles = new Set<string>();
  for (const match of text.matchAll(mentionPattern)) {
    if (match[1]) {
      handles.add(match[1].toLowerCase());
    }
  }
  return [...handles];
}

async function resolveHandlesToUids(
  handles: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (handles.length === 0) return result;
  const firestore = getDb();
  await Promise.all(
    handles.map(async (handle) => {
      try {
        const snap = await firestore.collection("handles").doc(handle).get();
        if (snap.exists && typeof snap.data()?.uid === "string") {
          result.set(handle, snap.data()!.uid);
        }
      } catch (e) {
        logger.error(`Error resolving handle ${handle}:`, e);
      }
    })
  );
  return result;
}

interface NotificationPayload {
  userId: string;
  type: "mention" | "new_comment" | "new_post" | "user_report" | "warning" | "suspension";
  title: string;
  message: string;
  link: string;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

async function sendNotification(payload: NotificationPayload) {
  try {
    const firestore = getDb();
    const notifications = firestore
      .collection("users")
      .doc(payload.userId)
      .collection("notifications");
    const data = {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: payload.metadata || {},
      };
    if (payload.idempotencyKey) {
      const id = createHash("sha256")
        .update(payload.idempotencyKey, "utf8")
        .digest("hex");
      await notifications.doc(id).set(data);
    } else {
      await notifications.add(data);
    }
  } catch (error) {
    logger.error(`Error sending notification to user ${payload.userId}:`, error);
  }
}

export const onCommentCreated = onDocumentCreated(
  {
    document: "comments/{commentId}",
    region: "europe-west1",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const comment = snapshot.data();
    if (!comment || comment.status !== "visible") return;

    const commentId = event.params.commentId;
    const authorId = comment.authorId || "";
    const authorName = comment.authorName || "Someone";
    const articleTitle = comment.articleTitle || "an article";
    const articleSlug = comment.articleSlug || "";
    const content = typeof comment.content === "string" ? comment.content : "";
    const snippet = content.length > 100 ? `${content.slice(0, 97)}...` : content;
    const link = `/posts/${articleSlug}#comments`;

    const notifiedUids = new Set<string>();
    if (authorId) notifiedUids.add(authorId);

    // 1. Mentions
    const mentionedHandles = extractMentionHandles(content);
    if (mentionedHandles.length > 0) {
      const handleToUid = await resolveHandlesToUids(mentionedHandles);
      for (const [handle, targetUid] of handleToUid.entries()) {
        if (!notifiedUids.has(targetUid)) {
          notifiedUids.add(targetUid);
          await sendNotification({
            userId: targetUid,
            type: "mention",
            title: `${authorName} mentioned you`,
            message: `In a comment on "${articleTitle}": "${snippet}"`,
            link,
            idempotencyKey: `comment:${commentId}:mention:${targetUid}`,
            metadata: {
              articleId: comment.articleId,
              articleSlug,
              commentId,
              authorId,
              authorName,
              authorHandle: comment.authorHandle || handle,
            },
          });
        }
      }
    }

    // 2. Moderators and Staff
    try {
      const firestore = getDb();
      const staffSnapshot = await firestore
        .collection("authors")
        .where("role", "in", ["super", "admin", "moderator"])
        .get();

      for (const staffDoc of staffSnapshot.docs) {
        const staffUid = staffDoc.id;
        if (!notifiedUids.has(staffUid)) {
          notifiedUids.add(staffUid);
          await sendNotification({
            userId: staffUid,
            type: "new_comment",
            title: `New comment from ${authorName}`,
            message: `On "${articleTitle}": "${snippet}"`,
            link,
            idempotencyKey: `comment:${commentId}:staff:${staffUid}`,
            metadata: {
              articleId: comment.articleId,
              articleSlug,
              commentId,
              authorId,
              authorName,
              authorHandle: comment.authorHandle,
              isStaffAlert: true,
            },
          });
        }
      }
    } catch (staffError) {
      logger.error("Error notifying staff of new comment:", staffError);
    }
  }
);

export const onCommentReplyCreated = onDocumentCreated(
  {
    document: "commentReplies/{replyId}",
    region: "europe-west1",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const reply = snapshot.data();
    if (!reply || reply.status !== "visible") return;

    const replyId = event.params.replyId;
    const parentCommentId = reply.parentCommentId || "";
    const authorId = reply.authorId || "";
    const authorName = reply.authorName || "Someone";
    const articleTitle = reply.articleTitle || "an article";
    const articleSlug = reply.articleSlug || "";
    const content = typeof reply.content === "string" ? reply.content : "";
    const snippet = content.length > 100 ? `${content.slice(0, 97)}...` : content;
    const link = `/posts/${articleSlug}#comments`;

    const notifiedUids = new Set<string>();
    if (authorId) notifiedUids.add(authorId);

    // 1. Mentions
    const mentionedHandles = extractMentionHandles(content);
    if (mentionedHandles.length > 0) {
      const handleToUid = await resolveHandlesToUids(mentionedHandles);
      for (const [handle, targetUid] of handleToUid.entries()) {
        if (!notifiedUids.has(targetUid)) {
          notifiedUids.add(targetUid);
          await sendNotification({
            userId: targetUid,
            type: "mention",
            title: `${authorName} mentioned you`,
            message: `In a reply on "${articleTitle}": "${snippet}"`,
            link,
            idempotencyKey: `reply:${replyId}:mention:${targetUid}`,
            metadata: {
              articleId: reply.articleId,
              articleSlug,
              commentId: replyId,
              parentCommentId,
              authorId,
              authorName,
              authorHandle: reply.authorHandle || handle,
            },
          });
        }
      }
    }

    // 2. Parent comment author notification
    if (parentCommentId) {
      try {
        const firestore = getDb();
        const parentDoc = await firestore
          .collection("comments")
          .doc(parentCommentId)
          .get();
        if (parentDoc.exists) {
          const parentAuthorId = parentDoc.data()?.authorId;
          if (parentAuthorId && !notifiedUids.has(parentAuthorId)) {
            notifiedUids.add(parentAuthorId);
            await sendNotification({
              userId: parentAuthorId,
              type: "mention",
              title: `${authorName} replied to your comment`,
              message: `On "${articleTitle}": "${snippet}"`,
              link,
              idempotencyKey: `reply:${replyId}:parent:${parentAuthorId}`,
              metadata: {
                articleId: reply.articleId,
                articleSlug,
                commentId: replyId,
                parentCommentId,
                authorId,
                authorName,
                authorHandle: reply.authorHandle,
              },
            });
          }
        }
      } catch (parentError) {
        logger.error("Error notifying parent comment author:", parentError);
      }
    }

    // 3. Moderators and Staff
    try {
      const firestore = getDb();
      const staffSnapshot = await firestore
        .collection("authors")
        .where("role", "in", ["super", "admin", "moderator"])
        .get();

      for (const staffDoc of staffSnapshot.docs) {
        const staffUid = staffDoc.id;
        if (!notifiedUids.has(staffUid)) {
          notifiedUids.add(staffUid);
          await sendNotification({
            userId: staffUid,
            type: "new_comment",
            title: `New reply from ${authorName}`,
            message: `On "${articleTitle}": "${snippet}"`,
            link,
            idempotencyKey: `reply:${replyId}:staff:${staffUid}`,
            metadata: {
              articleId: reply.articleId,
              articleSlug,
              commentId: replyId,
              parentCommentId,
              authorId,
              authorName,
              authorHandle: reply.authorHandle,
              isStaffAlert: true,
            },
          });
        }
      }
    } catch (staffError) {
      logger.error("Error notifying staff of new reply:", staffError);
    }
  }
);

export const onArticlePublished = onDocumentWritten(
  {
    document: "articles/{articleId}",
    region: "europe-west1",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return; // Deleted article

    const wasPublished = before?.publish === true;
    const isPublished = after.publish === true;

    // Trigger only when transitioning from not published to published
    if (!wasPublished && isPublished) {
      const articleId = event.params.articleId;
      const title = after.title || "New Article";
      const slug = after.slug || articleId;
      const img = after.img || "";
      const link = `/posts/${slug}`;

      logger.info(`Article "${title}" published! Notifying readers...`);

      try {
        const firestore = getDb();
        const usersSnapshot = await firestore.collection("users").get();
        if (usersSnapshot.empty) {
          logger.info("No registered users found to notify for new post.");
          return;
        }

        const BATCH_SIZE = 400;
        let batch = firestore.batch();
        let count = 0;

        for (const userDoc of usersSnapshot.docs) {
          const notificationRef = firestore
            .collection("users")
            .doc(userDoc.id)
            .collection("notifications")
            .doc(createHash("sha256").update(`article:${articleId}`, "utf8").digest("hex"));

          batch.set(notificationRef, {
            userId: userDoc.id,
            type: "new_post",
            title: "New Post Published",
            message: `"${title}" is now live!`,
            link,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
              articleId,
              articleSlug: slug,
              title,
              img,
            },
          });

          count++;
          if (count % BATCH_SIZE === 0) {
            await batch.commit();
            batch = firestore.batch();
          }
        }

        if (count % BATCH_SIZE !== 0) {
          await batch.commit();
        }

        logger.info(`Successfully sent new post notification to ${count} users.`);
      } catch (publishError) {
        logger.error("Error notifying readers of published article:", publishError);
      }
    }
  }
);

export const togglePinComment = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const { commentId, pinned } = request.data as {
      commentId: string;
      pinned: boolean;
    };

    if (!commentId || typeof pinned !== "boolean") {
      throw new HttpsError("invalid-argument", "Invalid comment ID or pin state.");
    }

    const authorDoc = await getDb().collection("authors").doc(request.auth.uid).get();
    const role = authorDoc.data()?.role;
    if (!authorDoc.exists || (role !== "admin" && role !== "super")) {
      throw new HttpsError(
        "permission-denied",
        "Only admins and super admins can pin comments."
      );
    }

    const commentRef = getDb().collection("comments").doc(commentId);
    const commentDoc = await commentRef.get();
    if (!commentDoc.exists) {
      throw new HttpsError("not-found", "Comment not found.");
    }

    const articleId = commentDoc.data()?.articleId;
    const batch = getDb().batch();

    if (pinned) {
      if (articleId) {
        const currentPinned = await getDb()
          .collection("comments")
          .where("articleId", "==", articleId)
          .where("pinned", "==", true)
          .get();

        currentPinned.forEach((docSnap) => {
          if (docSnap.id !== commentId) {
            batch.update(docSnap.ref, {
              pinned: false,
              pinnedAt: admin.firestore.FieldValue.delete(),
              pinnedBy: admin.firestore.FieldValue.delete(),
            });
          }
        });
      }

      batch.update(commentRef, {
        pinned: true,
        pinnedAt: admin.firestore.FieldValue.serverTimestamp(),
        pinnedBy: request.auth.uid,
      });
    } else {
      batch.update(commentRef, {
        pinned: false,
        pinnedAt: admin.firestore.FieldValue.delete(),
        pinnedBy: admin.firestore.FieldValue.delete(),
      });
    }

    await batch.commit();

    await writeServerAuditLog({
      actorUid: request.auth.uid,
      action: pinned ? "comment.pin" : "comment.unpin",
      category: "comments",
      details: `${pinned ? "Pinned" : "Unpinned"} comment on article "${commentDoc.data()?.articleTitle || articleId}"`,
      targetId: commentId,
      targetTitle: commentDoc.data()?.articleTitle || articleId,
      metadata: { articleId, pinned },
    });

    return { success: true, pinned };
  }
);

export const cleanupPermanentlyDeletedArticleAssets = onDocumentDeleted(
  { document: "articleTrash/{articleId}", region: "europe-west1" },
  async (event) => {
    const articleId = event.params.articleId;
    const restoredArticle = await getDb().collection("articles").doc(articleId).get();
    if (restoredArticle.exists) return;
    await admin.storage().bucket().deleteFiles({ prefix: `Articles/${articleId}/` });
    logger.info("Removed assets for permanently deleted article", { articleId });
  }
);

type CommentAttachment = {
  url: string;
  storagePath: string;
  width?: number;
  height?: number;
  alt?: string;
};

function normalizeCommentAttachments(value: unknown, uid: string): CommentAttachment[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 4) {
    throw new HttpsError("invalid-argument", "A post can contain at most four images.");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new HttpsError("invalid-argument", "Invalid image attachment.");
    }
    const source = item as Record<string, unknown>;
    const storagePath = typeof source.storagePath === "string" ? source.storagePath : "";
    const url = typeof source.url === "string" ? source.url : "";
    if (!new RegExp(`^comments/${uid}/[a-zA-Z0-9_-]{20,64}/[0-3]\\.(webp|jpg)$`).test(storagePath)) {
      throw new HttpsError("invalid-argument", "An image does not belong to this account.");
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== "firebasestorage.googleapis.com" ||
          !decodeURIComponent(parsed.pathname).includes(storagePath)) {
        throw new Error("mismatch");
      }
    } catch {
      throw new HttpsError("invalid-argument", "Invalid image URL.");
    }
    const boundedDimension = (field: "width" | "height") => {
      const candidate = Number(source[field]);
      return Number.isInteger(candidate) && candidate > 0 && candidate <= 1600
        ? candidate
        : undefined;
    };
    const alt = typeof source.alt === "string" ? source.alt.trim().slice(0, 180) : "";
    return {
      url,
      storagePath,
      ...(boundedDimension("width") ? { width: boundedDimension("width") } : {}),
      ...(boundedDimension("height") ? { height: boundedDimension("height") } : {}),
      ...(alt ? { alt } : {}),
    };
  });
}

function getAttachmentReservationId(attachments: CommentAttachment[], uid: string) {
  if (!attachments.length) return "";
  const ids = new Set(attachments.map((attachment) =>
    new RegExp(`^comments/${uid}/([a-zA-Z0-9_-]{20,64})/`).exec(attachment.storagePath)?.[1] || ""
  ));
  if (ids.size !== 1 || ids.has("")) {
    throw new HttpsError("invalid-argument", "Images must come from one upload reservation.");
  }
  return [...ids][0];
}

async function verifyCommentAttachmentObjects(attachments: CommentAttachment[]) {
  const bucket = admin.storage().bucket();
  await Promise.all(attachments.map(async (attachment) => {
    const object = bucket.file(attachment.storagePath);
    const [[metadata], [header]] = await Promise.all([
      object.getMetadata(),
      object.download({ start: 0, end: 15 }),
    ]).catch(() => {
      throw new HttpsError("failed-precondition", "An uploaded image could not be verified.");
    });
    const size = Number(metadata.size) || 0;
    const contentType = String(metadata.contentType || "");
    const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isWebp = header.length >= 12 &&
      header.subarray(0, 4).toString("ascii") === "RIFF" &&
      header.subarray(8, 12).toString("ascii") === "WEBP";
    if (size <= 0 || size > 2 * 1024 * 1024 ||
        !((contentType === "image/jpeg" && isJpeg) || (contentType === "image/webp" && isWebp))) {
      throw new HttpsError("failed-precondition", "An uploaded image failed validation.");
    }
    try {
      const parsed = new URL(attachment.url);
      const expectedPath = `/v0/b/${bucket.name}/o/${encodeURIComponent(attachment.storagePath)}`;
      const downloadTokens = String(metadata.metadata?.firebaseStorageDownloadTokens || "")
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean);
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== "firebasestorage.googleapis.com" ||
        parsed.pathname !== expectedPath ||
        parsed.searchParams.get("alt") !== "media" ||
        !downloadTokens.includes(parsed.searchParams.get("token") || "")
      ) {
        throw new Error("Attachment URL does not match the verified object.");
      }
    } catch {
      throw new HttpsError("failed-precondition", "An uploaded image URL failed validation.");
    }
  }));
}

function validatePostContent(value: unknown, hasAttachments: boolean) {
  const content = typeof value === "string" ? value.trim() : "";
  if (content.length > 2000 || (!content && !hasAttachments)) {
    throw new HttpsError("invalid-argument", "Write a message up to 2,000 characters.");
  }
  return content;
}

function attachmentClaimRef(attachment: CommentAttachment) {
  return getDb().collection("commentAttachmentClaims").doc(
    createHash("sha256").update(attachment.storagePath, "utf8").digest("hex")
  );
}

export const reserveCommentUploads = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to upload images.");
    const uid = request.auth.uid;
    const extensions = Array.isArray(request.data?.extensions)
      ? request.data.extensions
      : [];
    if (extensions.length < 1 || extensions.length > 4 ||
        extensions.some((value: unknown) => !["webp", "jpg"].includes(value as string))) {
      throw new HttpsError("invalid-argument", "Reserve between one and four JPG or WebP images.");
    }
    await Promise.all([
      enforceRateLimit(`uploads_hour_${uid}`, 12, 60 * 60_000, "Too many image uploads. Please try again later."),
      enforceRateLimit(`uploads_day_${uid}`, 40, 24 * 60 * 60_000, "Your daily image upload limit has been reached."),
    ]);
    const firestore = getDb();
    const [user, author] = await Promise.all([
      firestore.collection("users").doc(uid).get(),
      firestore.collection("authors").doc(uid).get(),
    ]);
    const isStaff = author.exists && RESERVABLE_TEAM_ROLES.includes(author.data()?.role);
    if (!isStaff && (!user.exists || !isAccountAllowedToParticipate(user.data()))) {
      throw new HttpsError("permission-denied", "This account cannot upload comment images.");
    }
    const reservationId = randomBytes(24).toString("base64url");
    const fileNames = extensions.map((extension: string, index: number) => `${index}.${extension}`);
    const storagePaths = fileNames.map((fileName: string) =>
      `comments/${uid}/${reservationId}/${fileName}`
    );
    await firestore.collection("commentUploadReservations").doc(reservationId).create({
      uid,
      fileNames,
      storagePaths,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60_000),
    });
    return { reservationId, storagePaths };
  }
);

export const createComment = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to comment.");
    const uid = request.auth.uid;
    const articleId = typeof request.data?.articleId === "string"
      ? request.data.articleId.trim()
      : "";
    if (!articleId || articleId.length > 128 || articleId.includes("/")) {
      throw new HttpsError("invalid-argument", "Invalid article.");
    }
    const attachments = normalizeCommentAttachments(request.data?.images, uid);
    const reservationId = getAttachmentReservationId(attachments, uid);
    const content = validatePostContent(request.data?.content, attachments.length > 0);
    await Promise.all([
      enforceRateLimit(`posts_minute_${uid}`, 6, 60_000, "You are posting too quickly. Please wait a minute."),
      enforceRateLimit(`posts_day_${uid}`, 60, 24 * 60 * 60_000, "Your daily posting limit has been reached."),
      verifyCommentAttachmentObjects(attachments),
    ]);

    const firestore = getDb();
    const commentRef = firestore.collection("comments").doc();
    const userRef = firestore.collection("users").doc(uid);
    const authorRef = firestore.collection("authors").doc(uid);
    const articleRef = firestore.collection("articles").doc(articleId);
    const claimRefs = attachments.map(attachmentClaimRef);
    const reservationRef = reservationId
      ? firestore.collection("commentUploadReservations").doc(reservationId)
      : null;

    await firestore.runTransaction(async (transaction) => {
      const [user, author, article, reservation, ...claims] = await Promise.all([
        transaction.get(userRef),
        transaction.get(authorRef),
        transaction.get(articleRef),
        reservationRef ? transaction.get(reservationRef) : Promise.resolve(null),
        ...claimRefs.map((ref) => transaction.get(ref)),
      ]);
      const identity = getCommenterIdentity(author, user, "comments");
      if (!article.exists || article.data()?.publish !== true) {
        throw new HttpsError("failed-precondition", "Comments are available only on published articles.");
      }
      if (claims.some((claim) => claim.exists)) {
        throw new HttpsError("already-exists", "An image is already attached to another post.");
      }
      if (attachments.length && (!reservation?.exists || reservation.data()?.uid !== uid ||
          reservation.data()?.expiresAt?.toMillis?.() < Date.now() ||
          attachments.some((attachment) => !reservation.data()?.storagePaths?.includes(attachment.storagePath)))) {
        throw new HttpsError("failed-precondition", "The image upload reservation is invalid or expired.");
      }
      const images = attachments;
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.create(commentRef, {
        articleId,
        articleSlug: article.data()?.slug || "",
        articleTitle: article.data()?.title || "",
        authorId: uid,
        authorName: identity.name,
        authorHandle: identity.handle,
        authorPhotoURL: identity.photoURL,
        content,
        ...(images.length ? {
          images,
          imageUrl: images[0].url,
          imageStoragePath: images[0].storagePath,
          ...(images[0].width ? { imageWidth: images[0].width } : {}),
          ...(images[0].height ? { imageHeight: images[0].height } : {}),
        } : {}),
        status: "visible",
        createdAt: now,
        updatedAt: now,
        edited: false,
        likeCount: 0,
        dislikeCount: 0,
        replyCount: 0,
      });
      claimRefs.forEach((ref, index) => transaction.create(ref, {
        storagePath: images[index].storagePath,
        ownerUid: uid,
        contentType: "comment",
        contentId: commentRef.id,
        createdAt: now,
      }));
      if (reservationRef) transaction.delete(reservationRef);
    });
    return { success: true, commentId: commentRef.id };
  }
);

export const createCommentReply = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to reply.");
    const uid = request.auth.uid;
    const parentCommentId = typeof request.data?.parentCommentId === "string"
      ? request.data.parentCommentId.trim()
      : "";
    if (!parentCommentId || parentCommentId.length > 128 || parentCommentId.includes("/")) {
      throw new HttpsError("invalid-argument", "Invalid parent comment.");
    }
    const attachments = normalizeCommentAttachments(request.data?.images, uid);
    const reservationId = getAttachmentReservationId(attachments, uid);
    const content = validatePostContent(request.data?.content, attachments.length > 0);
    await Promise.all([
      enforceRateLimit(`posts_minute_${uid}`, 6, 60_000, "You are posting too quickly. Please wait a minute."),
      enforceRateLimit(`posts_day_${uid}`, 60, 24 * 60 * 60_000, "Your daily posting limit has been reached."),
      verifyCommentAttachmentObjects(attachments),
    ]);

    const firestore = getDb();
    const replyRef = firestore.collection("commentReplies").doc();
    const userRef = firestore.collection("users").doc(uid);
    const authorRef = firestore.collection("authors").doc(uid);
    const parentRef = firestore.collection("comments").doc(parentCommentId);
    const claimRefs = attachments.map(attachmentClaimRef);
    const reservationRef = reservationId
      ? firestore.collection("commentUploadReservations").doc(reservationId)
      : null;

    await firestore.runTransaction(async (transaction) => {
      const [user, author, parent, reservation, ...claims] = await Promise.all([
        transaction.get(userRef),
        transaction.get(authorRef),
        transaction.get(parentRef),
        reservationRef ? transaction.get(reservationRef) : Promise.resolve(null),
        ...claimRefs.map((ref) => transaction.get(ref)),
      ]);
      const identity = getCommenterIdentity(author, user, "replies");
      if (!parent.exists || parent.data()?.status !== "visible") {
        throw new HttpsError("failed-precondition", "That comment is not available for replies.");
      }
      const articleRef = firestore.collection("articles").doc(parent.data()?.articleId || "_");
      const article = await transaction.get(articleRef);
      const isStaff =
        author.exists && RESERVABLE_TEAM_ROLES.includes(author.data()?.role);
      if (!article.exists || (!isStaff && article.data()?.publish !== true)) {
        throw new HttpsError("failed-precondition", "Replies are unavailable for this article.");
      }
      if (claims.some((claim) => claim.exists)) {
        throw new HttpsError("already-exists", "An image is already attached to another post.");
      }
      if (attachments.length && (!reservation?.exists || reservation.data()?.uid !== uid ||
          reservation.data()?.expiresAt?.toMillis?.() < Date.now() ||
          attachments.some((attachment) => !reservation.data()?.storagePaths?.includes(attachment.storagePath)))) {
        throw new HttpsError("failed-precondition", "The image upload reservation is invalid or expired.");
      }
      const images = attachments;
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.create(replyRef, {
        parentCommentId,
        articleId: parent.data()?.articleId || "",
        articleSlug: parent.data()?.articleSlug || article.data()?.slug || "",
        articleTitle: parent.data()?.articleTitle || article.data()?.title || "",
        authorId: uid,
        authorName: identity.name,
        authorHandle: identity.handle,
        authorPhotoURL: identity.photoURL,
        content,
        ...(images.length ? {
          images,
          imageUrl: images[0].url,
          imageStoragePath: images[0].storagePath,
          ...(images[0].width ? { imageWidth: images[0].width } : {}),
          ...(images[0].height ? { imageHeight: images[0].height } : {}),
        } : {}),
        status: "visible",
        createdAt: now,
        updatedAt: now,
        edited: false,
      });
      claimRefs.forEach((ref, index) => transaction.create(ref, {
        storagePath: images[index].storagePath,
        ownerUid: uid,
        contentType: "reply",
        contentId: replyRef.id,
        createdAt: now,
      }));
      if (reservationRef) transaction.delete(reservationRef);
    });
    return { success: true, replyId: replyRef.id };
  }
);

export const submitReport = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to submit a report.");
    }
    const uid = request.auth.uid;
    const type = request.data?.type;
    const targetId = typeof request.data?.targetId === "string"
      ? request.data.targetId.trim()
      : "";
    const reason = typeof request.data?.reason === "string"
      ? request.data.reason.trim()
      : "";
    const details = typeof request.data?.details === "string"
      ? request.data.details.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500)
      : "";
    if (
      !["user", "comment", "reply"].includes(type) ||
      !targetId || targetId.length > 128 || targetId.includes("/") || /[\r\n\0]/.test(targetId) ||
      !REPORT_REASONS.has(reason)
    ) {
      throw new HttpsError("invalid-argument", "Invalid report target or reason.");
    }

    await enforceRateLimit(
      `reports_${uid}`,
      5,
      60 * 60_000,
      "You have submitted several reports. Please wait before reporting again."
    );

    const firestore = getDb();
    const reporter = await firestore.collection("users").doc(uid).get();
    if (!reporter.exists || !isAccountAllowedToParticipate(reporter.data())) {
      throw new HttpsError("permission-denied", "This account cannot submit reports.");
    }

    let targetData: admin.firestore.DocumentData | undefined;
    let reportedUserId = targetId;
    let commentId: string | null = null;
    let parentCommentId: string | null = null;
    if (type === "comment") {
      const snapshot = await firestore.collection("comments").doc(targetId).get();
      if (!snapshot.exists || snapshot.data()?.status !== "visible") {
        throw new HttpsError("not-found", "That comment is no longer available.");
      }
      targetData = snapshot.data();
      reportedUserId = targetData?.authorId;
      commentId = snapshot.id;
    } else if (type === "reply") {
      const snapshot = await firestore.collection("commentReplies").doc(targetId).get();
      if (!snapshot.exists || snapshot.data()?.status !== "visible") {
        throw new HttpsError("not-found", "That reply is no longer available.");
      }
      targetData = snapshot.data();
      reportedUserId = targetData?.authorId;
      commentId = snapshot.id;
      parentCommentId = targetData?.parentCommentId || null;
    } else {
      const snapshot = await firestore.collection("users").doc(targetId).get();
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "That user is no longer available.");
      }
      targetData = snapshot.data();
    }

    if (typeof reportedUserId !== "string" || !reportedUserId || reportedUserId === uid) {
      throw new HttpsError("failed-precondition", "You cannot report this target.");
    }
    const targetAuthor = await firestore.collection("authors").doc(reportedUserId).get();
    if (targetAuthor.exists) {
      throw new HttpsError("failed-precondition", "Team accounts cannot be reported here.");
    }

    const reportedUser = await firestore.collection("users").doc(reportedUserId).get();
    const reportedData = reportedUser.data() || targetData || {};
    const reporterData = reporter.data() || {};
    const reasonLabels: Record<string, string> = {
      harassment: "Harassment, Bullying, or Threats",
      spam: "Spam, Advertising, or Scams",
      hate_speech: "Hate Speech or Discrimination",
      inappropriate: "Inappropriate or Explicit Content",
      impersonation: "Impersonation or False Identity",
      other: "Other Policy Violation",
    };
    const reportRef = firestore.collection("reports").doc();
    await reportRef.set({
      type,
      reportedUserId,
      reportedUserHandle: reportedData.handle || targetData?.authorHandle || "unknown",
      reportedUserName: reportedData.displayName || targetData?.authorName || "Reader",
      reporterId: uid,
      reporterHandle: reporterData.handle || "anonymous",
      reporterName: reporterData.displayName || "Reader",
      reason,
      reasonLabel: reasonLabels[reason],
      details,
      commentId,
      parentCommentId,
      commentContent: typeof targetData?.content === "string" ? targetData.content.slice(0, 2000) : null,
      articleId: targetData?.articleId || null,
      articleTitle: targetData?.articleTitle || null,
      articleSlug: targetData?.articleSlug || null,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 730 * 24 * 60 * 60_000),
    });
    return { submitted: true, reportId: reportRef.id };
  }
);

export const resolveReport = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }
    const reportId = typeof request.data?.reportId === "string"
      ? request.data.reportId.trim()
      : "";
    const action = request.data?.action;
    const notes = typeof request.data?.notes === "string"
      ? request.data.notes.replace(/[\r\n\t]+/g, " ").trim().slice(0, 1000)
      : "";
    if (!reportId || reportId.length > 128 || reportId.includes("/") ||
        !["dismiss", "hide", "delete"].includes(action)) {
      throw new HttpsError("invalid-argument", "Invalid report action.");
    }

    const firestore = getDb();
    const callerRef = firestore.collection("authors").doc(request.auth.uid);
    const reportRef = firestore.collection("reports").doc(reportId);
    let reportedUserHandle = "reader";
    let contentId = "";

    await firestore.runTransaction(async (transaction) => {
      const [caller, report] = await Promise.all([
        transaction.get(callerRef),
        transaction.get(reportRef),
      ]);
      if (!caller.exists || !["super", "admin", "moderator"].includes(caller.data()?.role)) {
        throw new HttpsError("permission-denied", "You cannot resolve reports.");
      }
      if (!report.exists) {
        throw new HttpsError("not-found", "That report no longer exists.");
      }
      const reportData = report.data() || {};
      if (reportData.status !== "pending") {
        throw new HttpsError("failed-precondition", "That report has already been resolved.");
      }
      reportedUserHandle = reportData.reportedUserHandle || "reader";
      const reportedUserId = reportData.reportedUserId;
      const targetAuthorRef = typeof reportedUserId === "string" && reportedUserId
        ? firestore.collection("authors").doc(reportedUserId)
        : null;
      const requestedContentId = reportData.commentId;
      const contentCollection = reportData.type === "reply" ? "commentReplies" : "comments";
      const contentRef =
        action !== "dismiss" && typeof requestedContentId === "string" && requestedContentId
          ? firestore.collection(contentCollection).doc(requestedContentId)
          : null;
      const [targetAuthor, content] = await Promise.all([
        targetAuthorRef ? transaction.get(targetAuthorRef) : Promise.resolve(null),
        contentRef ? transaction.get(contentRef) : Promise.resolve(null),
      ]);
      if (targetAuthor?.exists) {
        throw new HttpsError("failed-precondition", "Team accounts cannot be moderated from a reader report.");
      }

      if (action !== "dismiss") {
        if (!contentRef || !content?.exists || content.data()?.authorId !== reportedUserId) {
          throw new HttpsError("failed-precondition", "The reported content no longer matches this report.");
        }
        contentId = content.id;
        if (action === "hide") {
          transaction.update(contentRef, {
            status: "hidden",
            moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
            moderatedBy: request.auth!.uid,
          });
        } else {
          transaction.delete(contentRef);
        }
      }

      transaction.update(reportRef, {
        status: action === "dismiss" ? "dismissed" : "action_taken",
        actionTaken: action === "dismiss"
          ? admin.firestore.FieldValue.delete()
          : `${action}_content`,
        resolutionNotes: notes ||
          (action === "dismiss"
            ? "Dismissed by staff review"
            : action === "hide"
              ? "Hidden reported content"
              : "Deleted reported content"),
        resolvedBy: request.auth!.uid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await writeServerAuditLog({
      actorUid: request.auth.uid,
      action: `report.${action}`,
      category: "comments",
      details: `${action === "dismiss" ? "Dismissed" : action === "hide" ? "Hid" : "Deleted"} report content for @${reportedUserHandle}`,
      targetId: reportId,
      targetTitle: `Report on @${reportedUserHandle}`,
      metadata: { reportId, contentId, action },
    });
    return { success: true, reportId, action };
  }
);

export const onReportCreated = onDocumentCreated(
  {
    document: "reports/{reportId}",
    region: "europe-west1",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const report = snapshot.data();
    if (!report) return;

    const reportId = event.params.reportId;
    const reportedUserHandle = report.reportedUserHandle || "a user";
    const reporterHandle = report.reporterHandle || "a reader";
    const reasonLabel = report.reasonLabel || report.reason || "Policy Violation";
    const details = report.details || report.commentContent || "";
    const snippet = details.length > 80 ? `${details.slice(0, 77)}...` : details;

    const db = getDb();

    // Reject any reports targeting team members / authors
    if (report.reportedUserId) {
      const targetAuthorSnap = await db.collection("authors").doc(report.reportedUserId).get();
      if (targetAuthorSnap.exists) {
        logger.warn(`Rejected invalid report ${reportId} against team member ${report.reportedUserId}`);
        await db.collection("reports").doc(reportId).delete();
        return;
      }
    }

    // Query staff with roles: super, admin, moderator (NOT authors)
    const staffSnapshot = await db
      .collection("authors")
      .where("role", "in", ["super", "admin", "moderator"])
      .get();

    if (staffSnapshot.empty) {
      logger.warn("No super, admin, or moderator staff found to notify for report:", reportId);
      return;
    }

    const notificationPromises = staffSnapshot.docs.map(async (docSnap) => {
      const staffUid = docSnap.id;
      if (staffUid === report.reporterId) return;

      await sendNotification({
        userId: staffUid,
        type: "user_report",
        title: `🚨 User Report: @${reportedUserHandle}`,
        message: `Reported by @${reporterHandle} for ${reasonLabel}${snippet ? `: "${snippet}"` : ""}`,
        link: "/admin/comments",
        idempotencyKey: `report:${reportId}:staff:${staffUid}`,
        metadata: {
          reportId,
          type: report.type || "user",
          reportedUserId: report.reportedUserId,
          reportedUserHandle: report.reportedUserHandle,
          reporterId: report.reporterId,
          reporterHandle: report.reporterHandle,
          reason: report.reason,
          commentId: report.commentId,
          articleId: report.articleId,
        },
      });
    });

    await Promise.all(notificationPromises);

    await writeServerAuditLog({
      actorUid: report.reporterId || "system",
      action: "report.created",
      category: "comments",
      details: `User @${reportedUserHandle} was reported by @${reporterHandle} (${reasonLabel})`,
      targetId: reportId,
      targetTitle: `@${reportedUserHandle}`,
      metadata: {
        reportedUserId: report.reportedUserId,
        reportedUserHandle: report.reportedUserHandle,
        reporterHandle: report.reporterHandle,
        reason: report.reason,
      },
    });

    logger.info(`Notified ${staffSnapshot.size} moderators/admins for report ${reportId}`);
  }
);

// ---------------------------------------------------------------------------
// MODERATION & ENFORCEMENT CALLABLE FUNCTIONS
// ---------------------------------------------------------------------------

function sanitizeIpKey(ip: string): string {
  return ip.trim().replace(/[:.]/g, "_").toLowerCase();
}

async function validateModerationReferences(params: {
  firestore: admin.firestore.Firestore;
  targetUid: string;
  reportId?: unknown;
  commentId?: unknown;
  commentType?: unknown;
}) {
  const { firestore, targetUid, reportId, commentId, commentType } = params;
  const isSafeId = (value: unknown): value is string =>
    typeof value === "string" && value.length >= 1 && value.length <= 128 && !value.includes("/");

  let reportData: admin.firestore.DocumentData | undefined;
  if (reportId != null) {
    if (!isSafeId(reportId)) {
      throw new HttpsError("invalid-argument", "Invalid report reference.");
    }
    const report = await firestore.collection("reports").doc(reportId).get();
    reportData = report.data();
    if (!report.exists || reportData?.reportedUserId !== targetUid) {
      throw new HttpsError("failed-precondition", "The report does not belong to this user.");
    }
  }

  if (commentId != null) {
    if (!isSafeId(commentId) || !["comment", "reply"].includes(String(commentType))) {
      throw new HttpsError("invalid-argument", "Invalid comment reference.");
    }
    if (reportData && reportData.commentId !== commentId) {
      throw new HttpsError("failed-precondition", "The content does not belong to this report.");
    }
    const collectionName = commentType === "reply" ? "commentReplies" : "comments";
    const content = await firestore.collection(collectionName).doc(commentId).get();
    if (!content.exists || content.data()?.authorId !== targetUid) {
      throw new HttpsError("failed-precondition", "The content does not belong to this user.");
    }
  }
}

function validateModerationPayload(
  targetUid: unknown,
  reason: unknown,
  customMessage: unknown
) {
  if (
    typeof targetUid !== "string" || !targetUid || targetUid.length > 128 ||
    targetUid.includes("/") || /[\r\n\0]/.test(targetUid) ||
    typeof reason !== "string" || !reason.trim() || reason.length > 300 ||
    (customMessage != null &&
      (typeof customMessage !== "string" || customMessage.length > 1000))
  ) {
    throw new HttpsError("invalid-argument", "Invalid moderation target, reason, or notice.");
  }
}

/**
 * Tier 1: Warning & Content Hide
 * Accessible by: Super Admins, Admins, Moderators
 */
export const warnUser = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const db = getDb();
    const callerUid = request.auth.uid;
    const callerRef = db.collection("authors").doc(callerUid);
    const callerSnap = await callerRef.get();
    const callerRole = callerSnap.data()?.role;

    if (!callerSnap.exists || !["super", "admin", "moderator"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "You do not have permission to issue warnings.");
    }

    const { targetUid, reason, customMessage, reportId, commentId, commentType } = request.data || {};
    validateModerationPayload(targetUid, reason, customMessage);

    const targetAuthorRef = db.collection("authors").doc(targetUid);
    const targetAuthorSnap = await targetAuthorRef.get();
    if (targetAuthorSnap.exists) {
      throw new HttpsError("failed-precondition", "Team members and official authors cannot be warned.");
    }

    const userRef = db.collection("users").doc(targetUid);
    await validateModerationReferences({
      firestore: db,
      targetUid,
      reportId,
      commentId,
      commentType,
    });
    const warnRef = userRef.collection("warnings").doc();
    let targetHandle = "reader";

    // Append the warning and change state atomically so a concurrent permanent ban wins.
    await db.runTransaction(async (transaction) => {
      const [currentCaller, currentAuthor, currentUser] = await Promise.all([
        transaction.get(callerRef),
        transaction.get(targetAuthorRef),
        transaction.get(userRef),
      ]);
      const currentCallerRole = currentCaller.data()?.role;
      if (
        !currentCaller.exists ||
        !["super", "admin", "moderator"].includes(currentCallerRole)
      ) {
        throw new HttpsError(
          "permission-denied",
          "You no longer have permission to issue warnings."
        );
      }
      if (currentAuthor.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Team members and official authors cannot be warned."
        );
      }
      if (!currentUser.exists) {
        throw new HttpsError("not-found", "Target user profile does not exist.");
      }
      const currentData = currentUser.data() || {};
      if (currentData.status === "banned" || currentData.bannedAt != null) {
        throw new HttpsError(
          "failed-precondition",
          "A permanently banned account cannot be warned. Use the unban action first."
        );
      }
      if (!ACTIVE_ACCOUNT_STATUSES.has(currentData.status || "active")) {
        throw new HttpsError(
          "failed-precondition",
          "Warnings can only be issued to active or already-warned reader accounts."
        );
      }
      targetHandle = currentData.handle || currentData.displayName || "reader";
      transaction.create(warnRef, {
        reason,
        customMessage: customMessage || "",
        issuedBy: callerUid,
        issuedByRole: currentCallerRole,
        reportId: reportId || null,
        commentId: commentId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(userRef, {
        status: "warning",
        warningCount: admin.firestore.FieldValue.increment(1),
        lastWarnedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastWarningReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // 3. Hide infringing comment/reply if provided
    if (commentId) {
      const coll = commentType === "reply" ? "commentReplies" : "comments";
      await db.collection(coll).doc(commentId).update({
        status: "hidden",
        moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
        moderatedBy: callerUid,
      });
    }

    // 4. Update report if provided
    if (reportId) {
      await db.collection("reports").doc(reportId).update({
        status: "action_taken",
        actionTaken: "warning",
        resolvedBy: callerUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolutionNotes: customMessage || `Issued warning for ${reason}`,
      });
    }

    // 5. Send notification to reader
    await sendNotification({
      userId: targetUid,
      type: "warning",
      title: "⚠️ Community Guidelines Warning",
      message: customMessage || `You have received a formal warning for violating our Community Guidelines (${reason}). Please review the guidelines to keep your account in good standing.`,
      link: "/community-guidelines",
      metadata: {
        warningId: warnRef.id,
        reason,
      },
    });

    // 6. Record server audit log
    await writeServerAuditLog({
      actorUid: callerUid,
      action: "moderation.warn_user",
      category: "comments",
      details: `Issued warning to @${targetHandle} (${reason})`,
      targetId: targetUid,
      targetTitle: `@${targetHandle}`,
      metadata: {
        targetUid,
        targetHandle,
        reason,
        customMessage,
        warningId: warnRef.id,
        reportId,
        commentId,
      },
    });

    return { success: true, warningId: warnRef.id };
  }
);

/**
 * Tier 2: Content Removal & Temporary Suspension
 * Accessible by: Super Admins, Admins, Moderators
 */
export const suspendUser = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const db = getDb();
    const callerUid = request.auth.uid;
    const callerRef = db.collection("authors").doc(callerUid);
    const callerSnap = await callerRef.get();
    const callerRole = callerSnap.data()?.role;

    if (!callerSnap.exists || !["super", "admin", "moderator"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "You do not have permission to suspend users.");
    }

    const { targetUid, durationDays = 3, reason, customMessage, reportId, commentId, commentType } = request.data || {};
    validateModerationPayload(targetUid, reason, customMessage);

    const targetAuthorRef = db.collection("authors").doc(targetUid);
    const targetAuthorSnap = await targetAuthorRef.get();
    if (targetAuthorSnap.exists) {
      throw new HttpsError("failed-precondition", "Team members and official authors cannot be suspended.");
    }

    const userRef = db.collection("users").doc(targetUid);
    const normalizedDurationDays = Math.min(
      365,
      Math.max(1, Number.isFinite(Number(durationDays)) ? Number(durationDays) : 3)
    );
    const suspensionMs = normalizedDurationDays * 24 * 60 * 60 * 1000;
    await validateModerationReferences({
      firestore: db,
      targetUid,
      reportId,
      commentId,
      commentType,
    });
    const suspendedUntilDate = new Date(Date.now() + suspensionMs);
    const suspendedUntilTimestamp = admin.firestore.Timestamp.fromDate(suspendedUntilDate);
    let targetHandle = "reader";

    // Change state transactionally so a concurrent permanent ban cannot be overwritten.
    await db.runTransaction(async (transaction) => {
      const [currentCaller, currentAuthor, currentUser] = await Promise.all([
        transaction.get(callerRef),
        transaction.get(targetAuthorRef),
        transaction.get(userRef),
      ]);
      if (
        !currentCaller.exists ||
        !["super", "admin", "moderator"].includes(currentCaller.data()?.role)
      ) {
        throw new HttpsError(
          "permission-denied",
          "You no longer have permission to suspend users."
        );
      }
      if (currentAuthor.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Team members and official authors cannot be suspended."
        );
      }
      if (!currentUser.exists) {
        throw new HttpsError("not-found", "Target user profile does not exist.");
      }
      const currentData = currentUser.data() || {};
      if (currentData.status === "banned" || currentData.bannedAt != null) {
        throw new HttpsError(
          "failed-precondition",
          "A permanently banned account cannot be suspended. Use the unban action first."
        );
      }
      if (!ACTIVE_ACCOUNT_STATUSES.has(currentData.status || "active")) {
        throw new HttpsError(
          "failed-precondition",
          "Only active or warned reader accounts can be suspended."
        );
      }
      targetHandle = currentData.handle || currentData.displayName || "reader";
      transaction.update(userRef, {
        status: "suspended",
        suspendedUntil: suspendedUntilTimestamp,
        suspensionReason: reason,
        suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
        suspendedBy: callerUid,
        suspensionCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // 2. Hide or delete infringing comment if provided
    if (commentId) {
      const coll = commentType === "reply" ? "commentReplies" : "comments";
      await db.collection(coll).doc(commentId).update({
        status: "hidden",
        moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
        moderatedBy: callerUid,
      });
    }

    // 3. Update report if provided
    if (reportId) {
      await db.collection("reports").doc(reportId).update({
        status: "action_taken",
        actionTaken: "suspension",
        resolvedBy: callerUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolutionNotes: customMessage || `Suspended for ${normalizedDurationDays} days (${reason})`,
      });
    }

    // 4. Send notification to reader
    await sendNotification({
      userId: targetUid,
      type: "suspension",
      title: "🚫 Account Commenting Suspended",
      message: customMessage || `Your commenting privileges have been suspended for ${normalizedDurationDays} days due to Community Guidelines violations (${reason}). Privileges will be restored after ${suspendedUntilDate.toLocaleDateString()}.`,
      link: "/community-guidelines",
      metadata: {
        suspendedUntil: suspendedUntilDate.toISOString(),
        durationDays: normalizedDurationDays,
        reason,
      },
    });

    // 5. Record server audit log
    await writeServerAuditLog({
      actorUid: callerUid,
      action: "moderation.suspend_user",
      category: "comments",
      details: `Suspended @${targetHandle} for ${normalizedDurationDays} days (${reason})`,
      targetId: targetUid,
      targetTitle: `@${targetHandle}`,
      metadata: {
        targetUid,
        targetHandle,
        durationDays: normalizedDurationDays,
        suspendedUntil: suspendedUntilDate.toISOString(),
        reason,
        reportId,
      },
    });

    return { success: true, suspendedUntil: suspendedUntilDate.toISOString() };
  }
);

/**
 * Tier 3: Permanent Account Ban (account + handle + associated browser installations).
 * Network addresses are retained as private signals and are never blanket-blocked.
 * Accessible STRICTLY by: Super Admins and Admins ONLY.
 * Moderators are explicitly forbidden from executing permanent bans.
 */
export const banUser = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const db = getDb();
    const callerUid = request.auth.uid;
    const callerSnap = await db.collection("authors").doc(callerUid).get();
    const callerRole = callerSnap.data()?.role;

    if (!callerSnap.exists || !["super", "admin"].includes(callerRole)) {
      throw new HttpsError(
        "permission-denied",
        "Moderators do not have permission to execute permanent bans. Please escalate to an Admin or Super Admin."
      );
    }

    const { targetUid, reason, customMessage, reportId, commentId, commentType } = request.data || {};
    validateModerationPayload(targetUid, reason, customMessage);

    const targetAuthorSnap = await db.collection("authors").doc(targetUid).get();
    if (targetAuthorSnap.exists) {
      throw new HttpsError("failed-precondition", "Team members and official authors cannot be banned through user moderation.");
    }

    const userRef = db.collection("users").doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Target user profile does not exist.");
    }
    const userData = userSnap.data() || {};
    const targetHandle = userData.handle || userData.displayName || "reader";
    await validateModerationReferences({
      firestore: db,
      targetUid,
      reportId,
      commentId,
      commentType,
    });

    // Gather associated devices and network signals. Devices are enforceable;
    // shared network addresses are investigation-only to avoid collateral bans.
    const devicesSnapshot = await userRef.collection("devices").get();
    const deviceHashes = new Set<string>();
    const fingerprintHashes = new Set<string>();
    if (Array.isArray(userData.deviceHashes)) {
      userData.deviceHashes.forEach((hash: unknown) => {
        if (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)) deviceHashes.add(hash);
      });
    }
    devicesSnapshot.docs.forEach((snapshot) => {
      if (/^[a-f0-9]{64}$/.test(snapshot.id)) deviceHashes.add(snapshot.id);
      const fingerprintHash = snapshot.data()?.fingerprintHash;
      if (typeof fingerprintHash === "string" && /^[a-f0-9]{64}$/.test(fingerprintHash)) {
        fingerprintHashes.add(fingerprintHash);
      }
    });
    if (Array.isArray(userData.fingerprintHashes)) {
      userData.fingerprintHashes.forEach((hash: unknown) => {
        if (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)) fingerprintHashes.add(hash);
      });
    }

    const observedIps = new Set<string>();
    if (userData.lastIp && typeof userData.lastIp === "string") {
      observedIps.add(userData.lastIp.trim());
    }
    if (Array.isArray(userData.ipHistory)) {
      userData.ipHistory.forEach((ip: string) => {
        if (typeof ip === "string" && isIP(ip.trim())) observedIps.add(ip.trim());
      });
    }

    const deviceWrites = [...deviceHashes].map(async (deviceHash) => {
      const device = devicesSnapshot.docs.find((snapshot) => snapshot.id === deviceHash)?.data();
      await addBanSignalAssociation({
        collection: "bannedDevices",
        signalHash: deviceHash,
        label: device?.label || (deviceHash === userData.lastDeviceHash ? userData.lastDeviceLabel : "Unknown browser"),
        targetUid,
        targetHandle,
        reason,
        blockedBy: callerUid,
      });
    });
    const networkWrites = [...observedIps].map(async (rawIp) => {
      const signalKey = createHash("sha256").update(rawIp, "utf8").digest("hex");
      await db.collection("flaggedIps").doc(signalKey).set({
        ip: rawIp,
        observedAt: admin.firestore.FieldValue.serverTimestamp(),
        associatedAccounts: admin.firestore.FieldValue.arrayUnion(targetUid),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60_000),
        latestModeration: {
          bannedBy: callerUid,
          reason,
          targetUid,
          targetHandle,
        },
      }, { merge: true });
    });
    const fingerprintWrites = [...fingerprintHashes].map((fingerprintHash) =>
      addBanSignalAssociation({
        collection: "bannedFingerprints",
        signalHash: fingerprintHash,
        targetUid,
        targetHandle,
        reason,
        blockedBy: callerUid,
      })
    );
    await Promise.all([...deviceWrites, ...fingerprintWrites, ...networkWrites]);

    // Lock the normalized handle before completing the ban. A failed tombstone
    // is a failed ban, not a warning that can be overlooked.
    const normalizedTargetHandle = normalizeTeamHandle(targetHandle);
    if (normalizedTargetHandle) {
      await db.collection("handles").doc(normalizedTargetHandle).set(
        {
          uid: targetUid,
          status: "banned",
          lockedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Persist Firestore enforcement before disabling Auth. If Auth has a
    // transient failure, rules and callables still block the account and the
    // scheduled reconciler retries the Auth operation.
    await userRef.update({
      status: "banned",
      bannedAt: admin.firestore.FieldValue.serverTimestamp(),
      banReason: reason,
      bannedBy: callerUid,
      bannedDeviceHashes: [...deviceHashes],
      bannedFingerprintHashes: [...fingerprintHashes],
      authDisablePending: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      await admin.auth().updateUser(targetUid, { disabled: true });
      await admin.auth().revokeRefreshTokens(targetUid);
      await userRef.update({
        authDisablePending: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(`Disabled Firebase Auth account for UID: ${targetUid}`);
    } catch (authErr) {
      logger.error(`Ban recorded but Auth disable is pending for ${targetUid}:`, authErr);
      await writeServerAuditLog({
        actorUid: callerUid,
        action: "moderation.ban_auth_pending",
        category: "team",
        details: `Permanent ban recorded for @${targetHandle}; Auth disable queued for retry`,
        targetId: targetUid,
        targetTitle: `@${targetHandle}`,
        metadata: { targetUid, reason },
      });
      throw new HttpsError(
        "internal",
        "The permanent ban is active, but sign-in revocation is still being retried."
      );
    }

    // 6. Delete / hide infringing comment
    if (commentId) {
      const coll = commentType === "reply" ? "commentReplies" : "comments";
      await db.collection(coll).doc(commentId).delete();
    }

    // 7. Update report if provided
    if (reportId) {
      await db.collection("reports").doc(reportId).update({
        status: "action_taken",
        actionTaken: "permanent_ban",
        resolvedBy: callerUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolutionNotes: customMessage || `Permanently banned (${reason}). Blocked browser installations: ${deviceHashes.size}; fingerprint risk signals: ${fingerprintHashes.size}.`,
      });
    }

    // 8. Record server audit log
    await writeServerAuditLog({
      actorUid: callerUid,
      action: "moderation.ban_user",
      category: "team",
      details: `Permanently banned @${targetHandle}; blocked ${deviceHashes.size} browser installation(s) and flagged ${fingerprintHashes.size} fingerprint risk signal(s) for ${reason}`,
      targetId: targetUid,
      targetTitle: `@${targetHandle}`,
      metadata: {
        targetUid,
        targetHandle,
        blockedDeviceHashes: [...deviceHashes],
        blockedFingerprintHashes: [...fingerprintHashes],
        observedIpCount: observedIps.size,
        reason,
        customMessage,
        reportId,
      },
    });

    return {
      success: true,
      blockedDevicesCount: deviceHashes.size,
      flaggedFingerprintsCount: fingerprintHashes.size,
      observedNetworksCount: observedIps.size,
    };
  }
);

/**
 * Lift User Suspension
 * Accessible by: Super Admins, Admins, Moderators
 */
export const unsuspendUser = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const db = getDb();
    const callerUid = request.auth.uid;
    const callerRef = db.collection("authors").doc(callerUid);
    const callerSnap = await callerRef.get();
    const callerRole = callerSnap.data()?.role;

    if (!callerSnap.exists || !["super", "admin", "moderator"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "You do not have permission to lift suspensions.");
    }

    const { targetUid } = request.data || {};
    if (
      typeof targetUid !== "string" || !targetUid || targetUid.length > 128 ||
      targetUid.includes("/") || /[\r\n\0]/.test(targetUid)
    ) {
      throw new HttpsError("invalid-argument", "Missing required field: targetUid.");
    }

    const targetAuthorRef = db.collection("authors").doc(targetUid);
    const targetAuthorSnap = await targetAuthorRef.get();
    if (targetAuthorSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Team members and official authors cannot be unsuspended through reader moderation."
      );
    }

    const userRef = db.collection("users").doc(targetUid);
    let targetHandle = "reader";
    let nextStatus = "active";

    await db.runTransaction(async (transaction) => {
      const [currentCaller, currentAuthor, currentUser] = await Promise.all([
        transaction.get(callerRef),
        transaction.get(targetAuthorRef),
        transaction.get(userRef),
      ]);
      if (
        !currentCaller.exists ||
        !["super", "admin", "moderator"].includes(currentCaller.data()?.role)
      ) {
        throw new HttpsError(
          "permission-denied",
          "You no longer have permission to lift suspensions."
        );
      }
      if (currentAuthor.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Team members and official authors cannot be unsuspended through reader moderation."
        );
      }
      if (!currentUser.exists) {
        throw new HttpsError("not-found", "Target user profile does not exist.");
      }
      const currentData = currentUser.data() || {};
      if (currentData.status === "banned" || currentData.bannedAt != null) {
        throw new HttpsError(
          "failed-precondition",
          "A permanently banned account cannot be unsuspended. Use the unban action instead."
        );
      }
      if (currentData.status !== "suspended") {
        throw new HttpsError(
          "failed-precondition",
          "Only a currently suspended reader account can be unsuspended."
        );
      }
      targetHandle = currentData.handle || currentData.displayName || "reader";
      nextStatus = (currentData.warningCount ?? 0) > 0 ? "warning" : "active";
      transaction.update(userRef, {
        status: nextStatus,
        suspendedUntil: admin.firestore.FieldValue.delete(),
        suspensionReason: admin.firestore.FieldValue.delete(),
        suspendedAt: admin.firestore.FieldValue.delete(),
        suspendedBy: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await sendNotification({
      userId: targetUid,
      type: "suspension",
      title: "Commenting Privileges Restored",
      message: "Your commenting suspension has been lifted. You can now post comments and replies.",
      link: "/community-guidelines",
    });

    await writeServerAuditLog({
      actorUid: callerUid,
      action: "moderation.unsuspend_user",
      category: "comments",
      details: `Lifted commenting suspension for @${targetHandle}`,
      targetId: targetUid,
      targetTitle: `@${targetHandle}`,
      metadata: { targetUid, targetHandle, nextStatus },
    });

    return { success: true, nextStatus };
  }
);

/**
 * Lift Permanent Ban
 * Accessible STRICTLY by: Super Admins and Admins ONLY.
 */
export const unbanUser = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const db = getDb();
    const callerUid = request.auth.uid;
    const callerSnap = await db.collection("authors").doc(callerUid).get();
    const callerRole = callerSnap.data()?.role;

    if (!callerSnap.exists || !["super", "admin"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Only Admins and Super Admins can lift permanent bans.");
    }

    const { targetUid } = request.data || {};
    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Missing required field: targetUid.");
    }

    const userRef = db.collection("users").doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Target user profile does not exist.");
    }
    const userData = userSnap.data() || {};
    const targetHandle = userData.handle || userData.displayName || "reader";
    const nextStatus = (userData.warningCount ?? 0) > 0 ? "warning" : "active";
    if (userData.status !== "banned" && userData.bannedAt == null) {
      throw new HttpsError(
        "failed-precondition",
        "This account is not permanently banned."
      );
    }

    // 1. Re-enable Auth account
    try {
      await admin.auth().updateUser(targetUid, { disabled: false });
    } catch (authErr) {
      logger.error(`Could not re-enable Auth for ${targetUid}:`, authErr);
      throw new HttpsError(
        "internal",
        "The sign-in account could not be re-enabled, so the permanent ban remains in place. Please retry."
      );
    }

    // 2. Unblock browser installations owned by this moderation record.
    const deviceHashes = new Set<string>();
    const storedDeviceHashes = Array.isArray(userData.bannedDeviceHashes)
      ? userData.bannedDeviceHashes
      : userData.deviceHashes;
    if (Array.isArray(storedDeviceHashes)) {
      storedDeviceHashes.forEach((hash: unknown) => {
        if (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)) deviceHashes.add(hash);
      });
    }
    let unblockedDevicesCount = 0;
    let removedDeviceAssociationsCount = 0;
    for (const deviceHash of deviceHashes) {
      const result = await removeBanSignalAssociation({
        collection: "bannedDevices",
        signalHash: deviceHash,
        targetUid,
      });
      if (result.associationRemoved) removedDeviceAssociationsCount += 1;
      if (result.signalDeleted) unblockedDevicesCount += 1;
    }
    const fingerprintHashes = new Set<string>();
    const storedFingerprintHashes = Array.isArray(userData.bannedFingerprintHashes)
      ? userData.bannedFingerprintHashes
      : userData.fingerprintHashes;
    if (Array.isArray(storedFingerprintHashes)) {
      storedFingerprintHashes.forEach((hash: unknown) => {
        if (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)) fingerprintHashes.add(hash);
      });
    }
    let clearedFingerprintsCount = 0;
    let removedFingerprintAssociationsCount = 0;
    for (const fingerprintHash of fingerprintHashes) {
      const result = await removeBanSignalAssociation({
        collection: "bannedFingerprints",
        signalHash: fingerprintHash,
        targetUid,
      });
      if (result.associationRemoved) removedFingerprintAssociationsCount += 1;
      if (result.signalDeleted) clearedFingerprintsCount += 1;
    }

    // Remove legacy blanket IP bans created by older deployments. Network
    // signals in flaggedIps remain private audit history and are not enforced.
    const legacyIps = new Set<string>();
    if (Array.isArray(userData.bannedIps)) {
      userData.bannedIps.forEach((ip: string) => legacyIps.add(ip));
    }
    if (typeof userData.lastIp === "string") legacyIps.add(userData.lastIp);
    for (const ip of legacyIps) {
      const key = sanitizeIpKey(ip);
      if (key) {
        try {
          await db.collection("bannedIps").doc(key).delete();
        } catch (ipErr) {
          logger.warn(`Could not delete bannedIp doc for ${key}:`, ipErr);
        }
      }
    }

    // 3. Update user doc
    await userRef.update({
      status: nextStatus,
      bannedAt: admin.firestore.FieldValue.delete(),
      banReason: admin.firestore.FieldValue.delete(),
      bannedBy: admin.firestore.FieldValue.delete(),
      bannedIps: admin.firestore.FieldValue.delete(),
      bannedDeviceHashes: admin.firestore.FieldValue.delete(),
      bannedFingerprintHashes: admin.firestore.FieldValue.delete(),
      authDisablePending: admin.firestore.FieldValue.delete(),
      fingerprintRiskMatch: admin.firestore.FieldValue.delete(),
      fingerprintRiskMatchedAt: admin.firestore.FieldValue.delete(),
      suspendedUntil: admin.firestore.FieldValue.delete(),
      suspensionReason: admin.firestore.FieldValue.delete(),
      suspendedAt: admin.firestore.FieldValue.delete(),
      suspendedBy: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const normalizedHandle = normalizeTeamHandle(targetHandle);
    if (normalizedHandle) {
      const handleRef = db.collection("handles").doc(normalizedHandle);
      await db.runTransaction(async (transaction) => {
        const handle = await transaction.get(handleRef);
        if (handle.exists && handle.data()?.uid === targetUid) {
          transaction.set(handleRef, {
            status: admin.firestore.FieldValue.delete(),
            lockedAt: admin.firestore.FieldValue.delete(),
          }, { merge: true });
        }
      });
    }

    await sendNotification({
      userId: targetUid,
      type: "warning",
      title: "Account Restored",
      message: "Your account ban has been lifted by an administrator. Please adhere to the Community Guidelines.",
      link: "/community-guidelines",
    });

    await writeServerAuditLog({
      actorUid: callerUid,
      action: "moderation.unban_user",
      category: "team",
      details: `Lifted permanent ban and restored @${targetHandle} (${unblockedDevicesCount} browser installation(s) unblocked, ${clearedFingerprintsCount} fingerprint risk signal(s) cleared)`,
      targetId: targetUid,
      targetTitle: `@${targetHandle}`,
      metadata: { targetUid, targetHandle, unblockedDevicesCount, clearedFingerprintsCount, nextStatus },
    });

    return {
      success: true,
      nextStatus,
      unblockedDevicesCount,
      clearedFingerprintsCount,
      removedDeviceAssociationsCount,
      removedFingerprintAssociationsCount,
    };
  }
);

/**
 * Clear User Warnings
 * Accessible by: Super Admins, Admins, Moderators
 */
export const clearUserWarnings = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const db = getDb();
    const callerUid = request.auth.uid;
    const callerSnap = await db.collection("authors").doc(callerUid).get();
    const callerRole = callerSnap.data()?.role;

    if (!callerSnap.exists || !["super", "admin", "moderator"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "You do not have permission to clear warnings.");
    }

    const { targetUid } = request.data || {};
    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Missing required field: targetUid.");
    }

    const userRef = db.collection("users").doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Target user profile does not exist.");
    }
    const userData = userSnap.data() || {};
    const targetHandle = userData.handle || userData.displayName || "reader";

    // 1. Delete all warning subcollection documents
    const warningsSnap = await userRef.collection("warnings").get();
    await mutateDocumentsInChunks(warningsSnap.docs, (batch, warning) => {
      batch.delete(warning.ref);
    });

    // 2. Update user status (if currently "warning", restore to "active")
    const currentStatus = userData.status || "active";
    const nextStatus = currentStatus === "warning" ? "active" : currentStatus;

    await userRef.update({
      warningCount: 0,
      status: nextStatus,
      lastWarnedAt: admin.firestore.FieldValue.delete(),
      lastWarningReason: admin.firestore.FieldValue.delete(),
      lastWarningBy: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await sendNotification({
      userId: targetUid,
      type: "warning",
      title: "Warnings Cleared",
      message: "Your account warnings have been cleared by moderation staff. Your account is now in Good Standing.",
      link: "/account",
    });

    await writeServerAuditLog({
      actorUid: callerUid,
      action: "moderation.clear_warnings",
      category: "comments",
      details: `Cleared ${warningsSnap.size} warning(s) for @${targetHandle}`,
      targetId: targetUid,
      targetTitle: `@${targetHandle}`,
      metadata: { targetUid, targetHandle, clearedCount: warningsSnap.size },
    });

    return { success: true, clearedCount: warningsSnap.size, nextStatus };
  }
);

async function purgeExpiredCollection(collectionName: string) {
  const firestore = getDb();
  let deleted = 0;
  for (let page = 0; page < 10; page += 1) {
    const expired = await firestore
      .collection(collectionName)
      .where("expiresAt", "<=", admin.firestore.Timestamp.now())
      .limit(400)
      .get();
    if (expired.empty) break;
    const batch = firestore.batch();
    expired.docs.forEach((snapshot) => batch.delete(snapshot.ref));
    await batch.commit();
    deleted += expired.size;
    if (expired.size < 400) break;
  }
  return deleted;
}

export const reconcilePendingAuthDisables = onSchedule(
  { schedule: "every 30 minutes", region: "europe-west1", timeoutSeconds: 120 },
  async () => {
    const pending = await getDb()
      .collection("users")
      .where("authDisablePending", "==", true)
      .limit(200)
      .get();
    for (const account of pending.docs) {
      if (account.data()?.status !== "banned" && account.data()?.bannedAt == null) {
        await account.ref.update({ authDisablePending: admin.firestore.FieldValue.delete() });
        continue;
      }
      try {
        await admin.auth().updateUser(account.id, { disabled: true });
        await admin.auth().revokeRefreshTokens(account.id);
        await account.ref.update({
          authDisablePending: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        if ((error as { code?: string }).code === "auth/user-not-found") {
          await account.ref.update({ authDisablePending: admin.firestore.FieldValue.delete() });
        } else {
          logger.error("Unable to reconcile pending Auth disable", {
            uid: account.id,
            error,
          });
        }
      }
    }
  }
);

export const purgeExpiredSecurityData = onSchedule(
  {
    schedule: "every day 03:15",
    region: "europe-west1",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    const collections = [
      "deviceIdentityRegistry",
      "rateLimits",
      "riskAttestations",
      "commentUploadReservations",
      "riskAlerts",
      "flaggedIps",
      "triggerEvents",
      "auditLogs",
      "reports",
    ];
    const results: Record<string, number> = {};
    for (const collectionName of collections) {
      results[collectionName] = await purgeExpiredCollection(collectionName);
    }

    const bucket = admin.storage().bucket();
    const [temporaryFiles] = await bucket.getFiles({
      prefix: "temp_downloads/",
      maxResults: 1000,
    });
    const cutoff = Date.now() - 60 * 60_000;
    let temporaryDownloadsDeleted = 0;
    for (let offset = 0; offset < temporaryFiles.length; offset += 50) {
      await Promise.all(temporaryFiles.slice(offset, offset + 50).map(async (file) => {
        const createdAt = Date.parse(String(file.metadata.timeCreated || file.metadata.updated || ""));
        if (Number.isFinite(createdAt) && createdAt < cutoff) {
          await file.delete({ ignoreNotFound: true });
          temporaryDownloadsDeleted += 1;
        }
      }));
    }
    const [commentFiles] = await bucket.getFiles({ prefix: "comments/", maxResults: 2000 });
    const orphanCandidates = commentFiles.filter((file) => {
      const createdAt = Date.parse(String(file.metadata.timeCreated || file.metadata.updated || ""));
      return /^comments\/[^/]+\/[a-zA-Z0-9_-]{20,64}\/[0-3]\.(webp|jpg)$/.test(file.name) &&
        Number.isFinite(createdAt) && createdAt < cutoff;
    });
    let orphanCommentUploadsDeleted = 0;
    for (let offset = 0; offset < orphanCandidates.length; offset += 200) {
      const files = orphanCandidates.slice(offset, offset + 200);
      const claimRefs = files.map((file) => getDb().collection("commentAttachmentClaims").doc(
        createHash("sha256").update(file.name, "utf8").digest("hex")
      ));
      const claims = await getDb().getAll(...claimRefs);
      await Promise.all(files.map(async (file, index) => {
        if (!claims[index]?.exists) {
          await file.delete({ ignoreNotFound: true });
          orphanCommentUploadsDeleted += 1;
        }
      }));
    }
    logger.info("Expired security data purge completed", {
      ...results,
      temporaryDownloadsDeleted,
      orphanCommentUploadsDeleted,
    });
  }
);
