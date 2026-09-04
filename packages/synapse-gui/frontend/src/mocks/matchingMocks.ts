/**
 * synapse-gui frontend matching mocks
 * -----------------------------------------
 *
 * Fixture data used ONLY by Phase A skeleton sections, clearly isolated
 * from real API calls. Every consumer of this file will be updated in
 * Phase C to call the real backend instead (POST /matching/explore,
 * getMatchingJobResult, etc.) -- nothing here should survive past that
 * phase. Shapes are deliberately modeled after what the real backend
 * DTOs will look like, so swapping mock->real requires no UI rework.
 */

export interface MockNumericDistribution {
  variable: string;
  bin_edges: number[];
  treated_counts: number[];
  control_counts: number[];
}

export interface MockCategoricalFrequency {
  variable: string;
  categories: string[];
  treated_frequencies: number[];
  control_frequencies: number[];
}

export interface MockMissingnessRow {
  variable: string;
  treated_missing_pct: number;
  control_missing_pct: number;
}

export interface MockCorrelationMatrix {
  variables: string[];
  treated_matrix: number[][];
  control_matrix: number[][];
}

export const MOCK_EXPLORATION = {
  descriptiveStats: [
    { variable: "age", group: "treated", mean: 58.2, std: 11.4, min: 24, max: 85 },
    { variable: "age", group: "control", mean: 47.9, std: 12.8, min: 20, max: 82 },
    { variable: "clinical_score", group: "treated", mean: 30.1, std: 6.2, min: 12, max: 48 },
    { variable: "clinical_score", group: "control", mean: 24.6, std: 6.8, min: 8, max: 44 },
  ],
  numericDistributions: [
    {
      variable: "age",
      bin_edges: [20, 32, 44, 56, 68, 80, 92],
      treated_counts: [3, 8, 22, 41, 35, 11],
      control_counts: [18, 34, 40, 22, 9, 3],
    },
  ] as MockNumericDistribution[],
  categoricalFrequencies: [
    {
      variable: "region",
      categories: ["north", "south", "east"],
      treated_frequencies: [0.42, 0.35, 0.23],
      control_frequencies: [0.31, 0.29, 0.40],
    },
  ] as MockCategoricalFrequency[],
  missingness: [
    { variable: "age", treated_missing_pct: 0.02, control_missing_pct: 0.01 },
    { variable: "clinical_score", treated_missing_pct: 0.05, control_missing_pct: 0.08 },
  ] as MockMissingnessRow[],
  correlations: {
    variables: ["age", "clinical_score"],
    treated_matrix: [[1.0, 0.62], [0.62, 1.0]],
    control_matrix: [[1.0, 0.48], [0.48, 1.0]],
  } as MockCorrelationMatrix,
};

export const MOCK_RESULT = {
  summary: { n_query_total: 120, n_query_matched: 98, n_query_unmatched: 22, match_rate: 0.817, n_pairs: 98 },
  balance: [
    { variable: "age", is_matching_covariate: true, smd_before: 0.61, smd_after: 0.08 },
    { variable: "clinical_score", is_matching_covariate: true, smd_before: 0.54, smd_after: 0.11 },
    { variable: "region", is_matching_covariate: false, smd_before: 0.22, smd_after: 0.19 },
  ],
  overlap: { treated_ps_min: 0.08, treated_ps_max: 0.91, control_ps_min: 0.04, control_ps_max: 0.85, common_support_min: 0.08, common_support_max: 0.85 },
  pairDiagnostics: {
    n_pairs: 98, mean_distance: 0.042, median_distance: 0.031, min_distance: 0.001, max_distance: 0.198,
    p25_distance: 0.015, p75_distance: 0.058, n_pool_units_reused: 3,
  },
  matchedPreview: {
    columns: ["patient_id", "age", "clinical_score", "treatment", "pair_id", "weights"],
    rows: [
      { patient_id: 12, age: 58, clinical_score: 29.4, treatment: 1, pair_id: 0, weights: 1.0 },
      { patient_id: 47, age: 59, clinical_score: 30.1, treatment: 0, pair_id: 0, weights: 1.0 },
    ],
  },
};

export const MOCK_RUNS_LIST = [
  { id: "mock-run-a", label: "Run A — Nearest Neighbor + Euclidean", createdAt: Date.now() - 3_600_000, matchRate: 0.82, meanDistance: 0.042, nPairs: 98 },
  { id: "mock-run-b", label: "Run B — Propensity Score Matching", createdAt: Date.now() - 1_800_000, matchRate: 0.76, meanDistance: 0.031, nPairs: 91 },
];