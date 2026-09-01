import { useNavigate, useParams } from "react-router-dom";
import { getModuleTitle, MODULE_CONTENT } from "../constants/modules";
import { InteractiveModulePreview } from "../components/InteractiveModulePreview";

export const AVAILABLE_MODULES = [
  { id: "matching", title: "Population Matching", enabled: true },
  { id: "causal_estimation", title: "Causal Effect Estimation", enabled: false },  // predisposto, non implementato
];

export function ModuleInfoPage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const content = moduleId ? MODULE_CONTENT[moduleId] : undefined;

  return (
    <div className="min-h-screen w-full bg-[#FAF8F5] text-[#1E293B] font-['Manrope',sans-serif]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" />
      <div className="max-w-5xl mx-auto p-8">
        <button onClick={() => navigate("/")} className="mb-8 text-sm text-[#0284C7] hover:underline">
          ← Back to Landing Page
        </button>

        <h1 className="text-4xl font-bold mb-4 text-[#1E293B]">{getModuleTitle(moduleId)}</h1>
        <p className="text-[#64748B] mb-10 max-w-2xl">{content?.whatItDoes}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm">
            <h2 className="text-xl font-bold text-[#0284C7] mb-4">Algorithms & Tools</h2>
            {content && content.algorithms.length > 0 ? (
              <ul className="list-disc list-inside space-y-1 text-[#64748B] text-sm">
                {content.algorithms.map((a) => <li key={a}>{a}</li>)}
              </ul>
            ) : <p className="text-sm text-[#94A3B8]">Coming soon.</p>}
          </div>

          <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm">
            <h2 className="text-xl font-bold text-[#0284C7] mb-4">Configurable Parameters</h2>
            {content && content.parameters.length > 0 ? (
              <ul className="list-disc list-inside space-y-1 text-[#64748B] text-sm">
                {content.parameters.map((p) => <li key={p}>{p}</li>)}
              </ul>
            ) : <p className="text-sm text-[#94A3B8]">Coming soon.</p>}
          </div>

          <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm md:col-span-2">
            <h2 className="text-xl font-bold text-[#0284C7] mb-4">Results Produced</h2>
            {content && content.resultTypes.length > 0 ? (
              <ul className="list-disc list-inside space-y-1 text-[#64748B] text-sm">
                {content.resultTypes.map((r) => <li key={r}>{r}</li>)}
              </ul>
            ) : <p className="text-sm text-[#94A3B8]">Coming soon.</p>}
          </div>
        </div>

        {content?.hasInteractivePreview && <InteractiveModulePreview />}
      </div>
    </div>
  );
}