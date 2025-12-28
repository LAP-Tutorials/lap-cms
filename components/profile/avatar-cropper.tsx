import { useState, useCallback, useEffect } from "react"
import Cropper from "react-easy-crop"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Loader2 } from "lucide-react"

import { getCroppedImg } from "@/components/profile/canvas-utils"

interface AvatarCropperProps {
  isOpen: boolean
  onClose: () => void
  imageFile: File | null
  onCropComplete: (croppedBlob: Blob) => void
}

// function imports

export function AvatarCropper({ isOpen, onClose, imageFile, onCropComplete }: AvatarCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  // Load image from file
  useEffect(() => {
    if (imageFile) {
        const reader = new FileReader()
        reader.addEventListener("load", () => {
            setImageSrc(reader.result?.toString() || "")
        })
        reader.readAsDataURL(imageFile)
    }
  }, [imageFile])


  const onCropChange = (crop: { x: number; y: number }) => {
    setCrop(crop)
  }

  const onZoomChange = (zoom: number) => {
    setZoom(zoom)
  }

  const onCropCompleteInternal = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const createCroppedImage = useCallback(async () => {
    try {
        setProcessing(true)
      const croppedImage = await getCroppedImg(imageSrc!, croppedAreaPixels)
      if (croppedImage) {
          onCropComplete(croppedImage)
          onClose()
      }
    } catch (e) {
      console.error(e)
    } finally {
        setProcessing(false)
    }
  }, [imageSrc, croppedAreaPixels, onCropComplete, onClose])


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop Profile Picture</DialogTitle>
          <DialogDescription>
            Adjust the image to fit your profile.
          </DialogDescription>
        </DialogHeader>
        
        <div 
          className="relative h-64 w-full rounded-md overflow-hidden mt-4"
          style={{ 
            backgroundColor: '#1A1A1A', 
            border: '1px solid rgba(255, 255, 255, 0.1)' 
          }}
        >
            {imageSrc && (
                <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                showGrid={true}
                onCropChange={onCropChange}
                onZoomChange={onZoomChange}
                onCropComplete={onCropCompleteInternal}
                style={{
                  containerStyle: { background: "#1A1A1A" },
                  cropAreaStyle: { background: "transparent", border: "1px solid rgba(255, 255, 255, 0.5)" }
                }}
                />
            )}
        </div>

        <div className="space-y-4 py-4">
             <div className="flex items-center gap-4 px-2">
                <span className="text-sm font-medium text-white w-12">Zoom</span>
                 <Slider 
                    value={[zoom]} 
                    min={1} 
                    max={3} 
                    step={0.1} 
                    onValueChange={(val) => setZoom(val[0])} 
                    className="flex-1 cursor-pointer"
                />
             </div>
        </div>

        <DialogFooter className="sm:justify-between gap-3">
          <Button variant="outline" onClick={onClose} disabled={processing} className="flex-1">Cancel</Button>
          <Button onClick={createCroppedImage} disabled={processing} className="flex-1">
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


