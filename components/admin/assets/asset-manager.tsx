import { useState, useMemo, useEffect } from "react";
import { useAssets, Asset } from "@/hooks/use-assets";
import { UploadZone } from "./upload-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Folder,
  File as FileIcon,
  MoreVertical,
  Trash,
  Link as LinkIcon,
  FolderPlus,
  ArrowLeft,
  Loader2,
  Search,
  Image as ImageIcon,
  FileText,
  Copy,
  Scissors,
  ClipboardPaste,
  CheckSquare,
  Square,
  Edit,
  X,
  FileAudio,
  FileVideo,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Eye,
  Home,
  Palette,
  Database,
  Disc,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const getFileIcon = (mimeType: string, fileName: string) => {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  // Audio
  if (
    mimeType.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "m4a", "flac"].includes(extension)
  )
    return { icon: FileAudio, color: "text-yellow-400" };

  // Video
  if (
    mimeType.startsWith("video/") ||
    ["mp4", "webm", "avi", "mov", "mkv"].includes(extension)
  )
    return { icon: FileVideo, color: "text-blue-400" };

  // Documents
  if (mimeType.includes("pdf"))
    return { icon: FileText, color: "text-red-400" };
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    ["doc", "docx", "odt", "rtf", "txt", "md"].includes(extension)
  )
    return { icon: FileText, color: "text-blue-300" };

  // Presentations
  if (
    mimeType.includes("powerpoint") ||
    mimeType.includes("presentation") ||
    ["ppt", "pptx", "odp"].includes(extension)
  )
    return { icon: FileText, color: "text-orange-400" };

  // Spreadsheets
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    ["xls", "xlsx", "csv", "ods"].includes(extension)
  )
    return { icon: FileSpreadsheet, color: "text-emerald-400" };

  // Archives
  if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    mimeType.includes("tar") ||
    ["zip", "rar", "7z", "tar", "gz"].includes(extension)
  )
    return { icon: FileArchive, color: "text-orange-300" };

  // Code
  if (
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("html") ||
    mimeType.includes("css") ||
    [
      "js",
      "ts",
      "tsx",
      "jsx",
      "json",
      "html",
      "css",
      "scss",
      "less",
      "php",
      "py",
      "java",
      "c",
      "cpp",
      "cs",
      "go",
      "rs",
      "rb",
      "swift",
      "kt",
      "sql",
      "xml",
      "yaml",
      "toml",
      "config",
      "env",
    ].includes(extension)
  )
    return { icon: FileCode, color: "text-green-400" };

  // Design
  if (
    [
      "fig",
      "sketch",
      "xd",
      "ai",
      "psd",
      "ind",
      "cdr",
      "svg",
      "af",
      "kra",
    ].includes(extension)
  )
    return { icon: Palette, color: "text-pink-400" };

  // Database
  if (
    [
      "sql",
      "db",
      "sqlite",
      "mdb",
      "accdb",
      "dbf",
      "mysql",
      "pgsql",
      "mongodb",
    ].includes(extension)
  )
    return { icon: Database, color: "text-indigo-400" };

  // Disk Images
  if (
    ["iso", "dmg", "img", "toast", "vcd", "bin", "cue", "vhd", "vhdx"].includes(
      extension
    )
  )
    return { icon: Disc, color: "text-slate-400" };

  // System/Misc
  if (["exe", "msi", "dll", "sys"].includes(extension))
    return { icon: FileCode, color: "text-gray-400" };

  return { icon: FileIcon, color: "text-white/20" };
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export function AssetManager() {
  // Root level management for Tabs
  const {
    folders: rootFolders,
    loading: rootLoading,
    refresh: refreshRoot,
  } = useAssets("");
  const [activeTab, setActiveTab] = useState("overview");

  // Navigation state within a tab
  const [subPath, setSubPath] = useState<string[]>([]);

  // Computed current path
  // If overview, path is just subPath joined
  // If specific tab, path is tabName + subPath joined
  const getPath = () => {
    const parts = [];
    if (activeTab !== "overview") parts.push(activeTab);
    if (subPath.length > 0) parts.push(...subPath);
    return parts.join("/");
  };

  const currentPath = getPath();

  const {
    assets,
    folders,
    loading,
    uploadProgress,
    createFolder,
    uploadAsset,
    deleteAsset,
    refresh,
    renameAsset,
    moveAssets,
    copyAssets,
    getFolderStats,
    searchAssets,
  } = useAssets(currentPath);

  const [newFolderName, setNewFolderName] = useState("");
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // Multi-select & Clipboard State
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{
    type: "copy" | "cut";
    assets: Asset[];
    sourcePath: string[];
  } | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [assetToRename, setAssetToRename] = useState<Asset | null>(null);

  // Folder Stats State
  const [folderStats, setFolderStats] = useState<{ [key: string]: number }>({});
  const [totalPersistenceSize, setTotalPersistenceSize] = useState<number>(0);

  // Fetch total storage size on mount
  useEffect(() => {
    const fetchTotalSize = async () => {
      try {
        const stats = await getFolderStats("");
        setTotalPersistenceSize(stats.size);
      } catch (e) {
        console.error("Failed to fetch total storage size", e);
      }
    };
    fetchTotalSize();
  }, [getFolderStats]);

  useEffect(() => {
    const loadFolderStats = async () => {
      const selectedFolders = [...folders].filter((f) =>
        selectedAssets.has(f.id)
      );
      for (const folder of selectedFolders) {
        if (folderStats[folder.id] === undefined) {
          // Fetch if not already known
          const stats = await getFolderStats(folder.path);
          setFolderStats((prev) => ({ ...prev, [folder.id]: stats.size }));
        }
      }
    };
    if (selectedAssets.size > 0) {
      loadFolderStats();
    }
  }, [selectedAssets, folders, getFolderStats, folderStats]);

  // Search State
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Search Effect
  useEffect(() => {
    const performSearch = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchAssets(searchTerm);
        setSearchResults(results);
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [searchTerm, searchAssets]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedAssets);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedAssets(newSet);
  };

  const selectAll = () => {
    if (
      selectedAssets.size ===
      filteredAssets.length + filteredFolders.length
    ) {
      setSelectedAssets(new Set());
    } else {
      const newSet = new Set<string>();
      filteredFolders.forEach((f) => newSet.add(f.id));
      filteredAssets.forEach((a) => newSet.add(a.id));
      setSelectedAssets(newSet);
    }
  };

  const handleCopy = (isCut: boolean = false) => {
    const itemsToProcess = [...folders, ...assets].filter((item) =>
      selectedAssets.has(item.id)
    );
    setClipboard({
      type: isCut ? "cut" : "copy",
      assets: itemsToProcess,
      sourcePath: subPath,
    });
    setSelectedAssets(new Set());
    toast({
      title: isCut ? "Cut to clipboard" : "Copied to clipboard",
      variant: "default",
    });
  };

  const handlePaste = async () => {
    if (!clipboard) return;

    const destPathParts = [];
    if (activeTab !== "overview") destPathParts.push(activeTab);
    if (subPath.length > 0) destPathParts.push(...subPath);

    if (clipboard.type === "cut") {
      await moveAssets(clipboard.assets, destPathParts);
      setClipboard(null);
    } else {
      await copyAssets(clipboard.assets, destPathParts);
      setClipboard(null);
    }
    refresh();
  };

  const handleRename = () => {
    if (selectedAssets.size !== 1) return;
    const assetId = Array.from(selectedAssets)[0];
    const asset = [...folders, ...assets].find((a) => a.id === assetId);
    if (asset) {
      setAssetToRename(asset);
      setRenameValue(asset.name);
      setIsRenameOpen(true);
    }
  };

  const confirmRename = async () => {
    if (!assetToRename || !renameValue.trim()) return;
    if (renameValue !== assetToRename.name) {
      await renameAsset(assetToRename, renameValue);
    }
    setIsRenameOpen(false);
    setAssetToRename(null);
    setSelectedAssets(new Set());
  };

  const handleDeleteSelected = async () => {
    const itemsToDelete = [...folders, ...assets].filter((item) =>
      selectedAssets.has(item.id)
    );
    if (
      confirm(`Are you sure you want to delete ${itemsToDelete.length} items?`)
    ) {
      // Sequential delete for safety
      for (const item of itemsToDelete) {
        await deleteAsset(item);
      }
      setSelectedAssets(new Set());
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName);
    setNewFolderName("");
    setIsCreateFolderOpen(false);
    // If we are at root (overview), we should refresh root tabs too
    if (currentPath === "") {
      setTimeout(refreshRoot, 1000);
    }
  };

  const navigateToFolder = (folderName: string) => {
    // If we are in overview and the folder is a root folder (exists as a tab), switch to that tab
    if (
      activeTab === "overview" &&
      rootFolders.some((f) => f.name === folderName)
    ) {
      setActiveTab(folderName);
      setSubPath([]);
      return;
    }
    setSubPath([...subPath, folderName]);
  };

  const navigateUp = () => {
    if (subPath.length === 0) return;
    const newPath = [...subPath];
    newPath.pop();
    setSubPath(newPath);
  };

  const navigateToRoot = () => {
    setSubPath([]);
  };

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setSubPath([]); // Reset depth when switching tabs
  };

  const handleCopyLink = (url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard", variant: "success" });
  };

  const filteredAssets = useMemo(() => {
    if (searchTerm.trim()) return searchResults;
    return assets;
  }, [assets, searchResults, searchTerm]);

  const filteredFolders = useMemo(() => {
    if (searchTerm.trim()) return []; // Don't show folders in global search mode for now
    return folders;
  }, [folders, searchTerm]);

  const handleUpload = (files: File[]) => {
    files.forEach((file) => uploadAsset(file));
    if (currentPath === "") {
      setTimeout(refreshRoot, 2000);
    }
  };

  // Calculate total size of selected assets (including folders recursively)
  const totalSelectedSize = useMemo(() => {
    return [...folders, ...assets]
      .filter((item) => selectedAssets.has(item.id))
      .reduce((acc, item) => {
        if (item.type === "folder") {
          return acc + (folderStats[item.id] || 0);
        }
        return acc + (item.size || 0);
      }, 0);
  }, [selectedAssets, assets, folders, folderStats]);

  const renderFiles = () => {
    if (filteredAssets.length === 0 && filteredFolders.length === 0) {
      return (
        <div className="text-center py-12 border border-white/10 rounded-xl bg-white/5 border-dashed">
          <p className="text-white/40">Empty folder</p>
        </div>
      );
    }

    if (filteredAssets.length === 0) {
      return (
        <p className="text-sm text-white/40 italic">No files in this folder</p>
      );
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredAssets.map((asset) => (
          <div
            key={asset.id}
            className={`group relative border rounded-xl overflow-hidden transition-colors ${
              selectedAssets.has(asset.id)
                ? "border-purple-500/50 bg-purple-500/5"
                : "border-white/10 bg-[#1A1A1A] hover:border-purple-500/50"
            }`}
          >
            <div
              className="absolute top-2 left-2 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`rounded bg-black/50 hover:bg-black/80 p-1 cursor-pointer transition-opacity ${
                  selectedAssets.has(asset.id)
                    ? "opacity-100"
                    : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                }`}
                onClick={() => toggleSelection(asset.id)}
              >
                {selectedAssets.has(asset.id) ? (
                  <CheckSquare className="h-4 w-4 text-purple-400" />
                ) : (
                  <Square className="h-4 w-4 text-white/50" />
                )}
              </div>
            </div>
            <div className="aspect-square bg-black/40 flex items-center justify-center relative overflow-hidden">
              {asset.mimeType?.startsWith("image/") ? (
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="object-cover w-full h-full transition-transform group-hover:scale-105"
                />
              ) : (
                (() => {
                  const { icon: Icon, color } = getFileIcon(
                    asset.mimeType || "",
                    asset.name
                  );
                  return <Icon className={`h-12 w-12 ${color}`} />;
                })()
              )}

              {/* Overlay Actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex items-center justify-center gap-2 backdrop-blur-sm">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9 rounded-full bg-black/50 text-white border border-white/20 hover:bg-black/70 hover:scale-105 transition-all"
                  onClick={() => window.open(asset.url, "_blank")}
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9 rounded-full bg-black/50 text-white border border-white/20 hover:bg-black/70 hover:scale-105 transition-all"
                  onClick={() => handleCopyLink(asset.url!)}
                  title="Copy Link"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium truncate text-white/90"
                    title={asset.name}
                  >
                    {asset.name}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    {formatBytes(asset.size || 0)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 -mr-2 hover:bg-white/10"
                    >
                      <MoreVertical className="h-3 w-3 text-white/60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-[#121212] border-white/10 text-white"
                  >
                    <DropdownMenuItem
                      onClick={() => window.open(asset.url, "_blank")}
                      className="focus:bg-white/5"
                    >
                      <Eye className="mr-2 h-4 w-4" /> View
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault(); // Prevent closing to allow state update if needed, though mostly for Dialogs
                        setAssetToRename(asset);
                        setRenameValue(asset.name);
                        setIsRenameOpen(true);
                      }}
                      className="focus:bg-white/5"
                    >
                      <Edit className="mr-2 h-4 w-4" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setClipboard({
                          type: "copy",
                          assets: [asset],
                          sourcePath: subPath,
                        });
                        toast({ title: "Copied to clipboard" });
                      }}
                      className="focus:bg-white/5"
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setClipboard({
                          type: "cut",
                          assets: [asset],
                          sourcePath: subPath,
                        });
                        toast({ title: "Cut to clipboard" });
                      }}
                      className="focus:bg-white/5"
                    >
                      <Scissors className="mr-2 h-4 w-4" /> Cut
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleCopyLink(asset.url!)}
                      className="focus:bg-white/5"
                    >
                      <LinkIcon className="mr-2 h-4 w-4" /> Copy Link
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-400 focus:text-red-400 focus:bg-white/5"
                      onClick={() => deleteAsset(asset)}
                    >
                      <Trash className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Tabs Header */}
        <div className="border-b border-white/10 pb-2">
          {rootLoading ? (
            <div className="h-10 w-full animate-pulse bg-white/5 rounded-md" />
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="w-full"
            >
              <TabsList className="w-full justify-start overflow-x-auto bg-transparent p-0">
                <TabsTrigger
                  value="overview"
                  onClick={() => setSubPath([])}
                  className="flex items-center data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md px-4 py-2"
                >
                  <Home className="w-4 h-4 mr-2" /> Overview
                </TabsTrigger>
                {rootFolders.map((folder) => (
                  <TabsTrigger
                    key={folder.id}
                    value={folder.name}
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md px-4 py-2"
                  >
                    {folder.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Global Stats Bar */}
        <div className="flex items-center justify-between px-1 mb-4">
          <div className="text-sm text-white/50">
            Total Storage Used:{" "}
            <span className="text-white font-medium">
              {formatBytes(totalPersistenceSize)}
            </span>
          </div>
        </div>

        {/* Action Bar */}
        {(selectedAssets.size > 0 || clipboard) && (
          <div className="sticky top-20 z-50 flex items-center justify-between bg-[#1A1A1A] border border-purple-500/20 p-2 sm:p-3 rounded-lg shadow-2xl mb-6 backdrop-blur-md mx-1">
            <div className="flex items-center gap-2 sm:gap-4">
              {selectedAssets.size > 0 && (
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-purple-200">
                    {selectedAssets.size}{" "}
                    <span className="hidden sm:inline">selected</span>
                  </span>
                  <span className="text-xs text-white/40">
                    {formatBytes(totalSelectedSize)}
                  </span>
                </div>
              )}
              {clipboard && (
                <span className="text-sm text-white/50 flex items-center gap-2">
                  <ClipboardPaste className="h-4 w-4" />
                  {clipboard.assets.length} items
                  <span className="hidden sm:inline"> to {clipboard.type}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {selectedAssets.size > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedAssets(new Set())}
                    title="Clear Selection"
                    className="px-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="h-4 w-px bg-white/10 mx-1 sm:mx-2" />
                  {selectedAssets.size === 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRename}
                      className="px-2 sm:px-4"
                    >
                      <Edit className="h-4 w-4 sm:mr-2" />{" "}
                      <span className="hidden sm:inline">Rename</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy(false)}
                    className="px-2 sm:px-4"
                  >
                    <Copy className="h-4 w-4 sm:mr-2" />{" "}
                    <span className="hidden sm:inline">Copy</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy(true)}
                    className="px-2 sm:px-4"
                  >
                    <Scissors className="h-4 w-4 sm:mr-2" />{" "}
                    <span className="hidden sm:inline">Cut</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 px-2 sm:px-4"
                    onClick={handleDeleteSelected}
                  >
                    <Trash className="h-4 w-4 sm:mr-2" />{" "}
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </>
              )}

              {clipboard && (
                <>
                  <div className="h-4 w-px bg-white/10 mx-1 sm:mx-2" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setClipboard(null)}
                    className="px-2 sm:px-4"
                  >
                    <span className="hidden sm:inline">Cancel</span>
                    <span className="sm:hidden">
                      <X className="h-4 w-4" />
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 px-2 sm:px-4"
                    onClick={handlePaste}
                  >
                    <ClipboardPaste className="h-4 w-4 sm:mr-2" />{" "}
                    <span className="hidden sm:inline">Paste Here</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          {subPath.length > 0 && (
            <Button variant="ghost" size="icon" onClick={navigateUp}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="opacity-50">
              {activeTab === "overview" ? "Overview" : activeTab}
            </span>
            {subPath.length > 0 && (
              <>
                <span className="opacity-30">/</span>
                <span>{subPath[subPath.length - 1]}</span>
              </>
            )}
          </h2>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/50" />
            <Input
              type="search"
              placeholder="Search assets..."
              className="pl-8 bg-[#121212] border-white/10 focus-visible:ring-purple-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Dialog
            open={isCreateFolderOpen}
            onOpenChange={setIsCreateFolderOpen}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-white/10 hover:bg-white/5"
              >
                <FolderPlus className="mr-2 h-4 w-4" /> New Folder
              </Button>
            </DialogTrigger>
            <Button
              variant="outline"
              className="border-white/10 hover:bg-white/5"
              onClick={selectAll}
            >
              <CheckSquare className="mr-2 h-4 w-4" /> Select All
            </Button>
            <DialogContent className="bg-[#121212] border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Folder Name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                  className="bg-black/20 border-white/10"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateFolderOpen(false)}
                  className="border-white/10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateFolder}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
            <DialogContent className="bg-[#121212] border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>Rename Asset</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmRename()}
                  className="bg-black/20 border-white/10"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsRenameOpen(false)}
                  className="border-white/10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmRename}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Rename
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="min-h-[400px]">
          <UploadZone onUpload={handleUpload} uploadProgress={uploadProgress} />

          <div className="mt-8">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            ) : (
              <div className="space-y-8">
                {/* Folders Section */}
                {filteredFolders.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white/50 mb-4 uppercase tracking-wider">
                      Folders
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {filteredFolders.map((folder) => (
                        <div
                          key={folder.id}
                          className={`group relative flex flex-col items-center p-6 border rounded-xl transition-all cursor-pointer ${
                            selectedAssets.has(folder.id)
                              ? "bg-purple-500/10 border-purple-500/50"
                              : "bg-white/5 border-white/5 hover:bg-white/10"
                          }`}
                          onClick={() => navigateToFolder(folder.name)}
                        >
                          <div
                            className="absolute top-2 left-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div
                              className={`rounded hover:bg-white/10 p-1 cursor-pointer transition-opacity ${
                                selectedAssets.has(folder.id)
                                  ? "opacity-100"
                                  : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              }`}
                              onClick={() => toggleSelection(folder.id)}
                            >
                              {selectedAssets.has(folder.id) ? (
                                <CheckSquare className="h-5 w-5 text-purple-400" />
                              ) : (
                                <Square className="h-5 w-5 text-white/50" />
                              )}
                            </div>
                          </div>

                          <Folder
                            className="h-12 w-12 text-purple-400 mb-3"
                            fill="currentColor"
                            fillOpacity={0.2}
                          />
                          <span className="text-sm font-medium text-center truncate w-full text-white/90">
                            {folder.name}
                          </span>

                          <div
                            className="absolute top-2 right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-white/10"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="bg-[#121212] border-white/10 text-white"
                              >
                                <DropdownMenuItem
                                  onClick={() => {
                                    setAssetToRename(folder as any);
                                    setRenameValue(folder.name);
                                    setIsRenameOpen(true);
                                  }}
                                  className="focus:bg-white/5"
                                >
                                  <Edit className="mr-2 h-4 w-4" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setClipboard({
                                      type: "copy",
                                      assets: [folder as any],
                                      sourcePath: subPath,
                                    });
                                    toast({ title: "Copied to clipboard" });
                                  }}
                                  className="focus:bg-white/5"
                                >
                                  <Copy className="mr-2 h-4 w-4" /> Copy
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setClipboard({
                                      type: "cut",
                                      assets: [folder as any],
                                      sourcePath: subPath,
                                    });
                                    toast({ title: "Cut to clipboard" });
                                  }}
                                  className="focus:bg-white/5"
                                >
                                  <Scissors className="mr-2 h-4 w-4" /> Cut
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-400 focus:text-red-400 focus:bg-white/5"
                                  onClick={() => deleteAsset(folder)}
                                >
                                  <Trash className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files Section */}
                <div>
                  <h3 className="text-sm font-medium text-white/50 mb-4 uppercase tracking-wider">
                    Files
                  </h3>
                  {renderFiles()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
