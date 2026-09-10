/**
 * synapse-gui frontend CompareRunsSection
 * ---------------------------------------------------
 *
 * Lists every run in WorkspaceContext.runs (real run history, populated
 * by MatchingDesignSection's Run Analysis button) and fetches each run's
 * real result via GET /matching/jobs/{id}/result (useQueries, in
 * parallel) to build the comparison table -- no mock data. Per-run
 * config (algorithm/distance/etc.) comes from the run's own
 * moduleConfigSnapshot already held in context, no extra network call
 * needed for that part.
 */

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getMatchingJobResult } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";

function metricNumber(metrics: Record<string, unknown> | undefined, key: string): number | null {
  const value = metrics?.[key];
  return typeof value === "number" ? value : null;
}

export function CompareRunsSection() {
  const { runs, currentRunId, setCurrentRun, renameRun } = useWorkspace();
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());

  const resultQueries = useQueries({
    queries: runs.map((run) => ({
      queryKey: ["matching-result", run.jobId],
      queryFn: () => getMatchingJobResult(run.jobId),
      staleTime: Infinity, // a completed job's result never changes
      retry: false,
    })),
  });

  const rowsToShow = runs.filter((run) => selectedForCompare.size === 0 || selectedForCompare.has(run.id));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Compare Runs</h1>

      {runs.length === 0 ? (
        <p className="text-sm text-slate-400">Nessun run ancora eseguito. Vai su Design e premi "Run Analysis".</p>
      ) : (
        <>
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-medium text-slate-700">Run history</h2>
            <p className="mb-2 text-xs text-slate-400">Seleziona 2+ run da confrontare (nessuna selezione = mostra tutti).</p>
            {runs.map((run) => (
              <div key={run.id} className="flex items-center gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                <input
                  type="checkbox" checked={selectedForCompare.has(run.id)}
                  onChange={(e) =>
                    setSelectedForCompare((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(run.id); else next.delete(run.id);
                      return next;
                    })
                  }
                />
                <input
                  value={run.label} onChange={(e) => renameRun(run.id, e.target.value)}
                  className="flex-1 rounded border border-transparent px-1 py-0.5 hover:border-slate-200 focus:border-slate-300"
                />
                <button onClick={() => setCurrentRun(run.id)} className={`text-xs ${run.id === currentRunId ? "font-medium text-blue-700" : "text-slate-400 hover:text-blue-600"}`}>
                  {run.id === currentRunId ? "Current" : "View in Results"}
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
            <h2 className="mb-3 text-sm font-medium text-slate-700">Comparison</h2>
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-xs uppercase">
                  <th className="px-2 py-1.5">Run</th>
                  <th className="px-2 py-1.5">Algorithm</th>
                  <th className="px-2 py-1.5">Distance</th>
                  <th className="px-2 py-1.5">Match rate</th>
                  <th className="px-2 py-1.5">Mean distance</th>
                  <th className="px-2 py-1.5">Pairs</th>
                  <th className="px-2 py-1.5">Max |SMD| after</th>
                </tr>
              </thead>
              <tbody>
                {rowsToShow.map((run) => {
                  const runIndex = runs.findIndex((r) => r.id === run.id);
                  const query = resultQueries[runIndex];
                  const config = run.moduleConfigSnapshot as Record<string, any>;

                  if (query?.isLoading) {
                    return (
                      <tr key={run.id} className="border-b border-slate-100">
                        <td className="px-2 py-1.5">{run.label}</td>
                        <td colSpan={6} className="px-2 py-1.5 text-xs text-slate-400 animate-pulse">Caricamento...</td>
                      </tr>
                    );
                  }
                  if (query?.isError || !query?.data?.success) {
                    return (
                      <tr key={run.id} className="border-b border-slate-100">
                        <td className="px-2 py-1.5">{run.label}</td>
                        <td colSpan={6} className="px-2 py-1.5 text-xs text-red-500">Run non riuscito o non ancora completato.</td>
                      </tr>
                    );
                  }

                  const metrics = query.data.metrics;
                  return (
                    <tr key={run.id} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-800">{run.label}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{config?.strategy?.matching_algorithm ?? "-"}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{config?.distance?.distance_metric ?? "-"}</td>
                      <td className="px-2 py-1.5">{metricNumber(metrics, "match_rate") !== null ? `${(metricNumber(metrics, "match_rate")! * 100).toFixed(1)}%` : "-"}</td>
                      <td className="px-2 py-1.5">{metricNumber(metrics, "pair_mean_distance")?.toFixed(3) ?? "-"}</td>
                      <td className="px-2 py-1.5">{metricNumber(metrics, "pair_n_pairs") ?? "-"}</td>
                      <td className="px-2 py-1.5">{metricNumber(metrics, "max_abs_smd_after")?.toFixed(3) ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <Link
              to={`/workspace/modules/matching/design`}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              + Nuovo run (stessi dati) →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}