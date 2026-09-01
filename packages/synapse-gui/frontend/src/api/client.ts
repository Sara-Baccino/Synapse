/**
 * synapse-gui frontend API client
 * ------------------------------------
 *
 * Centralizes every HTTP call to the FastAPI backend: URL construction
 * (via the "/api" prefix proxied by Vite to localhost:8000), automatic
 * Authorization header injection when a JWT is present, uniform error
 * parsing into a typed ApiError, and one typed function per backend
 * endpoint. No session/refresh logic lives here -- that's the
 * responsibility of AuthContext (next file), which reads/writes the
 * same localStorage key this module reads from.
 */

import type {
  CurrentUserResponse,
  DatasetUploadResponse,
  DemoStructureRunRequest,
  DemoStructureRunResponse,
  DemoToolsResponse,
  ParseConfigRequest,
  FromArtifactRequest,
  ParseConfigResponse,
  StructureJobStatusResponse,
  StructureResultResponse,
  StructureRunRequest,
  StructureRunResponse,
  TokenResponse,
  ColumnDistinctValuesResponse,
  DatasetDetailResponse,
  ImportConfigResponse,
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

/**
 * JSON request/response wrapper. Automatically attaches the bearer
 * token (if present) and throws ApiError for any non-2xx response.
 */
async function apiFetch<TResponse>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<TResponse> {
  const token = getStoredToken();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  // Some endpoints (none currently) might return no body; guard just in case.
  const text = await response.text();
  return text ? (JSON.parse(text) as TResponse) : (undefined as TResponse);
}

// ======================================================================
// auth.py
// ======================================================================

/**
 * Logs in using the OAuth2 password-grant form (application/x-www-form-urlencoded),
 * matching FastAPI's OAuth2PasswordRequestForm on the backend.
 */
export async function login(username: string, password: string): Promise<TokenResponse> {
  const body = new URLSearchParams({ username, password });

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  return response.json() as Promise<TokenResponse>;
}

export function getCurrentUser(signal?: AbortSignal): Promise<CurrentUserResponse> {
  return apiFetch<CurrentUserResponse>("/auth/me", { signal });
}

// ======================================================================
// datasets.py
// ======================================================================

export async function uploadDataset(file: File): Promise<DatasetUploadResponse> {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // Deliberately no Content-Type header: the browser sets
  // multipart/form-data with the correct boundary automatically when
  // the body is a FormData instance.

  const response = await fetch(`${API_BASE_URL}/datasets/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  return response.json() as Promise<DatasetUploadResponse>;
}

export function parseConfig(request: ParseConfigRequest): Promise<ParseConfigResponse> {
  return apiFetch<ParseConfigResponse>("/datasets/parse-config", {
    method: "POST",
    body: request,
  });
}

// ======================================================================
// structure.py
// ======================================================================

export function runStructure(request: StructureRunRequest): Promise<StructureRunResponse> {
  return apiFetch<StructureRunResponse>("/structure/run", {
    method: "POST",
    body: request,
  });
}

export function getJobStatus(
  jobId: string,
  signal?: AbortSignal
): Promise<StructureJobStatusResponse> {
  return apiFetch<StructureJobStatusResponse>(`/structure/jobs/${jobId}`, { signal });
}

export function getStructureJobResult(
  jobId: string,
  signal?: AbortSignal
): Promise<StructureResultResponse> {
  return apiFetch<StructureResultResponse>(`/structure/jobs/${jobId}/result`, { signal });
}

// ======================================================================
// structure.py -- export/reporting
// ======================================================================

export function buildDownloadUrl(
  jobId: string,
  collection: "tables" | "datasets",
  name: string
): string {
  return `/api/structure/jobs/${jobId}/download/${collection}/${encodeURIComponent(name)}`;
}

export function buildReportUrl(jobId: string): string {
  return `/api/structure/jobs/${jobId}/report`;
}

/**
 * Downloads a binary file (CSV/PDF) as a Blob, attaching the auth
 * header manually since these are plain <a>-style downloads.
 */
export async function downloadAuthenticatedFile(
  url: string,
  suggestedFilename: string
): Promise<void> {
  const token = getStoredToken(); // <-- Usa la funzione interna coerente
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = suggestedFilename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}


export function createDatasetFromArtifact(request: FromArtifactRequest): Promise<DatasetUploadResponse> {
  return apiFetch<DatasetUploadResponse>("/datasets/from-artifact", {
    method: "POST",
    body: request,
  });
}
// ======================================================================
// demo.py
// ======================================================================

export function getDemoTools(signal?: AbortSignal): Promise<DemoToolsResponse> {
  return apiFetch<DemoToolsResponse>("/demo/tools", { signal });
}

export function runDemoStructure(request: DemoStructureRunRequest): Promise<DemoStructureRunResponse> {
  return apiFetch<DemoStructureRunResponse>("/demo/structure/run", {
    method: "POST",
    body: request,
  });
}

export function getDataset(datasetId: string, signal?: AbortSignal): Promise<DatasetDetailResponse> {
  return apiFetch<DatasetDetailResponse>(`/datasets/${datasetId}`, { signal });
}

export function getDistinctColumnValues(
  jobId: string, datasetName: string, columnName: string, signal?: AbortSignal
): Promise<ColumnDistinctValuesResponse> {
  return apiFetch<ColumnDistinctValuesResponse>(
    `/structure/jobs/${jobId}/datasets/${datasetName}/columns/${encodeURIComponent(columnName)}/distinct-values`,
    { signal }
  );
}

export async function importConfigFile(datasetId: string, file: File): Promise<ImportConfigResponse> {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`/api/datasets/${datasetId}/import-config`, {
    method: "POST", headers, body: formData,
  });

  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response.json() as Promise<ImportConfigResponse>;
}