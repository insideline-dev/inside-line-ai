import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export function OutputSchemaViewer({ promptKey: _promptKey }: { promptKey: string }) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Output Structure
        </Label>
        <Badge variant="outline" className="text-[10px]">
          Source: code
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">Schema configured in code.</p>
    </div>
  );
}
