import { useEffect, useRef, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { useCurrentUser } from "./hooks";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

interface NotificationEvent {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "match";
  link?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationCountEvent {
  count: number;
}

export type JobType = "scoring" | "pdf" | "matching" | "market_analysis";
export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface JobStatusEvent {
  jobId: string;
  jobType: JobType;
  status: JobStatus;
  progress?: number;
  result?: unknown;
  error?: string;
}

export function useNotificationSocket(
  onNewNotification?: (notification: NotificationEvent) => void,
  onCountUpdate?: (count: number) => void
) {
  const socketRef = useRef<Socket | null>(null);
  const { data: user } = useCurrentUser();

  useEffect(() => {
    if (!user) return;

    const socket = io(`${SOCKET_URL}/notifications`, {
      withCredentials: true,
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("[Socket] Connected to notifications");
    });

    socket.on("notification:new", (data: NotificationEvent) => {
      onNewNotification?.(data);
    });

    socket.on("notification:count", (data: NotificationCountEvent) => {
      onCountUpdate?.(data.count);
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, onNewNotification, onCountUpdate]);

  return socketRef.current;
}

export function useJobStatus(
  onStatusChange?: (event: JobStatusEvent) => void,
  jobIds?: string[]
) {
  const socketRef = useRef<Socket | null>(null);
  const { data: user } = useCurrentUser();
  const jobIdsKey = useMemo(() => jobIds?.join(",") ?? "", [jobIds]);

  useEffect(() => {
    if (!user) return;

    const socket = io(`${SOCKET_URL}/notifications`, {
      withCredentials: true,
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("job:status", (event: JobStatusEvent) => {
      if (jobIds && !jobIds.includes(event.jobId)) return;
      onStatusChange?.(event);
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket] Job status connection error:", error.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, onStatusChange, jobIdsKey]);

  return socketRef.current;
}
