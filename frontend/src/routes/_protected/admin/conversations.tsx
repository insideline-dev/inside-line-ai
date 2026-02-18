import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { customFetch } from "@/api/client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail } from "lucide-react";

export const Route = createFileRoute("/_protected/admin/conversations")({
  component: ConversationsPage,
});

type Conversation = {
  id: string;
  threadId: string;
  investorEmail: string;
  investorName: string | null;
  startupId: string | null;
  startupName: string | null;
  status: string;
  lastIntent: string | null;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  subject: string | null;
  bodyText: string | null;
  intent: string | null;
  intentConfidence: number | null;
  processed: boolean;
  errorMessage: string | null;
  createdAt: string;
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  awaiting_info: "outline",
  processing: "secondary",
  completed: "secondary",
  archived: "outline",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "conversations"],
    queryFn: () =>
      customFetch<{ data: Conversation[]; total: number }>(
        "/admin/conversations",
      ),
  });

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ["admin", "conversations", selectedId, "messages"],
    queryFn: () =>
      customFetch<{ data: Message[] }>(
        `/admin/conversations/${selectedId}/messages`,
      ),
    enabled: !!selectedId,
  });

  const conversations = data?.data ?? [];
  const messages = messagesData?.data ?? [];
  const selected = conversations.find((c) => c.id === selectedId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Conversations</h1>
          <p className="text-muted-foreground text-pretty">
            Clara AI email conversations with investors.
          </p>
        </div>
        <Card>
          <CardContent className="py-10">
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load conversations: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (selectedId && selected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedId(null)}
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-balance">
              {selected.investorName || selected.investorEmail}
            </h1>
            <p className="text-muted-foreground text-sm text-pretty">
              {selected.investorEmail}
              {selected.startupName && ` · ${selected.startupName}`}
              {" · "}
              <Badge variant={statusVariant[selected.status] ?? "outline"}>
                {selected.status.replace("_", " ")}
              </Badge>
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {messagesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-3/4" />
                <Skeleton className="ml-auto h-20 w-3/4" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 text-pretty">
                No messages in this conversation.
              </p>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isInbound = msg.direction === "inbound";
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                          isInbound
                            ? "bg-muted rounded-bl-sm"
                            : "bg-primary text-primary-foreground rounded-br-sm"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold ${isInbound ? "" : "text-primary-foreground/80"}`}>
                            {isInbound
                              ? selected.investorName || msg.fromEmail
                              : "Clara"}
                          </span>
                          {msg.intent && (
                            <Badge
                              variant={isInbound ? "outline" : "secondary"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {msg.intent}
                            </Badge>
                          )}
                        </div>
                        {msg.subject && (
                          <p className={`text-sm font-medium mb-1 text-balance ${isInbound ? "" : "text-primary-foreground"}`}>
                            {msg.subject}
                          </p>
                        )}
                        {msg.bodyText && (
                          <p className={`text-sm whitespace-pre-wrap text-pretty ${isInbound ? "text-foreground" : "text-primary-foreground"}`}>
                            {msg.bodyText}
                          </p>
                        )}
                        {msg.errorMessage && (
                          <p className="text-xs mt-2 text-destructive bg-destructive/10 rounded px-2 py-1 text-pretty">
                            {msg.errorMessage}
                          </p>
                        )}
                        <p className={`text-[10px] mt-1.5 ${isInbound ? "text-muted-foreground" : "text-primary-foreground/60"}`}>
                          {formatDate(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Conversations</h1>
        <p className="text-muted-foreground text-pretty">
          Clara AI email conversations with investors.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {data?.total ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {conversations.filter((c) => c.status === "active").length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {conversations.filter((c) => c.status === "completed").length}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-balance">
            <Mail className="h-4 w-4" />
            Conversations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={conversations}
            columns={[
              {
                header: "Investor",
                cell: (row) => (
                  <button
                    onClick={() => setSelectedId(row.id)}
                    className="text-left hover:underline font-medium"
                  >
                    {row.investorName || row.investorEmail}
                  </button>
                ),
              },
              {
                header: "Startup",
                cell: (row) => (
                  <span className="text-muted-foreground">
                    {row.startupName ?? "—"}
                  </span>
                ),
              },
              {
                header: "Status",
                cell: (row) => (
                  <Badge variant={statusVariant[row.status] ?? "outline"}>
                    {row.status.replace("_", " ")}
                  </Badge>
                ),
              },
              {
                header: "Intent",
                cell: (row) =>
                  row.lastIntent ? (
                    <Badge variant="outline">{row.lastIntent}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                header: "Messages",
                accessor: "messageCount",
                numeric: true,
              },
              {
                header: "Last Message",
                cell: (row) => (
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatDate(row.lastMessageAt)}
                  </span>
                ),
              },
            ]}
            rowKey={(row) => row.id}
            emptyState="No conversations yet. Conversations will appear here once Clara starts processing emails."
          />
        </CardContent>
      </Card>
    </div>
  );
}
