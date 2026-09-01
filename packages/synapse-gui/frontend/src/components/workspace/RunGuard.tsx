/**
 * Blocks access to Results/Artifacts/Export sections that require a
 * completed run. Verifies the job against the real backend state
 * (GET /structure/jobs/{id}) rather than trusting only WorkspaceContext.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";
import { getJobStatus } from "../../api/client";
import { useWorkspace } from "../../context/WorkspaceContext";

export function RunGuard({ children }: { children: ReactNode }) {
  const { jobId } = useWorkspace();
  const { moduleId } = useParams<{ moduleId: string }>();

  const query = useQuery({
    queryKey: ["run-check", jobId],
    queryFn: ({ signal }) => getJobStatus(jobId!, signal),
    enabled: Boolean(jobId),
    retry: false,
  });

  if (!jobId) {
    return <Navigate to={`/workspace/modules/${moduleId}/pipeline`} replace />;
  }

  if (query.isError) {
    // job_id non più valido lato backend (es. riavvio server)
    return <Navigate to={`/workspace/modules/${moduleId}/pipeline`} replace />;
  }

  if (query.isLoading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  // Non blocchiamo più su status "pending"/"running": ResultsSection
  // mostra la barra di progresso; solo l'assenza di un job è motivo di redirect.
  return <>{children}</>;
}