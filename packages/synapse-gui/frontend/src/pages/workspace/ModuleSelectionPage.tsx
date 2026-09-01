/**
 * Workspace module selection. Only "structure" is enabled today; other
 * entries are shown as disabled placeholders, so adding a new module in
 * the future means only extending this list, not touching the router.
 */

import { Link, useNavigate } from "react-router-dom";
import { useWorkspace } from "../../context/WorkspaceContext";
//import { AVAILABLE_MODULES } from "../../constants/modules";



const AVAILABLE_MODULES = [
  { id: "structure", title: "Structure Discovery", enabled: true },
  { id: "matching", title: "Dataset Matching", enabled: false },
  { id: "validation", title: "Synthetic Validation", enabled: false },
  { id: "discovery", title: "Constraint Discovery", enabled: false },
];

export function ModuleSelectionPage() {
  const navigate = useNavigate();
  const { setSelectedModule } = useWorkspace();

  return (
    <div className="min-h-screen bg-slate-50 p-10 flex flex-col">
      <div className="flex-1">
        <h1 className="text-2xl font-semibold text-slate-800">Select a module</h1>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {AVAILABLE_MODULES.map((mod) => (
            <button
              key={mod.id}
              disabled={!mod.enabled}
              onClick={() => {
                setSelectedModule(mod.id);
                navigate(`/workspace/modules/${mod.id}/config`);
              }}
              className="rounded-lg border border-slate-200 bg-white p-6 text-left shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <h2 className="font-medium text-slate-800">{mod.title}</h2>
              
              {!mod.enabled && <p className="mt-1 text-xs text-slate-400">Coming soon</p>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-6">
        <Link to="/" className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}