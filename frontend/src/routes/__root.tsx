import { Outlet, createRootRouteWithContext, ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface RouterContext {
  queryClient: QueryClient;
}

function ErrorFallback({ error }: ErrorComponentProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground">{error.message}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: ErrorFallback,
});

function RootComponent() {
  return <Outlet />;
}

