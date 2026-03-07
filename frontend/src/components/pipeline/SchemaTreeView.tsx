import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SchemaTreeViewProps {
  nodeLabel: string;
  promptKeys: string[];
  onPick: (path: string) => void;
}

function SingleKeySchema({
  promptKey,
  onPick: _onPick,
  view: _view,
}: {
  promptKey: string;
  onPick: (path: string) => void;
  view: "tree" | "json";
}) {
  return (
    <p className="text-xs text-muted-foreground py-2">
      Schema configured in code for {promptKey}.
    </p>
  );
}

export function SchemaTreeView({ nodeLabel, promptKeys, onPick }: SchemaTreeViewProps) {
  const [view, setView] = useState<"tree" | "json">("tree");
  const [copied, setCopied] = useState<string | null>(null);

  const handlePick = (path: string) => {
    const tag = `{{${path}}}`;
    navigator.clipboard.writeText(tag).then(() => {
      setCopied(path);
      setTimeout(() => setCopied(null), 1500);
      toast.success(`Copied ${tag} — or click to insert in prompt`);
      onPick(path);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">{nodeLabel}</p>
        <div className="flex items-center gap-1 rounded border p-0.5">
          <button
            type="button"
            onClick={() => setView("tree")}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              view === "tree" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Tree
          </button>
          <button
            type="button"
            onClick={() => setView("json")}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              view === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            JSON
          </button>
        </div>
      </div>

      {copied && (
        <div className="flex items-center gap-1.5 rounded bg-primary/10 px-2 py-1 text-xs text-primary">
          <Check className="h-3 w-3" />
          Copied <code className="font-mono">{`{{${copied}}}`}</code>
        </div>
      )}

      {promptKeys.map((key) => (
        <div key={key} className="space-y-1">
          <Badge variant="secondary" className="text-[10px]">{key}</Badge>
          <SingleKeySchema promptKey={key} onPick={handlePick} view={view} />
        </div>
      ))}
    </div>
  );
}
