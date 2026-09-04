/**
 * synapse-gui frontend ResultsSection
 * ---------------------------------------------
 *
 * 5 internal tabs: Matching summary / Balance / Overlap / Pair
 * diagnostics / Matched data. Populated from mock data (MOCK_RESULT)
 * until Phase C connects getMatchingJobResult for the current run.
 */

import { useState } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";

import { useWorkspace } from "../../../context/WorkspaceContext";
import { MOCK_RESULT } from "../../../mocks/matchingMocks";

type Tab = "summary" | "balance" | "overlap" | "pairs" | "matched_data";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Matching summary" },
  { id: "balance", label: "Balance" },
  { id: "overlap", label: "Overlap" },
  { id: "pairs", label: "Pair diagnostics" },
  { id: "matched_data", label: "Matched data" },
];

export function ResultsSection() {
  const { runs, currentRunId } = useWorkspace();
  const [tab, setTab] = useState<Tab>("summary");

  const currentRun = runs.find((r) => r.id === currentRunId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Results</h1>
      <p className="mb-4 text-sm text-slate-500">
        {currentRun ? `Showing: ${currentRun.label}` : "Showing mock data — connected to real run results in Phase C."}
      </p>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm ${tab === t.id ? "border-b-2 border-blue-600 font-medium text-blue-700" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-400">Initial units</dt><dd className="font-medium text-slate-800">{MOCK_RESULT.summary.n_query_total}</dd></div>
            <div><dt className="text-slate-400">Matched</dt><dd className="font-medium text-slate-800">{MOCK_RESULT.summary.n_query_matched}</dd></div>
            <div><dt className="text-slate-400">Unmatched</dt><dd className="font-medium text-slate-800">{MOCK_RESULT.summary.n_query_unmatched}</dd></div>
            <div><dt className="text-slate-400">Match rate</dt><dd className="font-medium text-slate-800">{(MOCK_RESULT.summary.match_rate * 100).toFixed(1)}%</dd></div>
            <div><dt className="text-slate-400">Pairs</dt><dd className="font-medium text-slate-800">{MOCK_RESULT.summary.n_pairs}</dd></div>
          </dl>
        </div>
      )}

      {tab === "balance" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-700">SMD before / after (Love Plot)</h2>
          <div className="space-y-2">
            {MOCK_RESULT.balance.map((row) => (
              <div key={row.variable} className="flex items-center gap-3 text-xs">
                <span className="w-32 text-slate-600">{row.variable}{!row.is_matching_covariate && <span className="ml-1 text-slate-400">(eval)</span>}</span>
                <div className="relative h-4 flex-1 bg-slate-100 rounded">
                  <div className="absolute top-0 h-4 w-px bg-slate-400" style={{ left: "50%" }} />
                  <div className="absolute top-0 h-4 w-2 rounded-full bg-red-400" style={{ left: `${50 + row.smd_before * 40}%` }} title={`before: ${row.smd_before}`} />
                  <div className="absolute top-0 h-4 w-2 rounded-full bg-blue-600" style={{ left: `${50 + row.smd_after * 40}%` }} title={`after: ${row.smd_after}`} />
                </div>
                <span className="w-20 text-right text-slate-500">{row.smd_before.toFixed(2)} → {row.smd_after.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400"><span className="text-red-400">●</span> before &nbsp; <span className="text-blue-600">●</span> after</p>
        </div>
      )}

      {tab === "overlap" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div><dt className="text-slate-400">Treated PS range</dt><dd>{MOCK_RESULT.overlap.treated_ps_min} – {MOCK_RESULT.overlap.treated_ps_max}</dd></div>
            <div><dt className="text-slate-400">Control PS range</dt><dd>{MOCK_RESULT.overlap.control_ps_min} – {MOCK_RESULT.overlap.control_ps_max}</dd></div>
            <div className="col-span-2"><dt className="text-slate-400">Common support</dt><dd>{MOCK_RESULT.overlap.common_support_min} – {MOCK_RESULT.overlap.common_support_max}</dd></div>
          </dl>
          <p className="text-xs text-slate-400">Propensity score distribution chart — connected in Phase C.</p>
        </div>
      )}

      {tab === "pairs" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-400">Pairs</dt><dd>{MOCK_RESULT.pairDiagnostics.n_pairs}</dd></div>
            <div><dt className="text-slate-400">Mean distance</dt><dd>{MOCK_RESULT.pairDiagnostics.mean_distance}</dd></div>
            <div><dt className="text-slate-400">Median distance</dt><dd>{MOCK_RESULT.pairDiagnostics.median_distance}</dd></div>
            <div><dt className="text-slate-400">Min / Max</dt><dd>{MOCK_RESULT.pairDiagnostics.min_distance} / {MOCK_RESULT.pairDiagnostics.max_distance}</dd></div>
            <div><dt className="text-slate-400">P25 / P75</dt><dd>{MOCK_RESULT.pairDiagnostics.p25_distance} / {MOCK_RESULT.pairDiagnostics.p75_distance}</dd></div>
            <div><dt className="text-slate-400">Reused control units</dt><dd>{MOCK_RESULT.pairDiagnostics.n_pool_units_reused}</dd></div>
          </dl>
          <div className="mt-4">
            <ScatterChart width={400} height={200}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="pair index" />
              <YAxis type="number" dataKey="y" name="distance" />
              <Tooltip />
              <ReferenceLine y={MOCK_RESULT.pairDiagnostics.mean_distance} stroke="#f59e0b" strokeDasharray="4 4" />
              <Scatter data={Array.from({ length: 20 }, (_, i) => ({ x: i, y: Math.random() * 0.15 }))} fill="#2563eb" />
            </ScatterChart>
          </div>
        </div>
      )}

      {tab === "matched_data" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400">
                  {MOCK_RESULT.matchedPreview.columns.map((c) => <th key={c} className="px-2 py-1">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {MOCK_RESULT.matchedPreview.rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {MOCK_RESULT.matchedPreview.columns.map((c) => <td key={c} className="px-2 py-1">{String((row as Record<string, unknown>)[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button disabled title="Wired to real download endpoint in Phase C" className="mt-3 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-400">
            Download CSV (Phase C)
          </button>
        </div>
      )}
    </div>
  );
}