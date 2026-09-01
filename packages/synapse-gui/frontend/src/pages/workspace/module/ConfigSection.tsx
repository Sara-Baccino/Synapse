import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getDataset, parseConfig } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";
import type {
  ColumnInfoDTO,
  ConfigValidationDTO,
  EncoderType,
  MissingStrategy,
  ScalerType,
} from "../../../types/api";

const MISSING_STRATEGIES: MissingStrategy[] = ["maintain", "drop", "impute", "replace"];
const SCALER_METHODS: Exclude<ScalerType, "none">[] = ["standard", "minmax", "robust"];
const ENCODER_METHODS: Exclude<EncoderType, "none">[] = ["one_hot", "ordinal"];

function toRawDataConfig(columns: ColumnInfoDTO[]): Record<string, unknown> {
  const rawColumns: Record<string, unknown> = {};
  for (const column of columns) {
    rawColumns[column.name] = {
      new_name: column.new_name,
      active: column.active,
      categorical: column.categorical,
      numerical: column.numerical,
      id: column.id,
      semantic_roles: column.semantic_roles,
      multiplier: column.multiplier,
      mappings: column.mappings,
      missing_data_management: column.missing_data_management,
      scaling: column.scaling,
      encoding: column.encoding,
      type: column.type,
    };
  }
  return { columns: rawColumns };
}

function updateColumn(
  columns: ColumnInfoDTO[],
  name: string,
  updater: (column: ColumnInfoDTO) => ColumnInfoDTO
): ColumnInfoDTO[] {
  return columns.map((column) => (column.name === name ? updater(column) : column));
}

