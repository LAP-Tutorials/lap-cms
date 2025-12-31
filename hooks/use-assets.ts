import { useState, useEffect, useCallback } from "react";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata,
  StorageReference,
  getBytes,
} from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { storage, auth, functions, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  getAggregateFromServer,
  sum,
  count,
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export interface Asset {
  id: string;
  name: string;
  type: "file" | "folder";
  url?: string;
  path: string;
  parentId: string | null;
  mimeType?: string;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function useAssets(path: string = "") {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});
  const { toast } = useToast();

  const fetchAssets = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const storageRef = ref(storage, path);
      const res = await listAll(storageRef);

      const folderItems: Asset[] = res.prefixes
        .filter((folderRef) => folderRef.name !== "temp_downloads")
        .map((folderRef) => ({
          id: folderRef.fullPath,
          name: folderRef.name,
          type: "folder",
          path: folderRef.fullPath,
          parentId: folderRef.parent?.fullPath || null,
        }));

      const fileItems: Asset[] = await Promise.all(
        res.items.map(async (itemRef) => {
          let url = "";
          // Optimize: Fetch metadata and URL in parallel
          let metadata: any = {};

          try {
            const [urlResult, metadataResult] = await Promise.all([
              getDownloadURL(itemRef).catch(() => ""),
              getMetadata(itemRef).catch(() => ({})),
            ]);
            url = urlResult;
            metadata = metadataResult || {};
          } catch (e) {
            console.warn("Failed to load details for", itemRef.name);
          }

          return {
            id: itemRef.fullPath,
            name: itemRef.name,
            type: "file",
            url: url,
            path: itemRef.fullPath,
            parentId: itemRef.parent?.fullPath || null,
            mimeType: metadata.contentType || "application/octet-stream",
            size: metadata.size || 0,
            createdAt: metadata.timeCreated || new Date().toISOString(),
            updatedAt: metadata.updated || new Date().toISOString(),
          };
        })
      );

      // Filter out weird placeholder files if we use them
      const cleanFiles = fileItems.filter((f) => f.name !== ".keep");

      setAssets(cleanFiles);
      setFolders(folderItems);
    } catch (error) {
      console.error("Error listing assets:", error);
      // If path doesn't exist or no permission, we might get error.
      // But typically listAll on empty path just returns empty.
      setAssets([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const createFolder = useCallback(
    async (name: string) => {
      if (!auth.currentUser) return;

      // Firebase Storage doesn't have real folders. We create a placeholder file.
      const folderPath = path ? `${path}/${name}` : name;
      const storageRef = ref(storage, `${folderPath}/.keep`);

      try {
        const blob = new Blob([""], { type: "application/x-empty" });
        await uploadBytesResumable(storageRef, blob);
        toast({ title: "Folder created", variant: "success" });
        fetchAssets();
      } catch (error) {
        console.error(error);
        toast({ title: "Error creating folder", variant: "destructive" });
      }
    },
    [path, fetchAssets, toast]
  );

  const uploadAsset = useCallback(
    async (file: File) => {
      if (!auth.currentUser) return;

      const storageRef = ref(
        storage,
        path ? `${path}/${file.name}` : file.name
      );
      const uploadTask = uploadBytesResumable(storageRef, file);

      setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress((prev) => ({ ...prev, [file.name]: progress }));
        },
        (error) => {
          console.error(error);
          toast({
            title: "Upload failed",
            description: file.name,
            variant: "destructive",
          });
          setUploadProgress((prev) => {
            const newState = { ...prev };
            delete newState[file.name];
            return newState;
          });
        },
        async () => {
          setUploadProgress((prev) => {
            const newState = { ...prev };
            delete newState[file.name];
            return newState;
          });
          toast({
            title: "File uploaded",
            description: file.name,
            variant: "success",
          });
          fetchAssets();
        }
      );
    },
    [path, fetchAssets, toast]
  );

  const deleteAsset = useCallback(
    async (asset: Asset) => {
      try {
        const manageAssets = httpsCallable(functions, "manageAssets");
        await manageAssets({
          action: "delete",
          items: [asset.path],
        });

        toast({ title: "Item deleted", variant: "success" });
        fetchAssets();
      } catch (error) {
        console.error("Error deleting item:", error);
        toast({
          title: "Error deleting item",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [fetchAssets, toast]
  );

  const copyAsset = useCallback(
    async (asset: Asset, destPath: string) => {
      try {
        const manageAssets = httpsCallable(functions, "manageAssets");
        await manageAssets({
          action: "copy",
          items: [asset.path],
          destPath: destPath,
        });
        toast({ title: "Asset copied successfully", variant: "success" });
      } catch (error) {
        console.error("Error into copyAsset:", error);
        toast({ title: "Failed to copy asset", variant: "destructive" });
        throw error;
      }
    },
    [toast]
  );

  const renameAsset = useCallback(
    async (asset: Asset, newName: string) => {
      try {
        const manageAssets = httpsCallable(functions, "manageAssets");
        await manageAssets({
          action: "rename",
          items: [asset.path],
          newName: newName,
        });

        toast({ title: "Asset renamed successfully", variant: "success" });
        fetchAssets();
      } catch (error) {
        console.error("Error renaming asset:", error);
        toast({
          title: "Failed to rename asset",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
        throw error;
      }
    },
    [fetchAssets, toast]
  );

  const moveAssets = useCallback(
    async (assetsToMove: Asset[], destPathList: string[]) => {
      try {
        const destPath = destPathList.join("/");
        const items = assetsToMove.map((a) => a.path);
        const manageAssets = httpsCallable(functions, "manageAssets");
        await manageAssets({
          action: "move",
          items: items,
          destPath: destPath,
        });
        toast({ title: "Assets moved successfully", variant: "success" });
        fetchAssets();
      } catch (error) {
        console.error("Error moving assets:", error);
        toast({ title: "Failed to move assets", variant: "destructive" });
        throw error;
      }
    },
    [fetchAssets, toast]
  );

  const copyAssetsToRes = useCallback(
    async (assetsToCopy: Asset[], destPathList: string[]) => {
      try {
        const destPath = destPathList.join("/");
        const items = assetsToCopy.map((a) => a.path);
        const manageAssets = httpsCallable(functions, "manageAssets");
        await manageAssets({
          action: "copy",
          items: items,
          destPath: destPath,
        });
        toast({ title: "Assets copied successfully", variant: "success" });
        fetchAssets();
      } catch (error) {
        console.error("Error copying assets:", error);
        toast({ title: "Failed to copy assets", variant: "destructive" });
        throw error;
      }
    },
    [fetchAssets, toast]
  );

  const getFolderStats = useCallback(
    async (
      folderPath: string
    ): Promise<{ size: number; fileCount: number }> => {
      let totalSize = 0;
      let totalFiles = 0;

      const processFolder = async (path: string) => {
        const folderRef = ref(storage, path);
        const res = await listAll(folderRef);

        // Process files in current folder
        const filePromises = res.items.map(async (itemRef) => {
          try {
            const metadata = await getMetadata(itemRef);
            totalSize += metadata.size;
            totalFiles++;
          } catch (e) {
            console.warn("Error processing file stats:", itemRef.fullPath);
          }
        });

        await Promise.all(filePromises);

        // Recursively process subfolders
        const folderPromises = res.prefixes.map((prefix) =>
          processFolder(prefix.fullPath)
        );
        await Promise.all(folderPromises);
      };

      await processFolder(folderPath);
      return { size: totalSize, fileCount: totalFiles };
    },
    []
  );

  const getFolderStatsIndexed = useCallback(
    async (
      folderPath: string
    ): Promise<{ size: number; fileCount: number }> => {
      try {
        const assetsRef = collection(db, "assets_index");
        // We want all files where path starts with folderPath + "/"
        // and also the folder itself? No, just children.
        // If folderPath is empty "", we match all.

        let q;
        if (folderPath) {
          const prefix = folderPath.endsWith("/")
            ? folderPath
            : folderPath + "/";
          q = query(
            assetsRef,
            where("path", ">=", prefix),
            where("path", "<=", prefix + "\uf8ff"),
            where("type", "==", "file")
          );
        } else {
          // Root
          q = query(assetsRef, where("type", "==", "file"));
        }

        const snapshot = await getAggregateFromServer(q, {
          totalSize: sum("size"),
          count: count(),
        });

        return {
          size: snapshot.data().totalSize || 0,
          fileCount: snapshot.data().count || 0,
        };
      } catch (error) {
        console.warn(
          "Indexed stats failed, falling back to storage crawl",
          error
        );
        // Fallback if index fails or not ready?
        // But user wants speed. Let's return 0 or crawl?
        // Let's crawl for now as fallback.
        return getFolderStats(folderPath);
      }
    },
    [getFolderStats]
  );

  // Replace getFolderStats with the indexed version
  // We rename the old one or just swap usage.
  // Ideally we keep the interface same.

  const searchAssets = useCallback(
    async (queryText: string): Promise<Asset[]> => {
      if (!queryText.trim()) return [];

      const lowerQuery = queryText.toLowerCase();

      try {
        const assetsRef = collection(db, "assets_index");

        // Strategy 1: Prefix search on name (e.g. "dra" -> "draft...")
        const prefixQuery = query(
          assetsRef,
          where("nameLower", ">=", lowerQuery),
          where("nameLower", "<=", lowerQuery + "\uf8ff"),
          limit(30)
        );

        // Strategy 2: Keyword search (e.g. "vivian" -> "... Dr Vivian ...")
        // Note: 'array-contains' only matches EXACT elements. "vivi" wont match "vivian" keyword.
        // But it handles the "word in middle" case which is what the user wants.
        const keywordQuery = query(
          assetsRef,
          where("keywords", "array-contains", lowerQuery),
          limit(30)
        );

        // Run both in parallel
        const [prefixSnapshot, keywordSnapshot] = await Promise.all([
          getDocs(prefixQuery),
          getDocs(keywordQuery),
        ]);

        // Merge and Deduplicate by ID (path)
        const mergedDocs = new Map();

        [...prefixSnapshot.docs, ...keywordSnapshot.docs].forEach((doc) => {
          mergedDocs.set(doc.id, doc.data());
        });

        const results: Asset[] = Array.from(mergedDocs.values()).map(
          (data) => ({
            id: data.path,
            name: data.name,
            type: data.type || "file",
            url: "",
            path: data.path,
            parentId: data.path.includes("/")
              ? data.path.substring(0, data.path.lastIndexOf("/"))
              : null,
            mimeType:
              data.mimeType ||
              (data.type === "folder"
                ? "application/vnd.google-apps.folder"
                : "application/octet-stream"),
            size: data.size || 0,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          })
        );

        // Fetch URLs for files (limit to top 20 to avoid spamming)
        const topResults = results.slice(0, 50);

        await Promise.all(
          topResults.map(async (asset) => {
            if (asset.type === "file" && asset.mimeType?.startsWith("image/")) {
              try {
                const refUrl = await getDownloadURL(ref(storage, asset.path));
                asset.url = refUrl;
              } catch (e) {
                /* ignore */
              }
            }
          })
        );

        return topResults;
      } catch (error) {
        console.error("Search failed:", error);
        return [];
      }
    },
    []
  );

  const getAllFilesInFolder = useCallback(
    async (folderPath: string): Promise<Asset[]> => {
      try {
        const assetsRef = collection(db, "assets_index");

        // Query documents where parentId == folderPath
        // For root (folderPath == ""), we search parentId == ""

        const q = query(
          assetsRef,
          where("parentId", "==", folderPath),
          orderBy("type", "desc"), // Folders first?
          orderBy("nameLower", "asc")
        );

        const querySnapshot = await getDocs(q);

        const results: Asset[] = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: data.path,
            name: data.name,
            type: data.type,
            url: "",
            path: data.path,
            parentId: data.parentId || getParentPath(data.path),
            mimeType:
              data.mimeType ||
              (data.type === "folder"
                ? "application/vnd.google-apps.folder"
                : "application/octet-stream"),
            size: data.size || 0,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

        // Loop Removed: URLs are now lazy loaded by AssetThumbnail component in UI.
        // This makes folder listing instant.

        return results;
      } catch (e) {
        console.error("Failed to list assets from index", e);
        // Fallback to empty
        return [];
      }
    },
    []
  );

  // Helper
  const getParentPath = (path: string) => {
    return path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "";
  };

  const getFileBlob = useCallback(
    async (path: string): Promise<Blob | null> => {
      try {
        const storageRef = ref(storage, path);
        const buffer = await getBytes(storageRef);
        // We need MIME type to create a proper blob, but for zipping, generic is often okay if we don't have it.
        // Ideally we get metadata too, but that's an extra call.
        // Let's try to guess from metadata or just use octet-stream.
        let contentType = "application/octet-stream";
        try {
          const metadata = await getMetadata(storageRef);
          contentType = metadata.contentType || contentType;
        } catch (e) {
          // Ignore metadata error
        }

        return new Blob([buffer], { type: contentType });
      } catch (e) {
        console.error("Error downloading file blob:", e);
        return null;
      }
    },
    []
  );

  const downloadFolder = useCallback(async (folderPath: string) => {
    try {
      const manageAssets = httpsCallable(functions, "manageAssets");
      const result = await manageAssets({
        action: "downloadFolder",
        items: [folderPath],
      });
      return (result.data as any).downloadUrl as string;
    } catch (error) {
      console.error("Error downloading folder:", error);
      throw error;
    }
  }, []);

  const downloadFile = useCallback(async (filePath: string) => {
    try {
      const manageAssets = httpsCallable(functions, "manageAssets");
      const result = await manageAssets({
        action: "downloadFile",
        items: [filePath],
      });
      return (result.data as any).downloadUrl as string;
    } catch (error) {
      console.error("Error downloading file:", error);
      throw error;
    }
  }, []);

  const syncIndex = useCallback(async () => {
    try {
      const manageAssets = httpsCallable(functions, "manageAssets");
      const result = await manageAssets({
        action: "syncIndex",
        items: [], // required by validation but unused
      });
      return (result.data as any).success as number;
    } catch (error) {
      console.error("Error syncing index:", error);
      throw error;
    }
  }, []);

  return {
    assets,
    folders,
    loading,
    uploadProgress,
    createFolder,
    uploadAsset,
    deleteAsset,
    refresh: fetchAssets,
    renameAsset,
    moveAssets,
    copyAssets: copyAssetsToRes,
    getFolderStats: getFolderStatsIndexed,
    searchAssets,
    getAllFilesInFolder,
    getFileBlob,
    downloadFolder,
    downloadFile,
    syncIndex,
  };
}
