/**
 * synapse-gui frontend API types
 * ----------------------------------
 *
 * Pure TypeScript interfaces mirroring the Pydantic DTOs already defined
 * in the FastAPI backend (auth.py, datasets.py, structure.py, demo.py),
 * plus the StructureModuleConfig shapes needed to build request bodies
 * for /structure/run and /demo/structure/run. No HTTP logic lives here
 * -- see api/client.ts for that.
 *
 * Naming intentionally mirrors the Python DTO names exactly, so backend
 * and frontend contracts can be read side by side without mental
 * translation.
 */

// ======================================================================
// auth.py
// ======================================================================

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface CurrentUserResponse {
  username: string;
  full_name: string;
}

// ======================================================================
// datasets.py
// ======================================================================

export interface ColumnPreviewDTO {
  name: string;
  dtype: string;
}

export interface DatasetUploadResponse {
  dataset_id: string;
  filename: string;
  n_rows: number;
  n_columns: number;
  columns: ColumnPreviewDTO[];
  preview: Record<string, unknown>[];
}

export type MissingStrategy = "drop" | "impute" | "replace" | "maintain";
export type ImputerType = "zero" | "mean" | "median" | "most_frequent" | "knn" | "iterative";
export type ScalerType = "none" | "standard" | "minmax" | "robust";
export type EncoderType = "none" | "one_hot" | "ordinal";

export interface MissingDataManagementDTO {
  strategy: MissingStrategy;
  value: unknown | null;
  condition: unknown[];
  imputer: ImputerType;
}

export interface ScalingConfigDTO {
  enabled: boolean;
  method: ScalerType;
}

export interface EncodingConfigDTO {
  enabled: boolean;
  method: EncoderType;
  order: unknown[] | null;
}

export interface ColumnInfoDTO {
  name: string;
  new_name: string;
  active: boolean;
  categorical: boolean;
  numerical: boolean;
  id: boolean;
  semantic_roles: string[];
  multiplier: number;
  mappings: Record<string, unknown>;
  missing_data_management: MissingDataManagementDTO;
  scaling: ScalingConfigDTO;
  encoding: EncodingConfigDTO;
  type: string | null;
}

export interface DataConfigDTO {
  columns: ColumnInfoDTO[];
}

export interface ConfigValidationDTO {
  is_valid: boolean;
  missing_in_dataset: string[];
  unconfigured_in_dataset: string[];
  errors: string[];
}

export interface ParseConfigRequest {
  dataset_id: string;
  existing_config?: Record<string, unknown> | null;
  id_columns?: string[] | null;
  infer_id?: boolean;
  custom_id_patterns?: string[] | null;
}

export interface ParseConfigResponse {
  dataset_id: string;
  data_config: DataConfigDTO;
  validation: ConfigValidationDTO;
}

// ======================================================================
// StructureModuleConfig (synapse_structure.config.*) -- mirrored here
// since Workspace Step 2 and the demo endpoint both send this as part
// of the request body.
// ======================================================================
export type AnalysisInputSource =
  | { kind: "toy"; datasetName: DemoDatasetName }
  | { kind: "artifact"; label: string; columns: string[]; rows: Record<string, unknown>[] };
  
export type ClusteringAlgorithmName =
  | "hdbscan"
  | "kmeans"
  | "agglomerative"
  | "gmm"
  | "fuzzy_cmeans";

export type ProjectionAlgorithmName =
  | "none"
  | "pca"
  | "umap"
  | "tsne"
  | "svd"
  | "kernel_pca"
  | "pacmap";

export interface HDBSCANConfig {
  min_cluster_size: number;
  min_samples: number | null;
  metric: string;
  cluster_selection_method: "eom" | "leaf";
  extra_params: Record<string, unknown>;
}

