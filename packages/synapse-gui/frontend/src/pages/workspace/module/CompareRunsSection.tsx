import { useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { getMatchingJobResult } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";

export function CompareRunsSection() {
  const { runs, currentRunId, setCurrentRun, renameRun } = useWorkspace();
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());

  const selectedRunList = runs.filter((r) => selectedForCompare.has(r.id));

  // Caricamento in parallelo dei risultati per tutte le run selezionate
  const resultsQueries = useQueries({
    queries: selectedRunList.map((run) => ({
      queryKey: ["matching-job-result", run.jobId],
      queryFn: ({ signal }: { signal?: AbortSignal }) => getMatchingJobResult(run.jobId, signal),
      enabled: Boolean(run.jobId),
    })),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Compare Runs</h1>

      {runs.length > 0 ? (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-medium text-slate-700">Run history</h2>
          {runs.map((run) => (
            <div key={run.id} className="flex items-center gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
              <input
                type="checkbox"
                checked={selectedForCompare.has(run.id)}
                onChange={(e) =>
                  setSelectedForCompare((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(run.id);
                    else next.delete(run.id);
                    return next;
                  })
                }
              />
              <input
                value={run.label}
                onChange={(e) => renameRun(run.id, e.target.value)}
                className="flex-1 rounded border border-transparent px-1 py-0.5 hover:border-slate-200 focus:border-slate-300"
              />
              <button
                onClick={() => setCurrentRun(run.id)}
                className={`text-xs ${run.id === currentRunId ? "font-medium text-blue-700" : "text-slate-400 hover:text-blue-600"}`}
              >
                {run.id === currentRunId ? "Current" : "View in Results"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-400">No executed runs in this session yet.</p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Comparison Table</h2>
        {selectedRunList.length === 0 ? (
          <p className="text-sm text-slate-400">Select at least one run above to compare parameters and metrics.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400">
                  <th className="px-3 py-2">Run Label</th>
                  <th className="px-3 py-2">Match Rate</th>
                  <th className="px-3 py-2">Matched Pairs</th>
                  <th className="px-3 py-2">Mean Distance</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
              {selectedRunList.map((run, index) => {
                const query = resultsQueries[index];
                const res: any = query?.data;

                const summary = res?.summary;
                const pairDiag = res?.pair_diagnostics ?? res?.pairDiagnostics;

                return (
                  <tr key={run.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-700">{run.label}</td>
                    <td className="px-3 py-2">
                      {summary?.match_rate != null ? `${(summary.match_rate * 100).toFixed(1)}%` : "-"}
                    </td>
                    <td className="px-3 py-2">{summary?.n_pairs ?? "-"}</td>
                    <td className="px-3 py-2">
                      {pairDiag?.mean_distance ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {query?.isLoading && <span className="text-amber-500">Loading...</span>}
                      {query?.isError && <span className="text-red-500">Error</span>}
                      {res && <span className="text-emerald-600 font-medium">Ready</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}