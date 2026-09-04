/**
 * synapse-gui frontend CompareRunsSection
 * ---------------------------------------------------
 *
 * Lists every run in WorkspaceContext.runs (real, not mocked -- the
 * run history itself is already wired), lets the user select 2+ for
 * side-by-side comparison. Per-run detail (balance/match rate/etc.)
 * still comes from MOCK_RUNS_LIST until Phase C connects
 * getMatchingJobResult for each selected run's jobId.
 */

import { useState } from "react";

import { useWorkspace } from "../../../context/WorkspaceContext";
import { MOCK_RUNS_LIST } from "../../../mocks/matchingMocks";

export function CompareRunsSection() {
  const { runs, currentRunId, setCurrentRun, renameRun } = useWorkspace();
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());

  // Phase A: if no real runs exist yet, show mock runs so the layout is
  // still verifiable (CompareGuard would normally block this page with
  // zero real runs, but during Phase A skeleton review it's useful to
  // see the comparison table populated).
  const displayRuns = runs.length > 0 ? runs : [];
  const compareData = runs.length > 0 ? [] : MOCK_RUNS_LIST;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Compare Runs</h1>

      {displayRuns.length > 0 && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-medium text-slate-700">Run history</h2>
          {displayRuns.map((run) => (
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
      )}

      {compareData.length > 0 && (
        <p className="mb-2 text-xs text-slate-400">Showing mock runs — real run history will populate this list once you execute analyses.</p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Comparison</h2>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400">
              <th className="px-2 py-1">Run</th>
              <th className="px-2 py-1">Match rate</th>
              <th className="px-2 py-1">Mean distance</th>
              <th className="px-2 py-1">Pairs</th>
            </tr>
          </thead>
          <tbody>
            {compareData.map((run) => (
              <tr key={run.id} className="border-b border-slate-100">
                <td className="px-2 py-1">{run.label}</td>
                <td className="px-2 py-1">{(run.matchRate * 100).toFixed(1)}%</td>
                <td className="px-2 py-1">{run.meanDistance}</td>
                <td className="px-2 py-1">{run.nPairs}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {compareData.length === 0 && displayRuns.length === 0 && (
          <p className="text-sm text-slate-400">No runs yet.</p>
        )}
      </div>
    </div>
  );
}