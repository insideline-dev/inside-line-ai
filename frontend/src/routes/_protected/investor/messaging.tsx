import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_protected/investor/messaging")({
  component: MessagingPage,
});

// AI_PLACEHOLDER
function MessagingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Direct Messaging</h1>
        <p className="text-muted-foreground text-pretty">
          AI-powered messaging will be available soon.
        </p>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-pretty">
          This feature is coming soon.
        </CardContent>
      </Card>
    </div>
  );
}
