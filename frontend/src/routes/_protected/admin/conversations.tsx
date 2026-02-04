import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgentConversation } from "@/types/admin";

export const Route = createFileRoute("/_protected/admin/conversations")({
  component: AgentConversations,
});

const mockConversations: AgentConversation[] = [];

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  waiting_response: "bg-yellow-100 text-yellow-800",
  resolved: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-800",
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AgentConversations() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agent Conversations</h1>
        <p className="text-muted-foreground">Monitor AI agent communication threads</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          {mockConversations.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No agent conversations yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Contact
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Messages
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Last Activity
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Authenticated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mockConversations.map((conversation) => (
                    <tr key={conversation.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">
                            {conversation.senderName || "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {conversation.senderEmail || conversation.senderPhone}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          className={
                            statusColors[conversation.status] || "bg-gray-100 text-gray-800"
                          }
                          variant="outline"
                        >
                          {conversation.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">{conversation.messageCount}</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {conversation.lastMessageAt
                          ? formatDate(conversation.lastMessageAt)
                          : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className={
                            conversation.isAuthenticated
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {conversation.isAuthenticated ? "Yes" : "No"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
