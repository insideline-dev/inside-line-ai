import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTodo, useUpdateTodo, useDeleteTodo, useToggleTodo } from "@/hooks/api/useTodos";
import { useConfirmation } from "@/hooks/useConfirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ArrowLeft, Trash2 } from "lucide-react";

const updateTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

type UpdateTodoForm = z.infer<typeof updateTodoSchema>;

export const Route = createFileRoute("/_protected/_layout/todos/$todoId")({
  component: TodoDetailPage,
});

function TodoDetailPage() {
  const { todoId } = Route.useParams();
  const navigate = useNavigate();
  const { data: todo, isLoading } = useTodo(todoId);
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const toggleTodo = useToggleTodo();
  const { showConfirmation } = useConfirmation();
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<UpdateTodoForm>({
    resolver: zodResolver(updateTodoSchema),
    defaultValues: {
      title: todo?.title || "",
      description: todo?.description || "",
    },
  });

  // Update form when todo loads
  if (todo && !form.formState.isDirty) {
    form.reset({
      title: todo.title,
      description: todo.description || "",
    });
  }

  const onSubmit = async (values: UpdateTodoForm) => {
    await updateTodo.mutateAsync({ id: todoId, data: values });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    const confirmed = await showConfirmation({
      title: "Delete Todo",
      description: "Are you sure you want to delete this todo?",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (confirmed) {
      await deleteTodo.mutateAsync(todoId);
      navigate({ to: "/todos" });
    }
  };

  const handleToggle = () => {
    if (todo) {
      toggleTodo.mutate({ id: todoId, completed: !todo.completed });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!todo) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Todo not found</p>
        <Button variant="link" onClick={() => navigate({ to: "/todos" })}>
          Back to todos
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/todos" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Todo Details</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <Checkbox checked={todo.completed} onCheckedChange={handleToggle} />
            <span className={todo.completed ? "line-through text-muted-foreground" : ""}>
              {todo.title}
            </span>
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? "Cancel" : "Edit"}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" processing={updateTodo.isPending}>
                  Save Changes
                </Button>
              </form>
            </Form>
          ) : (
            <div className="space-y-4">
              {todo.description && (
                <div>
                  <p className="text-sm font-medium">Description</p>
                  <p className="text-muted-foreground">{todo.description}</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="font-medium">Created</p>
                  <p className="text-muted-foreground">
                    {new Date(todo.createdAt).toLocaleString()}
                  </p>
                </div>
                {todo.updatedAt && (
                  <div>
                    <p className="font-medium">Updated</p>
                    <p className="text-muted-foreground">
                      {new Date(todo.updatedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                <div>
                  <p className="font-medium">Status</p>
                  <p className="text-muted-foreground">
                    {todo.completed ? "Completed" : "Active"}
                  </p>
                </div>
                <div>
                  <p className="font-medium">ID</p>
                  <p className="text-muted-foreground font-mono text-xs">{todo.id}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

