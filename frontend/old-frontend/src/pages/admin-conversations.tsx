import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MessageSquare, Trash2, Mail, Phone, Clock, User, Building2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface ConversationWithDetails {
  id: number;
  senderEmail: string | null;
  senderPhone: string | null;
  senderName: string | null;
  status: string;
  lastMessageAt: string;
  messageCount: number;
  isAuthenticated: boolean;
  currentStartupId: number | null;
  emailThreadId: string | null;
  whatsappThreadId: string | null;
  createdAt: string;
  startup: { id: number; companyName: string } | null;
  lastMessage: {
    content: string;
    direction: string;
    channel: string;
    createdAt: string;
  } | null;
}

interface GroupedConversations {
  startupId: number | null;
  startupName: string;
  conversations: ConversationWithDetails[];
}

export default function AdminConversations() {
  const { toast } = useToast();

  const { data: conversations, isLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/admin/conversations"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
      toast({
        title: "Conversation deleted",
        description: "The conversation and all its messages have been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete conversation. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Conversations</h1>
          <p className="text-muted-foreground">Manage AI agent conversation threads</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-8 w-8" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const conversationList = conversations || [];

  const groupedConversations: GroupedConversations[] = [];
  const startupGroups = new Map<number | null, ConversationWithDetails[]>();

  for (const conv of conversationList) {
    const key = conv.startup?.id ?? null;
    if (!startupGroups.has(key)) {
      startupGroups.set(key, []);
    }
    startupGroups.get(key)!.push(conv);
  }

  Array.from(startupGroups.entries()).forEach(([startupId, convs]) => {
    const startupName = startupId === null 
      ? "No Startup Linked" 
      : convs[0]?.startup?.companyName || "Unknown Startup";
    groupedConversations.push({ startupId, startupName, conversations: convs });
  });

  groupedConversations.sort((a, b) => {
    if (a.startupId === null) return 1;
    if (b.startupId === null) return -1;
    return a.startupName.localeCompare(b.startupName);
  });

  const getChannelIcon = (conv: ConversationWithDetails) => {
    if (conv.whatsappThreadId) return <Phone className="w-3 h-3" />;
    if (conv.emailThreadId) return <Mail className="w-3 h-3" />;
    return <MessageSquare className="w-3 h-3" />;
  };

  const getChannelLabel = (conv: ConversationWithDetails) => {
    if (conv.whatsappThreadId) return "WhatsApp";
    if (conv.emailThreadId) return "Email";
    return "Unknown";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffHours < 168) {
      return date.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Conversations</h1>
          <p className="text-muted-foreground">Manage AI agent conversation threads grouped by startup</p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-total-conversations">
          <MessageSquare className="w-3 h-3" />
          {conversationList.length} conversations
        </Badge>
      </div>

      <div className="space-y-6">
        {conversationList.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No conversations yet</h3>
              <p className="text-sm text-muted-foreground">
                Conversations will appear here when users interact with the AI agent via email or WhatsApp
              </p>
            </CardContent>
          </Card>
        ) : (
          groupedConversations.map((group) => (
            <Card key={group.startupId ?? "unlinked"} data-testid={`card-startup-group-${group.startupId ?? "unlinked"}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="w-5 h-5" />
                    {group.startupId ? (
                      <Link 
                        href={`/admin/review/${group.startupId}`} 
                        className="hover:underline"
                        data-testid={`link-startup-${group.startupId}`}
                      >
                        {group.startupName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{group.startupName}</span>
                    )}
                  </CardTitle>
                  <Badge variant="secondary" data-testid={`badge-group-count-${group.startupId ?? "unlinked"}`}>
                    {group.conversations.length} conversation{group.conversations.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.conversations.map((conv) => (
                  <div 
                    key={conv.id} 
                    className="flex items-start gap-4 p-3 rounded-md bg-muted/50"
                    data-testid={`card-conversation-${conv.id}`}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-background flex items-center justify-center">
                      {getChannelIcon(conv)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate" data-testid={`text-sender-${conv.id}`}>
                          {conv.senderName || conv.senderEmail || conv.senderPhone || "Unknown sender"}
                        </span>
                        <Badge variant="outline" className="flex items-center gap-1" data-testid={`badge-channel-${conv.id}`}>
                          {getChannelIcon(conv)}
                          {getChannelLabel(conv)}
                        </Badge>
                        <Badge variant={conv.status === "active" ? "default" : "secondary"} data-testid={`badge-status-${conv.id}`}>
                          {conv.status}
                        </Badge>
                        {conv.isAuthenticated && (
                          <Badge variant="outline" className="flex items-center gap-1" data-testid={`badge-verified-${conv.id}`}>
                            <User className="w-3 h-3" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      {conv.senderEmail && conv.senderName && (
                        <p className="text-sm text-muted-foreground truncate">{conv.senderEmail}</p>
                      )}
                      {conv.lastMessage && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {conv.lastMessage.direction === "outbound" ? "Agent: " : ""}
                          {conv.lastMessage.content}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1" data-testid={`text-message-count-${conv.id}`}>
                          <MessageSquare className="w-3 h-3" />
                          {conv.messageCount} messages
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(conv.lastMessageAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-delete-conversation-${conv.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the conversation with{" "}
                              <strong>{conv.senderName || conv.senderEmail || conv.senderPhone || "this user"}</strong>{" "}
                              and all {conv.messageCount} messages. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel data-testid={`button-cancel-delete-${conv.id}`}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(conv.id)}
                              className="bg-destructive text-destructive-foreground"
                              data-testid={`button-confirm-delete-${conv.id}`}
                            >
                              {deleteMutation.isPending ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
