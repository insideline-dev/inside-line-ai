import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownText } from "./MarkdownText";

interface Source {
  label: string;
  url: string;
}

interface CitedTextProps {
  text: string;
  sources?: Source[];
  className?: string;
}

/** Check if text contains citation markers like [1], [2] */
function hasCitations(text: string): boolean {
  return /\[\d+\]/.test(text);
}

function renderCitation(segment: string, index: number, sources: Source[]): ReactNode {
  const match = /^\[(\d+)\]$/.exec(segment);
  if (!match) {
    return <MarkdownText key={index} inline className="inline">{segment}</MarkdownText>;
  }

  const n = parseInt(match[1], 10);
  const source = sources[n - 1];

  if (!source) {
    return <MarkdownText key={index} inline className="inline">{segment}</MarkdownText>;
  }

  if (source.url.startsWith("http")) {
    return (
      <Tooltip key={index}>
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
    <Tooltip key={index}>
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
}

function parseCitations(paragraph: string, sources: Source[]): ReactNode[] {
  const segments = paragraph.split(/(\[\d+\])/g).filter(Boolean);
  return segments.map((segment, index) => renderCitation(segment, index, sources));
}

export function CitedText({ text, sources, className }: CitedTextProps) {
  const sourcesList = sources ?? [];
  const textHasCitations = hasCitations(text) && sourcesList.length > 0;

  // If text has citations, use the citation parser (preserves tooltip behavior)
  if (textHasCitations) {
    return (
      <div className={className}>
        {text.split("\n\n").map((paragraph, idx) => (
          <p key={idx} className="mb-2 last:mb-0">
            {parseCitations(paragraph, sourcesList)}
          </p>
        ))}
      </div>
    );
  }

  // Otherwise render as markdown
  return (
    <MarkdownText className={className}>
      {text}
    </MarkdownText>
  );
}
