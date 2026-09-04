/**
 * synapse-gui frontend API types
 * ----------------------------------
 * Mirrors the Pydantic DTOs of synapse_gui's backend (auth, datasets,
 * matching, demo). Recycled structure from synclair-gui's types/api.ts,
 * with the "structure" section replaced by "matching", and dataset
 * types extended for the two-dataset compatibility workflow.
 */

// ====================== auth.py ======================
export interface TokenResponse { access_token: string; token_type: string; }
export interface CurrentUserResponse { username: string; full_name: string; }

// ====================== datasets.py ======================
export interface ColumnPreviewDTO { name: string; dtype: string; }

export interface DatasetUploadResponse {
  dataset_id: string; filename: string; n_rows: number; n_columns: number;
  columns: ColumnPreviewDTO[]; preview: Record<string, unknown>[];
}

export interface DatasetDetailResponse {
  dataset_id: string; filename: string; n_rows: number; n_columns: number; has_data_config: boolean;
}

export type MissingStrategy = "drop" | "impute" | "replace" | "maintain";
export type ImputerType = "zero" | "mean" | "median" | "most_frequent" | "knn" | "iterative";
export type ScalerType = "none" | "standard" | "minmax" | "robust";
export type EncoderType = "none" | "one_hot" | "ordinal";

export interface MissingDataManagementDTO { strategy: MissingStrategy; value: unknown | null; condition: unknown[]; imputer: ImputerType; }
export interface ScalingConfigDTO { enabled: boolean; method: ScalerType; }
export interface EncodingConfigDTO { enabled: boolean; method: EncoderType; order: unknown[] | null; }

export interface ColumnInfoDTO {
  name: string; new_name: string; active: boolean; categorical: boolean; numerical: boolean; id: boolean;
  semantic_roles: string[]; multiplier: number; mappings: Record<string, unknown>;
  missing_data_management: MissingDataManagementDTO; scaling: ScalingConfigDTO; encoding: EncodingConfigDTO; type: string | null;
}

export interface DataConfigDTO { columns: ColumnInfoDTO[]; }

export interface ConfigValidationDTO {
  is_valid: boolean; missing_in_dataset: string[]; unconfigured_in_dataset: string[]; errors: string[];
}

export interface ParseConfigRequest {
  dataset_id: string; existing_config?: Record<string, unknown> | null;
  id_columns?: string[] | null; infer_id?: boolean; custom_id_patterns?: string[] | null;
}
export interface ParseConfigResponse { dataset_id: string; data_config: DataConfigDTO; validation: ConfigValidationDTO; }

export interface LegacyFieldMapping { column: string; legacy_field: string; legacy_value: unknown; mapped_to: string; }
export interface ImportConfigResponse {
  dataset_id: string; data_config: DataConfigDTO; validation: ConfigValidationDTO;
  fallback_used: boolean; fallback_reason: string | null; legacy_fields_mapped: LegacyFieldMapping[];
}

export interface CompatibilityCheckRequest { dataset_id_a: string; dataset_id_b: string; }
export interface CompatibilityCheckResponse { is_compatible: boolean; common_columns: string[]; excluded_id_like_columns: string[]; }

