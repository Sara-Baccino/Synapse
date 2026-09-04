/**
 * synapse-gui frontend DatasetGuard
 * -----------------------------------------
 *
 * Blocks access to sections requiring a valid population selection.
 * "Valid" means isPopulationSelectionValid() returns true (either a
 * single dataset with a treatment column + covariates, or two datasets
 * + covariates) -- NOT simply "at least two datasets in the cart", per
 * the Phase A clarification: matching can operate on a single dataset
 * split by a group column just as validly as on two separate datasets.
 *
 * Additionally verifies, against the real backend state, that every
 * dataset actually referenced by the current selection still exists
 * (GET /datasets/{id}) -- so a stale selection surviving a refresh or
 * a backend restart cannot produce a false "ready" state.
 */

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { getDataset } from "../../api/client";
import { isPopulationSelectionValid, useWorkspace } from "../../context/WorkspaceContext";

export function DatasetGuard({ children }: { children: ReactNode }) {
  const { populationSelection } = useWorkspace();

  const datasetIdsToVerify: string[] =
    populationSelection?.mode === "single_dataset"
      ? [populationSelection.datasetId]
      : populationSelection?.mode === "two_datasets"
      ? [populationSelection.datasetIdA, populationSelection.datasetIdB]
      : [];

  const verificationQuery = useQuery({
    queryKey: ["dataset-selection-check", datasetIdsToVerify],
    queryFn: async ({ signal }) => {
      await Promise.all(datasetIdsToVerify.map((id) => getDataset(id, signal)));
      return true;
    },
    enabled: datasetIdsToVerify.length > 0,
    retry: false,
  });

  if (!isPopulationSelectionValid(populationSelection)) {
    return <Navigate to="/workspace/modules/matching/data" replace />;
  }

  if (verificationQuery.isLoading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (verificationQuery.isError) {
    return <Navigate to="/workspace/modules/matching/data" replace />;
  }

  return <>{children}</>;
}