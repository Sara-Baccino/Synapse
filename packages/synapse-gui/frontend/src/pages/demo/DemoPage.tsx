import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { getDemoTools, runDemoStructure } from "../../api/client";
import { MatchingStrategyPicker } from "../../components/MatchingStrategyPicker";
import { DemoProvider, useDemo } from "../../context/DemoContext";
import type { ClusteringAlgorithmName, DemoDatasetName } from "../../types/api";

import { AVAILABLE_MODULES } from "../../constants/modules";
import {
  CartesianGrid,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";


function DemoIntro() {
  const { startAnalysis } = useDemo();
  const toolsQuery = useQuery({ queryKey: ["demo-tools"], queryFn: ({ signal }) => getDemoTools(signal) });

  return (
    <div className="min-h-screen bg-[#FAF8F5] p-8 flex flex-col">
      <div className="flex-1">
        <section className="max-w-3xl mx-auto text-center py-16">
          <h1 className="text-3xl font-semibold text-[#1E293B]">Try SynClair</h1>
          <p className="mt-4 text-[#64748B]">
            Upload a dataset, describe its columns, run an analysis, and inspect results and artifacts.
            This sandbox uses small toy datasets so you can try the real workflow without an account.
          </p>
        </section>

        <section className="max-w-4xl mx-auto">
          <h2 className="text-lg font-medium text-[#1E293B] mb-4">Choose a toy dataset</h2>

          {toolsQuery.isLoading && <p className="text-sm text-slate-500">Loading datasets...</p>}
          {toolsQuery.isError && <p className="text-sm text-red-600">Could not load demo datasets.</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {toolsQuery.data?.demo_datasets.map((d) => (
              <div key={d.name} className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold text-[#1E293B]">{d.title}</h3>
                <p className="mt-1 text-sm text-[#64748B]">{d.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#64748B]">
                  <div>Rows: <span className="font-medium text-[#1E293B]">{d.n_rows}</span></div>
                  <div>Columns: <span className="font-medium text-[#1E293B]">{d.n_columns}</span></div>
                  <div>Numerical: <span className="font-medium text-[#1E293B]">{d.n_numerical}</span></div>
                  <div>Categorical: <span className="font-medium text-[#1E293B]">{d.n_categorical}</span></div>
                </dl>
                <button
                  onClick={() => startAnalysis({ kind: "toy", datasetName: d.name as DemoDatasetName }, "structure", d.columns)}
                  className="mt-4 w-full rounded bg-[#0284C7] px-3 py-2 text-sm text-white"
                >
                  Use {d.title} with Structure →
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex justify-end pt-6 max-w-4xl mx-auto w-full">
        <Link to="/" className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-white">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
function DemoAnalysis() {
  const { step, experiments, resetToIntro, setStepResult, recordExperiment, continueWithSource } = useDemo();
  const [algorithm, setAlgorithm] = useState<ClusteringAlgorithmName>("kmeans");
  const [primaryParam, setPrimaryParam] = useState(3);
  const [includeProjection, setIncludeProjection] = useState(true);
  const [excludedColumns, setExcludedColumns] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<"config" | "module" | "pipeline" | "results">("config");
  
  const runMutation = useMutation({
    mutationFn: () => {
      if (!step) throw new Error("No analysis step active.");
      const shared = { n_clusters: primaryParam, include_projection: includeProjection, excluded_columns: excludedColumns };
      const body =
        step.source.kind === "toy"
          ? { dataset_name: step.source.datasetName, ...shared }
          : { inline_dataset: { columns: step.source.columns, rows: step.source.rows }, ...shared };
      return runDemoStructure(body);
    },
    onSuccess: (result) => {
      setStepResult(result);
      setActiveSection("results");
    },
  });
  if (!step) return null;

  const SECTIONS = [
    { id: "config" as const, label: "Config" },
    { id: "module" as const, label: "Module" },
    { id: "pipeline" as const, label: "Pipeline" },
    { id: "results" as const, label: "Results" },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 flex-shrink-0 border-r border-slate-200 bg-white p-4">
        <button onClick={resetToIntro} className="mb-4 text-xs text-[#0284C7] hover:underline">← Choose another dataset</button>
        <nav className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`rounded px-3 py-2 text-left text-sm ${activeSection === s.id ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-8 flex flex-col min-h-screen">
        <div className="flex-1">
          {activeSection === "config" && (
            <div>
              <h1 className="text-xl font-semibold text-slate-800 mb-4">Dataset & Columns</h1>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="px-3 py-2 font-medium">Column</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {step.columns.map((col) => (
                      <tr key={col.name} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">{col.name}</td>
                        <td className="px-3 py-2 text-slate-500">{col.numerical ? "numerical" : "categorical"}</td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!excludedColumns.includes(col.name)}
                            onChange={(e) =>
                              setExcludedColumns((prev) =>
                                e.target.checked ? prev.filter((c) => c !== col.name) : [...prev, col.name]
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Toggle columns off to exclude them from the analysis. Missing-data handling and scaling use
                automatic defaults in this sandbox.
              </p>
            </div>
          )}

          {activeSection === "module" && (
            <div>
              <h1 className="text-xl font-semibold text-slate-800 mb-4">Select a module</h1>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {AVAILABLE_MODULES.map((mod) => (
                  <div key={mod.id}
                    className={`rounded-lg border p-6 text-left shadow-sm ${mod.enabled ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white opacity-40"}`}>
                    <h2 className="font-medium text-slate-800">{mod.title}</h2>
                    <p className="mt-1 text-xs text-slate-400">{mod.enabled ? "Selected" : "Coming soon"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === "pipeline" && (
            <div>
              <h1 className="text-xl font-semibold text-slate-800 mb-4">Run Structure Discovery</h1>
              <MatchingStrategyPicker
                algorithm={algorithm} onAlgorithmChange={setAlgorithm}
                primaryParam={primaryParam} onPrimaryParamChange={setPrimaryParam}
                includeProjection={includeProjection} onIncludeProjectionChange={setIncludeProjection}
                disabled={runMutation.isPending}
              />
              <button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}
                className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {runMutation.isPending ? "Analisi in corso, attendi..." : "Run analysis →"}
              </button>
            </div>
          )}

          {activeSection === "results" && step.result?.success && (
            <div>
              <h1 className="text-xl font-semibold text-slate-800 mb-2">Structure Discovery Results</h1>
              <p className="text-sm text-slate-500 mb-4">
                Algorithm: <span className="font-medium text-slate-700">{algorithm}</span>
                {" · "}{algorithm === "hdbscan" ? "Min cluster size" : "Clusters"}: <span className="font-medium text-slate-700">{primaryParam}</span>
                {includeProjection && " · with 2D PCA projection"}
              </p>

              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-4">
                  {Object.entries(step.result.metrics).map(([k, v]) => (
                    <div key={k}><dt className="text-slate-400">{k}</dt><dd className="font-medium text-slate-800">{typeof v === "number" ? v.toFixed(3) : String(v)}</dd></div>
                  ))}
                </dl>
              </div>

              <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-medium text-slate-800 mb-3">Artifacts</h2>
                {step.result.embedding && step.result.embedding.length > 0 && (
                  <ScatterChart width={360} height={260}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" hide />
                    <YAxis type="number" dataKey="y" hide />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter
                      data={step.result.embedding.map((p, i) => ({ ...p, cluster: step.result!.labels[i] }))}
                      fill="#2563eb"
                    />
                  </ScatterChart>
                )}
                <p className="mt-3 text-sm text-slate-500">Clustered dataset ({step.result.clustered_rows.length} rows)</p>
                <div className="mt-2 overflow-x-auto max-h-64">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400">
                        {Object.keys(step.result.clustered_rows[0] ?? {}).map((c) => <th key={c} className="px-2 py-1">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {step.result.clustered_rows.slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1 text-slate-600">{String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {experiments.length > 0 && (
                <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-medium text-slate-800 mb-3">Previous experiments</h2>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {experiments.map((exp) => (
                      <li key={exp.id} className="border-b border-slate-100 pb-2">
                        {exp.algorithm} ({exp.primaryParam}) · silhouette{" "}
                        {typeof exp.result.metrics.silhouette === "number" ? exp.result.metrics.silhouette.toFixed(3) : "-"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-8 flex items-center gap-3">
                <button
                  onClick={() => {
                    recordExperiment({ moduleId: step.moduleId, algorithm, primaryParam, includeProjection, result: step.result! });
                    const rows = step.result!.clustered_rows;
                    const newColumns = Object.keys(rows[0]).map((name) => ({
                      name,
                      numerical: typeof rows[0][name] === "number",
                      categorical: typeof rows[0][name] !== "number",
                    }));
                    continueWithSource(
                      { kind: "artifact", label: "Previous analysis output", columns: Object.keys(rows[0]), rows },
                      "structure",
                      newColumns
                    );
                    setExcludedColumns([]);
                    setActiveSection("config");
                  }}
                  className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
                >
                  Continue composing pipeline →
                </button>
                <button onClick={resetToIntro} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600">End analysis</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end pt-6">
          <Link to="/" className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">← Back to Home</Link>
        </div>
      </main>
    </div>
  );
}

function DemoPageContent() {
  const { phase } = useDemo();
  return phase === "intro" ? <DemoIntro /> : <DemoAnalysis />;
}

export function DemoPage() {
  return (
    <DemoProvider>
      <DemoPageContent />
    </DemoProvider>
  );
}