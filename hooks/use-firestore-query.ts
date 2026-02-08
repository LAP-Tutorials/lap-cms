"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  limit,
  startAfter,
  type DocumentData,
  type QueryConstraint,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Pagination hook for collections
export function usePaginatedCollection(
  collectionName: string,
  pageSize = 10,
  constraints: QueryConstraint[] = [],
) {
  const [lastVisible, setLastVisible] = useState<DocumentData | null>(null);
  const [items, setItems] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Initial load
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, collectionName),
        ...constraints,
        limit(pageSize),
      );

      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setItems(docs);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === pageSize);
    } catch (error) {
      console.error(`Error fetching ${collectionName}:`, error);
    } finally {
      setLoading(false);
    }
  };

  // Load next page
  const loadMore = async () => {
    if (!lastVisible || !hasMore || loading) return;

    setLoading(true);
    try {
      const q = query(
        collection(db, collectionName),
        ...constraints,
        startAfter(lastVisible),
        limit(pageSize),
      );

      const snapshot = await getDocs(q);
      const newDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setItems((prev) => [...prev, ...newDocs]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === pageSize);
    } catch (error) {
      console.error(`Error fetching more ${collectionName}:`, error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh data
  const refresh = () => {
    setItems([]);
    setLastVisible(null);
    setHasMore(true);
    loadInitialData();
  };

  // Memoize constraints to avoid unnecessary re-renders
  const memoizedConstraints = useMemo(
    () => constraints,
    [JSON.stringify(constraints)],
  );

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, memoizedConstraints]);

  return { items, loading, hasMore, loadMore, refresh };
}

// Hook for fetching a single document
export function useDocument<T = DocumentData>(
  collectionName: string,
  id: string | null,
) {
  return useQuery({
    queryKey: ["document", collectionName, id],
    queryFn: async () => {
      if (!id) return null;
      const docRef = doc(db, collectionName, id);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() } as T;
    },
    enabled: !!id,
  });
}

// Hook for fetching a collection with query constraints
export function useCollection<T = DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
) {
  // Serialize constraints for stable cache key
  const constraintsKey = JSON.stringify(constraints);

  return useQuery({
    queryKey: ["collection", collectionName, constraintsKey],
    queryFn: async () => {
      const q = query(collection(db, collectionName), ...constraints);
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[];
    },
  });
}

// Hook for creating a document
export function useCreateDocument(collectionName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: DocumentData }) => {
      if (id) {
        await setDoc(doc(db, collectionName, id), data);
        return { id, ...data };
      } else {
        const docRef = doc(collection(db, collectionName));
        await setDoc(docRef, data);
        return { id: docRef.id, ...data };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collection", collectionName],
      });
    },
  });
}

// Hook for updating a document
export function useUpdateDocument(collectionName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<DocumentData>;
    }) => {
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, data);
      return { id, ...data };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["document", collectionName, variables.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["collection", collectionName],
      });
    },
  });
}

// Hook for deleting a document
export function useDeleteDocument(collectionName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, collectionName, id));
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({
        queryKey: ["document", collectionName, id],
      });
      queryClient.invalidateQueries({
        queryKey: ["collection", collectionName],
      });
    },
  });
}

// Hook for batch operations
export function useBatchOperations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      operations,
      collections = [],
    }: {
      operations: Array<{
        type: "set" | "update" | "delete";
        ref: DocumentReference;
        data?: DocumentData;
      }>;
      collections?: string[];
    }) => {
      const batch = writeBatch(db);

      operations.forEach((op) => {
        if (op.type === "set" && op.data) {
          batch.set(op.ref, op.data);
        } else if (op.type === "update" && op.data) {
          batch.update(op.ref, op.data);
        } else if (op.type === "delete") {
          batch.delete(op.ref);
        }
      });

      await batch.commit();
      return { success: true };
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      variables.collections?.forEach((collectionName) => {
        queryClient.invalidateQueries({
          queryKey: ["collection", collectionName],
        });
      });
    },
  });
}
