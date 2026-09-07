/**
 * synapse-gui frontend PipelineViewSection
 * ---------------------------------------------------
 *
 * Builds a real MatchingModuleConfig from populationSelection +
 * matchingDesign, calls POST /matching/run, polls status, and on
 * completion calls addRun() (never overwriting history) then navigates
 * to Results. Only supports mode === "single_dataset" for now, same
 * limitation as Exploration (two_datasets requires a merge step not
 * yet implemented).
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { getMatchingJobStatus, runMatching } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";
import type { MatchingModuleConfig } from "../../../types/api";

function buildModuleConfig(
  populationSelection: NonNullable<ReturnType<typeof useWorkspace>["populationSelection"]>,
  design: ReturnType<typeof useWorkspace>["matchingDesign"],
): MatchingModuleConfig {
  if (populationSelection.mode !== "single_dataset") {
    throw new Error("Only single_dataset mode is supported by the backend today.");
  }

  const parsedCaliper = design.caliperValue.trim() ? Number(design.caliperValue) : null;
  const caliperValue = parsedCaliper !== null && !Number.isNaN(parsedCaliper) ? parsedCaliper : null;

  return {
    population: {
      treatment_col: populationSelection.treatmentColumn,
      matching_direction: design.matchingDirection,
    },
    covariates: {
      matching_covariates: populationSelection.matchingCovariates,
    },
    representation: {
      use_propensity_score: design.usePropensityScore,
      matching_space: design.matchingSpace,
    },
    distance: {
      distance_metric: design.distanceMetric,
    },
    strategy: {
      matching_algorithm: design.matchingAlgorithm,
      allow_replacement: design.allowReplacement,
      caliper_value: caliperValue,
    },
    diagnostics: {
      balance_metrics: design.balanceMetrics as MatchingModuleConfig["diagnostics"] extends infer D ? (D extends { balance_metrics?: infer B } ? B : never) : never,
    },
  };
}

export function PipelineViewSection() {
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const { populationSelection, matchingDesign, addRun, runs } = useWorkspace();
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);

  const isSupported = populationSelection?.mode === "single_dataset";

  const statusQuery = useQuery({
    queryKey: ["pipeline-run-status", pollingJobId],
    queryFn: ({ signal }) => getMatchingJobStatus(pollingJobId!, signal),
    enabled: Boolean(pollingJobId),
    refetchInterval: (query) => (query.state.data?.status === "completed" || query.state.data?.status === "failed" ? false : 1000),
  });

  const runMutation = useMutation({
    mutationFn: () => {
      if (!populationSelection || populationSelection.mode !== "single_dataset") {
        throw new Error("Only single_dataset mode is supported today.");
      }
      const moduleConfig = buildModuleConfig(populationSelection, matchingDesign);
      return runMatching({ dataset_id: populationSelection.datasetId, module_config: moduleConfig as unknown as Record<string, unknown> });
    },
    onSuccess: (response) => {
      setPollingJobId(response.job_id);
    },
  });

  if (statusQuery.data?.status === "completed" && pollingJobId && !runs.some((r) => r.jobId === pollingJobId)) {
    addRun({
      jobId: pollingJobId,
      label: `Run ${runs.length + 1} — ${matchingDesign.matchingAlgorithm} + ${matchingDesign.distanceMetric}`,
      moduleConfigSnapshot: populationSelection && populationSelection.mode === "single_dataset"
        ? (buildModuleConfig(populationSelection, matchingDesign) as unknown as Record<string, unknown>)
        : {},
      populationSelectionSnapshot: populationSelection!,
    });
    navigate(`/workspace/modules/${moduleId}/results`);
  }

  const steps = [
    { id: "population", label: "Population", active: true, summary: isSupported ? `Single dataset, split by "${populationSelection.treatmentColumn}"` : "Not configured" },
    { id: "preprocessing", label: "Preprocessing / Filtering", active: false, summary: "No trimming applied" },
    { id: "representation", label: "Representation", active: matchingDesign.usePropensityScore, summary: matchingDesign.usePropensityScore ? "Propensity score (logistic)" : "Not used" },
    { id: "distance", label: "Distance", active: true, summary: matchingDesign.distanceMetric },
    { id: "strategy", label: "Matching Strategy", active: true, summary: `${matchingDesign.matchingAlgorithm}, ${matchingDesign.allowReplacement ? "with" : "without"} replacement` },
    { id: "diagnostics", label: "Diagnostics", active: matchingDesign.balanceMetrics.length > 0, summary: matchingDesign.balanceMetrics.join(", ") || "None selected" },
    { id: "results", label: "Results", active: true, summary: "Produced after run" },
  ];

  const isRunning = runMutation.isPending || (pollingJobId && statusQuery.data?.status !== "completed" && statusQuery.data?.status !== "failed");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Pipeline</h1>

      {!isSupported && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Running matching for two separate datasets is not supported yet.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {steps.map((step, index) => (
          <div key={step.id} className="relative flex items-start gap-4 pb-6 last:pb-0">
            {index < steps.length - 1 && <div className={`absolute left-[9px] top-6 h-full w-px ${step.active ? "bg-blue-300" : "bg-slate-200"}`} />}
            <span className={`mt-1 h-5 w-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${step.active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-400"}`}>
              {index + 1}
            </span>
            <div>
              <p className={`text-sm font-medium ${step.active ? "text-slate-800" : "text-slate-400"}`}>{step.label}</p>
              <p className="text-xs text-slate-500">{step.summary}</p>
            </div>
          </div>
        ))}
      </div>

      {isRunning && (
        <p className="mt-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {statusQuery.data?.progress.message ?? "Starting..."}
        </p>
      )}
      {statusQuery.data?.status === "failed" && (
        <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          <p className="font-semibold">Run failed:</p>
          <p className="mt-1">{statusQuery.data.progress?.message || "Execution error on backend."}</p>
          {statusQuery.data.progress?.logs && statusQuery.data.progress.logs.length > 0 && (
            <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-x-auto">
              {statusQuery.data.progress.logs.join("\n")}
            </pre>
          )}
        </div>
      )}

      <button
        onClick={() => runMutation.mutate()}
        disabled={!isSupported || Boolean(isRunning)}
        className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isRunning ? "Running..." : "Run analysis →"}
      </button>
    </div>
  );
}