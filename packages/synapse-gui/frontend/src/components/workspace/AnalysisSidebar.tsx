/**
 * synapse-gui frontend AnalysisSidebar
 * -----------------------------------------
 *
 * Persistent Workspace navigation: 7 sections. Node state (done/
 * current/pending) is derived from populationSelection + runs instead
 * of a single jobId, since the run history can now hold many runs.
 */

import { Link, NavLink, useParams } from "react-router-dom";

import { isPopulationSelectionValid, useWorkspace } from "../../context/WorkspaceContext";

const SECTIONS = [
  { path: "data", label: "Data" },
  { path: "exploration", label: "Exploration" },
  { path: "design", label: "Matching Design" },
  { path: "pipeline", label: "Pipeline" },
  { path: "results", label: "Results" },
  { path: "compare", label: "Compare Runs" },
  { path: "export", label: "Export" },
];

export function AnalysisSidebar() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { populationSelection, runs, currentRunId } = useWorkspace();

  const hasValidPopulation = isPopulationSelectionValid(populationSelection);
  const hasAnyRun = runs.length > 0;
  const currentRunCompleted = Boolean(currentRunId); // refined once RunGuard's live status is threaded through in Phase C

  const nodeState = (path: string): "done" | "current" | "pending" => {
    if (path === "data") return hasValidPopulation ? "done" : "current";
    if (path === "exploration" || path === "design" || path === "pipeline") {
      if (!hasValidPopulation) return "pending";
      return hasAnyRun ? "done" : "current";
    }
    if (path === "results") return currentRunCompleted ? "done" : "pending";
    if (path === "compare") return hasAnyRun ? "done" : "pending";
    return "pending"; // export
  };

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/" className="text-sm font-bold text-slate-800 hover:text-blue-600">Synapse</Link>
        <Link to="/workspace/modules" className="text-xs text-slate-500 hover:text-blue-600">← Modules</Link>
      </div>

      <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{moduleId}</div>

      <nav className="flex flex-col">
        {SECTIONS.map((section, index) => {
          const state = nodeState(section.path);
          return (
            <div key={section.path} className="relative flex items-start gap-3 pb-4">
              {index < SECTIONS.length - 1 && (
                <div className={`absolute left-[5px] top-4 h-full w-px ${state === "done" ? "bg-blue-400" : "bg-slate-200"}`} />
              )}
              <span
                className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 ${
                  state === "done" ? "border-blue-600 bg-blue-600" : state === "current" ? "border-blue-600 bg-white" : "border-slate-300 bg-white"
                }`}
              />
              <NavLink
                to={`/workspace/modules/${moduleId}/${section.path}`}
                className={({ isActive }) =>
                  `text-sm ${isActive ? "font-medium text-blue-700" : state === "pending" ? "text-slate-400" : "text-slate-600"}`
                }
              >
                {section.label}
              </NavLink>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}