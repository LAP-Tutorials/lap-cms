import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

export async function getCurrentUserRole(): Promise<"super" | "admin" | "manager" | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const ref = doc(db, "authors", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  return data.role || null;
}
