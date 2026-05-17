import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// pdfjs worker is shipped by react-pdf's bundled pdfjs-dist. Resolve via
// import.meta.url so Vite serves it as a static asset.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface ScreeningPitchDeckViewerProps {
  url: string | null;
  className?: string;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

export function ScreeningPitchDeckViewer({
  url,
  className,
}: ScreeningPitchDeckViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setPageInput(String(pageIndex));
  }, [pageIndex]);

  const commitPageInput = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || !numPages) {
      setPageInput(String(pageIndex));
      return;
    }
    const clamped = Math.min(numPages, Math.max(1, n));
    setPageIndex(clamped);
    setPageInput(String(clamped));
  };
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth - 8);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!numPages) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        setPageIndex((p) => Math.min(numPages, p + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        setPageIndex((p) => Math.max(1, p - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages]);

  const handleLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setLoadError(null);
  }, []);

  const handleLoadError = useCallback((err: Error) => {
    setLoadError(err.message || "Failed to load PDF");
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  };

  if (!url) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        <FileText className="h-6 w-6" />
        <span>No pitch deck on file.</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col rounded-lg border bg-background",
        isFullscreen && "h-screen w-screen bg-background",
        className,
      )}
      data-testid="screening-pitch-deck-viewer"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPageIndex((p) => Math.max(1, p - 1))}
            disabled={pageIndex <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={(e) => commitPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitPageInput((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setPageInput(String(pageIndex));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onFocus={(e) => e.target.select()}
              className="w-12 rounded border border-border bg-background px-1 py-0.5 text-center text-xs tabular-nums text-foreground focus:border-primary focus:outline-none"
              aria-label="Page number"
            />
            <span>/ {numPages ?? "—"}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setPageIndex((p) => Math.min(numPages ?? p, p + 1))
            }
            disabled={!numPages || pageIndex >= numPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - 0.1).toFixed(2)))}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + 0.1).toFixed(2)))}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open PDF in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Page area — sizes to the rendered page so there's no empty gap below */}
      <div className="overflow-auto bg-muted/20 p-3">
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-sm text-red-700">
            <span>Failed to load pitch deck: {loadError}</span>
            <Button asChild size="sm" variant="outline">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open in new tab
              </a>
            </Button>
          </div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadError}
            loading={
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading pitch deck…
              </div>
            }
          >
            {width != null && (
              <Page
                pageNumber={pageIndex}
                width={Math.max(280, width)}
                scale={scale}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                className="mx-auto shadow"
              />
            )}
          </Document>
        )}
      </div>
    </div>
  );
}