export function ConfigSection() {
  const navigate = useNavigate();
  const { activeDatasetId, cart, setDataConfig } = useWorkspace();

  const activeEntry = cart.find((item) => item.datasetId === activeDatasetId);
  const filename = activeEntry?.filename ?? "Selected Dataset";

  const [columns, setColumns] = useState<ColumnInfoDTO[] | null>(null);
  const [validation, setValidation] = useState<ConfigValidationDTO | null>(null);

  // Reset local state when active dataset changes from sidebar
  useEffect(() => {
    setColumns(null);
    setValidation(null);
  }, [activeDatasetId]);

  const datasetSummaryQuery = useQuery({
    queryKey: ["dataset-summary", activeDatasetId],
    queryFn: ({ signal }) => getDataset(activeDatasetId!, signal),
    enabled: Boolean(activeDatasetId),
  });

  const numericalCount = columns?.filter((c) => c.numerical).length ?? 0;
  const categoricalCount = columns?.filter((c) => c.categorical).length ?? 0;

  const buildMutation = useMutation({
    mutationFn: () => parseConfig({ dataset_id: activeDatasetId! }),
    onSuccess: (response) => {
      // Apply default strategies (Impute, Scaling on numerical, Encoding on categorical)
      const columnsWithDefaults = response.data_config.columns.map((col) => ({
        ...col,
        missing_data_management: {
          ...col.missing_data_management,
          strategy: "impute" as const,
        },
        scaling: col.numerical
          ? { enabled: true, method: "standard" as const }
          : col.scaling,
        encoding: col.categorical
          ? { enabled: true, method: "one_hot" as const, order: null }
          : col.encoding,
      }));

      setColumns(columnsWithDefaults);
      setValidation(response.validation);
    },
  });

  const revalidateMutation = useMutation({
    mutationFn: (currentColumns: ColumnInfoDTO[]) =>
      parseConfig({
        dataset_id: activeDatasetId!,
        existing_config: toRawDataConfig(currentColumns),
      }),
    onSuccess: (response) => {
      setColumns(response.data_config.columns);
      setValidation(response.validation);
    },
  });

  useEffect(() => {
    if (activeDatasetId && columns === null && !buildMutation.isPending) {
      buildMutation.mutate();
    }
  }, [activeDatasetId, columns, buildMutation]);

  if (!activeDatasetId) {
    return (
      <div className="text-slate-600">
        No dataset selected. Please go back to{" "}
        <button onClick={() => navigate("/workspace/dataset")} className="text-blue-600 underline">
          Dataset selection
        </button>
        .
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Configure columns</h1>
      <p className="mt-2 text-slate-500">
        Dataset: <span className="font-medium">{filename}</span>
      </p>

      {datasetSummaryQuery.data && (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-4 shadow-sm">
          <div>
            <p className="text-slate-400">Rows</p>
            <p className="font-medium text-slate-800">{datasetSummaryQuery.data.n_rows}</p>
          </div>
          <div>
            <p className="text-slate-400">Columns</p>
            <p className="font-medium text-slate-800">{datasetSummaryQuery.data.n_columns}</p>
          </div>
          <div>
            <p className="text-slate-400">Numerical features</p>
            <p className="font-medium text-slate-800">{numericalCount}</p>
          </div>
          <div>
            <p className="text-slate-400">Categorical features</p>
            <p className="font-medium text-slate-800">{categoricalCount}</p>
          </div>
        </div>
      )}

      {buildMutation.isPending && <p className="mt-6 text-slate-500">Building configuration...</p>}
      {buildMutation.isError && (
        <p className="mt-6 text-red-600">Failed to build configuration for this dataset.</p>
      )}

      {columns && (
        <>
          <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-medium">Column</th>
                  <th className="px-3 py-2 font-medium">Active</th>
                  <th className="px-3 py-2 font-medium">Numerical</th>
                  <th className="px-3 py-2 font-medium">Categorical</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Missing strategy</th>
                  <th className="px-3 py-2 font-medium">Scaling</th>
                  <th className="px-3 py-2 font-medium">Encoding</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((column) => (
                  <tr key={column.name} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">
                      {column.name}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={column.active}
                        onChange={(e) =>
                          setColumns((cols) =>
                            updateColumn(cols!, column.name, (c) => ({ ...c, active: e.target.checked }))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={column.numerical}
                        onChange={(e) =>
                          setColumns((cols) =>
                            updateColumn(cols!, column.name, (c) => ({
                              ...c,
                              numerical: e.target.checked,
                              categorical: e.target.checked ? false : c.categorical,
                            }))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={column.categorical}
                        onChange={(e) =>
                          setColumns((cols) =>
                            updateColumn(cols!, column.name, (c) => ({
                              ...c,
                              categorical: e.target.checked,
                              numerical: e.target.checked ? false : c.numerical,
                            }))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={column.id}
                        onChange={(e) =>
                          setColumns((cols) =>
                            updateColumn(cols!, column.name, (c) => ({ ...c, id: e.target.checked }))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={column.missing_data_management.strategy}
                        onChange={(e) =>
                          setColumns((cols) =>
                            updateColumn(cols!, column.name, (c) => ({
                              ...c,
                              missing_data_management: {
                                ...c.missing_data_management,
                                strategy: e.target.value as MissingStrategy,
                              },
                            }))
                          )
                        }
                        className="rounded border border-slate-300 px-2 py-1"
                      >
                        {MISSING_STRATEGIES.map((strategy) => (
                          <option key={strategy} value={strategy}>
                            {strategy}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={column.scaling.enabled}
                          disabled={!column.numerical}
                          onChange={(e) =>
                            setColumns((cols) =>
                              updateColumn(cols!, column.name, (c) => ({
                                ...c,
                                scaling: {
                                  enabled: e.target.checked,
                                  method: e.target.checked ? "standard" : "none",
                                },
                              }))
                            )
                          }
                        />
                        <select
                          value={column.scaling.method === "none" ? "standard" : column.scaling.method}
                          disabled={!column.scaling.enabled}
                          onChange={(e) =>
                            setColumns((cols) =>
                              updateColumn(cols!, column.name, (c) => ({
                                ...c,
                                scaling: { ...c.scaling, method: e.target.value as ScalerType },
                              }))
                            )
                          }
                          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                        >
                          {SCALER_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={column.encoding.enabled}
                          disabled={!column.categorical}
                          onChange={(e) =>
                            setColumns((cols) =>
                              updateColumn(cols!, column.name, (c) => ({
                                ...c,
                                encoding: {
                                  enabled: e.target.checked,
                                  method: e.target.checked ? "one_hot" : "none",
                                  order: null,
                                },
                              }))
                            )
                          }
                        />
                        <select
                          value={column.encoding.method === "none" ? "one_hot" : column.encoding.method}
                          disabled={!column.encoding.enabled}
                          onChange={(e) =>
                            setColumns((cols) =>
                              updateColumn(cols!, column.name, (c) => ({
                                ...c,
                                encoding: { ...c.encoding, method: e.target.value as EncoderType },
                              }))
                            )
                          }
                          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                        >
                          {ENCODER_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={() => revalidateMutation.mutate(columns)}
              disabled={revalidateMutation.isPending}
              className="rounded bg-slate-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {revalidateMutation.isPending ? "Validating..." : "Re-validate configuration"}
            </button>

            {validation && (
              <span className={validation.is_valid ? "text-sm text-green-600" : "text-sm text-red-600"}>
                {validation.is_valid ? "Configuration is valid." : validation.errors.join("; ")}
              </span>
            )}
          </div>

          {validation?.is_valid && (
            <div className="mt-6">
              <button
                onClick={() => {
                  setDataConfig({ columns } as never);
                  navigate("../pipeline");
                }}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
              >
                Continue to pipeline →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}