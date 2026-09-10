/**
 * synapse-gui frontend ResultsSection
 * ---------------------------------------------
 *
 * 6 internal tabs: Matching summary / Balance / Overlap / Pair
 * diagnostics / Matched data / Analysis configuration. Connected to the
 * real POST /matching/run outcome (via WorkspaceContext.currentRunId ->
 * useMatchingRun -> GET /matching/jobs/{id}/result), no mock data.
 * "Analysis configuration" replaces the old, static Pipeline step: it
 * reads the real config/provenance registered on the run's own
 * AnalysisResult, not hardcoded strings.
 */

import { useState } from "react";
import { useWorkspace } from "../../../context/WorkspaceContext";
import { useMatchingRun } from "../../../hooks/useMatchingRun";
import { buildMatchingDownloadUrl, buildMatchingReportUrl, downloadAuthenticatedFile } from "../../../api/client";

type Tab = "summary" | "balance" | "overlap" | "pairs" | "matched_data" | "config";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Matching summary" },
  { id: "balance", label: "Balance" },
  { id: "overlap", label: "Overlap" },
  { id: "pairs", label: "Pair diagnostics" },
  { id: "matched_data", label: "Matched data" },
  { id: "config", label: "Analysis configuration" },
];

function metricNumber(metrics: Record<string, unknown>, key: string): number | null {
  const value = metrics[key];
  return typeof value === "number" ? value : null;
}

