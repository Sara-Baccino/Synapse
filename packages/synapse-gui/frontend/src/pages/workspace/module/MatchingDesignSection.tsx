/**
 * synapse-gui frontend MatchingDesignSection
 * ---------------------------------------------------
 *
 * The MatchingModuleConfig sub-configs as internal tabs. State lives here
 * as the editable draft; "Run Analysis" is what actually builds the full
 * MatchingModuleConfig, writes it to WorkspaceContext (setModuleConfig,
 * for provenance/Compare Runs) and calls POST /matching/run.
 *
 * Covariates tab: a real, editable table (matching / diagnostic /
 * outcome / none per column) replaces the previous static, uneditable
 * list carried over from Data Loading. Candidate columns come from the
 * working dataset's own DataConfig (WorkspaceContext.dataConfigs),
 * not from the DataSection-derived default anymore -- that default is
 * only used to seed the initial "matching" selection. One-hot-encoded
 * categorical columns are expanded to their actual post-preprocessing
 * names (expandColumnToCovariateNames) for every role, not just
 * matching -- the same fix that resolved the "unable to find column"
 * crash applies equally to diagnostic/outcome covariates.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { runMatching } from "../../../api/client";
import { getWorkingDataset, useWorkspace } from "../../../context/WorkspaceContext";
import type { ColumnInfoDTO } from "../../../types/api";
import { expandColumnToCovariateNames } from "../../../utils/covariateExpansion";

type Tab = "population" | "covariates" | "representation" | "constraints" | "distance_strategy" | "diagnostics";
type CovariateRole = "matching" | "diagnostic" | "outcome" | "none";

const TABS: { id: Tab; label: string }[] = [
  { id: "population", label: "Population" },
  { id: "covariates", label: "Covariates" },
  { id: "representation", label: "Representation" },
  { id: "constraints", label: "Constraints" },
  { id: "distance_strategy", label: "Distance & Strategy" },
  { id: "diagnostics", label: "Diagnostics" },
];

function initialRole(column: ColumnInfoDTO, defaultMatchingCovariates: string[]): CovariateRole {
  const isDefaultMatching = defaultMatchingCovariates.some(
    (name) => name === column.name || name.startsWith(`${column.name}__`)
  );
  return isDefaultMatching ? "matching" : "none";
}

export function MatchingDesignSection() {
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const { populationSelection, dataConfigs, columnStats, setModuleConfig, addRun, runs } = useWorkspace();
  const workingDataset = getWorkingDataset(populationSelection);

  const candidateColumns: ColumnInfoDTO[] = workingDataset
    ? (dataConfigs[workingDataset.datasetId]?.columns ?? []).filter(
        (c) => c.active && !c.id && c.name !== workingDataset.treatmentColumn
      )
    : [];
  const stats = workingDataset ? columnStats[workingDataset.datasetId] ?? [] : [];

  const [tab, setTab] = useState<Tab>("population");

  const [covariateRoles, setCovariateRoles] = useState<Record<string, CovariateRole>>(() => {
    const roles: Record<string, CovariateRole> = {};
    for (const c of candidateColumns) roles[c.name] = initialRole(c, populationSelection?.matchingCovariates ?? []);
    return roles;
  });

  const [matchingDirection, setMatchingDirection] = useState<"treated_to_control" | "control_to_treated">("treated_to_control");
  const [usePropensityScore, setUsePropensityScore] = useState(true);
  const [matchingSpace, setMatchingSpace] = useState<"covariates_only" | "ps_only" | "logit_ps_only" | "hybrid_covariates_and_ps">("covariates_only");
  const [exactMatchCovariates, setExactMatchCovariates] = useState<Set<string>>(new Set());
  const [stratifiedMatching, setStratifiedMatching] = useState(false);
  const [distanceMetric, setDistanceMetric] = useState<"euclidean" | "mahalanobis" | "gower" | "weighted_hybrid">("euclidean");
  const [matchingAlgorithm, setMatchingAlgorithm] = useState<"greedy_nn" | "optimal_hungarian">("greedy_nn");
  const [allowReplacement, setAllowReplacement] = useState(false);
  const [caliperValue, setCaliperValue] = useState<string>("");
  const [balanceMetrics, setBalanceMetrics] = useState<Set<string>>(new Set(["smd"]));

  const [runError, setRunError] = useState<string | null>(null);

  const isHungarian = matchingAlgorithm === "optimal_hungarian";
  const caliperIsInvalid = caliperValue.trim() !== "" && Number.isNaN(Number(caliperValue));

  const matchingColumnNames = candidateColumns.filter((c) => covariateRoles[c.name] === "matching").map((c) => c.name);

  function buildModuleConfig(): Record<string, unknown> {
    const grouped: Record<CovariateRole, string[]> = { matching: [], diagnostic: [], outcome: [], none: [] };
    for (const column of candidateColumns) {
      const role = covariateRoles[column.name] ?? "none";
      grouped[role].push(...expandColumnToCovariateNames(column, stats));
    }
    return {
      population: { treatment_col: workingDataset!.treatmentColumn, matching_direction: matchingDirection },
      covariates: {
        matching_covariates: grouped.matching,
        evaluation_covariates: grouped.diagnostic,
        outcome_covariates: grouped.outcome,
      },
      representation: { use_propensity_score: usePropensityScore, matching_space: matchingSpace },
      constraints: {
        exact_match_covariates: Array.from(exactMatchCovariates),
        stratified_matching: stratifiedMatching,
      },
      distance: { distance_metric: distanceMetric },
      strategy: {
        matching_algorithm: matchingAlgorithm,
        allow_replacement: !isHungarian && allowReplacement,
        caliper_value: caliperValue.trim() !== "" ? Number(caliperValue) : null,
      },
      diagnostics: { balance_metrics: Array.from(balanceMetrics) },
    };
  }

  const runMutation = useMutation({
    mutationFn: async () => {
      const moduleConfig = buildModuleConfig();
      setModuleConfig(moduleConfig);
      const response = await runMatching({ dataset_id: workingDataset!.datasetId, module_config: moduleConfig });
      return { response, moduleConfig };
    },
    onSuccess: ({ response, moduleConfig }) => {
      setRunError(null);
      addRun({
        jobId: response.job_id,
        label: `Run ${runs.length + 1} · ${matchingAlgorithm} · ${distanceMetric}`,
        moduleConfigSnapshot: moduleConfig,
        populationSelectionSnapshot: populationSelection!,
      });
      navigate(`/workspace/modules/${moduleId || "matching"}/results`);
    },
    onError: (error: unknown) => {
      setRunError(error instanceof Error ? error.message : "Impossibile avviare il matching.");
    },
  });

  if (!workingDataset || candidateColumns.length === 0) {
    return (
      <div className="p-6 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
        Nessun dataset configurato. Torna alla scheda <strong>Data</strong> per selezionare la popolazione.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Matching Design</h1>

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

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {tab === "population" && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">Matching direction</label>
            <select value={matchingDirection} onChange={(e) => setMatchingDirection(e.target.value as typeof matchingDirection)} className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="treated_to_control">Treated → Control (ATT)</option>
              <option value="control_to_treated">Control → Treated (ATC)</option>
            </select>
            <p className="mt-2 text-xs text-slate-400">Colonna trattamento: <span className="font-mono">{workingDataset.treatmentColumn}</span></p>
          </div>
        )}

        {tab === "covariates" && (
          <div>
            <p className="mb-3 text-sm text-slate-500">
              Indica il ruolo di ciascuna variabile: <strong>matching</strong> (usata nella distanza/algoritmo),
              <strong> diagnostic</strong> (solo diagnostica di bilanciamento, non entra nel matching),
              <strong> outcome</strong> (endpoint, per analisi future), oppure nessuno.
            </p>
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase">
                  <th className="px-3 py-2">Column</th>
                  <th className="px-3 py-2">Role</th>
                </tr>
              </thead>
              <tbody>
                {candidateColumns.map((column) => (
                  <tr key={column.name} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-mono text-slate-700">{column.name}</td>
                    <td className="px-3 py-2">
                      <select
                        value={covariateRoles[column.name] ?? "none"}
                        onChange={(e) => {
                          const role = e.target.value as CovariateRole;
                          setCovariateRoles((prev) => ({ ...prev, [column.name]: role }));
                          if (role !== "matching") {
                            setExactMatchCovariates((prev) => {
                              if (!prev.has(column.name)) return prev;
                              const next = new Set(prev);
                              next.delete(column.name);
                              return next;
                            });
                          }
                        }}
                        className="rounded border border-slate-300 px-2 py-1"
                      >
                        <option value="matching">matching</option>
                        <option value="diagnostic">diagnostic</option>
                        <option value="outcome">outcome</option>
                        <option value="none">none</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "representation" && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={usePropensityScore} onChange={(e) => setUsePropensityScore(e.target.checked)} />
              Use propensity score
            </label>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Matching space</label>
              <select
                value={matchingSpace} disabled={!usePropensityScore && matchingSpace !== "covariates_only"}
                onChange={(e) => setMatchingSpace(e.target.value as typeof matchingSpace)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="covariates_only">Covariates only</option>
                {usePropensityScore && <option value="ps_only">Propensity score only</option>}
                {usePropensityScore && <option value="logit_ps_only">Logit propensity score only</option>}
                {usePropensityScore && <option value="hybrid_covariates_and_ps">Covariates + propensity score</option>}
              </select>
            </div>
          </div>
        )}

        {tab === "constraints" && (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-sm text-slate-600">Exact-match covariates (hard constraint) — solo tra le variabili di ruolo "matching"</p>
              <div className="flex flex-wrap gap-3 rounded border border-slate-200 p-3 bg-slate-50">
                {matchingColumnNames.length === 0 && <span className="text-xs text-slate-400">Nessuna covariata di matching selezionata.</span>}
                {matchingColumnNames.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exactMatchCovariates.has(c)}
                      onChange={(e) =>
                        setExactMatchCovariates((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c); else next.delete(c);
                          return next;
                        })
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={stratifiedMatching} onChange={(e) => setStratifiedMatching(e.target.checked)} />
              Stratified matching {exactMatchCovariates.size === 0 && "(seleziona almeno una covariata sopra per avere effetto)"}
            </label>
          </div>
        )}

        {tab === "distance_strategy" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Distance metric</label>
              <select value={distanceMetric} onChange={(e) => setDistanceMetric(e.target.value as typeof distanceMetric)} className="rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="euclidean">Euclidean</option>
                <option value="mahalanobis">Mahalanobis</option>
                <option value="gower">Gower</option>
                <option value="weighted_hybrid">Weighted hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Matching algorithm</label>
              <select value={matchingAlgorithm} onChange={(e) => setMatchingAlgorithm(e.target.value as typeof matchingAlgorithm)} className="rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="greedy_nn">Nearest Neighbor</option>
                <option value="optimal_hungarian">Optimal (Hungarian)</option>
              </select>
            </div>
            <label className={`flex items-center gap-2 text-sm ${isHungarian ? "opacity-40" : ""}`}>
              <input type="checkbox" checked={!isHungarian && allowReplacement} disabled={isHungarian} onChange={(e) => setAllowReplacement(e.target.checked)} />
              Allow replacement {isHungarian && "(not available for Hungarian)"}
            </label>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Caliper (optional)</label>
              <input
                value={caliperValue} onChange={(e) => setCaliperValue(e.target.value)} placeholder="e.g. 0.2"
                className={`w-32 rounded border px-3 py-2 text-sm ${caliperIsInvalid ? "border-red-400" : "border-slate-300"}`}
              />
              {caliperIsInvalid && <p className="mt-1 text-xs text-red-600">Valore non numerico.</p>}
            </div>
          </div>
        )}

        {tab === "diagnostics" && (
          <div className="space-y-2">
            {["smd", "variance_ratio", "ks_test", "chi_square", "jensen_shannon"].map((metric) => (
              <label key={metric} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox" checked={balanceMetrics.has(metric)}
                  onChange={(e) =>
                    setBalanceMetrics((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(metric); else next.delete(metric);
                      return next;
                    })
                  }
                />
                {metric}
              </label>
            ))}
          </div>
        )}
      </div>

      {matchingColumnNames.length === 0 && (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          Nessuna variabile con ruolo "matching": serve almeno una per poter eseguire il run.
        </p>
      )}
      {runError && <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{runError}</p>}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending || caliperIsInvalid || matchingColumnNames.length === 0}
          className="rounded bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runMutation.isPending ? "Avvio in corso..." : "Run Analysis →"}
        </button>
      </div>
    </div>
  );
}