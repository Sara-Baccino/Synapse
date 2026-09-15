/**
 * synapse-gui frontend DataConfigTable
 * ---------------------------------------------
 * Reusable Data Config editor for ONE dataset: recap box (rows/columns/
 * numerical/categorical counts, live) + per-column table (active, role,
 * % missing, imputation, scaling, encoding, values & mapping for
 * categoricals). Generalized from the previously-orphaned ConfigSection.tsx
 * so it can be mounted once per dataset -- single dataset, or twice (A/B)
 * for the two-dataset workflow.
 *
 * A single "role" select (numerical / categorical / id) is used instead of
 * three independent checkboxes: ColumnInfo's own validators already forbid
 * a column from being both, or from having scaling enabled while
 * categorical / encoding enabled while numerical, so the UI should not be
 * able to construct an invalid combination in the first place.
 */

import { useState } from "react";
import type { ColumnInfoDTO, ColumnStatsDTO, EncoderType, MissingStrategy, ScalerType } from "../types/api";

const MISSING_STRATEGIES: MissingStrategy[] = ["maintain", "drop", "impute", "replace"];
const SCALER_METHODS: Exclude<ScalerType, "none">[] = ["standard", "minmax", "robust"];
const ENCODER_METHODS: Exclude<EncoderType, "none">[] = ["one_hot", "ordinal"];

type Role = "numerical" | "categorical" | "id";

function roleOf(column: ColumnInfoDTO): Role {
  if (column.id) return "id";
  if (column.categorical) return "categorical";
  return "numerical";
}

function applyRole(column: ColumnInfoDTO, role: Role): ColumnInfoDTO {
  return {
    ...column,
    id: role === "id",
    categorical: role === "categorical",
    numerical: role === "numerical",
    // Switching away from categorical/numerical must drop the
    // scaling/encoding that would no longer be valid for the new role
    // (ColumnInfo's validator would reject the combination otherwise).
    scaling: role === "numerical" ? column.scaling : { enabled: false, method: "none" },
    encoding: role === "categorical" ? column.encoding : { enabled: false, method: "none", order: null },
  };
}

function updateColumn(columns: ColumnInfoDTO[], name: string, updater: (c: ColumnInfoDTO) => ColumnInfoDTO): ColumnInfoDTO[] {
  return columns.map((c) => (c.name === name ? updater(c) : c));
}

export function toRawDataConfig(columns: ColumnInfoDTO[]): Record<string, unknown> {
  const rawColumns: Record<string, unknown> = {};
  for (const column of columns) {
    rawColumns[column.name] = {
      new_name: column.new_name, active: column.active, categorical: column.categorical,
      numerical: column.numerical, id: column.id, semantic_roles: column.semantic_roles,
      multiplier: column.multiplier, mappings: column.mappings,
      missing_data_management: column.missing_data_management,
      scaling: column.scaling, encoding: column.encoding, type: column.type,
    };
  }
  return { columns: rawColumns };
}

