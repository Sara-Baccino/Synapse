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

interface WorkspaceContextValue {
  cart: CartDatasetEntry[];
  activeDatasetIds: string | null;
  dataConfig: DataConfigDTO | null;
  selectedModuleId: string | null;
  jobId: string | null;

  addToCart: (entry: Omit<CartDatasetEntry, "addedAt">) => void;
  setActiveDataset: (datasetId: string) => void;
  removeFromCart: (datasetId: string) => void;
  setDataConfig: (dataConfig: DataConfigDTO) => void;
  setSelectedModule: (moduleId: string) => void;
  setJobId: (jobId: string | null) => void;
  reset: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartDatasetEntry[]>([]);
  const [activeDatasetIds, setActiveDatasetId] = useState<string | null>(null);
  const [dataConfig, setDataConfigState] = useState<DataConfigDTO | null>(null);
  const [selectedModuleId, setSelectedModuleIdState] = useState<string | null>(null);
  const [jobId, setJobIdState] = useState<string | null>(null);

  function addToCart(entry: Omit<CartDatasetEntry, "addedAt">): void {
    setCart((prev) => [...prev.filter((e) => e.datasetId !== entry.datasetId), { ...entry, addedAt: Date.now() }]);
    setActiveDatasetId(entry.datasetId);
    setDataConfigState(null);
    setJobIdState(null);
  }

  function setActiveDataset(datasetId: string): void {
    setActiveDatasetId(datasetId);
    setDataConfigState(null);
    setJobIdState(null);
  }

  function removeFromCart(datasetId: string): void {
    setCart((prev) => prev.filter((e) => e.datasetId !== datasetId));
    if (activeDatasetIds === datasetId) {
      setActiveDatasetId(null);
      setDataConfigState(null);
    }
  }

  function setDataConfig(newDataConfig: DataConfigDTO): void {
    setDataConfigState(newDataConfig);
  }

  function setSelectedModule(moduleId: string): void {
    setSelectedModuleIdState(moduleId);
    setJobIdState(null);
  }

  function setJobId(newJobId: string | null): void {
    setJobIdState(newJobId);
  }

  function reset(): void {
    setCart([]);
    setActiveDatasetId(null);
    setDataConfigState(null);
    setSelectedModuleIdState(null);
    setJobIdState(null);
  }

  return (
    <WorkspaceContext.Provider
      value={{
        cart, activeDatasetIds, dataConfig, selectedModuleId, jobId,
        addToCart, setActiveDataset, removeFromCart, setDataConfig, setSelectedModule, setJobId, reset,
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