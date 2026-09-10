/**
 * synapse-gui frontend DataSection
 * -----------------------------------------
 * Selezione 1 vs 2 dataset, con parsing automatico delle colonne per la
 * selezione interattiva di trattamento/id/covariate, e collegamento reale
 * a check-compatibility + merge-populations + parse-config: da qui in poi
 * il resto del workflow (Explore, Matching Design, Run) lavora sempre su
 * un unico workingDatasetId + treatmentColumn, indipendentemente da quanti
 * file sono stati caricati.
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { checkCompatibility, mergePopulations, parseConfig, uploadDataset } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";
import type { PopulationSelection } from "../../../context/WorkspaceContext";
import type { CompatibilityCheckResponse, DatasetUploadResponse } from "../../../types/api";

const NO_ID_COLUMN = "";
const DEFAULT_MERGE_TREATMENT_COLUMN = "treatment";

function ColumnPickerTable({
  dataset,
  treatmentColumn,
  onTreatmentColumnChange,
  idColumn,
  onIdColumnChange,
  selectedCovariates,
  onToggleCovariate,
}: {
  dataset: DatasetUploadResponse;
  treatmentColumn: string;
  onTreatmentColumnChange: (col: string) => void;
  idColumn: string;
  onIdColumnChange: (col: string) => void;
  selectedCovariates: Set<string>;
  onToggleCovariate: (col: string, checked: boolean) => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <span>Seleziona la colonna trattamento/gruppo (obbligatoria) e, se presente, un identificativo (opzionale).</span>
        {idColumn !== NO_ID_COLUMN && (
          <button type="button" onClick={() => onIdColumnChange(NO_ID_COLUMN)} className="font-medium text-blue-600 hover:underline">
            Rimuovi ID
          </button>
        )}
      </div>
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">Colonna</th>
            <th className="px-4 py-3">Tipo Dato</th>
            <th className="px-4 py-3 text-center">ID</th>
            <th className="px-4 py-3 text-center">Trattamento / Gruppo</th>
            <th className="px-4 py-3 text-center">Covariata Matching</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {dataset.columns.map((col) => {
            const isTreatment = treatmentColumn === col.name;
            const isId = idColumn === col.name;
            const isCovariate = selectedCovariates.has(col.name);

            return (
              <tr key={col.name} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{col.name}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{col.dtype}</td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="radio"
                    name="id-column"
                    checked={isId}
                    disabled={isTreatment}
                    onChange={() => onIdColumnChange(col.name)}
                    className="h-4 w-4 text-slate-600 focus:ring-slate-500 disabled:opacity-30"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="radio"
                    name="treatment-column"
                    checked={isTreatment}
                    onChange={() => {
                      onTreatmentColumnChange(col.name);
                      if (isId) onIdColumnChange(NO_ID_COLUMN);
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={isCovariate}
                    disabled={isTreatment || isId}
                    onChange={(e) => onToggleCovariate(col.name, e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 disabled:opacity-30"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DataSection() {
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const { addToCart, setPopulationSelection } = useWorkspace();

  const [mode, setMode] = useState<"single_dataset" | "two_datasets">("single_dataset");
  const [datasetSingle, setDatasetSingle] = useState<DatasetUploadResponse | null>(null);
  const [datasetA, setDatasetA] = useState<DatasetUploadResponse | null>(null);
  const [datasetB, setDatasetB] = useState<DatasetUploadResponse | null>(null);

  const [treatmentColumn, setTreatmentColumn] = useState("");
  const [idColumnSingle, setIdColumnSingle] = useState(NO_ID_COLUMN);
  const [covariatesSingle, setCovariatesSingle] = useState<Set<string>>(new Set());

  const [idColumnA, setIdColumnA] = useState(NO_ID_COLUMN);
  const [idColumnB, setIdColumnB] = useState(NO_ID_COLUMN);
  const [covariatesTwoDatasets, setCovariatesTwoDatasets] = useState<Set<string>>(new Set());
  const [compatibility, setCompatibility] = useState<CompatibilityCheckResponse | null>(null);

  const [confirmError, setConfirmError] = useState<string | null>(null);

  const uploadMutation = useMutation({ mutationFn: (file: File) => uploadDataset(file) });

  const compatMutation = useMutation({
    mutationFn: (payload: { dataset_id_a: string; dataset_id_b: string }) => checkCompatibility(payload),
    onSuccess: (response) => {
      setCompatibility(response);
      // Dropping any covariate no longer valid for the new pair, rather
      // than silently sending a stale selection to merge-populations.
      setCovariatesTwoDatasets((prev) => new Set([...prev].filter((c) => response.common_columns.includes(c))));
    },
  });

  // Re-check compatibility as soon as both populations are uploaded (or
  // re-uploaded), per the requirement: with two datasets, only variables
  // confirmed to exist in both -- same name AND compatible dtype -- can
  // ever be offered as matching covariates.
  useEffect(() => {
    if (datasetA && datasetB) {
      compatMutation.mutate({ dataset_id_a: datasetA.dataset_id, dataset_id_b: datasetB.dataset_id });
    } else {
      setCompatibility(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetA?.dataset_id, datasetB?.dataset_id]);

  const confirmMutation = useMutation({
    mutationFn: async (): Promise<PopulationSelection> => {
      if (mode === "single_dataset") {
        const dataset = datasetSingle!;
        await parseConfig({
          dataset_id: dataset.dataset_id,
          id_columns: idColumnSingle ? [idColumnSingle] : undefined,
          infer_id: true,
        });
        return {
          mode: "single_dataset",
          datasetId: dataset.dataset_id,
          workingDatasetId: dataset.dataset_id,
          treatmentColumn,
          idColumn: idColumnSingle || null,
          matchingCovariates: Array.from(covariatesSingle),
        };
      }

      const merged = await mergePopulations({
        dataset_id_a: datasetA!.dataset_id,
        dataset_id_b: datasetB!.dataset_id,
        treatment_col_name: DEFAULT_MERGE_TREATMENT_COLUMN,
        columns: Array.from(covariatesTwoDatasets),
        id_column_a: idColumnA || null,
        id_column_b: idColumnB || null,
      });
      const hasSourceId = Boolean(idColumnA || idColumnB);
      await parseConfig({
        dataset_id: merged.dataset_id,
        id_columns: hasSourceId ? ["source_id"] : undefined,
        infer_id: true,
      });
      return {
        mode: "two_datasets",
        datasetIdA: datasetA!.dataset_id,
        datasetIdB: datasetB!.dataset_id,
        workingDatasetId: merged.dataset_id,
        treatmentColumn: DEFAULT_MERGE_TREATMENT_COLUMN,
        idColumn: hasSourceId ? "source_id" : null,
        matchingCovariates: Array.from(covariatesTwoDatasets),
      };
    },
    onSuccess: (selection) => {
      setConfirmError(null);
      setPopulationSelection(selection);
      const currentModule = moduleId || "matching";
      navigate(`/workspace/modules/${currentModule}/exploration`);
    },
    onError: (error: unknown) => {
      setConfirmError(error instanceof Error ? error.message : "Impossibile completare la selezione delle popolazioni.");
    },
  });

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>, target: "single" | "a" | "b") {
    const file = e.target.files?.[0];
    if (!file) return;

    uploadMutation.mutate(file, {
      onSuccess: (response) => {
        addToCart({ datasetId: response.dataset_id, filename: response.filename, origin: { kind: "upload" } });
        if (target === "single") {
          setDatasetSingle(response);
          setTreatmentColumn("");
          setIdColumnSingle(NO_ID_COLUMN);
          setCovariatesSingle(new Set());
        }
        if (target === "a") {
          setDatasetA(response);
          setIdColumnA(NO_ID_COLUMN);
        }
        if (target === "b") {
          setDatasetB(response);
          setIdColumnB(NO_ID_COLUMN);
        }
      },
    });
  }

  function toggleCovariateSingle(col: string, checked: boolean) {
    setCovariatesSingle((prev) => {
      const next = new Set(prev);
      if (checked) next.add(col);
      else next.delete(col);
      return next;
    });
  }

  function toggleCovariateTwoDatasets(col: string, checked: boolean) {
    setCovariatesTwoDatasets((prev) => {
      const next = new Set(prev);
      if (checked) next.add(col);
      else next.delete(col);
      return next;
    });
  }

  const canConfirm =
    mode === "single_dataset"
      ? Boolean(datasetSingle && treatmentColumn && covariatesSingle.size > 0)
      : Boolean(datasetA && datasetB && compatibility?.is_compatible && covariatesTwoDatasets.size > 0);

  const isBusy = uploadMutation.isPending || compatMutation.isPending || confirmMutation.isPending;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Data Loading</h1>
      <p className="text-sm text-slate-500 mb-6">
        Select populations and matching variables.
      </p>

      {/* Scelta tra 1 o 2 dataset */}
      <div className="mb-6 flex gap-6 rounded-lg bg-slate-100 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input
            type="radio"
            checked={mode === "single_dataset"}
            onChange={() => setMode("single_dataset")}
            className="text-blue-600 focus:ring-blue-500"
          />
          Single Dataset (Group/Treatment column)
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input
            type="radio"
            checked={mode === "two_datasets"}
            onChange={() => setMode("two_datasets")}
            className="text-blue-600 focus:ring-blue-500"
          />
          Two Separate Populations (Target vs Control)
        </label>
      </div>

      {mode === "single_dataset" ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-slate-700 mb-2">File Dataset (.xlsx, .csv, .parquet)</label>
          <input type="file" accept=".csv,.parquet,.json,.xlsx,.xls" onChange={(e) => handleUpload(e, "single")} className="block text-sm text-slate-500" />

          {uploadMutation.isPending && <p className="mt-2 text-xs font-semibold text-blue-600">File analysis in progress...</p>}

          {datasetSingle && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-600">
                {datasetSingle.filename} — {datasetSingle.n_rows} rows, {datasetSingle.n_columns} columns
              </p>
              <ColumnPickerTable
                dataset={datasetSingle}
                treatmentColumn={treatmentColumn}
                onTreatmentColumnChange={setTreatmentColumn}
                idColumn={idColumnSingle}
                onIdColumnChange={setIdColumnSingle}
                selectedCovariates={covariatesSingle}
                onToggleCovariate={toggleCovariateSingle}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Population A (Treated / Target)</label>
              <input type="file" accept=".csv,.parquet,.json,.xlsx,.xls" onChange={(e) => handleUpload(e, "a")} className="block text-sm" />
              {datasetA && (
                <>
                  <p className="mt-1 text-xs text-slate-500">{datasetA.filename} ({datasetA.n_rows} righe)</p>
                  <label className="mt-2 block text-xs font-medium text-slate-600">Colonna ID (opzionale)</label>
                  <select value={idColumnA} onChange={(e) => setIdColumnA(e.target.value)} className="mt-1 w-full rounded border border-slate-300 text-xs p-1.5">
                    <option value={NO_ID_COLUMN}>— Nessuna —</option>
                    {datasetA.columns.map((col) => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Population B (Controls / Reference)</label>
              <input type="file" accept=".csv,.parquet,.json,.xlsx,.xls" onChange={(e) => handleUpload(e, "b")} className="block text-sm" />
              {datasetB && (
                <>
                  <p className="mt-1 text-xs text-slate-500">{datasetB.filename} ({datasetB.n_rows} righe)</p>
                  <label className="mt-2 block text-xs font-medium text-slate-600">Colonna ID (opzionale)</label>
                  <select value={idColumnB} onChange={(e) => setIdColumnB(e.target.value)} className="mt-1 w-full rounded border border-slate-300 text-xs p-1.5">
                    <option value={NO_ID_COLUMN}>— Nessuna —</option>
                    {datasetB.columns.map((col) => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {datasetA && datasetB && (
            <div>
              {compatMutation.isPending && <p className="text-xs font-semibold text-blue-600">Verifica delle colonne in comune...</p>}

              {compatibility && !compatibility.is_compatible && (
                <p className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  Nessuna colonna utilizzabile in comune tra i due dataset (stesso nome e tipo compatibile). Impossibile procedere con il matching su questa coppia.
                </p>
              )}

              {compatibility && compatibility.dtype_mismatches.length > 0 && (
                <p className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                  Escluse per tipo incompatibile tra i due dataset: {compatibility.dtype_mismatches.map((m) => m.column).join(", ")}
                </p>
              )}

              {compatibility && compatibility.is_compatible && (
                <>
                  <p className="mb-2 text-xs font-medium text-slate-700">
                    Seleziona le covariate di matching (solo colonne presenti in entrambi i dataset):
                  </p>
                  <div className="flex flex-wrap gap-3 rounded border border-slate-200 p-3 bg-slate-50">
                    {compatibility.common_columns.map((col) => (
                      <label key={col} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={covariatesTwoDatasets.has(col)}
                          onChange={(e) => toggleCovariateTwoDatasets(col, e.target.checked)}
                          className="rounded text-blue-600"
                        />
                        {col}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {confirmError && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{confirmError}</p>
      )}

      {/* Bottone di conferma e avanzamento */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => confirmMutation.mutate()}
          disabled={!canConfirm || isBusy}
          className="rounded bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {confirmMutation.isPending ? "Elaborazione in corso..." : "Confirm Selection and Go to Exploration →"}
        </button>
      </div>
    </div>
  );
}