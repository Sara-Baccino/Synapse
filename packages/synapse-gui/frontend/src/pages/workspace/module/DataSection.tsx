/**
 * synapse-gui frontend DataSection
 * -----------------------------------------
 * Selezione 1 vs 2 dataset con parsing automatico delle colonne
 * e selezione interattiva da tabella/lista.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { uploadDataset } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";
import type { PopulationSelection } from "../../../context/WorkspaceContext";
import type { DatasetUploadResponse } from "../../../types/api";

function ColumnPickerTable({
  dataset,
  treatmentColumn,
  onTreatmentColumnChange,
  selectedCovariates,
  onToggleCovariate,
}: {
  dataset: DatasetUploadResponse;
  treatmentColumn: string;
  onTreatmentColumnChange: (col: string) => void;
  selectedCovariates: Set<string>;
  onToggleCovariate: (col: string, checked: boolean) => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">Colonna</th>
            <th className="px-4 py-3">Tipo Dato</th>
            <th className="px-4 py-3 text-center">Trattamento / Gruppo</th>
            <th className="px-4 py-3 text-center">Covariata Matching</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {dataset.columns.map((col) => {
            const isTreatment = treatmentColumn === col.name;
            const isCovariate = selectedCovariates.has(col.name);

            return (
              <tr key={col.name} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{col.name}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{col.dtype}</td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="radio"
                    name="treatment-column"
                    checked={isTreatment}
                    onChange={() => onTreatmentColumnChange(col.name)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={isCovariate}
                    disabled={isTreatment}
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
  const [covariatesSingle, setCovariatesSingle] = useState<Set<string>>(new Set());
  const [covariatesTwoDatasets, setCovariatesTwoDatasets] = useState<Set<string>>(new Set());

  const uploadMutation = useMutation({ mutationFn: (file: File) => uploadDataset(file) });

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>, target: "single" | "a" | "b") {
    const file = e.target.files?.[0];
    if (!file) return;

    uploadMutation.mutate(file, {
      onSuccess: (response) => {
        addToCart({ datasetId: response.dataset_id, filename: response.filename, origin: { kind: "upload" } });
        if (target === "single") {
          setDatasetSingle(response);
          setTreatmentColumn("");
          setCovariatesSingle(new Set());
        }
        if (target === "a") setDatasetA(response);
        if (target === "b") setDatasetB(response);
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
      : Boolean(datasetA && datasetB && covariatesTwoDatasets.size > 0);

  function handleConfirm() {
    if (!canConfirm) return;

    const selection: PopulationSelection =
      mode === "single_dataset"
        ? {
            mode: "single_dataset",
            datasetId: datasetSingle!.dataset_id,
            treatmentColumn,
            idColumn: null,
            matchingCovariates: Array.from(covariatesSingle),
          }
        : {
            mode: "two_datasets",
            datasetIdA: datasetA!.dataset_id,
            datasetIdB: datasetB!.dataset_id,
            idColumn: null,
            matchingCovariates: Array.from(covariatesTwoDatasets),
          };

    setPopulationSelection(selection);
    
    // Navigazione verso lo step di Exploration
    const currentModule = moduleId || "matching";
    navigate(`/workspace/modules/${currentModule}/exploration`);
  }

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
                selectedCovariates={covariatesSingle}
                onToggleCovariate={toggleCovariateSingle}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Population A (Treated / Target)</label>
            <input type="file" accept=".csv,.parquet,.json,.xlsx,.xls" onChange={(e) => handleUpload(e, "a")} className="block text-sm" />
            {datasetA && <p className="mt-1 text-xs text-slate-500">{datasetA.filename} ({datasetA.n_rows} righe)</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Population B (Controls / Reference)</label>
            <input type="file" accept=".csv,.parquet,.json,.xlsx,.xls" onChange={(e) => handleUpload(e, "b")} className="block text-sm" />
            {datasetB && <p className="mt-1 text-xs text-slate-500">{datasetB.filename} ({datasetB.n_rows} righe)</p>}
          </div>

          {datasetA && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-700">Select matching covariates:</p>
              <div className="flex flex-wrap gap-3 rounded border border-slate-200 p-3 bg-slate-50">
                {datasetA.columns.map((col) => (
                  <label key={col.name} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={covariatesTwoDatasets.has(col.name)}
                      onChange={(e) => toggleCovariateTwoDatasets(col.name, e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    {col.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottone di conferma e avanzamento */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="rounded bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm Selection and Go to Exploration →
        </button>
      </div>
    </div>
  );
}