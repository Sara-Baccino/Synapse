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
      workingDatasetId: string;
      treatmentColumn: string;
      idColumn: string | null;
      matchingCovariates: string[];
    }
  | {
      mode: "two_datasets";
      datasetIdA: string;
      datasetIdB: string;
      workingDatasetId: string | null;
      treatmentColumn: string;
      idColumn: string | null;
      matchingCovariates: string[];
    };

// Everything downstream of the Dataset page (Explore, Matching Design, Run)
// reads workingDatasetId/treatmentColumn only -- it never needs to know
// whether the working dataset came from a single upload or from merging
// two populations. For "single_dataset", workingDatasetId is always equal
// to datasetId (set at selection time); for "two_datasets", it stays null
// until POST /datasets/merge-populations succeeds, and this getter is what
// isPopulationSelectionValid uses to require that step actually happened.
export function getWorkingDataset(
  selection: PopulationSelection | null
): { datasetId: string; treatmentColumn: string } | null {
  if (!selection || !selection.workingDatasetId) return null;
  return { datasetId: selection.workingDatasetId, treatmentColumn: selection.treatmentColumn };
}

export function isPopulationSelectionValid(selection: PopulationSelection | null): boolean {
  if (!selection) return false;
  if (!selection.workingDatasetId || !selection.treatmentColumn) return false;
  if (selection.matchingCovariates.length === 0) return false;
  if (selection.mode === "single_dataset") return Boolean(selection.datasetId);
  return Boolean(selection.datasetIdA && selection.datasetIdB);
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
  moduleConfig: Record<string, unknown> | null;

  runs: RunEntry[];
  currentRunId: string | null;

  addToCart: (entry: Omit<CartDatasetEntry, "addedAt">) => void;
  removeFromCart: (datasetId: string) => void;
  setDataConfigFor: (datasetId: string, dataConfig: DataConfigDTO) => void;
  setSelectedModule: (moduleId: string) => void;

  setPopulationSelection: (selection: PopulationSelection) => void;
  setModuleConfig: (config: Record<string, unknown>) => void;

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
  const [moduleConfig, setModuleConfigState] = useState<Record<string, unknown> | null>(null);
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
    // Changing which dataset(s)/populations are in play invalidates any
    // matching design chosen for the previous selection (covariate lists,
    // in particular, would silently reference columns that may not even
    // exist in the new selection).
    setModuleConfigState(null);
  }

  function setModuleConfig(config: Record<string, unknown>): void {
    setModuleConfigState(config);
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
    setModuleConfigState(null);
    setRuns([]);
    setCurrentRunId(null);
  }

  return (
    <WorkspaceContext.Provider
      value={{
        cart, dataConfigs, selectedModuleId, populationSelection, moduleConfig, runs, currentRunId,
        addToCart, removeFromCart, setDataConfigFor, setSelectedModule,
        setPopulationSelection, setModuleConfig, addRun, setCurrentRun, renameRun, reset,
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