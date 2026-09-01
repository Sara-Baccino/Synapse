import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { uploadDataset } from "../../api/client";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { DatasetUploadResponse } from "../../types/api";

export function DatasetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToCart } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const isDemo = searchParams.get("mode") === "demo";

  const mutation = useMutation<DatasetUploadResponse, unknown, File>({
    mutationFn: (file: File) => uploadDataset(file),
    onSuccess: (response) => {
      addToCart({
        datasetId: response.dataset_id,
        filename: response.filename,
        origin: { kind: "upload" },
      });
    },
  });

  function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    mutation.mutate(file);
  }

  const result = mutation.data;

  return (
    <div className="min-h-screen bg-slate-50 p-10">
      <h1 className="text-2xl font-semibold text-slate-800">
        Upload your dataset
      </h1>
      <p className="mt-2 max-w-xl text-slate-500">
        {isDemo 
          ? "Stai utilizzando il dataset pre-caricato SynClair_Toy_Dataset_v1.csv."
          : "Upload a CSV or Parquet file. You'll be able to review and adjust the column configuration in the next step."
        }
      </p>

      {/* Se siamo in DEMO MODE mostra il banner dedicato invece dell'upload manuale */}
      {isDemo ? (
        <div className="mt-6 rounded-lg border border-cyan-200 bg-cyan-50/50 p-6">
          <p className="text-sm font-semibold text-cyan-900">Toy Dataset Attivo</p>
          <p className="mt-1 text-xs text-cyan-700">Non è necessario caricare file in modalità Demo.</p>
          <button
            onClick={() => navigate("/demo")}
            className="mt-4 rounded bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            Continue to configuration →
          </button>
        </div>
      ) : (

      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.parquet,.json,.xlsx,.xls"
          onChange={handleFileChange}
          className="block text-sm text-slate-600"
        />
        {selectedFileName && (
          <p className="mt-2 text-sm text-slate-500">Selected: {selectedFileName}</p>
        )}

        {mutation.isPending && (
          <p className="mt-4 text-sm text-slate-500">Uploading and parsing dataset...</p>
        )}

        {mutation.isError && (
          <p className="mt-4 text-sm text-red-600">
            Upload failed. Please check the file format and try again.
          </p>
        )}
      </div>
      )}

      {result && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">{result.filename}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {result.n_rows} rows · {result.n_columns} columns
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  {result.columns.map((column) => (
                    <th key={column.name} className="whitespace-nowrap px-3 py-2 font-medium">
                      {column.name}
                      <span className="ml-1 text-xs text-slate-400">({column.dtype})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-100">
                    {result.columns.map((column) => (
                      <td key={column.name} className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {String(row[column.name] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => navigate("/workspace/modules")}
            className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm text-white"
          >
            Continue to module selection →
          </button>

          <div className="mt-6 flex justify-end">
            <Link to="/" className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              ← Back to Home
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}