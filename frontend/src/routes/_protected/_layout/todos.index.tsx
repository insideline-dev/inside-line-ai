import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTodos, useCreateTodo, useToggleTodo, useDeleteTodo } from "@/hooks/api/useTodos";
import { useConfirmation } from "@/hooks/useConfirmation";
import { TodoCard } from "@/components/todos/TodoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Loader2 } from "lucide-react";

const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

type CreateTodoForm = z.infer<typeof createTodoSchema>;

export const Route = createFileRoute("/_protected/_layout/todos/")({
  component: TodosPage,
});

function TodosPage() {
  const { data: todos, isLoading } = useTodos();
  const createTodo = useCreateTodo();
  const toggleTodo = useToggleTodo();
  const deleteTodo = useDeleteTodo();
  const { showConfirmation } = useConfirmation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const form = useForm<CreateTodoForm>({
    resolver: zodResolver(createTodoSchema),
    defaultValues: { title: "", description: "" },
  });

  const onSubmit = async (values: CreateTodoForm) => {
    await createTodo.mutateAsync(values);
    form.reset();
    setIsCreateOpen(false);
  };

  const handleToggle = (id: string, completed: boolean) => {
    toggleTodo.mutate({ id, completed });
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirmation({
      title: "Delete Todo",
      description: "Are you sure you want to delete this todo?",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (confirmed) {
      deleteTodo.mutate(id);
    }
  };

  // Filter to show only incomplete todos
  const currentTodos = todos?.filter((t) => !t.completed) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Current Todos</h1>
          <p className="text-muted-foreground">Manage your active tasks</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Todo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Todo</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="What needs to be done?" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Add more details..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" processing={createTodo.isPending}>
                    Create
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {currentTodos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No active todos. Create one to get started!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {currentTodos.map((todo: any) => (
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