export function ResultsSection() {
  const { runs, currentRunId } = useWorkspace();
  const [tab, setTab] = useState<Tab>("summary");

  const currentRun = runs.find((r) => r.id === currentRunId);
  const { statusQuery, resultQuery, isFinished } = useMatchingRun(currentRun?.jobId ?? null);

  if (!currentRun) {
    return (
      <div className="p-6 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
        Nessun run eseguito. Vai su <strong>Design</strong> e premi "Run Analysis" per generare dei risultati.
      </div>
    );
  }

  const jobStatus = statusQuery.data?.status;

  if (jobStatus === "failed") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-800 mb-4">Results</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Il job è terminato con un errore: {statusQuery.data?.progress?.message || "errore sconosciuto."}
        </div>
      </div>
    );
  }

  if (!isFinished) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-800 mb-4">Results</h1>
        <p className="text-sm text-slate-500 animate-pulse">
          {statusQuery.data?.progress?.message || "Esecuzione del matching in corso..."}
        </p>
      </div>
    );
  }

  if (resultQuery.isLoading) {
    return <p className="text-sm text-slate-500 animate-pulse">Caricamento risultati...</p>;
  }
  if (resultQuery.isError || !resultQuery.data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Impossibile recuperare i risultati del run.
      </div>
    );
  }

  const result = resultQuery.data;

  if (!result.success) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-800 mb-4">Results</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Il matching è terminato senza produrre un risultato valido: {result.error || "errore sconosciuto."}
        </div>
      </div>
    );
  }

  const metrics = result.metrics;
  const nMatched = metricNumber(metrics, "n_query_matched") ?? 0;
  const nUnmatched = metricNumber(metrics, "n_query_unmatched") ?? 0;
  const matchRate = metricNumber(metrics, "match_rate");
  const nSelected = metricNumber(metrics, "n_pool_units_selected");

  const balanceTable = result.tables.find((t) => t.name === "balance_table");
  const matchedDataset = result.datasets.find((d) => d.name === "matched_dataset");

  const commonSupportEntries = Object.keys(metrics)
    .filter((key) => key.startsWith("common_support_min__"))
    .map((minKey) => {
      const stratum = minKey.replace("common_support_min__", "");
      return {
        stratum,
        min: metricNumber(metrics, minKey),
        max: metricNumber(metrics, `common_support_max__${stratum}`),
      };
    });

  const pairMetrics = {
    n_pairs: metricNumber(metrics, "pair_n_pairs"),
    mean_distance: metricNumber(metrics, "pair_mean_distance"),
    median_distance: metricNumber(metrics, "pair_median_distance"),
    min_distance: metricNumber(metrics, "pair_min_distance"),
    max_distance: metricNumber(metrics, "pair_max_distance"),
    p25_distance: metricNumber(metrics, "pair_p25_distance"),
    p75_distance: metricNumber(metrics, "pair_p75_distance"),
    n_pool_units_reused: metricNumber(metrics, "pair_n_pool_units_reused"),
  };
  const hasPairDiagnostics = pairMetrics.n_pairs !== null;

  const moduleConfig = (result.config?.module_config ?? {}) as Record<string, any>;
  const dataConfigColumns = ((result.config?.data_config as any)?.columns ?? []) as Array<Record<string, any>>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Results</h1>
      <p className="mb-4 text-sm text-slate-500">Showing: {currentRun.label}</p>

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
            <div><dt className="text-slate-400">Initial units (query)</dt><dd className="font-medium text-slate-800">{nMatched + nUnmatched}</dd></div>
            <div><dt className="text-slate-400">Matched</dt><dd className="font-medium text-slate-800">{nMatched}</dd></div>
            <div><dt className="text-slate-400">Unmatched</dt><dd className="font-medium text-slate-800">{nUnmatched}</dd></div>
            <div><dt className="text-slate-400">Match rate</dt><dd className="font-medium text-slate-800">{matchRate !== null ? `${(matchRate * 100).toFixed(1)}%` : "-"}</dd></div>
            {nSelected !== null && (
              <div><dt className="text-slate-400">Pool units selected (population-level)</dt><dd className="font-medium text-slate-800">{nSelected}</dd></div>
            )}
          </dl>
        </div>
      )}

      {tab === "balance" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-700">SMD before / after</h2>
          {!balanceTable || balanceTable.preview.length === 0 ? (
            <p className="text-xs text-slate-400">Diagnostica di bilanciamento non calcolata per questo run.</p>
          ) : (
            <div className="space-y-2">
              {balanceTable.preview.map((row: any, i: number) => (
                <div key={`${row.variable}-${i}`} className="flex items-center gap-3 text-xs">
                  <span className="w-32 text-slate-600 truncate" title={row.variable}>
                    {row.variable}{!row.is_matching_covariate && <span className="ml-1 text-slate-400">(eval)</span>}
                  </span>
                  <div className="relative h-4 flex-1 bg-slate-100 rounded">
                    <div className="absolute top-0 h-4 w-px bg-slate-400" style={{ left: "50%" }} />
                    <div className="absolute top-0 h-4 w-2 rounded-full bg-red-400" style={{ left: `${50 + (row.smd_before ?? 0) * 40}%` }} title={`before: ${row.smd_before}`} />
                    <div className="absolute top-0 h-4 w-2 rounded-full bg-blue-600" style={{ left: `${50 + (row.smd_after ?? 0) * 40}%` }} title={`after: ${row.smd_after}`} />
                  </div>
                  <span className="w-24 text-right text-slate-500">{(row.smd_before ?? 0).toFixed(2)} → {(row.smd_after ?? 0).toFixed(2)}</span>
                </div>
              ))}
              <p className="mt-3 text-xs text-slate-400"><span className="text-red-400">●</span> before &nbsp; <span className="text-blue-600">●</span> after</p>
            </div>
          )}
        </div>
      )}

      {tab === "overlap" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {commonSupportEntries.length === 0 ? (
            <p className="text-xs text-slate-400">Diagnostica di overlap non calcolata per questo run (richiede propensity score).</p>
          ) : (
            <table className="min-w-full text-left text-sm divide-y divide-slate-200">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <th className="px-3 py-2">Strato</th>
                  <th className="px-3 py-2">Common support (min–max)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commonSupportEntries.map((e) => (
                  <tr key={e.stratum}>
                    <td className="px-3 py-2 font-mono text-xs">{e.stratum}</td>
                    <td className="px-3 py-2">{e.min?.toFixed(3)} – {e.max?.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "pairs" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {!hasPairDiagnostics ? (
            <p className="text-xs text-slate-400">Diagnostica pair-level non calcolata per questo run (o algoritmo population-level senza coppie).</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-400">Pairs</dt><dd>{pairMetrics.n_pairs}</dd></div>
              <div><dt className="text-slate-400">Mean distance</dt><dd>{pairMetrics.mean_distance?.toFixed(3)}</dd></div>
              <div><dt className="text-slate-400">Median distance</dt><dd>{pairMetrics.median_distance?.toFixed(3)}</dd></div>
              <div><dt className="text-slate-400">Min / Max</dt><dd>{pairMetrics.min_distance?.toFixed(3)} / {pairMetrics.max_distance?.toFixed(3)}</dd></div>
              <div><dt className="text-slate-400">P25 / P75</dt><dd>{pairMetrics.p25_distance?.toFixed(3)} / {pairMetrics.p75_distance?.toFixed(3)}</dd></div>
              <div><dt className="text-slate-400">Reused control units</dt><dd>{pairMetrics.n_pool_units_reused}</dd></div>
            </dl>
          )}
        </div>
      )}

      {tab === "matched_data" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {!matchedDataset ? (
            <p className="text-xs text-slate-400">Nessun dataset matchato disponibile per questo run.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400">
                      {matchedDataset.columns.map((c) => <th key={c} className="px-2 py-1">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matchedDataset.preview.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {matchedDataset.columns.map((c) => <td key={c} className="px-2 py-1">{String((row as Record<string, unknown>)[c] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-slate-400">{matchedDataset.n_rows} righe totali, anteprima limitata.</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => downloadAuthenticatedFile(buildMatchingDownloadUrl(currentRun.jobId, "datasets", "matched_dataset"), "matched_dataset.csv")}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Download matched dataset (CSV)
                </button>
                <button
                  onClick={() => downloadAuthenticatedFile(buildMatchingReportUrl(currentRun.jobId), "synapse_report.pdf")}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Download report (PDF)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "config" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Execution summary</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              <div><dt className="text-slate-400">Matching direction</dt><dd className="font-mono">{moduleConfig.population?.matching_direction ?? "-"}</dd></div>
              <div><dt className="text-slate-400">Treatment column</dt><dd className="font-mono">{moduleConfig.population?.treatment_col ?? "-"}</dd></div>
              <div><dt className="text-slate-400">Propensity score</dt><dd className="font-mono">{String(moduleConfig.representation?.use_propensity_score ?? false)}</dd></div>
              <div><dt className="text-slate-400">Matching space</dt><dd className="font-mono">{moduleConfig.representation?.matching_space ?? "-"}</dd></div>
              <div><dt className="text-slate-400">Distance</dt><dd className="font-mono">{moduleConfig.distance?.distance_metric ?? "-"}</dd></div>
              <div><dt className="text-slate-400">Algorithm</dt><dd className="font-mono">{moduleConfig.strategy?.matching_algorithm ?? "-"}</dd></div>
              <div><dt className="text-slate-400">Replacement</dt><dd className="font-mono">{String(moduleConfig.strategy?.allow_replacement ?? false)}</dd></div>
              <div><dt className="text-slate-400">Caliper</dt><dd className="font-mono">{moduleConfig.strategy?.caliper_value ?? "none"}</dd></div>
              <div><dt className="text-slate-400">Exact-match covariates</dt><dd className="font-mono">{(moduleConfig.constraints?.exact_match_covariates ?? []).join(", ") || "none"}</dd></div>
            </dl>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Variables (data configuration used for this run)</h2>
            {dataConfigColumns.length === 0 ? (
              <p className="text-xs text-slate-400">Nessuna configurazione registrata per questo run.</p>
            ) : (
              <table className="min-w-full text-left text-xs divide-y divide-slate-200">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase">
                    <th className="px-2 py-1.5">Colonna</th>
                    <th className="px-2 py-1.5">Ruolo</th>
                    <th className="px-2 py-1.5">Imputazione</th>
                    <th className="px-2 py-1.5">Scaling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dataConfigColumns.map((col) => (
                    <tr key={col.name}>
                      <td className="px-2 py-1.5 font-mono">{col.name}</td>
                      <td className="px-2 py-1.5">{col.id ? "id" : col.categorical ? "categorical" : col.numerical ? "numerical" : "-"}</td>
                      <td className="px-2 py-1.5">{col.missing_data_management?.strategy === "impute" ? col.missing_data_management?.imputer : col.missing_data_management?.strategy}</td>
                      <td className="px-2 py-1.5">{col.scaling?.enabled ? col.scaling.method : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}