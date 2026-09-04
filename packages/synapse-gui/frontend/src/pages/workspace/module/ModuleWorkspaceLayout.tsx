/**
 * synapse-gui ModuleWorkspaceLayout
 * -----------------------------------------
 * Header principale con Logo Synapse a sinistra (Home),
 * Tab di navigazione centrati al mezzo, e area contenuti.
 */
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { useWorkspace } from "../../../context/WorkspaceContext";


export function ModuleWorkspaceLayout() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const currentModule = moduleId || "matching";
  const { populationSelection, currentRunId } = useWorkspace();

  // Condizioni per sbloccare i tab durante la navigazione
  const isDataConfigured = Boolean(populationSelection);
  const isRunExecuted = Boolean(currentRunId);

  const navItems = [
    { label: "Data", path: "data", enabled: true },
    { label: "Exploration", path: "exploration", enabled: isDataConfigured },
    { label: "Design", path: "design", enabled: isDataConfigured },
    { label: "Pipeline", path: "pipeline", enabled: isDataConfigured },
    { label: "Results", path: "results", enabled: isDataConfigured && isRunExecuted },
    { label: "Export", path: "export", enabled: isDataConfigured && isRunExecuted },
  ];


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar Header */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
        
        {/* Sinistra: Logo Synapse (reindirizza alla landing/home) */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-violet-500 via-pink-500 to-amber-400 bg-clip-text text-transparent">
              Synapse
            </span>
          </Link>
        </div>

        {/* Centro: Bottoni di navigazione centrati */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const targetPath = `/workspace/modules/${currentModule}/${item.path}`;

            if (!item.enabled) {
              return (
                <span
                  key={item.path}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 cursor-not-allowed select-none rounded-md"
                  title="Completa lo step precedente per accedere"
                >
                  {item.label}
                </span>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={targetPath}
                className={({ isActive }) =>
                  `px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Destra: Spazio di bilanciamento / Indicatore di Modulo */}
        <div className="flex items-center justify-end">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
            {currentModule}
          </span>
        </div>
      </header>

      {/* Contenuto principale centralizzato */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}