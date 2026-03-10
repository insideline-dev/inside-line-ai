import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Source {
  label: string;
  url: string;
}

interface CitedTextProps {
  text: string;
  sources?: Source[];
  className?: string;
}

function parseCitations(paragraph: string, sources: Source[]): ReactNode[] {
  const segments = paragraph.split(/(\[\d+\])/g);

  return segments.map((segment, i) => {
    const match = /^\[(\d+)\]$/.exec(segment);
    if (!match) return <span key={i}>{segment}</span>;

    const n = parseInt(match[1], 10);
    const source = sources[n - 1];

    if (!source) return <span key={i}>{segment}</span>;

    if (source.url.startsWith("http")) {
      return (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-baseline no-underline"
            >
              <sup className="text-[10px] font-medium text-primary cursor-pointer hover:text-primary/80 ml-0.5">
                [{n}]
              </sup>
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            <p className="font-medium">{source.label}</p>
            <p className="text-muted-foreground truncate">{source.url}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Tooltip key={i}>
        <TooltipTrigger asChild>
          <sup className="text-[10px] font-medium text-muted-foreground ml-0.5 cursor-help">
            [{n}]
          </sup>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">{source.label}</p>
        </TooltipContent>
      </Tooltip>
    );
  });
}

export function CitedText({ text, sources, className }: CitedTextProps) {
  return (
    <div className={className}>
      {text.split("\n\n").map((paragraph, idx) => (
        <p key={idx} className="mb-2 last:mb-0">
          {parseCitations(paragraph, sources ?? [])}
        </p>
      ))}
    </div>
  );
}
