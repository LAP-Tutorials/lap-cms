import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
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

const CONTENT_STAFF_ROLES = ["manager", "admin", "super"];
const RESERVABLE_TEAM_ROLES = ["moderator", ...CONTENT_STAFF_ROLES];
const OFFICIAL_HANDLE_KEYS = [
  "lap",
  "lapdocs",
  "laptutorials",
  "lapain",
  "arclapain",
];
const TEAM_HANDLE_PATTERN = /^[a-z0-9_-]{3,20}$/;

function normalizeTeamHandle(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "_")
    : "";
}




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
  async () => {
    const firestore = getDb();
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

async function deleteAccountData(uid: string) {
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

    const anonymizeDiscussion = (
      batch: admin.firestore.WriteBatch,
      snapshot: admin.firestore.DocumentSnapshot
    ) => {
      batch.update(snapshot.ref, {
        authorId: "deleted-user",
        authorName: "Deleted user",
        authorHandle: admin.firestore.FieldValue.delete(),
        authorPhotoURL: admin.firestore.FieldValue.delete(),
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

    // Votes remain in the public totals forever, but their private per-user
    // records are removed with the account.
    await mutateDocumentsInChunks(reactions.docs, (batch, snapshot) => {
      batch.delete(snapshot.ref);
    });
    await reactionOwnerRef.delete().catch((error) => {
      if ((error as { code?: number }).code !== 5) throw error;
    });

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

    await deleteAccountData(request.auth.uid);
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
    await getDb().runTransaction(async (transaction) => {
      const comment = await transaction.get(commentRef);
      if (!comment.exists) return;
      const current = Math.max(0, Number(comment.data()?.replyCount) || 0);
      transaction.update(commentRef, { replyCount: Math.max(0, current + delta) });
    });
  }
);

export const removeRepliesWithComment = onDocumentDeleted(
  { document: "comments/{commentId}", region: "europe-west1" },
  async (event) => {
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

    const optionalString = (value: unknown) =>
      typeof value === "string" ? value : "";

    const newUser = await admin
      .auth()
      .createUser({
        email: email.trim(),
        password,
        displayName: name.trim(),
      })
      .catch((error) => {
        logger.error("Failed to create Auth user", error);
        if (error?.code === "auth/email-already-exists") {
          throw new HttpsError(
            "already-exists",
            "A user with this email already exists."
          );
        }
        throw new HttpsError("internal", "Failed to create the user account.");
      });

    try {
      const authorData = {
        uid: newUser.uid,
        name: name.trim(),
        city: optionalString(city),
        job: optionalString(job),
        role,
        showOnTeam: role !== "moderator",
        avatar: optionalString(avatar),
        imgAlt: optionalString(imgAlt),
        biography: { body: "", summary: "" },
        slug: optionalString(slug),
        socials:
          typeof socials === "object" && socials !== null ? socials : {},
        createdAt: new Date().toISOString(),
        dateJoined: admin.firestore.FieldValue.serverTimestamp(),
      };
      await getDb().collection("authors").doc(newUser.uid).set(authorData);
    } catch (error) {
      await getDb()
        .collection("authors")
        .doc(newUser.uid)
        .delete()
        .catch((cleanupError) => {
          logger.error("Failed to roll back author profile", cleanupError);
        });
      await admin.auth().deleteUser(newUser.uid).catch((cleanupError) => {
        logger.error("Failed to roll back Auth user", cleanupError);
      });
      logger.error("Failed to create author profile", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to create the author profile.");
    }

    return { uid: newUser.uid };
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
        .filter((snapshot) => !teamUids.has(snapshot.id))
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

    const userRef = firestore.collection("users").doc(uid);
    const authorRef = firestore.collection("authors").doc(uid);
    await firestore.runTransaction(async (transaction) => {
      const [user, author] = await Promise.all([
        transaction.get(userRef),
        transaction.get(authorRef),
      ]);
      if (!user.exists) {
        throw new HttpsError("not-found", "That Docs reader profile no longer exists.");
      }
      if (author.exists) {
        throw new HttpsError("already-exists", "That account is already a CMS team member.");
      }

      const data = user.data() || {};
      const handle = normalizeTeamHandle(data.handle);
      const name =
        (typeof data.displayName === "string" && data.displayName.trim()) ||
        handle ||
        userRecord.email?.split("@")[0] ||
        "Moderator";
      const timestamp = admin.firestore.FieldValue.serverTimestamp();

      transaction.set(authorRef, {
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

    if (!caller.exists || caller.data()?.role !== "super") {
      throw new HttpsError(
        "permission-denied",
        "Only a super admin can delete team members."
      );
    }

    const member = await getDb().collection("authors").doc(uid).get();
    if (!member.exists) {
      throw new HttpsError("not-found", "That team member no longer exists.");
    }

    await deleteAccountData(uid);
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

    logger.info("Starting manageAssets function", {
      action: request.data.action,
      itemsCount: request.data.items?.length,
    });

    const { action, items, destPath, newName } = request.data;

    // items should be an array of full storage paths, e.g. ["folder/file.png"]
    if (!action || !items || !Array.isArray(items) || items.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required arguments: action and items array."
      );
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
        if (items.length !== 1 || !newName) {
          throw new HttpsError(
            "invalid-argument",
            "Rename requires exactly 1 item and newName."
          );
        }
        const srcPath = items[0];

        let isFolder = false;
        try {
          await bucket.file(srcPath).getMetadata();
        } catch (e: any) {
          if (e.code === 404) isFolder = true;
          else throw e;
        }

        const pathParts = srcPath.split("/");
        pathParts.pop(); // remove old name
        const parentPath = pathParts.join("/");
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;

        if (!isFolder) {
          await bucket.file(srcPath).move(newPath);
          log(`Renamed file ${srcPath} to ${newPath}`);
        } else {
          // Folder rename = move all files with prefix
          const prefix = srcPath.endsWith("/") ? srcPath : `${srcPath}/`;
          const [files] = await bucket.getFiles({ prefix });
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
        if (destPath === undefined || destPath === null) {
          throw new HttpsError(
            "invalid-argument",
            "Copy/Move requires destPath (can be empty string)."
          );
        }

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

        if (files.length === 0) {
          // It might be empty, just return empty zip? Or error?
          // Let's allow empty zip or just handle gracefully.
        }

        const zip = new JSZip();

        // Download all files in parallel
        // WARNING: Large folders might run out of memory.
        // Ideally we stream, but JSZip generateAsync needs all data for compression unless we use a stream-capable zip lib.
        // JSZip is memory-bound.

        await Promise.all(
          files.map(async (file) => {
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
          })
        );

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

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          publish: true,
          date: doc.data().scheduledPublishDate || now, // Use scheduled time as publish time
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
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
  type: "mention" | "new_comment" | "new_post";
  title: string;
  message: string;
  link: string;
  metadata?: Record<string, any>;
}

async function sendNotification(payload: NotificationPayload) {
  try {
    const firestore = getDb();
    await firestore
      .collection("users")
      .doc(payload.userId)
      .collection("notifications")
      .add({
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: payload.metadata || {},
      });
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
        .where("role", "in", ["super", "admin", "manager", "moderator"])
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
        .where("role", "in", ["super", "admin", "manager", "moderator"])
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
            .doc();

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

export const checkPasswordResetEligibility = onCall(
  { region: "europe-west1", minInstances: 0 },
  async (request) => {
    const rawEmail = request.data?.email;
    if (typeof rawEmail !== "string" || !rawEmail.trim()) {
      throw new HttpsError("invalid-argument", "An email address is required.");
    }
    const email = rawEmail.trim().toLowerCase();

    try {
      const authUser = await admin.auth().getUserByEmail(email);
      const authorDoc = await getDb().collection("authors").doc(authUser.uid).get();
      if (authorDoc.exists) {
        const role = authorDoc.data()?.role;
        if (["super", "admin", "manager", "moderator"].includes(role)) {
          return {
            allowed: false,
            isStaff: true,
            message: "Contact admin or super admin to reset your password.",
          };
        }
      }
    } catch (err: any) {
      if (err?.code === "auth/user-not-found") {
        return { allowed: true, isStaff: false };
      }
      logger.error("Error checking password reset eligibility:", err);
    }

    return { allowed: true, isStaff: false };
  }
);

export const onCommentDeleted = onDocumentDeleted(
  {
    document: "comments/{commentId}",
    region: "europe-west1",
  },
  async (event) => {
    const commentId = event.params.commentId;
    logger.info(`Comment ${commentId} deleted. Cleaning up child replies...`);

    try {
      const firestore = getDb();
      const repliesSnapshot = await firestore
        .collection("commentReplies")
        .where("parentCommentId", "==", commentId)
        .get();

      if (repliesSnapshot.empty) {
        logger.info(`No child replies to delete for comment ${commentId}.`);
        return;
      }

      const BATCH_SIZE = 400;
      let batch = firestore.batch();
      let count = 0;

      for (const replyDoc of repliesSnapshot.docs) {
        batch.delete(replyDoc.ref);
        count++;
        if (count % BATCH_SIZE === 0) {
          await batch.commit();
          batch = firestore.batch();
        }
      }

      if (count % BATCH_SIZE !== 0) {
        await batch.commit();
      }

      logger.info(`Successfully deleted ${count} child replies for comment ${commentId}.`);
    } catch (error) {
      logger.error(`Error deleting child replies for comment ${commentId}:`, error);
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
    return { success: true, pinned };
  }
);
