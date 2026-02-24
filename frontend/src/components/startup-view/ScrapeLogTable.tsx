import { useState } from "react";
import { Globe } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ScrapeLogTableProps {
  websiteUrl: string;
  homepageTitle: string;
  fullText: string;
  subpages: Array<{ url: string; title: string; content: string }>;
}

function pathFromUrl(url: string, base: string): string {
  try {
    const parsed = new URL(url, base);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

function formatChars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ScrapeLogTable({
  websiteUrl,
  homepageTitle,
  fullText,
  subpages,
}: ScrapeLogTableProps) {
  const [open, setOpen] = useState(false);

  const subpageCharsTotal = subpages.reduce((s, p) => s + (p.content?.length ?? 0), 0);
  const homepageChars = Math.max(0, (fullText?.length ?? 0) - subpageCharsTotal);
  const totalChars = fullText?.length ?? 0;
  const pageCount = 1 + subpages.length;

  const sorted = [...subpages].sort(
    (a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0),
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Globe className="h-3 w-3" />
        <span>
          Scrape Log — {pageCount} pages · {formatChars(totalChars)} chars
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 max-h-[240px] overflow-auto rounded border text-xs">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr className="text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Path</th>
                <th className="px-2 py-1 font-medium">Title</th>
                <th className="px-2 py-1 font-medium text-right tabular-nums">Chars</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <tr>
                <td className="px-2 py-1 font-mono">/</td>
                <td className="px-2 py-1 max-w-[200px] truncate">{homepageTitle || "—"}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${homepageChars === 0 ? "text-amber-500" : ""}`}>
                  {formatChars(homepageChars)}
                </td>
              </tr>
              {sorted.map((page) => {
                const chars = page.content?.length ?? 0;
                return (
                  <tr key={page.url}>
                    <td className="px-2 py-1 font-mono max-w-[180px] truncate">
                      {pathFromUrl(page.url, websiteUrl)}
                    </td>
                    <td className="px-2 py-1 max-w-[200px] truncate">{page.title || "—"}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${chars === 0 ? "text-amber-500" : ""}`}>
                      {formatChars(chars)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur-sm">
              <tr className="font-medium">
                <td className="px-2 py-1" colSpan={2}>Total</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatChars(totalChars)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
