import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownTextProps {
  children: string;
  className?: string;
  inline?: boolean;
}

function getComponents(inline: boolean): Components {
  return {
    // Paragraphs
    p: ({ children }) =>
      inline ? (
        <span>{children}</span>
      ) : (
        <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
      ),

    // Inline formatting
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    code: ({ children }) => (
      <code className="rounded bg-muted px-1 py-0.5 text-[0.9em] font-mono">
        {children}
      </code>
    ),
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

    // Tables (GFM)
    table: ({ children }) => (
      <div className="my-4 w-full overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-muted/50 border-b border-border">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-border">{children}</tbody>
    ),
    tr: ({ children }) => <tr className="hover:bg-muted/30">{children}</tr>,
    th: ({ children }) => (
      <th className="px-3 py-2 text-left font-semibold text-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 align-top text-foreground/90">{children}</td>
    ),

    // Lists
    ul: ({ children }) =>
      inline ? (
        <span>{children}</span>
      ) : (
        <ul className="my-2 list-disc pl-6 space-y-1">{children}</ul>
      ),
    ol: ({ children }) =>
      inline ? (
        <span>{children}</span>
      ) : (
        <ol className="my-2 list-decimal pl-6 space-y-1">{children}</ol>
      ),
    li: ({ children }) =>
      inline ? <span>{children}</span> : <li className="leading-relaxed">{children}</li>,

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-2 border-border pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),

    // Horizontal rule
    hr: () => <hr className="my-4 border-border" />,

    // Headings
    h1: ({ children }) => (
      <h1 className="mt-4 mb-2 text-xl font-semibold">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-4 mb-2 text-lg font-semibold">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-3 mb-2 text-base font-semibold">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-3 mb-1 text-sm font-semibold">{children}</h4>
    ),

    // Pre-formatted code blocks
    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">
        {children}
      </pre>
    ),
  };
}

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

export function MarkdownText({ children, className, inline = false }: MarkdownTextProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={getComponents(inline)}
      >
        {sanitizeMarkdown(children)}
      </ReactMarkdown>
    </div>
  );
}
