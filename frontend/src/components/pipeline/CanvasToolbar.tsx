import { Redo2, Undo2, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CanvasToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  nodeCount: number;
  edgeCount: number;
  isDirty: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  saveDisabled?: boolean;
  publishDisabled?: boolean;
}

export function CanvasToolbar(props: CanvasToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background/95 px-2 py-1 shadow-sm">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={props.onZoomOut} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={props.onZoomIn} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={props.onFitView} title="Fit view">
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {props.isDirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
        <Badge variant="secondary">{props.nodeCount} nodes</Badge>
        <Badge variant="secondary">{props.edgeCount} edges</Badge>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={props.onSaveDraft} disabled={props.saveDisabled}>
          Save Draft
        </Button>
        <Button size="sm" onClick={props.onPublish} disabled={props.publishDisabled}>
          Publish
        </Button>
      </div>
    </div>
  );
}
