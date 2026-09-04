import { createContext, useContext, useState, type ReactNode } from "react";
import type { AnalysisInputSource, DemoMatchingRunResponse } from "../types/api";

export interface DemoStep {
  moduleId: string;
  source: AnalysisInputSource;
  columns: { name: string; numerical: boolean; categorical: boolean }[];
  result?: DemoMatchingRunResponse;
}

export interface DemoExperiment {
  id: string;
  moduleId: string;
  algorithm: string;
  primaryParam: number;
  includeProjection: boolean;
  result: DemoMatchingRunResponse;
}

interface DemoContextValue {
  phase: "intro" | "analysis";
  step: DemoStep | null;
  experiments: DemoExperiment[];
  startAnalysis: (source: AnalysisInputSource, moduleId: string, columns: DemoStep["columns"]) => void;
  setStepResult: (result: DemoMatchingRunResponse) => void;
  recordExperiment: (exp: Omit<DemoExperiment, "id">) => void;
  continueWithSource: (source: AnalysisInputSource, moduleId: string, columns: DemoStep["columns"]) => void;
  resetToIntro: () => void;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"intro" | "analysis">("intro");
  const [step, setStep] = useState<DemoStep | null>(null);
  const [experiments, setExperiments] = useState<DemoExperiment[]>([]);

  function startAnalysis(source: AnalysisInputSource, moduleId: string, columns: DemoStep["columns"]): void {
    setStep({ moduleId, source, columns });
    setPhase("analysis");
  }

  function continueWithSource(source: AnalysisInputSource, moduleId: string, columns: DemoStep["columns"]): void {
    setStep({ moduleId, source, columns });
  }

  function setStepResult(result: DemoMatchingRunResponse): void {
    setStep((current) => (current ? { ...current, result } : current));
  }

  function recordExperiment(exp: Omit<DemoExperiment, "id">): void {
    setExperiments((prev) => [...prev, { ...exp, id: crypto.randomUUID() }]);
  }

  function resetToIntro(): void {
    setStep(null);
    setExperiments([]);
    setPhase("intro");
  }

  return (
    <DemoContext.Provider
      value={{ phase, step, experiments, startAnalysis, setStepResult, recordExperiment, continueWithSource, resetToIntro }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext);
  if (context === undefined) throw new Error("useDemo() must be used within a <DemoProvider>.");
  return context;
}