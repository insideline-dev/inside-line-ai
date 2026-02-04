import { Link } from "@tanstack/react-router";
import type { Todo } from "@/types/schemas";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TodoCardProps {
  todo: Todo;
  onToggle?: (id: string, completed: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function TodoCard({ todo, onToggle, onEdit, onDelete }: TodoCardProps) {
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle?.(todo.id, !todo.completed);
  };

  return (
    <Link to="/todos/$todoId" params={{ todoId: todo.id }}>
      <div
        className={cn(
          "border border-border/70 bg-accent/20 dark:bg-accent/30 p-4 rounded-lg space-y-3 overflow-hidden transition-opacity",
          todo.completed && "opacity-60"
        )}
      >
        <div className="flex items-center gap-4">
          <div onClick={handleToggle} className="cursor-pointer">
            <Checkbox checked={todo.completed} />
          </div>
          <Avatar className="w-11 h-11 border border-border bg-accent/50">
            <AvatarFallback>{todo.title.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <h3
              className={cn(
                "text-lg font-bold truncate",
                todo.completed && "line-through text-muted-foreground"
              )}
            >
              {todo.title}
            </h3>
            {todo.description && (
              <p className="text-sm text-muted-foreground truncate max-w-[280px]">
                {todo.description}
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onEdit?.();
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  onDelete?.();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Created: {new Date(todo.createdAt).toLocaleDateString()}</span>
          {todo.updatedAt && (
            <span>Updated: {new Date(todo.updatedAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

