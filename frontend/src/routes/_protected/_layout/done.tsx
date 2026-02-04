import { createFileRoute } from "@tanstack/react-router";
import { useTodos, useToggleTodo, useDeleteTodo } from "@/hooks/api/useTodos";
import { useConfirmation } from "@/hooks/useConfirmation";
import { TodoCard } from "@/components/todos/TodoCard";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_protected/_layout/done")({
  component: DoneTodosPage,
});

function DoneTodosPage() {
  const { data: todos, isLoading } = useTodos();
  const toggleTodo = useToggleTodo();
  const deleteTodo = useDeleteTodo();
  const { showConfirmation } = useConfirmation();

  const handleToggle = (id: string, completed: boolean) => {
    toggleTodo.mutate({ id, completed });
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirmation({
      title: "Delete Todo",
      description: "Are you sure you want to delete this completed todo?",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (confirmed) {
      deleteTodo.mutate(id);
    }
  };

  // Filter to show only completed todos
  const doneTodos = todos?.filter((t) => t.completed) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Done Todos</h1>
        <p className="text-muted-foreground">Completed tasks</p>
      </div>

      {doneTodos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No completed todos yet. Complete some tasks to see them here!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doneTodos.map((todo: any) => (
            <TodoCard
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onDelete={() => handleDelete(todo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

