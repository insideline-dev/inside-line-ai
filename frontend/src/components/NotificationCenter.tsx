import { useState, useCallback } from "react";
import { Bell, Check, Sparkles, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  useNotificationControllerGetNotifications,
  useNotificationControllerMarkAsRead,
  getNotificationControllerGetNotificationsQueryKey,
} from "@/api/generated/notifications/notifications";
import { useNotificationSocket } from "@/lib/auth";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error" | "match";
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [socketCount, setSocketCount] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: response, isLoading } = useNotificationControllerGetNotifications();
  const notifications = (response?.data as Notification[] | undefined) ?? [];

  const { mutate: markRead } = useNotificationControllerMarkAsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getNotificationControllerGetNotificationsQueryKey() });
      },
    },
  });

  const handleNewNotification = useCallback(
    (notification: Notification) => {
      queryClient.setQueryData(
        getNotificationControllerGetNotificationsQueryKey(),
        (old: { data?: Notification[] } | undefined) => ({
          ...old,
          data: [notification, ...(old?.data || [])],
        })
      );
      toast(notification.title, { description: notification.message });
    },
    [queryClient]
  );

  const handleCountUpdate = useCallback((count: number) => {
    setSocketCount(count);
  }, []);

  useNotificationSocket(handleNewNotification, handleCountUpdate);

  const unreadCount = socketCount ?? notifications.filter((n) => !n.read).length;

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "success":
        return <Check className="w-4 h-4 text-green-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "match":
        return <Sparkles className="w-4 h-4 text-primary" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const resolveNotificationLink = (link?: string): string | null => {
    if (!link) return null;

    const trimmedLink = link.trim();
    const legacyAdminStartupMatch = trimmedLink.match(/^\/admin\/startups\/([^/?#]+)/);
    if (legacyAdminStartupMatch) {
      return `/admin/startup/${legacyAdminStartupMatch[1]}`;
    }

    const investorMatchRoute = trimmedLink.match(/^\/investor\/matches\/([^/?#]+)/);
    if (investorMatchRoute) {
      return `/investor/startup/${investorMatchRoute[1]}`;
    }

    return trimmedLink;
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markRead({ id: notification.id });
    }
    const target = resolveNotificationLink(notification.link);
    if (target) {
      navigate({ to: target as any });
    }
    setOpen(false);
  };

  const getRelativeTime = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="font-semibold text-sm">Notifications</span>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-8 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 20).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex items-start gap-3 px-3 py-3 cursor-pointer ${
                  !notification.read ? "bg-muted/50" : ""
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3 w-full">
                  <div className="mt-0.5">{getNotificationIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notification.read ? "font-medium" : ""}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="w-2 h-2 bg-primary rounded-full mt-1.5" />
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
