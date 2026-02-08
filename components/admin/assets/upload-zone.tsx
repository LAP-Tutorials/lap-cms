import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
  uploadProgress: { [key: string]: number };
}

export function UploadZone({ onUpload, uploadProgress }: UploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onUpload(acceptedFiles);
    },
    [onUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const uploadingFiles = Object.entries(uploadProgress);

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors max-w-2xl mx-auto",
          isDragActive
            ? "border-purple-500 bg-purple-500/10"
            : "border-white/10 hover:border-white/20 hover:bg-white/5",
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-10 w-10 text-white/40" />
          {isDragActive ? (
            <p className="text-lg font-medium text-white">
              Drop the files here ...
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-lg font-medium text-white/90">
                Drag & drop files here, or click to select files
              </p>
              <p className="text-sm text-white/50">
                Supports images, documents, and more
              </p>
            </div>
          )}
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-2 mt-4">
          <h4 className="font-medium text-sm text-white/70">Uploading...</h4>
          <div className="grid gap-2">
            {uploadingFiles.map(([fileName, progress]) => (
              <div
                key={fileName}
                className="bg-white/10 p-3 rounded-md flex items-center gap-3 border border-white/5"
              >
                <FileIcon className="h-8 w-8 text-purple-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium truncate text-white">
                      {fileName}
                    </span>
                    <span className="text-xs text-white/60">
                      {Math.round(progress)}%
                    </span>
                  </div>
                  <Progress value={progress} className="h-1 bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
