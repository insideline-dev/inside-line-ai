import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useCurrentUser } from "./hooks";

const SOCKET_URL = import.meta.env.DEV ? "http://localhost:8080" : "";

// ── Shared socket singleton ──────────────────────────────────────────

let sharedSocket: Socket | null = null;
let refCount = 0;

function acquireSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(`${SOCKET_URL}/notifications`, {
      withCredentials: true,
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  refCount++;
  return sharedSocket;
}

function releaseSocket(): void {
  refCount--;
  if (refCount <= 0 && sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
    refCount = 0;
  }
}

// ── Types ────────────────────────────────────────────────────────────

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

export type JobType =
  | "scoring"
  | "pdf"
  | "matching"
  | "market_analysis"
  | "ai_extraction"
  | "ai_enrichment"
  | "ai_scraping"
  | "ai_research"
  | "ai_evaluation"
  | "ai_synthesis";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface JobStatusEvent {
  jobId: string;
  jobType: JobType;
  status: JobStatus;
  startupId?: string;
  pipelineRunId?: string;
  progress?: number;
  result?: unknown;
  error?: string;
}

export interface PhaseEvent {
  startupId: string;
  pipelineRunId?: string;
  phase: string;
  status: string;
  error?: string;
}

export interface PipelineStatusEvent {
  startupId: string;
  pipelineRunId: string;
  status: string;
  overallScore?: number;
  error?: string;
}

export interface AgentProgressEvent {
  startupId: string;
  pipelineRunId?: string;
  phase: string;
  agent: {
    key: string;
    status: "pending" | "running" | "completed" | "failed";
    progress?: number;
    startedAt?: string;
    completedAt?: string;
    error?: string;
    attempts?: number;
    retryCount?: number;
    phaseRetryCount?: number;
    agentAttemptId?: string;
    usedFallback?: boolean;
    fallbackReason?:
      | "EMPTY_STRUCTURED_OUTPUT"
      | "TIMEOUT"
      | "SCHEMA_OUTPUT_INVALID"
      | "MODEL_OR_PROVIDER_ERROR"
      | "UNHANDLED_AGENT_EXCEPTION";
    rawProviderError?: string;
    lastEvent?: "started" | "retrying" | "completed" | "failed" | "fallback";
    lastEventAt?: string;
  };
}

// ── Hooks ────────────────────────────────────────────────────────────

function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { data: user } = useCurrentUser();

  useEffect(() => {
    if (!user) {
      setSocket(null);
      return;
    }

    const nextSocket = acquireSocket();
    setSocket(nextSocket);

    return () => {
      releaseSocket();
      setSocket(null);
    };
  }, [user?.id]);

  return socket;
}

export function useNotificationSocket(
  onNewNotification?: (notification: NotificationEvent) => void,
  onCountUpdate?: (count: number) => void
) {
  const socket = useSocket();
  const onNewNotificationRef = useRef(onNewNotification);
  const onCountUpdateRef = useRef(onCountUpdate);

  useEffect(() => {
    onNewNotificationRef.current = onNewNotification;
    onCountUpdateRef.current = onCountUpdate;
  });

  useEffect(() => {
    if (!socket) return;

    const handleNew = (data: NotificationEvent) => {
      onNewNotificationRef.current?.(data);
    };
    const handleCount = (data: NotificationCountEvent) => {
      onCountUpdateRef.current?.(data.count);
    };
    const handleError = (data: { message: string }) => {
      console.error("[WS] Auth error:", data.message);
    };

    socket.on("notification:new", handleNew);
    socket.on("notification:count", handleCount);
    socket.on("error", handleError);

    return () => {
      socket.off("notification:new", handleNew);
      socket.off("notification:count", handleCount);
      socket.off("error", handleError);
    };
  }, [socket]);

  return socket;
}

export function useJobStatus(
  onStatusChange?: (event: JobStatusEvent) => void,
  jobIds?: string[]
) {
  const socket = useSocket();
  const jobIdsKey = useMemo(() => jobIds?.join(",") ?? "", [jobIds]);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });

  useEffect(() => {
    if (!socket) return;

    const handleStatus = (event: JobStatusEvent) => {
      if (jobIds && !jobIds.includes(event.jobId)) return;
      onStatusChangeRef.current?.(event);
    };

    socket.on("job:status", handleStatus);

    return () => {
      socket.off("job:status", handleStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, jobIdsKey]);

  return socket;
}

export function usePipelineStatus(
  startupId: string | null,
  handlers?: {
    onPhaseUpdate?: (data: PhaseEvent) => void;
    onPipelineStarted?: (data: { startupId: string; pipelineRunId: string }) => void;
    onPipelineComplete?: (data: PipelineStatusEvent) => void;
    onPipelineFailed?: (data: PipelineStatusEvent) => void;
    onPipelineCancelled?: (data: PipelineStatusEvent) => void;
    onAgentProgress?: (data: AgentProgressEvent) => void;
  }
) {
  const socket = useSocket();
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  const filterByStartup = useCallback(
    <T extends { startupId: string }>(handler: ((data: T) => void) | undefined) => {
      return (data: T) => {
        if (!startupId || data.startupId !== startupId) return;
        handler?.(data);
      };
    },
    [startupId]
  );

  useEffect(() => {
    if (!socket || !startupId) return;

    const onPipelineStarted = filterByStartup<{ startupId: string; pipelineRunId: string }>(
      (d) => handlersRef.current?.onPipelineStarted?.(d)
    );
    const onPipelineCompleted = filterByStartup<PipelineStatusEvent>(
      (d) => handlersRef.current?.onPipelineComplete?.(d)
    );
    const onPipelineFailed = filterByStartup<PipelineStatusEvent>(
      (d) => handlersRef.current?.onPipelineFailed?.(d)
    );
    const onPipelineCancelled = filterByStartup<PipelineStatusEvent>(
      (d) => handlersRef.current?.onPipelineCancelled?.(d)
    );
    const onPhaseUpdate = filterByStartup<PhaseEvent>(
      (d) => handlersRef.current?.onPhaseUpdate?.(d)
    );
    const onAgentProgress = filterByStartup<AgentProgressEvent>(
      (d) => handlersRef.current?.onAgentProgress?.(d)
    );

    socket.on("pipeline:started", onPipelineStarted);
    socket.on("pipeline:completed", onPipelineCompleted);
    socket.on("pipeline:failed", onPipelineFailed);
    socket.on("pipeline:cancelled", onPipelineCancelled);
    socket.on("phase:started", onPhaseUpdate);
    socket.on("phase:completed", onPhaseUpdate);
    socket.on("phase:failed", onPhaseUpdate);
    socket.on("phase:waiting", onPhaseUpdate);
    socket.on("phase:skipped", onPhaseUpdate);
    socket.on("agent:progress", onAgentProgress);
    socket.on("agent:completed", onAgentProgress);

    return () => {
      socket.off("pipeline:started", onPipelineStarted);
      socket.off("pipeline:completed", onPipelineCompleted);
      socket.off("pipeline:failed", onPipelineFailed);
      socket.off("pipeline:cancelled", onPipelineCancelled);
      socket.off("phase:started", onPhaseUpdate);
      socket.off("phase:completed", onPhaseUpdate);
      socket.off("phase:failed", onPhaseUpdate);
      socket.off("phase:waiting", onPhaseUpdate);
      socket.off("phase:skipped", onPhaseUpdate);
      socket.off("agent:progress", onAgentProgress);
      socket.off("agent:completed", onAgentProgress);
    };
  }, [socket, startupId, filterByStartup]);

  return socket;
}
