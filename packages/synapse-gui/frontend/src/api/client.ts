/**
 * synapse-gui frontend API client
 * ------------------------------------
 * Recycled structure from synclair-gui's client.ts. "structure"
 * functions replaced by "matching" equivalents; datasets/auth sections
 * identical in shape.
 */

import type {
  CompatibilityCheckRequest, CompatibilityCheckResponse, CurrentUserResponse,
  DatasetDetailResponse, DatasetUploadResponse, DemoMatchingRunRequest, DemoMatchingRunResponse,
  DemoToolsResponse, FromArtifactRequest, ImportConfigResponse, MatchingJobStatusResponse,
  MatchingResultResponse, MatchingRunRequest, MatchingRunResponse, ParseConfigRequest,
  ParseConfigResponse, TokenResponse,
} from "../types/api";

export const AUTH_TOKEN_STORAGE_KEY = "synapse_token";
const API_BASE_URL = "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

async function parseErrorDetail(response: Response): Promise<unknown> {
  try {
    const body = await response.json();
    return body?.detail ?? body;
  } catch {
    return response.statusText;
  }
}

async function apiFetch<TResponse>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<TResponse> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  const text = await response.text();
  return text ? (JSON.parse(text) as TResponse) : (undefined as TResponse);
}

// ---------- auth ----------
export async function login(username: string, password: string): Promise<TokenResponse> {
  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${API_BASE_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response.json() as Promise<TokenResponse>;
}
export function getCurrentUser(signal?: AbortSignal): Promise<CurrentUserResponse> {
  return apiFetch<CurrentUserResponse>("/auth/me", { signal });
}

// ---------- datasets ----------
export async function uploadDataset(file: File): Promise<DatasetUploadResponse> {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/datasets/upload`, { method: "POST", headers, body: formData });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response.json() as Promise<DatasetUploadResponse>;
}

export function getDataset(datasetId: string, signal?: AbortSignal): Promise<DatasetDetailResponse> {
  return apiFetch<DatasetDetailResponse>(`/datasets/${datasetId}`, { signal });
}

export function parseConfig(request: ParseConfigRequest): Promise<ParseConfigResponse> {
  return apiFetch<ParseConfigResponse>("/datasets/parse-config", { method: "POST", body: request });
}

export async function importConfigFile(datasetId: string, file: File): Promise<ImportConfigResponse> {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/import-config`, { method: "POST", headers, body: formData });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response.json() as Promise<ImportConfigResponse>;
}

export function checkCompatibility(request: CompatibilityCheckRequest): Promise<CompatibilityCheckResponse> {
  return apiFetch<CompatibilityCheckResponse>("/datasets/check-compatibility", { method: "POST", body: request });
}

export function createDatasetFromArtifact(request: FromArtifactRequest): Promise<DatasetUploadResponse> {
  return apiFetch<DatasetUploadResponse>("/datasets/from-artifact", { method: "POST", body: request });
}

// ---------- structure / modules ----------
export function runStructure(payload: { dataset_id: string; module_config: Record<string, unknown> }, signal?: AbortSignal): Promise<MatchingRunResponse> {
  return apiFetch<MatchingRunResponse>("/modules/structure/run", { method: "POST", body: payload, signal });
}

export function getJobStatus(jobId: string, signal?: AbortSignal): Promise<MatchingJobStatusResponse> {
  return apiFetch<MatchingJobStatusResponse>(`/jobs/${jobId}/status`, { signal });
}

export function getDistinctColumnValues(jobId: string, artifactName: string, columnName: string, signal?: AbortSignal): Promise<{ distinct_values: unknown[]; truncated: boolean }> {
  return apiFetch<{ distinct_values: unknown[]; truncated: boolean }>(`/jobs/${jobId}/artifacts/${encodeURIComponent(artifactName)}/distinct?column=${encodeURIComponent(columnName)}`, { signal });
}

export function buildDownloadUrl(jobId: string, category: string, name: string): string {
  return `/api/jobs/${jobId}/download?category=${category}&name=${encodeURIComponent(name)}`;
}

export function buildReportUrl(jobId: string): string {
  return `/api/jobs/${jobId}/report`;
}

// ---------- matching ----------
export function runMatching(request: MatchingRunRequest): Promise<MatchingRunResponse> {
  return apiFetch<MatchingRunResponse>("/matching/run", { method: "POST", body: request });
}
export function getMatchingJobStatus(jobId: string, signal?: AbortSignal): Promise<MatchingJobStatusResponse> {
  return apiFetch<MatchingJobStatusResponse>(`/matching/jobs/${jobId}`, { signal });
}
export function getMatchingJobResult(jobId: string, signal?: AbortSignal): Promise<MatchingResultResponse> {
  return apiFetch<MatchingResultResponse>(`/matching/jobs/${jobId}/result`, { signal });
}
export function buildMatchingDownloadUrl(jobId: string, collection: "tables" | "datasets", name: string): string {
  return `/api/matching/jobs/${jobId}/download/${collection}/${encodeURIComponent(name)}`;
}
export function buildMatchingReportUrl(jobId: string): string {
  return `/api/matching/jobs/${jobId}/report`;
}
export async function downloadAuthenticatedFile(url: string, suggestedFilename: string): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = suggestedFilename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

// Aggiungi questo in client.ts sotto la sezione matching
export function startMatchingJob(request: MatchingRunRequest): Promise<MatchingRunResponse> {
  return runMatching(request);
}

export interface DescriptiveStatRow { 
  variable: string; 
  group: string; 
  mean: number | null; 
  std: number | null; 
  min: number | null; 
  max: number | null; 
}

export interface NumericDistribution { 
  variable: string; 
  bin_edges: number[]; 
  treated_counts: number[]; 
  control_counts: number[]; 
}

export interface CategoricalFrequency { 
  variable: string; 
  categories: string[]; 
  treated_frequencies: number[]; 
  control_frequencies: number[]; 
}

export interface MissingnessRow { 
  variable: string; 
  treated_missing_pct: number; 
  control_missing_pct: number; 
}

export interface CorrelationMatrix { 
  variables: string[]; 
  treated_matrix: number[][]; 
  control_matrix: number[][]; 
}

export interface PopulationProfile {  
  descriptive_stats: DescriptiveStatRow[];  
  numeric_distributions: NumericDistribution[];  
  categorical_frequencies: CategoricalFrequency[];  
  missingness: MissingnessRow[];  
  correlations: CorrelationMatrix;
}

export interface ExploreRequest { 
  dataset_id: string;
  treatment_col: string; 
  matching_covariates: string[]; 
}

export function explorePopulation(request: ExploreRequest): Promise<PopulationProfile> {  
  return apiFetch<PopulationProfile>("/matching/explore", { method: "POST", body: request });
}

// ---------- demo ----------
export function getDemoTools(signal?: AbortSignal): Promise<DemoToolsResponse> {
  return apiFetch<DemoToolsResponse>("/demo/tools", { signal });
}
export function runDemoStructure(signal?: AbortSignal): Promise<any> {
  return apiFetch<any>("/demo/structure", { method: "POST", signal });
}
export function runDemoMatching(request: DemoMatchingRunRequest): Promise<DemoMatchingRunResponse> {
  return apiFetch<DemoMatchingRunResponse>("/demo/matching/run", { method: "POST", body: request });
}