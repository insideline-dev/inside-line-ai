import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getStartupControllerGetProgressQueryKey,
  getStartupControllerFindOneQueryKey,
  useStartupControllerGetProgress,
} from "@/api/generated/startup/startup";
import {
  usePipelineStatus,
  type AgentProgressEvent,
  type PhaseEvent,
  type PipelineStatusEvent,
} from "@/lib/auth/useSocket";
import {
  PIPELINE_PHASE_ORDER,
  type PipelineAgentProgress,
  type PipelineProgressData,
  type PipelinePhaseProgress,
  type StartupProgressResponse,
} from "@/types/pipeline-progress";

const TERMINAL_PIPELINE_STATUSES = new Set(["completed", "failed", "cancelled"]);

function unwrapApiResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as Record<string, unknown>).data as T;
  }

  return payload as T;
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function calculateAgentProgress(agent: PipelineAgentProgress): number {
  if (typeof agent.progress === "number") {
    return normalizePercent(agent.progress);
  }

  if (agent.status === "completed") {
    return 100;
  }
  if (agent.status === "running") {
    return 50;
  }
  return 0;
}

function calculatePhaseProgress(phase: PipelinePhaseProgress): number {
  if (phase.status === "completed" || phase.status === "skipped") {
    return 100;
  }

  const agents = Object.values(phase.agents ?? {});
  if (!agents.length) {
    return phase.status === "running" ? 50 : 0;
  }

  const total = agents.reduce((sum, agent) => sum + calculateAgentProgress(agent), 0);
  return normalizePercent(total / agents.length);
}

function isTerminalPhaseStatus(status: string | undefined): boolean {
  return status === "completed" || status === "failed" || status === "skipped";
}

function isTerminalAgentStatus(status: string | undefined): boolean {
  return status === "completed" || status === "failed";
}

function normalizeNonNegativeInt(value: number | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function isOlderTimestamp(
  incoming: string | undefined,
  existing: string | undefined,
): boolean {
  if (!incoming || !existing) {
    return false;
  }
  const incomingMs = new Date(incoming).getTime();
  const existingMs = new Date(existing).getTime();
  if (!Number.isFinite(incomingMs) || !Number.isFinite(existingMs)) {
    return false;
  }
  return incomingMs < existingMs;
}

function normalizeTerminalAgentStates(progress: PipelineProgressData): void {
  const pipelineTerminal = Boolean(
    progress.pipelineStatus &&
      TERMINAL_PIPELINE_STATUSES.has(progress.pipelineStatus),
  );
  const now = new Date().toISOString();

  for (const phase of Object.values(progress.phases)) {
    const phaseTerminal = isTerminalPhaseStatus(phase.status);
    if (!pipelineTerminal && !phaseTerminal) {
      continue;
    }

    const agents = Object.values(phase.agents ?? {});
    if (!agents.length) {
      continue;
    }

    for (const agent of agents) {
      if (agent.status !== "running" && agent.status !== "pending") {
        continue;
      }

      const hasFallbackSignal =
        agent.usedFallback === true || agent.lastEvent === "fallback";
      const hasFailureSignal =
        (Boolean(agent.error) && !hasFallbackSignal) ||
        agent.lastEvent === "failed" ||
        phase.status === "failed";

      if (hasFallbackSignal) {
        agent.status = "completed";
        agent.completedAt = agent.completedAt ?? now;
        continue;
      }

      if (hasFailureSignal) {
        agent.status = "failed";
        agent.completedAt = agent.completedAt ?? now;
        continue;
      }

      const hasSuccessSignal =
        phase.status === "completed" ||
        phase.status === "skipped" ||
        Boolean(agent.completedAt) ||
        agent.lastEvent === "completed";

      if (hasSuccessSignal) {
        agent.status = "completed";
        agent.completedAt = agent.completedAt ?? now;
        delete agent.error;
      }
    }

    phase.progress = calculatePhaseProgress(phase);
  }
}

function normalizeCompletedPipelinePhases(progress: PipelineProgressData): void {
  if (progress.pipelineStatus !== "completed") {
    return;
  }

  const now = new Date().toISOString();
  for (const phase of Object.values(progress.phases)) {
    if (isTerminalPhaseStatus(phase.status)) {
      phase.progress = calculatePhaseProgress(phase);
      continue;
    }

    phase.status = "completed";
    phase.startedAt = phase.startedAt ?? now;
    phase.completedAt = phase.completedAt ?? now;
    delete phase.error;
    phase.progress = 100;
  }
}

function recomputeProgress(progress: PipelineProgressData): PipelineProgressData {
  normalizeCompletedPipelinePhases(progress);
  normalizeTerminalAgentStates(progress);

  const phaseEntries = Object.entries(progress.phases);
  const phaseCount = Math.max(phaseEntries.length, 1);
  const overall = phaseEntries.reduce((sum, [, phase]) => {
    return sum + normalizePercent(phase.progress);
  }, 0);

  progress.phasesCompleted = phaseEntries
    .filter(([, phase]) => phase.status === "completed" || phase.status === "skipped")
    .map(([phase]) => phase);
  progress.overallProgress =
    progress.pipelineStatus === "completed"
      ? 100
      : normalizePercent(overall / phaseCount);
  progress.updatedAt = new Date().toISOString();
  return progress;
}

function buildDefaultProgress(): PipelineProgressData {
  return {
    overallProgress: 0,
    currentPhase: PIPELINE_PHASE_ORDER[0],
    pipelineStatus: "running",
    phasesCompleted: [],
    phases: Object.fromEntries(
      PIPELINE_PHASE_ORDER.map((phase) => [
        phase,
        { status: "pending", progress: 0 },
      ]),
    ),
    updatedAt: new Date().toISOString(),
  };
}

function ensurePhase(
  progress: PipelineProgressData,
  phase: string,
): PipelinePhaseProgress {
  if (!progress.phases[phase]) {
    progress.phases[phase] = { status: "pending", progress: 0 };
  }
  return progress.phases[phase];
}

function toProgressResponse(payload: unknown): StartupProgressResponse | null {
  const unwrapped = unwrapApiResponse<unknown>(payload);
  if (!unwrapped || typeof unwrapped !== "object") {
    return null;
  }

  const record = unwrapped as Record<string, unknown>;
  if (!("progress" in record)) {
    return null;
  }

  return {
    status: typeof record.status === "string" ? record.status : undefined,
    progress: (record.progress as PipelineProgressData | null) ?? null,
  };
}

function patchProgressPayload(
  payload: unknown,
  updater: (current: PipelineProgressData) => PipelineProgressData,
): unknown {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    const wrapped = payload as Record<string, unknown>;
    const currentData = wrapped.data as Record<string, unknown>;
    const currentProgress = (currentData?.progress as PipelineProgressData | null) ?? null;
    const nextProgress = updater(currentProgress ?? buildDefaultProgress());

    return {
      ...wrapped,
      data: {
        ...(currentData ?? {}),
        progress: nextProgress,
      },
    };
  }

  if (payload && typeof payload === "object" && "progress" in (payload as Record<string, unknown>)) {
    const current = payload as Record<string, unknown>;
    const nextProgress = updater((current.progress as PipelineProgressData | null) ?? buildDefaultProgress());
    return {
      ...current,
      progress: nextProgress,
    };
  }

  const nextProgress = updater(buildDefaultProgress());
  return {
    status: "analyzing",
    progress: nextProgress,
  };
}

