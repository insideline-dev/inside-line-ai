import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownTextProps {
  children: string;
  className?: string;
}

const components: Components = {
  // Render paragraphs inline-friendly (no extra margins beyond what the parent controls)
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 text-[0.9em] font-mono">
      {children}
    </code>
  ),
  // Prevent block-level elements from breaking inline flow
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  ),
};

/**
 * Fix orphaned markdown bold/italic markers from LLM output.
 * The LLM sometimes drops the leading ** from bold text, producing
 * "Leadership** with experience" instead of "**Leadership** with experience".
 * This scans for unmatched ** and strips them to avoid raw symbols in the UI.
 */
function sanitizeMarkdown(text: string): string {
  // Process each line independently to handle multi-line content
  return text.split("\n").map(line => {
    const markers = [...line.matchAll(/\*\*/g)];
    if (markers.length === 0) return line;
    // If even count, all ** are paired — leave as-is
    if (markers.length % 2 === 0) return line;
    // Odd count: strip the first orphaned ** (the one missing its opening pair)
    const firstIdx = markers[0].index!;
    return line.slice(0, firstIdx) + line.slice(firstIdx + 2);
  }).join("\n");
}

export function MarkdownText({ children, className }: MarkdownTextProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {sanitizeMarkdown(children)}
      </ReactMarkdown>
    </div>
  );
}
