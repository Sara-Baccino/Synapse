import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { getModuleTitle } from "../../../constants/modules";
import { useWorkspace } from "../../../context/WorkspaceContext";
import { useStructureRun } from "../../../hooks/useStructureRun";
import type { DataFramePreviewDTO, RowFilterCondition } from "../../../types/api";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createDatasetFromArtifact, getDistinctColumnValues } from "../../../api/client";

function ArtifactPromotionPanel({ jobId, artifact }: { jobId: string; artifact: DataFramePreviewDTO }) {
  const navigate = useNavigate();
  const { addToCart } = useWorkspace();
  const { moduleId } = useParams<{ moduleId: string }>();

  const discreteColumns = artifact.columns.filter((col) => {
    const distinctInPreview = new Set(artifact.preview.map((row) => row[col]));
    return distinctInPreview.size > 0 && distinctInPreview.size <= 10;
  });

  const [filterColumn, setFilterColumn] = useState<string>("");
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());

  const distinctValuesQuery = useQuery({
    queryKey: ["distinct-values", jobId, artifact.name, filterColumn],
    queryFn: ({ signal }) => getDistinctColumnValues(jobId, artifact.name, filterColumn, signal),
    enabled: Boolean(filterColumn),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const row_filters: RowFilterCondition[] = [];
      if (filterColumn && selectedValues.size > 0) {
        row_filters.push({ column: filterColumn, operator: "in", value: Array.from(selectedValues) });
      }
      return createDatasetFromArtifact({ source_job_id: jobId, artifact_name: artifact.name, row_filters });
    },
    onSuccess: (response) => {
      addToCart({
        datasetId: response.dataset_id, filename: response.filename,
        origin: { kind: "artifact", sourceJobId: jobId, sourceModuleId: moduleId ?? "", artifactName: artifact.name },
      });
      navigate("/workspace/modules");
    },
  });

  return (
    <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-700">{artifact.name}</p>

      {discreteColumns.length > 0 && (
        <div className="mt-3">
          <label className="text-xs text-slate-500">Filter by column (optional)</label>
          <select
            value={filterColumn}
            onChange={(e) => { setFilterColumn(e.target.value); setSelectedValues(new Set()); }}
            className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">— No filter, use all rows —</option>
            {discreteColumns.map((col) => <option key={col} value={col}>{col}</option>)}
          </select>

          {filterColumn && distinctValuesQuery.isLoading && (
            <p className="mt-2 text-xs text-slate-400">Loading values...</p>
          )}

          {filterColumn && distinctValuesQuery.data && (
            <>
              <div className="mt-2 flex flex-wrap gap-3">
                {distinctValuesQuery.data.distinct_values.map((value) => {
                  const valueStr = String(value);
                  return (
                    <label key={valueStr} className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedValues.has(valueStr)}
                        onChange={(e) =>
                          setSelectedValues((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(valueStr); else next.delete(valueStr);
                            return next;
                          })
                        }
                      />
                      {valueStr}
                    </label>
                  );
                })}
              </div>
              {distinctValuesQuery.data.truncated && (
                <p className="mt-1 text-xs text-amber-600">
                  Showing first 50 distinct values only; this column has more.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {mutation.isError && <p className="mt-2 text-xs text-red-600">Failed to promote this artifact. Please try again.</p>}

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {mutation.isPending ? "Creating dataset..." : `Continue composing pipeline with "${artifact.name}" →`}
      </button>
    </div>
  );
}


export function ResultsSection() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { jobId } = useWorkspace();
  const { statusQuery, resultQuery, isFinished } = useStructureRun(jobId);

  const clusteredDataset = resultQuery.data?.datasets.find((d) => d.name === "clustered_dataset");
  const embeddingDataset = resultQuery.data?.datasets.find((d) => d.name === "projection_embedding");

  const scatterPoints =
    embeddingDataset && clusteredDataset
      ? embeddingDataset.preview.map((row, i) => ({
          x: Number(row["dim_0"] ?? 0),
          y: Number(row["dim_1"] ?? 0),
          cluster: clusteredDataset.preview[i]?.["cluster_label"] ?? null,
        }))
      : [];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-800">{getModuleTitle(moduleId)} Results</h1>

      {!isFinished && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-700">{statusQuery.data?.progress.message ?? "Starting..."}</p>
          {statusQuery.data?.progress.percentage != null && (
            <div className="mt-3 h-2 w-full rounded bg-slate-100">
              <div
                className="h-2 rounded bg-blue-600 transition-all"
                style={{ width: `${statusQuery.data.progress.percentage}%` }}
              />
            </div>
          )}
        </div>
      )}

      {isFinished && (resultQuery.isError || (resultQuery.data && !resultQuery.data.success)) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          Analysis failed{resultQuery.data?.error ? `: ${resultQuery.data.error}` : "."}
        </div>
      )}

      {isFinished && resultQuery.data?.success && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-slate-800">Metrics</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-4">
              {Object.entries(resultQuery.data.metrics).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-slate-400">{key}</dt>
                  <dd className="font-medium text-slate-800">
                    {typeof value === "number" ? value.toFixed(3) : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-slate-800 mb-3">Artifacts</h2>

            {scatterPoints.length > 0 && (
              <ScatterChart width={400} height={280} className="mb-4">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" hide />
                <YAxis type="number" dataKey="y" hide />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatterPoints} fill="#2563eb" />
              </ScatterChart>
            )}

            {[...resultQuery.data.tables, ...resultQuery.data.datasets].map((table) => (
              <div key={table.name} className="mb-4 last:mb-0">
                <p className="text-sm font-medium text-slate-700">{table.name} · {table.n_rows} rows · {table.n_columns} columns</p>
                <div className="mt-1 overflow-x-auto max-h-56">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400">
                        {table.columns.map((c) => <th key={c} className="px-2 py-1">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {table.preview.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          {table.columns.map((c) => <td key={c} className="px-2 py-1 text-slate-600">{String(row[c] ?? "")}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {resultQuery.data!.datasets.includes(table) && jobId && (
                  <ArtifactPromotionPanel jobId={jobId} artifact={table} />
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <Link to="/" className="ml-auto rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              ← Back to Home
            </Link>
          </div>
        </>
      )}
    </div>
  );
}