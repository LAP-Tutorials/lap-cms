import { useState, useEffect, useCallback } from "react";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata,
  StorageReference,
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

      const folderItems: Asset[] = res.prefixes.map((folderRef) => ({
        id: folderRef.fullPath,
        name: folderRef.name,
        type: "folder",
        path: folderRef.fullPath,
        parentId: folderRef.parent?.fullPath || null,
      }));

      const fileItems: Asset[] = await Promise.all(
        res.items.map(async (itemRef) => {
          let url = "";
          let metadata: any = {};

          try {
            // We get metadata first to avoid fetching URL for non-displayable/huge files if we wanted to optimization,
            // but strictly we need URL for the UI.
            // Parallelize for speed
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
            createdAt: metadata.timeCreated,
            updatedAt: metadata.updated,
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

  const createFolder = async (name: string) => {
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
  };

  const uploadAsset = async (file: File) => {
    if (!auth.currentUser) return;

    const storageRef = ref(storage, path ? `${path}/${file.name}` : file.name);
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
  };

  const deleteAsset = async (asset: Asset) => {
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
  };

  const copyAsset = async (asset: Asset, destPath: string) => {
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
  };

  const renameAsset = async (asset: Asset, newName: string) => {
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
  };

  const moveAssets = async (assetsToMove: Asset[], destPathList: string[]) => {
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
  };

  const copyAssetsToRes = async (
    assetsToCopy: Asset[],
    destPathList: string[]
  ) => {
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
  };

  const getFolderStats = async (
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
  };

  const searchAssets = async (query: string): Promise<Asset[]> => {
    if (!query.trim()) return [];
    const results: Asset[] = [];

    const processFolder = async (path: string) => {
      const folderRef = ref(storage, path);
      const res = await listAll(folderRef);

      // Check files
      for (const itemRef of res.items) {
        if (itemRef.name.toLowerCase().includes(query.toLowerCase())) {
          try {
            const [url, metadata] = await Promise.all([
              getDownloadURL(itemRef).catch(() => ""),
              getMetadata(itemRef).catch(() => ({})),
            ]);

            results.push({
              id: itemRef.fullPath,
              name: itemRef.name,
              type: "file",
              url,
              path: itemRef.fullPath,
              parentId: itemRef.parent?.fullPath || null,
              mimeType:
                (metadata as any).contentType || "application/octet-stream",
              size: (metadata as any).size || 0,
              createdAt: (metadata as any).timeCreated,
              updatedAt: (metadata as any).updated,
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
  };

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
  };
}