function ValuesAndMapping({ column, distinctValues, onChange }: {
  column: ColumnInfoDTO; distinctValues: string[]; onChange: (mappings: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (distinctValues.length === 0) {
    return <span className="text-xs text-slate-300">—</span>;
  }
  return (
    <div>
      <button onClick={() => setExpanded((v) => !v)} className="text-xs text-blue-600 hover:underline">
        {expanded ? "Hide" : `${distinctValues.length} values`}
      </button>
      {expanded && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs space-y-1">
          {distinctValues.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <span className="w-24 truncate text-slate-600" title={value}>{value}</span>
              <span className="text-slate-300">→</span>
              <input
                value={String(column.mappings[value] ?? "")}
                onChange={(e) => onChange({ ...column.mappings, [value]: e.target.value })}
                placeholder="(unmapped)"
                className="w-16 rounded border border-slate-300 px-1 py-0.5"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DataConfigTable({
  title, columns, columnStats, nRows, onColumnsChange,
}: {
  title: string;
  columns: ColumnInfoDTO[];
  columnStats: ColumnStatsDTO[];
  nRows: number;
  onColumnsChange: (columns: ColumnInfoDTO[]) => void;
}) {
  const statsByName = Object.fromEntries(columnStats.map((s) => [s.name, s]));
  const numericalCount = columns.filter((c) => c.numerical).length;
  const categoricalCount = columns.filter((c) => c.categorical).length;

  function set(name: string, updater: (c: ColumnInfoDTO) => ColumnInfoDTO) {
    onColumnsChange(updateColumn(columns, name, updater));
  }

  return (
    <div>
      {title && <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>}

      <div className="mb-3 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-4 shadow-sm">
        <div><p className="text-slate-400">Rows</p><p className="font-medium text-slate-800">{nRows}</p></div>
        <div><p className="text-slate-400">Columns</p><p className="font-medium text-slate-800">{columns.length}</p></div>
        <div><p className="text-slate-400">Numerical</p><p className="font-medium text-slate-800">{numericalCount}</p></div>
        <div><p className="text-slate-400">Categorical</p><p className="font-medium text-slate-800">{categoricalCount}</p></div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th className="px-3 py-2 font-medium">Column</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">% Missing</th>
              <th className="px-3 py-2 font-medium">Missing strategy</th>
              <th className="px-3 py-2 font-medium">Scaling</th>
              <th className="px-3 py-2 font-medium">Encoding</th>
              <th className="px-3 py-2 font-medium">Values &amp; mapping</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => {
              const stats = statsByName[column.name];
              const role = roleOf(column);
              return (
                <tr key={column.name} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{column.name}</td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={column.active} onChange={(e) => set(column.name, (c) => ({ ...c, active: e.target.checked }))} />
                  </td>
                  <td className="px-3 py-2">
                    <select value={role} onChange={(e) => set(column.name, (c) => applyRole(c, e.target.value as Role))} className="rounded border border-slate-300 px-2 py-1">
                      <option value="numerical">numerical</option>
                      <option value="categorical">categorical</option>
                      <option value="id">id</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 font-mono">{stats ? `${(stats.missing_pct * 100).toFixed(1)}%` : "-"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={column.missing_data_management.strategy}
                      onChange={(e) => set(column.name, (c) => ({ ...c, missing_data_management: { ...c.missing_data_management, strategy: e.target.value as MissingStrategy } }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {MISSING_STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox" checked={column.scaling.enabled} disabled={role !== "numerical"}
                        onChange={(e) => set(column.name, (c) => ({ ...c, scaling: { enabled: e.target.checked, method: e.target.checked ? "standard" : "none" } }))}
                      />
                      <select
                        value={column.scaling.method === "none" ? "standard" : column.scaling.method}
                        disabled={!column.scaling.enabled}
                        onChange={(e) => set(column.name, (c) => ({ ...c, scaling: { ...c.scaling, method: e.target.value as ScalerType } }))}
                        className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                      >
                        {SCALER_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox" checked={column.encoding.enabled} disabled={role !== "categorical"}
                        onChange={(e) => set(column.name, (c) => ({ ...c, encoding: { enabled: e.target.checked, method: e.target.checked ? "one_hot" : "none", order: null } }))}
                      />
                      <select
                        value={column.encoding.method === "none" ? "one_hot" : column.encoding.method}
                        disabled={!column.encoding.enabled}
                        onChange={(e) => set(column.name, (c) => ({ ...c, encoding: { ...c.encoding, method: e.target.value as EncoderType } }))}
                        className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                      >
                        {ENCODER_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {role === "categorical" ? (
                      <ValuesAndMapping
                        column={column} distinctValues={stats?.distinct_values ?? []}
                        onChange={(mappings) => set(column.name, (c) => ({ ...c, mappings }))}
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}