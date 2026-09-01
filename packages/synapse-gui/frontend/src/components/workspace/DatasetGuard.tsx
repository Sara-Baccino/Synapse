import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { getDataset } from "../../api/client";
import { useWorkspace } from "../../context/WorkspaceContext";

export function DatasetGuard({ children }: { children: ReactNode }) {
  const { activeDatasetId } = useWorkspace();

  const query = useQuery({
    queryKey: ["dataset-check", activeDatasetId],
    queryFn: ({ signal }) => getDataset(activeDatasetId!, signal),
    enabled: Boolean(activeDatasetId),
    retry: false,
  });

  if (!activeDatasetId) {
    return <Navigate to="/workspace/dataset" replace />;
  }

  if (query.isLoading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (query.isError) {
    return <Navigate to="/workspace/dataset" replace />;
  }

  return <>{children}</>;
}