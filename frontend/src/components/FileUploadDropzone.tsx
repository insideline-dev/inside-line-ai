import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface FileUploadDropzoneProps {
  onUpload: (file: File) => void;
  accept?: string;
}

export function FileUploadDropzone({
  onUpload,
  accept,
}: FileUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onUpload(files[0]);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragActive(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "w-full rounded-lg border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground text-pretty transition-colors",
        isDragActive && "border-primary bg-muted/50 text-foreground",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => handleFiles(event.target.files)}
      />
      {isDragActive ? "Drop the file here..." : "Drag and drop a file here, or click to select"}
    </button>
  );
}
