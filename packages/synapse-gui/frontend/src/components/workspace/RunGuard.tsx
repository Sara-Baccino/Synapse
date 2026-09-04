/**
 * synapse-gui frontend RunGuard
 * -----------------------------------
 *
 * Blocks access to Results/Export if no run is currently selected
 * (currentRunId), or if that run's backend job no longer exists.
 * Source of truth is now the run history (WorkspaceContext.runs +
 * currentRunId), not a single jobId as in the original SynClair
 * version.
 */

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";

import { getMatchingJobStatus } from "../../api/client";
import { useWorkspace } from "../../context/WorkspaceContext";

export function RunGuard({ children }: { children: ReactNode }) {
  const { runs, currentRunId } = useWorkspace();
  const { moduleId } = useParams<{ moduleId: string }>();

  const currentRun = runs.find((r) => r.id === currentRunId) ?? null;

  const query = useQuery({
    queryKey: ["run-check", currentRun?.jobId],
    queryFn: ({ signal }) => getMatchingJobStatus(currentRun!.jobId, signal),
    enabled: Boolean(currentRun),
    retry: false,
  });

  if (!currentRun) {
    return <Navigate to={`/workspace/modules/${moduleId}/pipeline`} replace />;
  }

  if (query.isError) {
    return <Navigate to={`/workspace/modules/${moduleId}/pipeline`} replace />;
  }

  if (query.isLoading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return <>{children}</>;
}