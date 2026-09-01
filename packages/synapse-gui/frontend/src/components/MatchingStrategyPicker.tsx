import type { ClusteringAlgorithmName } from "../types/api";

const CLUSTERING_ALGORITHMS: ClusteringAlgorithmName[] = ["kmeans", "hdbscan", "agglomerative", "gmm", "fuzzy_cmeans"];

interface Props {
  algorithm: ClusteringAlgorithmName;
  onAlgorithmChange: (a: ClusteringAlgorithmName) => void;
  primaryParam: number;
  onPrimaryParamChange: (n: number) => void;
  includeProjection: boolean;
  onIncludeProjectionChange: (v: boolean) => void;
  disabled?: boolean;
}

export function ClusteringAlgorithmPicker({
  algorithm, onAlgorithmChange, primaryParam, onPrimaryParamChange,
  includeProjection, onIncludeProjectionChange, disabled,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="block">
        <span className="text-sm text-slate-600">Clustering algorithm</span>
        <select value={algorithm} disabled={disabled} onChange={(e) => onAlgorithmChange(e.target.value as ClusteringAlgorithmName)}
          className="mt-1 block rounded border border-slate-300 px-3 py-2 disabled:opacity-50">
          {CLUSTERING_ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">{algorithm === "hdbscan" ? "Min cluster size" : "Number of clusters"}</span>
        <input type="number" min={2} value={primaryParam} disabled={disabled}
          onChange={(e) => onPrimaryParamChange(Number(e.target.value))}
          className="mt-1 block w-32 rounded border border-slate-300 px-3 py-2 disabled:opacity-50" />
      </label>
      <label className="flex items-center gap-2 pb-2">
        <input type="checkbox" checked={includeProjection} disabled={disabled} onChange={(e) => onIncludeProjectionChange(e.target.checked)} />
        <span className="text-sm text-slate-600">Include 2D PCA projection</span>
      </label>
    </div>
  );
}