import { useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScreeningPitchDeckViewerProps {
  url: string | null;
  className?: string;
  pageIndex?: number;
  onPageChange?: (pageNumber: number) => void;
}

export function ScreeningPitchDeckViewer({
  url,
  className,
}: ScreeningPitchDeckViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      void el.requestFullscreen();
      setIsFullscreen(true);
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
      <div className="flex items-center justify-end gap-1 border-b px-3 py-2">
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

      <div className="flex-1 overflow-hidden bg-muted/20">
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-sm text-red-700">
            <span>Failed to load pitch deck.</span>
            <Button asChild size="sm" variant="outline">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open in new tab
              </a>
            </Button>
          </div>
        ) : (
          <iframe
            src={url}
            title="Pitch Deck"
            className="h-[600px] w-full"
            style={isFullscreen ? { height: "calc(100vh - 48px)" } : undefined}
            onError={() => setLoadError(true)}
          />
        )}
      </div>
    </div>
  );
}
