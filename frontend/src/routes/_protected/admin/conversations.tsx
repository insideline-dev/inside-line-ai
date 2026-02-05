import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_protected/admin/conversations")({
  component: AgentConversations,
});

// AI_PLACEHOLDER
function AgentConversations() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Conversations</h1>
        <p className="text-muted-foreground text-pretty">
          AI agent conversations are coming soon.
        </p>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-pretty">
          This feature will be available once AI messaging is enabled.
        </CardContent>
      </Card>
    </div>
  );
}
