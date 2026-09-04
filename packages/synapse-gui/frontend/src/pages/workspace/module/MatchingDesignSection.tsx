/**
 * synapse-gui frontend MatchingDesignSection
 * ---------------------------------------------------
 *
 * The 7 MatchingModuleConfig sub-configs as internal tabs, not separate
 * routes. State lives here (not yet wired to /matching/run -- that
 * happens in PipelineViewSection once this section's config is read
 * from WorkspaceContext in Phase C). For Phase A, purely local state to
 * verify the layout.
 */

import { useState } from "react";

type Tab = "population" | "covariates" | "representation" | "constraints" | "distance_strategy" | "diagnostics";

const TABS: { id: Tab; label: string }[] = [
  { id: "population", label: "Population" },
  { id: "covariates", label: "Covariates" },
  { id: "representation", label: "Representation" },
  { id: "constraints", label: "Constraints" },
  { id: "distance_strategy", label: "Distance & Strategy" },
  { id: "diagnostics", label: "Diagnostics" },
];

export function MatchingDesignSection() {
  const [tab, setTab] = useState<Tab>("population");

  const [matchingDirection, setMatchingDirection] = useState<"treated_to_control" | "control_to_treated">("treated_to_control");
  const [usePropensityScore, setUsePropensityScore] = useState(true);
  const [matchingSpace, setMatchingSpace] = useState<"covariates_only" | "ps_only" | "logit_ps_only" | "hybrid_covariates_and_ps">("covariates_only");
  const [distanceMetric, setDistanceMetric] = useState<"euclidean" | "mahalanobis" | "gower" | "weighted_hybrid">("euclidean");
  const [matchingAlgorithm, setMatchingAlgorithm] = useState<"greedy_nn" | "optimal_hungarian">("greedy_nn");
  const [allowReplacement, setAllowReplacement] = useState(false);
  const [caliperValue, setCaliperValue] = useState<string>("");
  const [balanceMetrics, setBalanceMetrics] = useState<Set<string>>(new Set(["smd"]));

  // Dynamic UI: some params are only meaningful for certain algorithms.
  const isHungarian = matchingAlgorithm === "optimal_hungarian";

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
          </div>
        )}

        {tab === "covariates" && (
          <p className="text-sm text-slate-500">Matching/evaluation covariates are set in the Data section.</p>
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
          <p className="text-sm text-slate-500">Exact match / stratification covariates — set here in Phase C.</p>
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
            {/* Dynamic: replacement is disabled for Hungarian (unique assignment). */}
            <label className={`flex items-center gap-2 text-sm ${isHungarian ? "opacity-40" : ""}`}>
              <input type="checkbox" checked={!isHungarian && allowReplacement} disabled={isHungarian} onChange={(e) => setAllowReplacement(e.target.checked)} />
              Allow replacement {isHungarian && "(not available for Hungarian)"}
            </label>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Caliper (optional)</label>
              <input value={caliperValue} onChange={(e) => setCaliperValue(e.target.value)} placeholder="e.g. 0.2" className="w-32 rounded border border-slate-300 px-3 py-2 text-sm" />
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
    </div>
  );
}