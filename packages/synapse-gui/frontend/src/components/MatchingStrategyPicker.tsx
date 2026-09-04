import type { StrategyConfig, DistanceConfig } from "../types/api";

interface Props {
  strategyConfig: StrategyConfig;
  onStrategyChange: (config: StrategyConfig) => void;
  distanceConfig: DistanceConfig;
  onDistanceChange: (config: DistanceConfig) => void;
  disabled?: boolean;
}

const MATCHING_ALGORITHMS: { value: NonNullable<StrategyConfig["matching_algorithm"]>; label: string }[] = [
  { value: "greedy_nn", label: "Greedy Nearest Neighbor" },
  { value: "optimal_hungarian", label: "Optimal (Hungarian)" },
  { value: "optimal_transport_sinkhorn", label: "Optimal Transport (Sinkhorn)" },
  { value: "full_matching", label: "Full Matching" },
];

const DISTANCE_METRICS: { value: NonNullable<DistanceConfig["distance_metric"]>; label: string }[] = [
  { value: "euclidean", label: "Euclidean" },
  { value: "mahalanobis", label: "Mahalanobis" },
  { value: "gower", label: "Gower (Mixed types)" },
  { value: "ps_logit", label: "Propensity Score Logit" },
  { value: "weighted_hybrid", label: "Weighted Hybrid" },
];

export function MatchingStrategyPicker({
  strategyConfig,
  onStrategyChange,
  distanceConfig,
  onDistanceChange,
  disabled,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Matching Algorithm */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Matching Algorithm</span>
          <select
            value={strategyConfig.matching_algorithm ?? "greedy_nn"}
            disabled={disabled}
            onChange={(e) =>
              onStrategyChange({
                ...strategyConfig,
                matching_algorithm: e.target.value as StrategyConfig["matching_algorithm"],
              })
            }
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 bg-white"
          >
            {MATCHING_ALGORITHMS.map((algo) => (
              <option key={algo.value} value={algo.value}>
                {algo.label}
              </option>
            ))}
          </select>
        </label>

        {/* Distance Metric */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Distance Metric</span>
          <select
            value={distanceConfig.distance_metric ?? "euclidean"}
            disabled={disabled}
            onChange={(e) =>
              onDistanceChange({
                ...distanceConfig,
                distance_metric: e.target.value as DistanceConfig["distance_metric"],
              })
            }
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 bg-white"
          >
            {DISTANCE_METRICS.map((metric) => (
              <option key={metric.value} value={metric.value}>
                {metric.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Matching Ratio K */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Matching Ratio (K controls per treated)</span>
          <input
            type="number"
            min={1}
            max={10}
            value={strategyConfig.matching_ratio_k ?? 1}
            disabled={disabled}
            onChange={(e) =>
              onStrategyChange({
                ...strategyConfig,
                matching_ratio_k: Number(e.target.value),
              })
            }
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 bg-white"
          />
        </label>

        {/* Caliper Value */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Caliper Value (Optional)</span>
          <input
            type="number"
            step="0.05"
            placeholder="No caliper"
            value={strategyConfig.caliper_value ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onStrategyChange({
                ...strategyConfig,
                caliper_value: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 bg-white"
          />
        </label>
      </div>

      {/* Allow Replacement Checkbox */}
      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          id="allow-replacement"
          checked={strategyConfig.allow_replacement ?? false}
          disabled={disabled}
          onChange={(e) =>
            onStrategyChange({
              ...strategyConfig,
              allow_replacement: e.target.checked,
            })
          }
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="allow-replacement" className="text-sm font-medium text-slate-700">
          Allow control unit replacement (match controls to multiple treated units)
        </label>
      </div>
    </div>
  );
}