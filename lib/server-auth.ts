import "server-only";

const CONTENT_STAFF_ROLES = new Set(["manager", "admin", "super"]);

type ContentStaffAuthResult =
  | { ok: true; uid: string }
  | { ok: false; status: 401 | 403 };

export async function verifyContentStaffRequest(
  request: Request,
): Promise<ContentStaffAuthResult> {
  const authorization = request.headers.get("authorization") || "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!idToken) return { ok: false, status: 401 };

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return { ok: false, status: 403 };

  const identityResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    },
  );
  if (!identityResponse.ok) return { ok: false, status: 401 };

  const identity = (await identityResponse.json()) as {
    users?: Array<{ localId?: string }>;
  };
  const uid = identity.users?.[0]?.localId;
  if (!uid) return { ok: false, status: 401 };

  const authorResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId,
    )}/databases/(default)/documents/authors/${encodeURIComponent(uid)}?key=${encodeURIComponent(apiKey)}`,
    { cache: "no-store" },
  );
  if (!authorResponse.ok) return { ok: false, status: 403 };

  const author = (await authorResponse.json()) as {
    fields?: { role?: { stringValue?: string } };
  };
  const role = author.fields?.role?.stringValue || "";
  return CONTENT_STAFF_ROLES.has(role)
    ? { ok: true, uid }
    : { ok: false, status: 403 };
}
