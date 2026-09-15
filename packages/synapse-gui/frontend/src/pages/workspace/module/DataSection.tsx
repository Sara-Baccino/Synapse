/**
 * synapse-gui frontend DataSection
 * -----------------------------------------
 * Data Loading + Data Config in one page (Block C): upload triggers an
 * automatic parse-config (default inference), then the real, editable
 * DataConfigTable is shown -- recap box, per-column role/missing/scaling/
 * encoding/values&mapping, all wired to the backend, no mock defaults.
 *
 * Two-dataset mode keeps THREE separate DataConfigs, stored in
 * WorkspaceContext.dataConfigs (already keyed by dataset_id, no new
 * state needed): one for Population A, one for Population B, and one for
 * the merged/common dataset actually used for matching -- so later
 * sections (Exploration's "distribution of non-common variables per
 * group") can still see each population's own full configuration.
 *
 * Matching-covariate *selection* itself no longer happens here: it moves
 * to Matching Design - Covariates (Block E). Until that block lands, all
 * active, non-id columns (minus the treatment column) are used as a
 * temporary default so the pipeline keeps working end-to-end.
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import {
  checkConfigCompatibility, mergePopulations, parseConfig, uploadDataset,
} from "../../../api/client";
import { DataConfigTable, toRawDataConfig } from "../../../components/DataConfigTable";
import { useWorkspace } from "../../../context/WorkspaceContext";
import type { PopulationSelection } from "../../../context/WorkspaceContext";
import type {
  ColumnInfoDTO, ColumnStatsDTO, ConfigCompatibilityResponse, DatasetUploadResponse,
} from "../../../types/api";
import { expandColumnToCovariateNames } from "../../../utils/covariateExpansion";

const MERGE_TREATMENT_COLUMN = "treatment";

interface DatasetConfigState {
  columns: ColumnInfoDTO[];
  stats: ColumnStatsDTO[];
  nRows: number;
}

function deriveMatchingCovariates(
  columns: ColumnInfoDTO[], treatmentColumn: string | null, stats: ColumnStatsDTO[]
): string[] {
  const names: string[] = [];
  for (const c of columns) {
    if (!c.active || c.id || c.name === treatmentColumn || !(c.numerical || c.categorical)) continue;
    names.push(...expandColumnToCovariateNames(c, stats));
  }
  return names;
}

function deriveIdColumn(columns: ColumnInfoDTO[]): string | null {
  return columns.find((c) => c.id)?.name ?? null;
}

export function DataSection() {
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const { addToCart, setDataConfigFor, setColumnStatsFor, setPopulationSelection } = useWorkspace();

  const [mode, setMode] = useState<"single_dataset" | "two_datasets">("single_dataset");

  const [datasetSingle, setDatasetSingle] = useState<DatasetUploadResponse | null>(null);
  const [configSingle, setConfigSingle] = useState<DatasetConfigState | null>(null);
  const [treatmentColumn, setTreatmentColumn] = useState("");

  const [datasetA, setDatasetA] = useState<DatasetUploadResponse | null>(null);
  const [datasetB, setDatasetB] = useState<DatasetUploadResponse | null>(null);
  const [configA, setConfigA] = useState<DatasetConfigState | null>(null);
  const [configB, setConfigB] = useState<DatasetConfigState | null>(null);
  const [configCompat, setConfigCompat] = useState<ConfigCompatibilityResponse | null>(null);

  const [confirmError, setConfirmError] = useState<string | null>(null);

  const uploadSingleMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataset = await uploadDataset(file);
      const parsed = await parseConfig({ dataset_id: dataset.dataset_id });
      return { dataset, parsed };
    },
    onSuccess: ({ dataset, parsed }) => {
      addToCart({ datasetId: dataset.dataset_id, filename: dataset.filename, origin: { kind: "upload" } });
      setDatasetSingle(dataset);
      setConfigSingle({ columns: parsed.data_config.columns, stats: parsed.column_stats, nRows: parsed.n_rows });
      setTreatmentColumn("");
    },
  });

  const uploadAMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataset = await uploadDataset(file);
      const parsed = await parseConfig({ dataset_id: dataset.dataset_id });
      return { dataset, parsed };
    },
    onSuccess: ({ dataset, parsed }) => {
      addToCart({ datasetId: dataset.dataset_id, filename: dataset.filename, origin: { kind: "upload" } });
      setDatasetA(dataset);
      setConfigA({ columns: parsed.data_config.columns, stats: parsed.column_stats, nRows: parsed.n_rows });
      setConfigCompat(null);
    },
  });

  const uploadBMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataset = await uploadDataset(file);
      const parsed = await parseConfig({ dataset_id: dataset.dataset_id });
      return { dataset, parsed };
    },
    onSuccess: ({ dataset, parsed }) => {
      addToCart({ datasetId: dataset.dataset_id, filename: dataset.filename, origin: { kind: "upload" } });
      setDatasetB(dataset);
      setConfigB({ columns: parsed.data_config.columns, stats: parsed.column_stats, nRows: parsed.n_rows });
      setConfigCompat(null);
    },
  });

  const compatMutation = useMutation({
    mutationFn: () => checkConfigCompatibility({ dataset_id_a: datasetA!.dataset_id, dataset_id_b: datasetB!.dataset_id }),
    onSuccess: (response) => setConfigCompat(response),
  });

  // Automatic first check as soon as both populations have a config;
  // afterwards the user can re-run it manually (button below) after
  // editing roles, rather than re-checking on every keystroke.
  useEffect(() => {
    if (datasetA && datasetB && configA && configB && !configCompat) {
      compatMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetA?.dataset_id, datasetB?.dataset_id, Boolean(configA), Boolean(configB)]);

  const confirmSingleMutation = useMutation({
    mutationFn: async (): Promise<PopulationSelection> => {
      const dataset = datasetSingle!;
      const persisted = await parseConfig({
        dataset_id: dataset.dataset_id, existing_config: toRawDataConfig(configSingle!.columns),
      });
      if (!persisted.validation.is_valid) {
        throw new Error(persisted.validation.errors.join("; ") || "Configurazione non valida.");
      }
      setDataConfigFor(dataset.dataset_id, persisted.data_config);
      setColumnStatsFor(dataset.dataset_id, persisted.column_stats);
      const activeColumns = persisted.data_config.columns.filter((c) => c.active);
      return {
        mode: "single_dataset",
        datasetId: dataset.dataset_id,
        workingDatasetId: dataset.dataset_id,
        treatmentColumn,
        idColumn: deriveIdColumn(activeColumns),
        matchingCovariates: deriveMatchingCovariates(activeColumns, treatmentColumn, persisted.column_stats),
      };
    },
    onSuccess: (selection) => {
      setConfirmError(null);
      setPopulationSelection(selection);
      navigate(`/workspace/modules/${moduleId || "matching"}/exploration`);
    },
    onError: (error: unknown) => setConfirmError(error instanceof Error ? error.message : "Errore di configurazione."),
  });

  const confirmTwoDatasetsMutation = useMutation({
    mutationFn: async (): Promise<PopulationSelection> => {
      const persistedA = await parseConfig({
        dataset_id: datasetA!.dataset_id, existing_config: toRawDataConfig(configA!.columns),
      });
      if (!persistedA.validation.is_valid) {
        throw new Error(`Population A: ${persistedA.validation.errors.join("; ")}`);
      }
      const persistedB = await parseConfig({
        dataset_id: datasetB!.dataset_id, existing_config: toRawDataConfig(configB!.columns),
      });
      if (!persistedB.validation.is_valid) {
        throw new Error(`Population B: ${persistedB.validation.errors.join("; ")}`);
      }
      setDataConfigFor(datasetA!.dataset_id, persistedA.data_config);
      setColumnStatsFor(datasetA!.dataset_id, persistedA.column_stats);
      setDataConfigFor(datasetB!.dataset_id, persistedB.data_config);
      setColumnStatsFor(datasetB!.dataset_id, persistedB.column_stats);

      const compat = await checkConfigCompatibility({ dataset_id_a: datasetA!.dataset_id, dataset_id_b: datasetB!.dataset_id });
      if (compat.compatible_columns.length === 0) {
        throw new Error("Nessuna colonna con lo stesso ruolo di configurazione tra i due dataset: impossibile unire le popolazioni.");
      }

      const idColumnA = deriveIdColumn(persistedA.data_config.columns);
      const idColumnB = deriveIdColumn(persistedB.data_config.columns);

      const merged = await mergePopulations({
        dataset_id_a: datasetA!.dataset_id, dataset_id_b: datasetB!.dataset_id,
        treatment_col_name: MERGE_TREATMENT_COLUMN, columns: compat.compatible_columns,
        id_column_a: idColumnA, id_column_b: idColumnB,
      });
      const hasSourceId = Boolean(idColumnA || idColumnB);
      const mergedParsed = await parseConfig({
        dataset_id: merged.dataset_id, id_columns: hasSourceId ? ["source_id"] : undefined, infer_id: true,
      });
      setDataConfigFor(merged.dataset_id, mergedParsed.data_config);
      setColumnStatsFor(merged.dataset_id, mergedParsed.column_stats);

      const activeColumns = mergedParsed.data_config.columns.filter((c) => c.active);
      return {
        mode: "two_datasets",
        datasetIdA: datasetA!.dataset_id, datasetIdB: datasetB!.dataset_id,
        workingDatasetId: merged.dataset_id, treatmentColumn: MERGE_TREATMENT_COLUMN,
        idColumn: hasSourceId ? "source_id" : deriveIdColumn(activeColumns),
        matchingCovariates: deriveMatchingCovariates(activeColumns, MERGE_TREATMENT_COLUMN, mergedParsed.column_stats),
      };
    },
    onSuccess: (selection) => {
      setConfirmError(null);
      setPopulationSelection(selection);
      navigate(`/workspace/modules/${moduleId || "matching"}/exploration`);
    },
    onError: (error: unknown) => setConfirmError(error instanceof Error ? error.message : "Errore di configurazione."),
  });

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>, target: "single" | "a" | "b") {
    const file = e.target.files?.[0];
    if (!file) return;
    if (target === "single") uploadSingleMutation.mutate(file);
    if (target === "a") uploadAMutation.mutate(file);
    if (target === "b") uploadBMutation.mutate(file);
  }

  const canConfirmSingle = Boolean(datasetSingle && configSingle && treatmentColumn);
  const canConfirmTwoDatasets = Boolean(datasetA && datasetB && configA && configB && configCompat?.compatible_columns.length);
  const isBusy =
    uploadSingleMutation.isPending || uploadAMutation.isPending || uploadBMutation.isPending ||
    compatMutation.isPending || confirmSingleMutation.isPending || confirmTwoDatasetsMutation.isPending;

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Data Loading</h1>
      <p className="text-sm text-slate-500 mb-6">Select populations and review their data configuration.</p>

      <div className="mb-6 flex gap-6 rounded-lg bg-slate-100 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input type="radio" checked={mode === "single_dataset"} onChange={() => setMode("single_dataset")} className="text-blue-600" />
          Single Dataset (Group/Treatment column)
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input type="radio" checked={mode === "two_datasets"} onChange={() => setMode("two_datasets")} className="text-blue-600" />
          Two Separate Populations (Target vs Control)
        </label>
      </div>

      {mode === "single_dataset" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <label className="block text-sm font-medium text-slate-700 mb-2">File Dataset (.csv, .parquet, .xlsx)</label>
            <input type="file" accept=".csv,.parquet,.json,.xlsx,.xls" onChange={(e) => handleUpload(e, "single")} className="block text-sm text-slate-500" />
            {uploadSingleMutation.isPending && <p className="mt-2 text-xs font-semibold text-blue-600">Caricamento e analisi in corso...</p>}
          </div>

          {datasetSingle && configSingle && (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <label className="block text-sm font-medium text-slate-700 mb-1">Colonna trattamento / gruppo</label>
                <select value={treatmentColumn} onChange={(e) => setTreatmentColumn(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
                  <option value="">— Seleziona —</option>
                  {configSingle.columns.filter((c) => c.active && !c.id).map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <DataConfigTable
                title="Data Config" columns={configSingle.columns} columnStats={configSingle.stats} nRows={configSingle.nRows}
                onColumnsChange={(columns) => setConfigSingle({ ...configSingle, columns })}
              />
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <label className="block text-sm font-medium text-slate-700 mb-2">Population A (Treated / Target)</label>
              <input type="file" accept=".csv,.parquet,.json,.xlsx,.xls" onChange={(e) => handleUpload(e, "a")} className="block text-sm" />
              {uploadAMutation.isPending && <p className="mt-2 text-xs font-semibold text-blue-600">Caricamento...</p>}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <label className="block text-sm font-medium text-slate-700 mb-2">Population B (Controls / Reference)</label>
              <input type="file" accept=".csv,.parquet,.json,.xlsx,.xls" onChange={(e) => handleUpload(e, "b")} className="block text-sm" />
              {uploadBMutation.isPending && <p className="mt-2 text-xs font-semibold text-blue-600">Caricamento...</p>}
            </div>
          </div>

          {datasetA && configA && (
            <DataConfigTable
              title={`Data Config — ${datasetA.filename} (Population A)`} columns={configA.columns} columnStats={configA.stats} nRows={configA.nRows}
              onColumnsChange={(columns) => { setConfigA({ ...configA, columns }); setConfigCompat(null); }}
            />
          )}
          {datasetB && configB && (
            <DataConfigTable
              title={`Data Config — ${datasetB.filename} (Population B)`} columns={configB.columns} columnStats={configB.stats} nRows={configB.nRows}
              onColumnsChange={(columns) => { setConfigB({ ...configB, columns }); setConfigCompat(null); }}
            />
          )}

          {datasetA && datasetB && configA && configB && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Compatibilità di configurazione</h3>
                <button onClick={() => compatMutation.mutate()} disabled={compatMutation.isPending} className="text-xs text-blue-600 hover:underline disabled:opacity-40">
                  {compatMutation.isPending ? "Verifica..." : "Ricontrolla dopo le modifiche"}
                </button>
              </div>
              {configCompat && (
                <>
                  {configCompat.compatible_columns.length > 0 ? (
                    <p className="text-xs text-slate-600">
                      Colonne comuni con configurazione coerente: <span className="font-mono">{configCompat.compatible_columns.join(", ")}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-red-600">Nessuna colonna comune con lo stesso ruolo di configurazione.</p>
                  )}
                  {configCompat.mismatched_columns.length > 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Ruolo incoerente tra A e B: {configCompat.mismatched_columns.map((m) => `${m.column} (${m.reason})`).join("; ")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {confirmError && <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{confirmError}</p>}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => (mode === "single_dataset" ? confirmSingleMutation.mutate() : confirmTwoDatasetsMutation.mutate())}
          disabled={isBusy || (mode === "single_dataset" ? !canConfirmSingle : !canConfirmTwoDatasets)}
          className="rounded bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {confirmSingleMutation.isPending || confirmTwoDatasetsMutation.isPending ? "Elaborazione..." : "Confirm Selection and Go to Exploration →"}
        </button>
      </div>
    </div>
  );
}