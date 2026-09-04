/**
 * synapse-gui frontend CompareGuard
 * -----------------------------------------
 *
 * Unlocks Compare Runs if at least one run exists in history --
 * deliberately independent from currentRunId (unlike RunGuard): the
 * user should be able to reach Compare Runs even if they've navigated
 * away from "the current run", as long as some run was ever executed
 * in this session.
 */

import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";

import { useWorkspace } from "../../context/WorkspaceContext";

export function CompareGuard({ children }: { children: ReactNode }) {
  const { runs } = useWorkspace();
  const { moduleId } = useParams<{ moduleId: string }>();

  if (runs.length === 0) {
    return <Navigate to={`/workspace/modules/${moduleId}/pipeline`} replace />;
  }

  return <>{children}</>;
}