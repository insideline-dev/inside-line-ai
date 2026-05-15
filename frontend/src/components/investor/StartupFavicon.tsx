import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface StartupFaviconProps {
  /** Startup display name — first letter is the fallback when image fails. */
  name: string;
  /** Startup website. If absent or unparseable, only the letter renders. */
  website: string | null | undefined;
  className?: string;
}

/**
 * Square avatar tile that tries multiple favicon CDNs in cascade and falls
 * back to the company initial when all sources fail or no website is known.
 *
 * Implementation note — the cascade lives in the native `onerror` handler,
 * NOT in React state. React StrictMode + key changes + img preloading
 * conspired to fire stale-closure errors that exhausted the chain before
 * any source actually loaded; doing the cascade via direct DOM mutation
 * (`event.currentTarget.src = next`) sidesteps all of that.
 */
export function StartupFavicon({ name, website, className }: StartupFaviconProps) {
  const sources = useMemo(() => {
    if (!website) return [];
    let host: string;
    try {
      host = new URL(
        website.startsWith("http") ? website : `https://${website}`,
      ).hostname;
    } catch {
      return [];
    }
    return [
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
      `https://logo.clearbit.com/${encodeURIComponent(host)}`,
    ];
  }, [website]);

  return (
    <div
      className={cn(
        "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40",
        className,
      )}
      aria-label={`${name} avatar`}
    >
      <span className="text-base font-semibold text-foreground/70">
        {name.charAt(0).toUpperCase()}
      </span>
      {sources.length > 0 && (
        <img
          src={sources[0]}
          alt=""
          data-srcidx="0"
          className="absolute inset-0 h-full w-full bg-background object-contain p-2"
          onError={(event) => {
            const img = event.currentTarget;
            const nextIdx = Number(img.dataset.srcidx ?? "0") + 1;
            if (nextIdx < sources.length) {
              img.dataset.srcidx = String(nextIdx);
              img.src = sources[nextIdx];
            } else {
              img.style.display = "none";
            }
          }}
        />
      )}
    </div>
  );
}
