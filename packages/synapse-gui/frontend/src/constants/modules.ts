/**
 * Shared registry of Workspace modules: id, display title, and whether
 * the module is enabled today. Used by ModuleSelectionPage (module
 * picker), ModuleInfoPage (public info page), and any component that
 * needs to display a module's title given its id (e.g. ResultsSection).
 */

export interface ModuleDefinition {
  id: string;
  title: string;
  subtitle: string;
  enabled: boolean;
}

export interface ModuleContent {
  whatItDoes: string;
  algorithms: string[];
  parameters: string[];
  resultTypes: string[];
  hasInteractivePreview: boolean;
}

export const AVAILABLE_MODULES: ModuleDefinition[] = [
  { id: "matching", title: "Dataset Matching", subtitle: "Identify corresponding records across datasets.", enabled: true },
  { id: "structure", title: "Structure Discovery", subtitle: "Clustering, dimensionality reduction, and structure discovery.", enabled: false },
  { id: "validation", title: "Synthetic Validation", subtitle: "Validate synthetic datasets against real ones.", enabled: false },
  { id: "discovery", title: "Constraint Discovery", subtitle: "Find rules your data appears to follow.", enabled: false },
];

export const MODULE_CONTENT: Record<string, ModuleContent> = {
  matching: {
    whatItDoes: "Dataset Matching identifies corresponding records and matches across multiple datasets using advanced strategies.",
    algorithms: ["Blocking", "Record Linkage", "Similarity Metrics", "Threshold Tuning"],
    parameters: ["Blocking keys and strategies", "Similarity thresholds", "Weight configuration"],
    resultTypes: ["Matched pairs", "Match confidence scores", "Merged dataset (exportable)"],
    hasInteractivePreview: false,
  },
  structure: {
    whatItDoes:
      "Structure Discovery finds groups, subpopulations, and low-dimensional structure in your dataset via clustering and dimensionality reduction.",
    algorithms: ["KMeans", "HDBSCAN", "Agglomerative Clustering", "Gaussian Mixture", "Fuzzy C-Means", "PCA", "UMAP", "t-SNE", "Truncated SVD", "Kernel PCA", "PaCMAP"],
    parameters: ["Number of clusters / min cluster size", "Distance metric", "Projection method and dimensionality", "Optional stability and feature-importance analysis"],
    resultTypes: ["Cluster labels", "Silhouette / Davies-Bouldin / inertia metrics", "2D embedding for visualization", "Clustered dataset (exportable)"],
    hasInteractivePreview: false,
  },
  validation: {
    whatItDoes: "In development — will validate synthetic datasets against real reference data.",
    algorithms: [],
    parameters: [],
    resultTypes: [],
    hasInteractivePreview: false,
  },
  discovery: {
    whatItDoes: "In development — will discover implicit constraints and rules in your data.",
    algorithms: [],
    parameters: [],
    resultTypes: [],
    hasInteractivePreview: false,
  },
};

export function getModuleTitle(moduleId: string | undefined): string {
  if (!moduleId) return "Analysis";
  const found = AVAILABLE_MODULES.find((m) => m.id === moduleId);
  if (found) return found.title;
  return moduleId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}