export interface RowFilterCondition { column: string; operator: "eq" | "ne" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte"; value: unknown; }
export interface FromArtifactRequest { source_job_id: string; artifact_name: string; row_filters?: RowFilterCondition[]; new_filename?: string; }

// ====================== MatchingModuleConfig sub-configs ======================
export interface PopulationConfig { treatment_col: string; matching_direction: "treated_to_control" | "control_to_treated" | "bidirectional_full"; id_col?: string | null; }
export interface CovariatesConfig { matching_covariates: string[]; evaluation_covariates?: string[]; covariate_missing_threshold?: number; }
export interface PropensityScoreConfig { poly_degree?: number; regularization_c?: number; max_iter?: number; random_state?: number | null; }
export interface RepresentationConfig {
  use_propensity_score?: boolean; ps_method?: "logistic" | "random_forest" | "lightgbm";
  ps_config?: PropensityScoreConfig | null; matching_space?: "covariates_only" | "ps_only" | "logit_ps_only" | "hybrid_covariates_and_ps";
}
export interface ConstraintsConfig { exact_match_covariates?: string[]; stratified_matching?: boolean; }
export interface DistanceConfig {
  distance_metric?: "euclidean" | "mahalanobis" | "gower" | "ps_logit" | "weighted_hybrid";
  weight_numerical?: number; weight_categorical?: number;
}
export interface StrategyConfig {
  matching_algorithm?: "greedy_nn" | "optimal_hungarian" | "optimal_transport_sinkhorn" | "full_matching";
  matching_ratio_k?: number; allow_replacement?: boolean; caliper_value?: number | null;
  caliper_scale?: "absolute" | "standard_deviation"; ties_handling?: "first" | "random_seeded";
  optimal_transport_target_size?: number | null;
  apply_candidate_prefilter?: boolean; prefilter_k_neighbors?: number; prefilter_min_candidates?: number | null;
}
export interface DiagnosticsConfig {
  run_overlap_diagnostics?: boolean; run_pair_diagnostics?: boolean; run_balance_diagnostics?: boolean;
  balance_metrics?: ("smd" | "variance_ratio" | "ks_test" | "chi_square" | "jensen_shannon")[];
}
export interface MatchingPreprocessingConfig { apply_trimming?: boolean; trimming_strategy?: "none" | "symmetric_quantile" | "crump_optimal" | "kde_density"; trim_quantile?: number; }

export interface MatchingModuleConfig {
  population: PopulationConfig; covariates: CovariatesConfig;
  preprocessing?: MatchingPreprocessingConfig; representation?: RepresentationConfig;
  constraints?: ConstraintsConfig; distance?: DistanceConfig; strategy?: StrategyConfig; diagnostics?: DiagnosticsConfig;
}

// ====================== matching.py ======================
export interface MatchingRunRequest { dataset_id: string; module_config: Record<string, unknown>; }
export interface MatchingRunResponse { job_id: string; }
export type JobStatus = "pending" | "running" | "completed" | "failed";
export interface JobProgressDTO { message: string; percentage: number | null; logs: string[]; }
export interface MatchingJobStatusResponse { job_id: string; status: JobStatus; progress: JobProgressDTO; }
export interface DataFramePreviewDTO { name: string; n_rows: number; n_columns: number; columns: string[]; preview: Record<string, unknown>[]; }
export type MetricValue = number | string | boolean;
export interface MatchingResultResponse {
  job_id: string; status: JobStatus; success: boolean; error: string | null;
  metrics: Record<string, MetricValue>; tables: DataFramePreviewDTO[]; datasets: DataFramePreviewDTO[]; runtime_seconds: number | null;
}

// ====================== demo.py ======================
export interface DemoToolDTO { id: string; title: string; description: string; }
export interface DemoDatasetDTO { name: string; title: string; description: string; }
export interface DemoToolsResponse { tools: DemoToolDTO[]; demo_datasets: DemoDatasetDTO[]; }
export type DemoDatasetName = "clinical_selection_bias";
export interface DemoMatchingRunRequest {
  dataset_name: DemoDatasetName; matching_covariates?: string[];
  use_propensity_score?: boolean; matching_algorithm?: "greedy_nn" | "optimal_hungarian";
}
export interface BalanceRow {
  variable: string; is_matching_covariate: boolean;
  smd_before: number | null; smd_after: number | null; abs_smd_before: number | null; abs_smd_after: number | null;
  [key: string]: unknown;
}
export interface DemoMatchingRunResponse {
  dataset_name: string; n_observations: number; metrics: Record<string, MetricValue>;
  balance_table: BalanceRow[]; success: boolean; error: string | null;
}