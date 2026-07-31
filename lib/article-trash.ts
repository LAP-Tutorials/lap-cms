import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export const ARTICLE_TRASH_COLLECTION = "articleTrash";

export async function moveArticleToTrash(articleId: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to delete an article.");

  const articleRef = doc(db, "articles", articleId);
  const trashRef = doc(db, ARTICLE_TRASH_COLLECTION, articleId);

  await runTransaction(db, async (transaction) => {
    const article = await transaction.get(articleRef);
    if (!article.exists()) throw new Error("Article not found.");

    transaction.set(trashRef, {
      article: article.data(),
      deletedAt: serverTimestamp(),
      deletedBy: user.uid,
    });
    transaction.delete(articleRef);
  });
}

export async function restoreArticleFromTrash(articleId: string) {
  const trashRef = doc(db, ARTICLE_TRASH_COLLECTION, articleId);
  const articleRef = doc(db, "articles", articleId);

  await runTransaction(db, async (transaction) => {
    const [trash, activeArticle] = await Promise.all([
      transaction.get(trashRef),
      transaction.get(articleRef),
    ]);

    if (!trash.exists()) throw new Error("Deleted article not found.");
    if (activeArticle.exists()) {
      throw new Error("An article with this ID already exists.");
    }

    const article = trash.data().article;
    const slug = typeof article?.slug === "string" ? article.slug.trim() : "";
    if (!slug) throw new Error("This article does not have a valid slug.");

    const slugMatches = await getDocs(
      query(collection(db, "articles"), where("slug", "==", slug)),
    );
    if (!slugMatches.empty) {
      throw new Error(`Another article already uses the slug "${slug}".`);
    }

    transaction.set(articleRef, article);
    transaction.delete(trashRef);
  });
}

export async function permanentlyDeleteArticle(articleId: string) {
  await deleteDoc(doc(db, ARTICLE_TRASH_COLLECTION, articleId));
}