export interface KMeansConfig {
  n_clusters: number;
  init: string;
  n_init: number | string;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export interface AgglomerativeConfig {
  n_clusters: number;
  metric: string;
  linkage: "ward" | "complete" | "average" | "single";
  extra_params: Record<string, unknown>;
}

export interface GMMConfig {
  n_components: number;
  covariance_type: "full" | "tied" | "diag" | "spherical";
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export interface FuzzyCMeansConfig {
  n_clusters: number;
  m: number;
  error: number;
  maxiter: number;
  init: unknown | null;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export type ClusteringConfig =
  | HDBSCANConfig
  | KMeansConfig
  | AgglomerativeConfig
  | GMMConfig
  | FuzzyCMeansConfig;

export interface PCAConfig {
  n_components: number | null;
  target_variance: number | null;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export interface UMAPConfig {
  n_components: number;
  n_neighbors: number;
  min_dist: number;
  metric: string;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export interface TSNEConfig {
  n_components: number;
  perplexity: number;
  learning_rate: string | number;
  init: string;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export interface SVDConfig {
  n_components: number;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export interface KernelPCAConfig {
  n_components: number;
  kernel: "linear" | "poly" | "rbf" | "sigmoid" | "cosine" | "precomputed";
  gamma: number | null;
  random_state: number | null;
  fit_inverse_transform: boolean;
  extra_params: Record<string, unknown>;
}

export interface PaCMAPConfig {
  n_components: number;
  n_neighbors: number;
  MN_ratio: number;
  FP_ratio: number;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export type ProjectionConfig =
  | PCAConfig
  | UMAPConfig
  | TSNEConfig
  | SVDConfig
  | KernelPCAConfig
  | PaCMAPConfig;

export interface BootstrapStabilityConfig {
  n_iterations: number;
  sample_fraction: number;
  seed: number;
}

export interface RFImportanceConfig {
  n_estimators: number;
  max_depth: number;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export interface ShapConfig {
  n_estimators: number;
  max_depth: number;
  random_state: number | null;
  extra_params: Record<string, unknown>;
}

export interface StructureModuleConfig {
  apply_imputation: boolean;
  clustering_algorithm: ClusteringAlgorithmName;
  clustering_config: ClusteringConfig;
  projection_algorithm: ProjectionAlgorithmName;
  projection_config: ProjectionConfig | null;
  run_stability: boolean;
  stability_config: BootstrapStabilityConfig;
  run_feature_importance: boolean;
  rf_importance_config: RFImportanceConfig;
  run_shap: boolean;
  shap_config: ShapConfig;
  run_cluster_profile: boolean;
}

export interface DatasetDetailResponse {
  dataset_id: string;
  filename: string;
  n_rows: number;
  n_columns: number;
  has_data_config: boolean;
}

// ======================================================================
// structure.py
// ======================================================================

export interface StructureRunRequest {
  dataset_id: string;
  module_config: Record<string, unknown>;
}

export interface StructureRunResponse {
  job_id: string;
}

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface JobProgressDTO {
  message: string;
  percentage: number | null;
  logs: string[];
}

export interface StructureJobStatusResponse {
  job_id: string;
  status: JobStatus;
  progress: JobProgressDTO;
}

export interface DataFramePreviewDTO {
  name: string;
  n_rows: number;
  n_columns: number;
  columns: string[];
  preview: Record<string, unknown>[];
}

export type MetricValue = number | string | boolean;

export interface StructureResultResponse {
  job_id: string;
  status: JobStatus;
  success: boolean;
  error: string | null;
  metrics: Record<string, MetricValue>;
  tables: DataFramePreviewDTO[];
  datasets: DataFramePreviewDTO[];
  runtime_seconds: number | null;
}

// ======================================================================
// demo.py
// ======================================================================

export interface DemoToolDTO {
  id: string;
  title: string;
  description: string;
}

export interface DemoDatasetDTO {
  name: string;
  title: string;
  description: string;
  n_rows: number;
  n_columns: number;
  n_numerical: number;
  n_categorical: number;
}

export interface DemoToolsResponse {
  tools: DemoToolDTO[];
  demo_datasets: DemoDatasetDTO[];
}

export interface InlineDatasetDTO {
  columns: string[];
  rows: Record<string, unknown>[];
}

export type DemoDatasetName = "iris" | "wine";

export interface DemoStructureRunRequest {
  dataset_name?: DemoDatasetName;
  inline_dataset?: InlineDatasetDTO;
  n_clusters?: number;
  include_projection?: boolean;
}

export interface DemoStructureRunResponse {
  dataset_label: string;
  n_observations: number;
  n_features: number;
  feature_names: string[];
  labels: number[];
  metrics: Record<string, MetricValue>;
  embedding: EmbeddingPointDTO[] | null;
  clustered_rows: Record<string, unknown>[];
  success: boolean;
  error: string | null;
}

export interface EmbeddingPointDTO {
  x: number;
  y: number;
}

export interface DemoColumnSummaryDTO {
  name: string;
  numerical: boolean;
  categorical: boolean;
}

export interface DemoDatasetDTO {
  name: string;
  title: string;
  description: string;
  n_rows: number;
  n_columns: number;
  n_numerical: number;
  n_categorical: number;
  columns: DemoColumnSummaryDTO[];
}

export interface DemoStructureRunRequest {
  dataset_name?: DemoDatasetName;
  inline_dataset?: InlineDatasetDTO;
  excluded_columns?: string[];
  n_clusters?: number;
  include_projection?: boolean;
}

export interface RowFilterCondition {
  column: string;
  operator: "eq" | "ne" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte";
  value: unknown;
}

export interface FromArtifactRequest {
  source_job_id: string;
  artifact_name: string;
  row_filters?: RowFilterCondition[];
  new_filename?: string;
}

export interface ColumnDistinctValuesResponse {
  column: string;
  distinct_values: unknown[];
  truncated: boolean;
}

export interface LegacyFieldMapping {
  column: string;
  legacy_field: string;
  legacy_value: unknown;
  mapped_to: string;
}

export interface ImportConfigResponse {
  dataset_id: string;
  data_config: DataConfigDTO;
  validation: ConfigValidationDTO;
  fallback_used: boolean;
  fallback_reason: string | null;
  legacy_fields_mapped: LegacyFieldMapping[];
}