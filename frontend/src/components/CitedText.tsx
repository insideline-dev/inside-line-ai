import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownText } from "./MarkdownText";

function stripCitationMarkers(text: string): string {
  return text.replace(/\[(\d+)\]/g, "").replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();
}

interface Source {
  label: string;
  url: string;
}

interface CitedTextProps {
  text: string;
  sources?: Source[];
  className?: string;
  stripCitations?: boolean;
}

/** Check if text contains citation markers like [1], [2] */
function hasCitations(text: string): boolean {
  return /\[\d+\]/.test(text);
}

/** Detect GFM markdown tables (pipe row + separator row). */
function containsMarkdownTable(text: string): boolean {
  return /^\s*\|.*\|.*$/m.test(text) && /^\s*\|[\s\-:|]+\|\s*$/m.test(text);
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

export function CitedText({ text, sources, className, stripCitations = false }: CitedTextProps) {
  const sourcesList = sources ?? [];
  const renderedText = stripCitations ? stripCitationMarkers(text) : text;
  const textHasCitations = !stripCitations && hasCitations(renderedText) && sourcesList.length > 0;
  const hasTable = containsMarkdownTable(renderedText);

  if (hasTable) {
    return <MarkdownText className={className}>{renderedText}</MarkdownText>;
  }

  if (textHasCitations) {
    return (
      <div className={className}>
        {renderedText.split("\n\n").map((paragraph, idx) => (
          <p key={idx} className="mb-2 last:mb-0">
            {parseCitations(paragraph, sourcesList)}
          </p>
        ))}
      </div>
    );
  }

  return (
    <MarkdownText className={className}>
      {renderedText}
    </MarkdownText>
  );
}
