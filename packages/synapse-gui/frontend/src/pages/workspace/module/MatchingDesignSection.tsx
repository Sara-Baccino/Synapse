/**
 * synapse-gui frontend MatchingDesignSection
 * ---------------------------------------------------
 *
 * Same 6-tab layout as Phase A, but state now lives in
 * WorkspaceContext.matchingDesign instead of local component state, so
 * PipelineViewSection can read it to build the real MatchingModuleConfig.
 */

import { useState } from "react";

import { useWorkspace } from "../../../context/WorkspaceContext";
import type { MatchingDesignState, BalanceMetricType } from "../../../context/WorkspaceContext";

type Tab = "population" | "covariates" | "representation" | "constraints" | "distance_strategy" | "diagnostics";

const TABS: { id: Tab; label: string }[] = [
  { id: "population", label: "Population" },
  { id: "covariates", label: "Covariates" },
  { id: "representation", label: "Representation" },
  { id: "constraints", label: "Constraints" },
  { id: "distance_strategy", label: "Distance & Strategy" },
  { id: "diagnostics", label: "Diagnostics" },
];

const ALL_BALANCE_METRICS: BalanceMetricType[] = [
  "smd",
  "variance_ratio",
  "ks_test",
  "chi_square",
  "jensen_shannon",
];

export function MatchingDesignSection() {
  const [tab, setTab] = useState<Tab>("population");
  const { populationSelection, matchingDesign, setMatchingDesign } = useWorkspace();

  const isHungarian = matchingDesign.matchingAlgorithm === "optimal_hungarian";

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
            <select
              value={matchingDesign.matchingDirection}
              onChange={(e) => setMatchingDesign({ matchingDirection: e.target.value as MatchingDesignState["matchingDirection"] })}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="treated_to_control">Treated → Control (ATT)</option>
              <option value="control_to_treated">Control → Treated (ATC)</option>
            </select>
          </div>
        )}

        {tab === "covariates" && (
          <div>
            <p className="text-sm text-slate-500">Matching covariates (set in Data):</p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              {populationSelection?.matchingCovariates.join(", ") || "None selected yet"}
            </p>
          </div>
        )}

        {tab === "representation" && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" checked={matchingDesign.usePropensityScore}
                onChange={(e) => setMatchingDesign({ usePropensityScore: e.target.checked, matchingSpace: e.target.checked ? matchingDesign.matchingSpace : "covariates_only" })}
              />
              Use propensity score
            </label>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Matching space</label>
              <select
                value={matchingDesign.matchingSpace} disabled={!matchingDesign.usePropensityScore}
                onChange={(e) => setMatchingDesign({ matchingSpace: e.target.value as MatchingDesignState["matchingSpace"] })}
                className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="covariates_only">Covariates only</option>
                {matchingDesign.usePropensityScore && <option value="ps_only">Propensity score only</option>}
                {matchingDesign.usePropensityScore && <option value="logit_ps_only">Logit propensity score only</option>}
                {matchingDesign.usePropensityScore && <option value="hybrid_covariates_and_ps">Covariates + propensity score</option>}
              </select>
            </div>
          </div>
        )}

        {tab === "constraints" && (
          <p className="text-sm text-slate-500">Exact match / stratification covariates — not yet wired to config (Phase C follow-up).</p>
        )}

        {tab === "distance_strategy" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Distance metric</label>
              <select
                value={matchingDesign.distanceMetric}
                onChange={(e) => setMatchingDesign({ distanceMetric: e.target.value as MatchingDesignState["distanceMetric"] })}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="euclidean">Euclidean</option>
                <option value="mahalanobis">Mahalanobis</option>
                <option value="gower">Gower</option>
                <option value="weighted_hybrid">Weighted hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Matching algorithm</label>
              <select
                value={matchingDesign.matchingAlgorithm}
                onChange={(e) => {
                  const algorithm = e.target.value as MatchingDesignState["matchingAlgorithm"];
                  setMatchingDesign({ matchingAlgorithm: algorithm, allowReplacement: algorithm === "optimal_hungarian" ? false : matchingDesign.allowReplacement });
                }}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="greedy_nn">Nearest Neighbor</option>
                <option value="optimal_hungarian">Optimal (Hungarian)</option>
              </select>
            </div>
            <label className={`flex items-center gap-2 text-sm ${isHungarian ? "opacity-40" : ""}`}>
              <input
                type="checkbox" checked={!isHungarian && matchingDesign.allowReplacement} disabled={isHungarian}
                onChange={(e) => setMatchingDesign({ allowReplacement: e.target.checked })}
              />
              Allow replacement {isHungarian && "(not available for Hungarian)"}
            </label>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Caliper (optional)</label>
              <input
                value={matchingDesign.caliperValue} onChange={(e) => setMatchingDesign({ caliperValue: e.target.value })}
                placeholder="e.g. 0.2" className="w-32 rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {tab === "diagnostics" && (
          <div className="space-y-2">
            {ALL_BALANCE_METRICS.map((metric) => (
              <label key={metric} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox" checked={matchingDesign.balanceMetrics.includes(metric)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...matchingDesign.balanceMetrics, metric]
                      : matchingDesign.balanceMetrics.filter((m) => m !== metric);
                    setMatchingDesign({ balanceMetrics: next });
                  }}
                />
                {metric}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}