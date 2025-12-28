import { useState } from "react"
import { useAssets, Asset } from "@/hooks/use-assets"
import { UploadZone } from "./upload-zone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Home
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function AssetManager() {
  // Root level management for Tabs
  const { folders: rootFolders, loading: rootLoading, refresh: refreshRoot } = useAssets("")
  const [activeTab, setActiveTab] = useState("overview")
  
  // Navigation state within a tab
  const [subPath, setSubPath] = useState<string[]>([])
  
  // Computed current path
  // If overview, path is just subPath joined
  // If specific tab, path is tabName + subPath joined
  const getPath = () => {
    const parts = []
    if (activeTab !== "overview") parts.push(activeTab)
    if (subPath.length > 0) parts.push(...subPath)
    return parts.join("/")
  }
  
  const currentPath = getPath()

  const {
    assets,
    folders,
    loading,
    uploadProgress,
    createFolder,
    uploadAsset,
    deleteAsset,
    refresh
  } = useAssets(currentPath)
  
  const [newFolderName, setNewFolderName] = useState("")
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const { toast } = useToast()

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    await createFolder(newFolderName)
    setNewFolderName("")
    setIsCreateFolderOpen(false)
    // If we are at root (overview), we should refresh root tabs too
    if (currentPath === "") {
        setTimeout(refreshRoot, 1000)
    }
  }

  const navigateToFolder = (folderName: string) => {
    setSubPath([...subPath, folderName])
  }

  const navigateUp = () => {
    if (subPath.length === 0) return
    const newPath = [...subPath]
    newPath.pop()
    setSubPath(newPath)
  }
  
  const navigateToRoot = () => {
      setSubPath([])
  }

  const handleTabChange = (val: string) => {
      setActiveTab(val)
      setSubPath([]) // Reset depth when switching tabs
  }

  const handleCopyLink = (url: string) => {
    if (!url) return
    navigator.clipboard.writeText(url)
    toast({ title: "Link copied to clipboard", variant: "success" })
  }

  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleUpload = (files: File[]) => {
      files.forEach(file => uploadAsset(file))
      if (currentPath === "") {
        setTimeout(refreshRoot, 2000)
      }
  }

  return (
    <div className="space-y-6">
      {/* Tabs Header */}
      <div className="border-b border-white/10 pb-2">
         {rootLoading ? (
             <div className="h-10 w-full animate-pulse bg-white/5 rounded-md" />
         ) : (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="w-full justify-start overflow-x-auto bg-transparent p-0">
                    <TabsTrigger 
                        value="overview" 
                        className="flex items-center data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-md px-4 py-2"
                    >
                        <Home className="w-4 h-4 mr-2" /> Overview
                    </TabsTrigger>
                    {rootFolders.map(folder => (
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          {subPath.length > 0 && (
            <Button variant="ghost" size="icon" onClick={navigateUp}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="opacity-50">{activeTab === 'overview' ? 'Root' : activeTab}</span>
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
          
          <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-white/10 hover:bg-white/5">
                <FolderPlus className="mr-2 h-4 w-4" /> New Folder
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#121212] border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Folder Name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  className="bg-black/20 border-white/10"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)} className="border-white/10">Cancel</Button>
                <Button onClick={handleCreateFolder} className="bg-purple-600 hover:bg-purple-700 text-white">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
                {(filteredFolders.length > 0) && (
                    <div>
                        <h3 className="text-sm font-medium text-white/50 mb-4 uppercase tracking-wider">Folders</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {filteredFolders.map((folder) => (
                            <div
                                key={folder.id}
                                className="group relative flex flex-col items-center p-6 border border-white/5 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition-all"
                                onClick={() => navigateToFolder(folder.name)}
                            >
                                <Folder className="h-12 w-12 text-purple-400 mb-3" fill="currentColor" fillOpacity={0.2} />
                                <span className="text-sm font-medium text-center truncate w-full text-white/90">
                                {folder.name}
                                </span>
                                
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/10">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-[#121212] border-white/10 text-white">
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
                    <h3 className="text-sm font-medium text-white/50 mb-4 uppercase tracking-wider">Files</h3>
                    {filteredAssets.length === 0 && filteredFolders.length === 0 ? (
                        <div className="text-center py-12 border border-white/10 rounded-xl bg-white/5 border-dashed">
                            <p className="text-white/40">Empty folder</p>
                        </div>
                    ) : filteredAssets.length === 0 ? (
                        <p className="text-sm text-white/40 italic">No files in this folder</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filteredAssets.map((asset) => (
                            <div
                            key={asset.id}
                            className="group relative border border-white/10 rounded-xl overflow-hidden bg-[#1A1A1A] hover:border-purple-500/50 transition-colors"
                            >
                            <div className="aspect-square bg-black/40 flex items-center justify-center relative overflow-hidden">
                                {asset.mimeType?.startsWith("image/") ? (
                                <img
                                    src={asset.url}
                                    alt={asset.name}
                                    className="object-cover w-full h-full transition-transform group-hover:scale-105"
                                />
                                ) : (
                                <FileText className="h-12 w-12 text-white/20" />
                                )}
                                
                                {/* Overlay Actions */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                                    <Button 
                                        size="icon" 
                                        variant="secondary" 
                                        className="h-9 w-9 rounded-full bg-white text-black hover:bg-gray-200"
                                        onClick={() => window.open(asset.url, '_blank')}
                                        title="View"
                                    >
                                        <ImageIcon className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        size="icon" 
                                        variant="secondary" 
                                        className="h-9 w-9 rounded-full bg-white text-black hover:bg-gray-200"
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
                                        <p className="text-sm font-medium truncate text-white/90" title={asset.name}>
                                        {asset.name}
                                        </p>
                                        <p className="text-xs text-white/40 mt-1">
                                            {(asset.size! / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 hover:bg-white/10">
                                            <MoreVertical className="h-3 w-3 text-white/60" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-[#121212] border-white/10 text-white">
                                            <DropdownMenuItem onClick={() => handleCopyLink(asset.url!)} className="focus:bg-white/5">
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
                    )}
                
                </div>
                </div>
            )}
          </div>
      </div>
    </div>
  )
}
