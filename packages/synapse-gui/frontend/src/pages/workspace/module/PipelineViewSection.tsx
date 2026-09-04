/**
 * synapse-gui frontend PipelineViewSection
 * ---------------------------------------------------
 *
 * Read-only view of the pipeline that will run: Population ->
 * Preprocessing -> Representation -> Distance -> Matching Strategy ->
 * Diagnostics -> Results, with each step's active/inactive state and
 * key config values shown before execution. The "Run" action lives
 * here, not in Matching Design (which only edits config).
 *
 * Phase A: config values are read from local mock-equivalent defaults
 * (Matching Design's real state isn't lifted to WorkspaceContext yet --
 * that wiring happens in Phase C). Run button is present but disabled,
 * clearly labeled, since POST /matching/run needs a real
 * MatchingModuleConfig built from Matching Design's state.
 */

import { useWorkspace } from "../../../context/WorkspaceContext";

interface PipelineStep {
  id: string;
  label: string;
  active: boolean;
  summary: string;
}

export function PipelineViewSection() {
  const { populationSelection } = useWorkspace();

  const steps: PipelineStep[] = [
    {
      id: "population",
      label: "Population",
      active: true,
      summary:
        populationSelection?.mode === "single_dataset"
          ? `Single dataset, split by "${populationSelection.treatmentColumn}"`
          : populationSelection?.mode === "two_datasets"
          ? "Two separate datasets"
          : "Not configured yet",
    },
    { id: "preprocessing", label: "Preprocessing / Filtering", active: false, summary: "No trimming applied" },
    { id: "representation", label: "Representation", active: true, summary: "Propensity score (logistic)" },
    { id: "distance", label: "Distance", active: true, summary: "Euclidean" },
    { id: "strategy", label: "Matching Strategy", active: true, summary: "Nearest Neighbor, 1:1, no replacement" },
    { id: "diagnostics", label: "Diagnostics", active: true, summary: "SMD, overlap, pair diagnostics" },
    { id: "results", label: "Results", active: true, summary: "Produced after run" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Pipeline</h1>
      <p className="mb-6 text-sm text-slate-500">
        This is the sequence that will execute when you run the matching analysis.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {steps.map((step, index) => (
          <div key={step.id} className="relative flex items-start gap-4 pb-6 last:pb-0">
            {index < steps.length - 1 && (
              <div className={`absolute left-[9px] top-6 h-full w-px ${step.active ? "bg-blue-300" : "bg-slate-200"}`} />
            )}
            <span
              className={`mt-1 h-5 w-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                step.active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-400"
              }`}
            >
              {index + 1}
            </span>
            <div>
              <p className={`text-sm font-medium ${step.active ? "text-slate-800" : "text-slate-400"}`}>{step.label}</p>
              <p className="text-xs text-slate-500">{step.summary}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        disabled
        title="Wired to POST /matching/run in Phase C, once Matching Design's config is lifted to shared state"
        className="mt-6 rounded bg-slate-200 px-4 py-2 text-sm text-slate-400 cursor-not-allowed"
      >
        Run analysis (connected in Phase C) →
      </button>
    </div>
  );
}