function cloneProgress(progress: PipelineProgressData): PipelineProgressData {
  return {
    ...progress,
    phasesCompleted: [...(progress.phasesCompleted ?? [])],
    phases: Object.fromEntries(
      Object.entries(progress.phases ?? {}).map(([phaseKey, phaseValue]) => [
        phaseKey,
        {
          ...phaseValue,
          agents: phaseValue.agents
            ? Object.fromEntries(
                Object.entries(phaseValue.agents).map(([agentKey, agentValue]) => [
                  agentKey,
                  { ...agentValue },
                ]),
              )
            : undefined,
        },
      ]),
    ),
    agentEvents: Array.isArray(progress.agentEvents)
      ? [...progress.agentEvents]
      : progress.agentEvents,
    agentTraces: Array.isArray(progress.agentTraces)
      ? [...progress.agentTraces]
      : progress.agentTraces,
  };
}

export function useStartupRealtimeProgress(
  startupId: string | number | null | undefined,
  options?: {
    enabled?: boolean;
    pollMs?: number;
    useSocket?: boolean;
  },
) {
  const queryClient = useQueryClient();
  const id = startupId ? String(startupId) : null;
  const enabled = Boolean(id) && (options?.enabled ?? true);
  const pollMs = options?.pollMs ?? 3000;
  const socketEnabled = options?.useSocket ?? true;
  const queryKey = id ? getStartupControllerGetProgressQueryKey(id) : null;

  const query = useStartupControllerGetProgress(id ?? "", {
    query: {
      enabled,
      refetchInterval: (queryState) => {
        const current = toProgressResponse(queryState.state.data)?.progress;
        const status = current?.pipelineStatus;
        if (status && TERMINAL_PIPELINE_STATUSES.has(status)) {
          return false;
        }
        return pollMs;
      },
    },
  });

  const progressResponse = useMemo(() => {
    const parsed = toProgressResponse(query.data);
    if (!parsed?.progress) {
      return parsed;
    }

    return {
      ...parsed,
      progress: recomputeProgress(cloneProgress(parsed.progress)),
    };
  }, [query.data]);
  const progress = progressResponse?.progress ?? null;

  usePipelineStatus(enabled && socketEnabled ? id : null, {
    onPipelineStarted: (data) => {
      if (!queryKey) return;
      queryClient.setQueryData(queryKey, (current) =>
        patchProgressPayload(current, (base) => {
          const next = { ...base };
          next.pipelineRunId = data.pipelineRunId;
          next.pipelineStatus = "running";
          next.currentPhase = next.currentPhase || PIPELINE_PHASE_ORDER[0];
          return recomputeProgress(next);
        }),
      );
    },
    onPipelineComplete: (data: PipelineStatusEvent) => {
      if (!queryKey) return;
      queryClient.setQueryData(queryKey, (current) =>
        patchProgressPayload(current, (base) => {
          const next = { ...base };
          if (
            next.pipelineRunId &&
            data.pipelineRunId &&
            next.pipelineRunId !== data.pipelineRunId
          ) {
            return next;
          }
          next.pipelineRunId = data.pipelineRunId;
          next.pipelineStatus = data.status;
          next.overallProgress = 100;
          if (data.error) {
            next.error = data.error;
          }
          return recomputeProgress(next);
        }),
      );
      void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
      if (id) {
        void queryClient.invalidateQueries({
          queryKey: getStartupControllerFindOneQueryKey(id),
        });
      }
    },
    onPipelineFailed: (data: PipelineStatusEvent) => {
      if (!queryKey) return;
      queryClient.setQueryData(queryKey, (current) =>
        patchProgressPayload(current, (base) => {
          const next = { ...base };
          if (
            next.pipelineRunId &&
            data.pipelineRunId &&
            next.pipelineRunId !== data.pipelineRunId
          ) {
            return next;
          }
          next.pipelineRunId = data.pipelineRunId;
          next.pipelineStatus = data.status;
          next.error = data.error;
          return recomputeProgress(next);
        }),
      );
      void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
      if (id) {
        void queryClient.invalidateQueries({
          queryKey: getStartupControllerFindOneQueryKey(id),
        });
      }
    },
    onPipelineCancelled: (data: PipelineStatusEvent) => {
      if (!queryKey) return;
      queryClient.setQueryData(queryKey, (current) =>
        patchProgressPayload(current, (base) => {
          const next = { ...base };
          if (
            next.pipelineRunId &&
            data.pipelineRunId &&
            next.pipelineRunId !== data.pipelineRunId
          ) {
            return next;
          }
          next.pipelineRunId = data.pipelineRunId;
          next.pipelineStatus = data.status;
          next.error = data.error;
          return recomputeProgress(next);
        }),
      );
      void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
      if (id) {
        void queryClient.invalidateQueries({
          queryKey: getStartupControllerFindOneQueryKey(id),
        });
      }
    },
    onPhaseUpdate: (data: PhaseEvent) => {
      if (!queryKey) return;
      queryClient.setQueryData(queryKey, (current) =>
        patchProgressPayload(current, (base) => {
          const next = { ...base };
          if (data.pipelineRunId) {
            if (
              next.pipelineRunId &&
              next.pipelineRunId !== data.pipelineRunId
            ) {
              return next;
            }
            next.pipelineRunId = data.pipelineRunId;
          }

          const phase = ensurePhase(next, data.phase);
          const now = new Date().toISOString();

          phase.status = data.status;
          if (data.status === "running" && !phase.startedAt) {
            phase.startedAt = now;
          }
          if (
            data.status === "completed" ||
            data.status === "failed" ||
            data.status === "skipped"
          ) {
            phase.completedAt = now;
          }
          if (data.error) {
            phase.error = data.error;
          } else if (data.status !== "failed") {
            delete phase.error;
          }

          phase.progress = calculatePhaseProgress(phase);
          const hasTerminalPipelineStatus =
            typeof next.pipelineStatus === "string" &&
            TERMINAL_PIPELINE_STATUSES.has(next.pipelineStatus);

          if (
            data.status === "running" ||
            data.status === "waiting" ||
            data.status === "pending"
          ) {
            next.currentPhase = data.phase;
            if (!hasTerminalPipelineStatus) {
              next.pipelineStatus = "running";
              delete next.error;
            }
          }
          if (data.status === "failed") {
            next.currentPhase = data.phase;
            if (data.error) {
              next.error = data.error;
            }
            if (!hasTerminalPipelineStatus) {
              // A phase failure can still be retried; wait for explicit pipeline terminal events.
              next.pipelineStatus = "running";
            }
          }
          return recomputeProgress(next);
        }),
      );
    },
    onAgentProgress: (data: AgentProgressEvent) => {
      if (!queryKey) return;
      queryClient.setQueryData(queryKey, (current) =>
        patchProgressPayload(current, (base) => {
          const next = { ...base };
          if (data.pipelineRunId) {
            if (
              next.pipelineRunId &&
              next.pipelineRunId !== data.pipelineRunId
            ) {
              return next;
            }
            next.pipelineRunId = data.pipelineRunId;
          }

          const phase = ensurePhase(next, data.phase);
          const now = new Date().toISOString();
          const incomingPhaseRetryCount = normalizeNonNegativeInt(
            data.agent.phaseRetryCount,
            normalizeNonNegativeInt(phase.retryCount, 0),
          );
          const currentPhaseRetryCount = normalizeNonNegativeInt(
            phase.retryCount,
            0,
          );
          if (incomingPhaseRetryCount < currentPhaseRetryCount) {
            return recomputeProgress(next);
          }
          if (incomingPhaseRetryCount > currentPhaseRetryCount) {
            phase.agents = {};
          }
          phase.retryCount = incomingPhaseRetryCount;
          const existing = (phase.agents ?? {})[data.agent.key] ?? {
            key: data.agent.key,
            status: "pending",
          };
          const incomingAgentAttemptId =
            typeof data.agent.agentAttemptId === "string" &&
            data.agent.agentAttemptId.trim().length > 0
              ? data.agent.agentAttemptId.trim()
              : undefined;
          const isDifferentAttempt =
            Boolean(existing.agentAttemptId) &&
            Boolean(incomingAgentAttemptId) &&
            existing.agentAttemptId !== incomingAgentAttemptId;

          if (
            isOlderTimestamp(data.agent.lastEventAt, existing.lastEventAt) ||
            (isTerminalAgentStatus(existing.status) &&
              !isTerminalAgentStatus(data.agent.status) &&
              (!isDifferentAttempt ||
                incomingPhaseRetryCount <=
                  normalizeNonNegativeInt(existing.phaseRetryCount, 0)))
          ) {
            return recomputeProgress(next);
          }

          const agent: PipelineAgentProgress = {
            ...existing,
            ...data.agent,
            progress:
              typeof data.agent.progress === "number"
                ? normalizePercent(data.agent.progress)
                : existing.progress,
            startedAt:
              data.agent.startedAt ??
              (data.agent.status === "running" ? existing.startedAt ?? now : existing.startedAt),
            completedAt:
              data.agent.completedAt ??
              (data.agent.status === "completed" || data.agent.status === "failed"
                ? existing.completedAt ?? now
                : existing.completedAt),
            attempts: data.agent.attempts ?? existing.attempts,
            retryCount: data.agent.retryCount ?? existing.retryCount,
            phaseRetryCount:
              data.agent.phaseRetryCount ?? existing.phaseRetryCount,
            agentAttemptId:
              incomingAgentAttemptId ?? existing.agentAttemptId,
            usedFallback: data.agent.usedFallback ?? existing.usedFallback,
            fallbackReason:
              data.agent.fallbackReason ?? existing.fallbackReason,
            rawProviderError:
              data.agent.rawProviderError ?? existing.rawProviderError,
            lastEvent: data.agent.lastEvent ?? existing.lastEvent,
            lastEventAt: data.agent.lastEventAt ?? existing.lastEventAt,
            dataSummary: data.agent.dataSummary ?? existing.dataSummary,
          };

          phase.agents = {
            ...(phase.agents ?? {}),
            [data.agent.key]: agent,
          };

          if (phase.status === "pending" || phase.status === "waiting") {
            phase.status = "running";
          }

          const phaseAgents = Object.values(phase.agents ?? {});
          let latestHardFailure:
            | (typeof phaseAgents)[number]
            | undefined;
          for (let index = phaseAgents.length - 1; index >= 0; index -= 1) {
            const candidate = phaseAgents[index];
            if (
              candidate?.status === "failed" &&
              candidate.usedFallback !== true &&
              candidate.lastEvent !== "fallback"
            ) {
              latestHardFailure = candidate;
              break;
            }
          }
          if (latestHardFailure?.error) {
            phase.error = latestHardFailure.error;
          } else if (phase.status !== "failed") {
            delete phase.error;
          }

          phase.progress = calculatePhaseProgress(phase);
          next.currentPhase = data.phase;

          return recomputeProgress(next);
        }),
      );
    },
  });

  return {
    ...query,
    progressResponse,
    progress,
  };
}
