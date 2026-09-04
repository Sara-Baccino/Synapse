import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getJobStatus, runStructure } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";
import { MatchingStrategyPicker } from "../../../components/MatchingStrategyPicker";
import type {
  ClusteringAlgorithmName,
  ClusteringConfig,
  ProjectionConfig,
  StructureModuleConfig,
} from "../../../types/api";

const DEFAULT_CLUSTERING_CONFIGS: Record<ClusteringAlgorithmName, ClusteringConfig> = {
  hdbscan: {
    min_cluster_size: 15,
    min_samples: null,
    metric: "euclidean",
    cluster_selection_method: "eom",
    extra_params: {},
  },
  kmeans: {
    n_clusters: 5,
    init: "k-means++",
    n_init: 10,
    random_state: 42,
    extra_params: {},
  },
  agglomerative: {
    n_clusters: 5,
    metric: "euclidean",
    linkage: "ward",
    extra_params: {},
  },
  gmm: {
    n_components: 5,
    covariance_type: "full",
    random_state: 42,
    extra_params: {},
  },
  fuzzy_cmeans: {
    n_clusters: 5,
    m: 2.0,
    error: 0.005,
    maxiter: 1000,
    init: null,
    random_state: 42,
    extra_params: {},
  },
};

const DEFAULT_PCA_CONFIG: ProjectionConfig = {
  n_components: 2,
  target_variance: null,
  random_state: 42,
  extra_params: {},
};

function buildClusteringConfig(
  algorithm: ClusteringAlgorithmName,
  primaryParam: number
): ClusteringConfig {
  switch (algorithm) {
    case "hdbscan":
      return { ...DEFAULT_CLUSTERING_CONFIGS.hdbscan, min_cluster_size: primaryParam };
    case "kmeans":
      return { ...DEFAULT_CLUSTERING_CONFIGS.kmeans, n_clusters: primaryParam };
    case "agglomerative":
      return { ...DEFAULT_CLUSTERING_CONFIGS.agglomerative, n_clusters: primaryParam };
    case "gmm":
      return { ...DEFAULT_CLUSTERING_CONFIGS.gmm, n_components: primaryParam };
    case "fuzzy_cmeans":
      return { ...DEFAULT_CLUSTERING_CONFIGS.fuzzy_cmeans, n_clusters: primaryParam };
  }
}

export function PipelineSection() {
  const navigate = useNavigate();
  const { activeDatasetId, jobId, setJobId } = useWorkspace();

  const [clusteringAlgorithm, setClusteringAlgorithm] = useState<ClusteringAlgorithmName>("kmeans");
  const [primaryParam, setPrimaryParam] = useState<number>(5);
  const [includeProjection, setIncludeProjection] = useState(true);

  const existingJobQuery = useQuery({
    queryKey: ["pipeline-existing-job", jobId],
    queryFn: ({ signal }) => getJobStatus(jobId!, signal),
    enabled: Boolean(jobId),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 1000;
    },
  });

  const runMutation = useMutation({
    mutationFn: () => {
      const clusteringConfig = buildClusteringConfig(clusteringAlgorithm, primaryParam);

      const moduleConfig: StructureModuleConfig = {
        apply_imputation: false,
        clustering_algorithm: clusteringAlgorithm,
        clustering_config: clusteringConfig,
        projection_algorithm: includeProjection ? "pca" : "none",
        projection_config: includeProjection ? DEFAULT_PCA_CONFIG : null,
        run_stability: false,
        stability_config: { n_iterations: 50, sample_fraction: 0.8, seed: 42 },
        run_feature_importance: false,
        rf_importance_config: { n_estimators: 100, max_depth: 6, random_state: 42, extra_params: {} },
        run_shap: false,
        shap_config: { n_estimators: 100, max_depth: 5, random_state: 42, extra_params: {} },
        run_cluster_profile: false,
      };

      return runStructure({
        dataset_id: activeDatasetId!,
        module_config: moduleConfig as unknown as Record<string, unknown>,
      });
    },
    onSuccess: (response) => {
      setJobId(response.job_id);
      navigate("/workspace/modules/structure/results");
    },
  });

  const existingStatus = existingJobQuery.data?.status;
  const isBusy = runMutation.isPending || existingStatus === "pending" || existingStatus === "running";
  const hasCompletedRun = existingStatus === "completed";

  if (!activeDatasetId) {
    return (
      <div className="text-slate-600">
        No dataset selected. Please go back to{" "}
        <button onClick={() => navigate("/workspace/dataset")} className="text-blue-600 underline">
          Dataset selection
        </button>
        .
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Pipeline & Algorithm Selection</h1>
      <p className="mt-2 text-slate-500">
        Choose your clustering and projection parameters before running the analysis.
      </p>

      {isBusy && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Analisi in corso, attendi...
        </p>
      )}

      {hasCompletedRun && !isBusy && (
        <div className="mt-3 flex items-center gap-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          <span>Un'analisi è già stata completata per questo dataset.</span>
          <button
            onClick={() => navigate("/workspace/modules/structure/results")}
            className="font-medium underline"
          >
            View results →
          </button>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <MatchingStrategyPicker
          algorithm={clusteringAlgorithm}
          onAlgorithmChange={setClusteringAlgorithm}
          primaryParam={primaryParam}
          onPrimaryParamChange={setPrimaryParam}
          includeProjection={includeProjection}
          onIncludeProjectionChange={setIncludeProjection}
          disabled={isBusy}
        />

        {runMutation.isError && (
          <p className="mt-4 text-sm text-red-600">
            Failed to start the analysis. Please check your configuration.
          </p>
        )}

        <button
          onClick={() => {
            if (hasCompletedRun) setJobId(null as unknown as string);
            runMutation.mutate();
          }}
          disabled={isBusy}
          className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition"
        >
          {isBusy ? "Analisi in corso, attendi..." : hasCompletedRun ? "Run new analysis" : "Run analysis →"}
        </button>
      </div>
    </div>
  );
}