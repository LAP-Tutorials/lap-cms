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
import { storage, auth, functions } from "@/lib/firebase";
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
        if (asset.type === "file") {
          const storageRef = ref(storage, asset.path);
          await deleteObject(storageRef);
        } else {
          const folderRef = ref(storage, asset.path);
          const listRes = await listAll(folderRef);

          const deletePromises = [
            ...listRes.items.map((item) => deleteObject(item)),
          ];

          await Promise.all(deletePromises);
        }

        toast({ title: "Item deleted", variant: "success" });
        fetchAssets();
      } catch (error) {
        console.error(error);
        toast({ title: "Error deleting item", variant: "destructive" });
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

  const searchAssets = useCallback(async (query: string): Promise<Asset[]> => {
    if (!query.trim()) return [];
    const results: Asset[] = [];

    const processFolder = async (path: string) => {
      const folderRef = ref(storage, path);
      let res;
      try {
        res = await listAll(folderRef);
      } catch (e) {
        console.warn("Failed to list contents of", path);
        return;
      }

      // Check subfolders
      for (const prefix of res.prefixes) {
        if (prefix.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            id: prefix.fullPath,
            name: prefix.name,
            type: "folder",
            path: prefix.fullPath,
            parentId: prefix.parent?.fullPath || null,
          });
        }
      }

      // Check files
      for (const itemRef of res.items) {
        if (itemRef.name.toLowerCase().includes(query.toLowerCase())) {
          try {
            const [url, metadata] = await Promise.all([
              getDownloadURL(itemRef).catch(() => ""),
              getMetadata(itemRef).catch(() => ({} as any)),
            ]);

            results.push({
              id: itemRef.fullPath,
              name: itemRef.name,
              type: "file",
              url,
              path: itemRef.fullPath,
              parentId: itemRef.parent?.fullPath || null,
              mimeType: metadata.contentType || "application/octet-stream",
              size: metadata.size || 0,
              createdAt: metadata.timeCreated || new Date().toISOString(),
              updatedAt: metadata.updated || new Date().toISOString(),
            });
          } catch (e) {
            console.warn("Failed to load search result details", itemRef.name);
          }
        }
      }

      // Recurse
      await Promise.all(res.prefixes.map((p) => processFolder(p.fullPath)));
    };

    await processFolder(""); // Start from root
    return results;
  }, []);

  const getAllFilesInFolder = useCallback(
    async (folderPath: string): Promise<Asset[]> => {
      const results: Asset[] = [];

      const processFolder = async (path: string) => {
        const folderRef = ref(storage, path);
        const res = await listAll(folderRef);

        // Collect files
        const filePromises = res.items.map(async (itemRef) => {
          try {
            const url = await getDownloadURL(itemRef).catch(() => "");
            const metadata = await getMetadata(itemRef).catch(() => ({}));

            results.push({
              id: itemRef.fullPath,
              name: itemRef.name,
              type: "file",
              url,
              path: itemRef.fullPath,
              parentId: itemRef.parent?.fullPath || null,
              mimeType:
                (metadata as any).contentType || "application/octet-stream",
            });
          } catch (e) {
            console.warn("Failed to fetch file for zip", itemRef.name);
          }
        });

        await Promise.all(filePromises);

        // Recurse
        await Promise.all(res.prefixes.map((p) => processFolder(p.fullPath)));
      };

      await processFolder(folderPath);
      return results;
    },
    []
  );

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
    getFolderStats,
    searchAssets,
    getAllFilesInFolder,
    getFileBlob,
    downloadFolder,
    downloadFile,
  };
}
