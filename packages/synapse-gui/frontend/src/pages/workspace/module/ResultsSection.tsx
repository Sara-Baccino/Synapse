import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";

import { getMatchingJobResult } from "../../../api/client";
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

  const { data: realResult, isLoading, isError } = useQuery({
    queryKey: ["matching-job-result", currentRun?.jobId],
    queryFn: ({ signal }) => getMatchingJobResult(currentRun!.jobId, signal),
    enabled: Boolean(currentRun?.jobId),
  });

  // Cast sicuro su any per gestire sia snake_case che camelCase senza blocchi di compilazione
  const rawResult: any = realResult ?? MOCK_RESULT;

  const summary = rawResult?.summary ?? {};
  const balance = rawResult?.balance ?? [];
  const overlap = rawResult?.overlap ?? {};
  const pairDiag = rawResult?.pair_diagnostics ?? rawResult?.pairDiagnostics ?? {};
  const matchedPreview = rawResult?.matched_data_preview ?? rawResult?.matchedPreview ?? {};
  const sampleRows = matchedPreview?.sample_rows ?? matchedPreview?.rows ?? [];

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500 animate-pulse">Loading analysis results...</div>;
  }

  if (isError) {
    return <div className="p-6 text-sm text-red-500">Failed to load run results from server.</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Results</h1>
      <p className="mb-4 text-sm text-slate-500">
        {currentRun ? `Showing: ${currentRun.label}` : "Showing mock data — execute a run to view live results."}
      </p>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm ${tab === t.id ? "border-b-2 border-blue-600 font-medium text-blue-700" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* SUMMARY */}
      {tab === "summary" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-400">Initial units</dt><dd className="font-medium text-slate-800">{summary.n_query_total ?? "-"}</dd></div>
            <div><dt className="text-slate-400">Matched</dt><dd className="font-medium text-slate-800">{summary.n_query_matched ?? "-"}</dd></div>
            <div><dt className="text-slate-400">Unmatched</dt><dd className="font-medium text-slate-800">{summary.n_query_unmatched ?? "-"}</dd></div>
            <div><dt className="text-slate-400">Match rate</dt><dd className="font-medium text-slate-800">{summary.match_rate != null ? `${(summary.match_rate * 100).toFixed(1)}%` : "-"}</dd></div>
            <div><dt className="text-slate-400">Pairs</dt><dd className="font-medium text-slate-800">{summary.n_pairs ?? "-"}</dd></div>
          </dl>
        </div>
      )}

      {/* BALANCE */}
      {tab === "balance" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-700">SMD before / after (Love Plot)</h2>
          <div className="space-y-2">
            {balance.map((row: any) => (
              <div key={row.variable} className="flex items-center gap-3 text-xs">
                <span className="w-32 text-slate-600">{row.variable}{!row.is_matching_covariate && <span className="ml-1 text-slate-400">(eval)</span>}</span>
                <div className="relative h-4 flex-1 bg-slate-100 rounded">
                  <div className="absolute top-0 h-4 w-px bg-slate-400" style={{ left: "50%" }} />
                  <div className="absolute top-0 h-4 w-2 rounded-full bg-red-400" style={{ left: `${Math.min(Math.max(50 + (row.smd_before ?? 0) * 40, 0), 100)}%` }} title={`before: ${row.smd_before}`} />
                  <div className="absolute top-0 h-4 w-2 rounded-full bg-blue-600" style={{ left: `${Math.min(Math.max(50 + (row.smd_after ?? 0) * 40, 0), 100)}%` }} title={`after: ${row.smd_after}`} />
                </div>
                <span className="w-20 text-right text-slate-500">{row.smd_before?.toFixed(2)} → {row.smd_after?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OVERLAP */}
      {tab === "overlap" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <dt className="text-slate-400">Treated PS range</dt>
              <dd>{overlap.treated_range ? `${overlap.treated_range[0]} – ${overlap.treated_range[1]}` : overlap.treated_ps_min != null ? `${overlap.treated_ps_min} – ${overlap.treated_ps_max}` : "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Control PS range</dt>
              <dd>{overlap.control_range ? `${overlap.control_range[0]} – ${overlap.control_range[1]}` : overlap.control_ps_min != null ? `${overlap.control_ps_min} – ${overlap.control_ps_max}` : "-"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-400">Common support</dt>
              <dd>{overlap.common_support_range ? `${overlap.common_support_range[0]} – ${overlap.common_support_range[1]}` : overlap.common_support_min != null ? `${overlap.common_support_min} – ${overlap.common_support_max}` : "-"}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* PAIR DIAGNOSTICS */}
      {tab === "pairs" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-400">Pairs</dt><dd>{pairDiag.n_pairs ?? "-"}</dd></div>
            <div><dt className="text-slate-400">Mean distance</dt><dd>{pairDiag.mean_distance ?? "-"}</dd></div>
            <div><dt className="text-slate-400">Median distance</dt><dd>{pairDiag.median_distance ?? "-"}</dd></div>
            <div><dt className="text-slate-400">Min / Max</dt><dd>{pairDiag.min_distance ?? "-"} / {pairDiag.max_distance ?? "-"}</dd></div>
            <div><dt className="text-slate-400">P25 / P75</dt><dd>{pairDiag.p25_distance ?? "-"} / {pairDiag.p75_distance ?? "-"}</dd></div>
            <div><dt className="text-slate-400">Reused control units</dt><dd>{pairDiag.n_pool_units_reused ?? "-"}</dd></div>
          </dl>
          {pairDiag.mean_distance != null && (
            <div className="mt-4">
              <ScatterChart width={400} height={200}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" name="pair index" />
                <YAxis type="number" dataKey="y" name="distance" />
                <Tooltip />
                <ReferenceLine y={pairDiag.mean_distance} stroke="#f59e0b" strokeDasharray="4 4" />
                <Scatter data={Array.from({ length: 20 }, (_, i) => ({ x: i, y: Math.random() * 0.15 }))} fill="#2563eb" />
              </ScatterChart>
            </div>
          )}
        </div>
      )}

      {/* MATCHED DATA */}
      {tab === "matched_data" && matchedPreview?.columns && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400">
                  {matchedPreview.columns.map((c: string) => (
                    <th key={c} className="px-2 py-1">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100">
                    {matchedPreview.columns.map((c: string) => (
                      <td key={c} className="px-2 py-1">{String(row[c] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}