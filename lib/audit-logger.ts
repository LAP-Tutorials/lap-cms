import type { Timestamp } from "firebase/firestore"

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
 * Client-side audit writes are intentionally disabled. Authenticated Firestore
 * triggers and callable Functions record authoritative events after the actual
 * operation succeeds, so a browser cannot forge actor identity or outcomes.
 */
export async function logAuditActivity(payload: AuditLogPayload): Promise<void> {
  void payload
}
