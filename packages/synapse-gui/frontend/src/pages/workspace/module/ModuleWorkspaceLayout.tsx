import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom";

export function ModuleWorkspaceLayout() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const steps = [
    { id: "config", label: "Configuration" },
    { id: "pipeline", label: "Pipeline" },
    { id: "results", label: "Results" },
    { id: "export", label: "Export" },
  ];

  const currentStep = location.pathname.split("/").pop() || "config";

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1E293B] font-['Manrope',sans-serif] flex flex-col">
      <header className="bg-white border-b border-[#E2E8F0] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate("/workspace/modules")}
            className="text-sm text-[#0284C7] hover:underline"
          >
            ← Modules
          </button>
          <h1 className="text-xl font-bold capitalize">{moduleId} Workspace</h1>
        </div>
        <nav className="flex space-x-2">
          {steps.map((step) => {
            const isActive = currentStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => navigate(`/workspace/modules/${moduleId}/${step.id}`)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#0284C7] text-white"
                    : "text-[#64748B] hover:bg-[#F1F5F9]"
                }`}
              >
                {step.label}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}