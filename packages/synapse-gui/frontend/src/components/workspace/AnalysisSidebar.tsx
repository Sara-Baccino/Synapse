import { Link, NavLink, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getJobStatus } from "../../api/client";
import { useWorkspace } from "../../context/WorkspaceContext";

const SECTIONS = [
  { path: "config", label: "Config" },
  { path: "pipeline", label: "Pipeline" },
  { path: "results", label: "Results" },
  { path: "export", label: "Export" },
];

export function AnalysisSidebar() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { cart, activeDatasetId, setActiveDataset, jobId } = useWorkspace();

  const jobStatusQuery = useQuery({
    queryKey: ["sidebar-job-status", jobId],
    queryFn: ({ signal }) => getJobStatus(jobId!, signal),
    enabled: Boolean(jobId),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "completed" ? false : 1000),
  });
  const jobStatus = jobStatusQuery.data?.status;

  const nodeState = (path: string): "done" | "current" | "pending" => {
    if (path === "config") return jobId ? "done" : "current";
    if (path === "pipeline") {
      if (jobStatus === "completed") return "done";
      if (jobId) return "current";
      return "pending";
    }
    return jobStatus === "completed" ? "done" : "pending";
  };

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/" className="text-sm font-bold text-slate-800 hover:text-blue-600">synapse</Link>
        <Link to="/workspace/modules" className="text-xs text-slate-500 hover:text-blue-600">← Modules</Link>
      </div>

      <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{moduleId}</div>

      {/* Dataset cart */}
      <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Datasets</span>
          <Link to="/workspace/dataset" className="text-xs text-blue-600 hover:underline">+ Add</Link>
        </div>
        {cart.length === 0 && <p className="text-xs text-slate-400">No dataset yet.</p>}
        <ul className="space-y-1">
          {cart.map((entry) => (
            <li key={entry.datasetId}>
              <button
                onClick={() => setActiveDataset(entry.datasetId)}
                className={`w-full truncate rounded px-2 py-1 text-left text-xs ${
                  entry.datasetId === activeDatasetId ? "bg-blue-100 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-100"
                }`}
                title={entry.filename}
              >
                {entry.origin.kind === "artifact" ? "🔗 " : "📄 "}
                {entry.filename}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <nav className="flex flex-col">
        {SECTIONS.map((section, index) => {
          const state = nodeState(section.path);
          return (
            <div key={section.path} className="relative flex items-start gap-3 pb-4">
              {index < SECTIONS.length - 1 && (
                <div className={`absolute left-[5px] top-4 h-full w-px ${state === "done" ? "bg-blue-400" : "bg-slate-200"}`} />
              )}
              <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 ${
                state === "done" ? "border-blue-600 bg-blue-600" : state === "current" ? "border-blue-600 bg-white" : "border-slate-300 bg-white"
              }`} />
              <NavLink
                to={`/workspace/modules/${moduleId}/${section.path}`}
                className={({ isActive }) => `text-sm ${isActive ? "font-medium text-blue-700" : state === "pending" ? "text-slate-400" : "text-slate-600"}`}
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