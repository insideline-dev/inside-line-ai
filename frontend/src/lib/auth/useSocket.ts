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
  const onNewNotificationRef = useRef(onNewNotification);
  const onCountUpdateRef = useRef(onCountUpdate);

  useEffect(() => {
    onNewNotificationRef.current = onNewNotification;
    onCountUpdateRef.current = onCountUpdate;
  });

  useEffect(() => {
    if (!user) return;

    const socket = io(`${SOCKET_URL}/notifications`, {
      withCredentials: true,
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("notification:new", (data: NotificationEvent) => {
      onNewNotificationRef.current?.(data);
    });

    socket.on("notification:count", (data: NotificationCountEvent) => {
      onCountUpdateRef.current?.(data.count);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  return socketRef.current;
}

export function useJobStatus(
  onStatusChange?: (event: JobStatusEvent) => void,
  jobIds?: string[]
) {
  const socketRef = useRef<Socket | null>(null);
  const { data: user } = useCurrentUser();
  const jobIdsKey = useMemo(() => jobIds?.join(",") ?? "", [jobIds]);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });

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
      onStatusChangeRef.current?.(event);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, jobIdsKey]);

  return socketRef.current;
}
