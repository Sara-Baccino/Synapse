/**
 * synapse-gui frontend ConfigSection
 * -----------------------------------------
 *
 * Calls POST /datasets/parse-config (or /import-config if a config.json
 * is provided) for every dataset in the current populationSelection,
 * so DataConfig actually exists in dataset_store before Run -- this is
 * the step that was missing and caused every run to fail. Shows the
 * inferred column table (type, missing %) read-only for now; per-column
 * editing (imputer/transform dropdowns) and matching-role assignment
 * (hard/soft constraint, outcome, stratification, analysis-only) are a
 * follow-up, not yet implemented here.
 */

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { importConfigFile, parseConfig } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";

export function ConfigSection() {
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const { populationSelection, setDataConfigForDataset, dataConfigByDatasetId } = useWorkspace();

  const datasetIds =
    populationSelection?.mode === "single_dataset"
      ? [populationSelection.datasetId]
      : populationSelection?.mode === "two_datasets"
      ? [populationSelection.datasetIdA, populationSelection.datasetIdB]
      : [];

  // Tracks which datasets the user explicitly imported a config for --
  // once true, auto-inference must NEVER run for that dataset again,
  // regardless of timing, so an in-flight parseMutation response can't
  // silently clobber an imported config that arrived first.
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [autoInferredIds, setAutoInferredIds] = useState<Set<string>>(new Set());

  const parseMutation = useMutation({
    mutationFn: (datasetId: string) => parseConfig({ dataset_id: datasetId }),
    onSuccess: (response, datasetId) => {
      // Guard: if the user imported a config for this dataset while this
      // request was in flight, do not overwrite it.
      if (importedIds.has(datasetId)) return;
      setDataConfigForDataset(datasetId, response.data_config);
      setAutoInferredIds((prev) => new Set(prev).add(datasetId));
    },
  });

  const importConfigMutation = useMutation({
    mutationFn: ({ datasetId, file }: { datasetId: string; file: File }) => importConfigFile(datasetId, file),
    onSuccess: (response, { datasetId }) => {
      setImportedIds((prev) => new Set(prev).add(datasetId));
      setDataConfigForDataset(datasetId, response.data_config);
    },
  });

  useEffect(() => {
    datasetIds.forEach((id) => {
      const alreadyHandled = dataConfigByDatasetId[id] || autoInferredIds.has(id) || importedIds.has(id);
      if (!alreadyHandled && !parseMutation.isPending) {
        parseMutation.mutate(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetIds.join(",")]);

  const allConfigured = datasetIds.length > 0 && datasetIds.every((id) => dataConfigByDatasetId[id]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Config</h1>
      <p className="mb-4 text-sm text-slate-500">
        Column types, active flags, and missing-data strategy for each dataset. Import a config.json to
        override automatic inference, or correct it manually (editing coming in a follow-up).
      </p>

      {datasetIds.map((datasetId) => {
        const config = dataConfigByDatasetId[datasetId];
        const isImported = importedIds.has(datasetId);
        return (
          <div key={datasetId} className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                Dataset: {datasetId.slice(0, 8)}
                {isImported && <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">config.json imported</span>}
              </p>
              <label className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 cursor-pointer hover:bg-slate-50">
                Import config.json
                <input
                  type="file" accept=".json" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importConfigMutation.mutate({ datasetId, file });
                  }}
                />
              </label>
            </div>

            {!config && <p className="text-xs text-slate-400">Building configuration...</p>}

            {config && (
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400">
                    <th className="px-2 py-1">Column</th>
                    <th className="px-2 py-1">Numerical</th>
                    <th className="px-2 py-1">Categorical</th>
                    <th className="px-2 py-1">Missing strategy</th>
                  </tr>
                </thead>
                <tbody>
                  {config.columns.map((col) => (
                    <tr key={col.name} className="border-b border-slate-100">
                      <td className="px-2 py-1 font-medium text-slate-700">{col.name}</td>
                      <td className="px-2 py-1">{col.numerical ? "✓" : ""}</td>
                      <td className="px-2 py-1">{col.categorical ? "✓" : ""}</td>
                      <td className="px-2 py-1">{col.missing_data_management.strategy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      <button
        onClick={() => navigate(`/workspace/modules/${moduleId}/exploration`)}
        disabled={!allConfigured}
        className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue to Exploration →
      </button>
    </div>
  );
}