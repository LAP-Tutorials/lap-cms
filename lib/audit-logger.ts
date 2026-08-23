import { addDoc, collection, doc, getDoc, serverTimestamp, type Timestamp } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"

export type AuditCategory =
  | "articles"
  | "comments"
  | "team"
  | "handles"
  | "assets"
  | "profile"
  | "auth"

export interface AuditLogPayload {
  action: string
  category: AuditCategory
  details: string
  targetId?: string
  targetTitle?: string
  metadata?: Record<string, any>
}

export interface AuditLogEntry {
  id: string
  timestamp: Timestamp | any
  actorUid: string
  actorName: string
  actorHandle: string
  actorEmail: string
  actorRole: "super" | "admin" | "author" | "moderator"
  actorPhotoURL?: string
  action: string
  category: AuditCategory
  details: string
  targetId?: string
  targetTitle?: string
  metadata?: Record<string, any>
}

/**
 * Records an immutable administrative activity log in Firestore.
 * Automatically enriches the log with the current user's profile and staff role.
 */
export async function logAuditActivity(payload: AuditLogPayload): Promise<void> {
  const currentUser = auth.currentUser
  if (!currentUser) return

  try {
    let actorName = currentUser.displayName || "Staff Member"
    let actorHandle = ""
    let actorRole: "super" | "admin" | "author" | "moderator" = "author"
    let actorPhotoURL = currentUser.photoURL || ""

    try {
      const authorDoc = await getDoc(doc(db, "authors", currentUser.uid))
      if (authorDoc.exists()) {
        const authorData = authorDoc.data()
        actorName = authorData?.name || actorName
        actorHandle = authorData?.handle || ""
        actorRole = authorData?.role || "author"
        actorPhotoURL = authorData?.avatar || actorPhotoURL
      }
      if (!actorHandle) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid))
        if (userDoc.exists()) {
          actorHandle = userDoc.data()?.handle || ""
          if (!actorPhotoURL) actorPhotoURL = userDoc.data()?.photoURL || ""
        }
      }
    } catch {
      // Fallback to basic auth info
    }

    const logData = {
      actorUid: currentUser.uid,
      actorName,
      actorHandle: actorHandle || currentUser.email?.split("@")[0] || "staff",
      actorEmail: currentUser.email || "",
      actorRole,
      actorPhotoURL,
      action: payload.action,
      category: payload.category,
      details: payload.details,
      targetId: payload.targetId || "",
      targetTitle: payload.targetTitle || "",
      metadata: payload.metadata || {},
      timestamp: serverTimestamp(),
    }

    await addDoc(collection(db, "auditLogs"), logData)
  } catch (err) {
    console.error("Failed to write audit activity log:", err)
  }
}
