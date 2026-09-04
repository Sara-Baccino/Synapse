/**
 * synapse-gui frontend WorkspaceContext
 * -------------------------------------------
 *
 * Holds two independent concerns:
 *  1. Dataset Cart -- every dataset uploaded/promoted in this session,
 *     recycled from SynClair.
 *  2. PopulationSelection -- how the two populations to compare are
 *     currently defined: either one dataset split by a treatment/group
 *     column, or two separate datasets. A single discriminated union,
 *     not two parallel disconnected states, per the Phase A decision.
 *  3. Run history (runs[] + currentRunId) -- every matching run
 *     executed in this session is appended, never overwritten, so
 *     Compare Runs can look back at any of them. Session-only (no
 *     server-side persistence), matching the rest of this Context.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { DataConfigDTO } from "../types/api";

export interface CartDatasetOrigin {
  kind: "upload" | "artifact";
  sourceJobId?: string;
  sourceModuleId?: string;
  artifactName?: string;
}

export interface CartDatasetEntry {
  datasetId: string;
  filename: string;
  origin: CartDatasetOrigin;
  addedAt: number;
}

export type PopulationSelection =
  | {
      mode: "single_dataset";
      datasetId: string;
      treatmentColumn: string;
      idColumn: string | null;
      matchingCovariates: string[];
    }
  | {
      mode: "two_datasets";
      datasetIdA: string;
      datasetIdB: string;
      idColumn: string | null;
      matchingCovariates: string[];
    };

export function isPopulationSelectionValid(selection: PopulationSelection | null): boolean {
  if (!selection) return false;
  if (selection.mode === "single_dataset") {
    return Boolean(selection.datasetId && selection.treatmentColumn && selection.matchingCovariates.length > 0);
  }
  return Boolean(selection.datasetIdA && selection.datasetIdB && selection.matchingCovariates.length > 0);
}

export interface RunEntry {
  id: string;
  jobId: string;
  label: string;
  createdAt: number;
  moduleConfigSnapshot: Record<string, unknown>;
  populationSelectionSnapshot: PopulationSelection;
}

interface WorkspaceContextValue {
  cart: CartDatasetEntry[];
  dataConfigs: Record<string, DataConfigDTO>;
  selectedModuleId: string | null;

  populationSelection: PopulationSelection | null;

  runs: RunEntry[];
  currentRunId: string | null;

  addToCart: (entry: Omit<CartDatasetEntry, "addedAt">) => void;
  removeFromCart: (datasetId: string) => void;
  setDataConfigFor: (datasetId: string, dataConfig: DataConfigDTO) => void;
  setSelectedModule: (moduleId: string) => void;

  setPopulationSelection: (selection: PopulationSelection) => void;

  addRun: (run: Omit<RunEntry, "id" | "createdAt">) => void;
  setCurrentRun: (runId: string) => void;
  renameRun: (runId: string, label: string) => void;

  reset: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function generateLocalId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartDatasetEntry[]>([]);
  const [dataConfigs, setDataConfigs] = useState<Record<string, DataConfigDTO>>({});
  const [selectedModuleId, setSelectedModuleIdState] = useState<string | null>(null);
  const [populationSelection, setPopulationSelectionState] = useState<PopulationSelection | null>(null);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  function addToCart(entry: Omit<CartDatasetEntry, "addedAt">): void {
    setCart((prev) => [...prev.filter((e) => e.datasetId !== entry.datasetId), { ...entry, addedAt: Date.now() }]);
  }

  function removeFromCart(datasetId: string): void {
    setCart((prev) => prev.filter((e) => e.datasetId !== datasetId));
    setDataConfigs((prev) => {
      const next = { ...prev };
      delete next[datasetId];
      return next;
    });
  }

  function setDataConfigFor(datasetId: string, dataConfig: DataConfigDTO): void {
    setDataConfigs((prev) => ({ ...prev, [datasetId]: dataConfig }));
  }

  function setSelectedModule(moduleId: string): void {
    setSelectedModuleIdState(moduleId);
  }

  function setPopulationSelection(selection: PopulationSelection): void {
    setPopulationSelectionState(selection);
  }

  function addRun(run: Omit<RunEntry, "id" | "createdAt">): void {
    const newRun: RunEntry = { ...run, id: generateLocalId(), createdAt: Date.now() };
    setRuns((prev) => [...prev, newRun]);
    setCurrentRunId(newRun.id);
  }

  function setCurrentRun(runId: string): void {
    setCurrentRunId(runId);
  }

  function renameRun(runId: string, label: string): void {
    setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, label } : r)));
  }

  function reset(): void {
    setCart([]);
    setDataConfigs({});
    setSelectedModuleIdState(null);
    setPopulationSelectionState(null);
    setRuns([]);
    setCurrentRunId(null);
  }

  return (
    <WorkspaceContext.Provider
      value={{
        cart, dataConfigs, selectedModuleId, populationSelection, runs, currentRunId,
        addToCart, removeFromCart, setDataConfigFor, setSelectedModule,
        setPopulationSelection, addRun, setCurrentRun, renameRun, reset,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (context === undefined) throw new Error("useWorkspace() must be used within a <WorkspaceProvider>.");
  return context;
}