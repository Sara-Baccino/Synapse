/**
 * synapse-gui frontend ExplorationSection
 * -----------------------------------------
 * Connesso a POST /matching/explore.
 * Supporta sia single_dataset che due dataset distinti (two_datasets)
 * consentendo di visualizzare i grafici pre-match in entrambi i casi.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { explorePopulation, type ExploreRequest, type PopulationProfile } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";

type Tab = "distributions" | "categorical" | "missingness" | "correlations";

export function ExplorationSection() {
  const { populationSelection } = useWorkspace();
  const [tab, setTab] = useState<Tab>("distributions");

  const isConfigured = Boolean(populationSelection);

  const profileQuery = useQuery<PopulationProfile>({
    queryKey: ["population-profile", populationSelection],
    queryFn: async () => {
      if (!populationSelection) throw new Error("Nessun dataset selezionato.");

      const covariates = populationSelection.matchingCovariates || [];

      // CASE 1: Single Dataset
      if (populationSelection.mode === "single_dataset") {
        const requestPayload: ExploreRequest = {
          dataset_id: populationSelection.datasetId,
          treatment_col: populationSelection.treatmentColumn,
          matching_covariates: covariates,
        };
        return await explorePopulation(requestPayload);
      }

      // CASE 2: Two Datasets (Trattati in A, Controlli in B)
      const { datasetIdA, datasetIdB } = populationSelection;

      // Tentiamo l'esplorazione separata dei due dataset per ricavare i profili
      const [resA, resB] = await Promise.allSettled([
        explorePopulation({ dataset_id: datasetIdA, treatment_col: "treatment", matching_covariates: covariates }),
        explorePopulation({ dataset_id: datasetIdB, treatment_col: "treatment", matching_covariates: covariates }),
      ]);

      // Se il backend supporta la chiamata separata, uniamo i dati:
      const profileA = resA.status === "fulfilled" ? resA.value : null;
      const profileB = resB.status === "fulfilled" ? resB.value : null;

      if (profileA || profileB) {
        return combineProfiles(profileA, profileB, covariates);
      }

      throw new Error("Impossibile calcolare il profilo per i due dataset selezionati.");
    },
    enabled: Boolean(
      isConfigured &&
      (populationSelection?.matchingCovariates?.length ?? 0) > 0
    ),
    retry: false,
  });

  if (!isConfigured) {
    return (
      <div className="p-6 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
        Nessun dataset configurato. Torna alla scheda <strong>Data</strong> per selezionare la popolazione.
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "distributions", label: "Distributions" },
    { id: "categorical", label: "Categorical" },
    { id: "missingness", label: "Missingness" },
    { id: "correlations", label: "Correlations" },
  ];

  const profile = profileQuery.data;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-slate-800 font-sans">Exploration (Pre-Match)</h1>
        {populationSelection.mode === "two_datasets" && (
          <span className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
            2 Dataset Separati
          </span>
        )}
      </div>

      {profileQuery.isLoading && (
        <p className="text-sm text-slate-500 animate-pulse">Calcolo profilo della popolazione pre-match in corso...</p>
      )}

      {profileQuery.isError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
          Failed to compute population profile: {profileQuery.error instanceof Error ? profileQuery.error.message : "Error"}
        </div>
      )}

      {profile && (
        <>
          <div className="mb-4 flex gap-2 border-b border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "border-b-2 border-blue-600 text-blue-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB 1: DISTRIBUTIONS */}
          {tab === "distributions" && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Descriptive statistics</h2>
              
              {(!profile.descriptive_stats || profile.descriptive_stats.length === 0) ? (
                <p className="text-xs text-slate-400 mb-4">Nessuna statistica descrittiva disponibile.</p>
              ) : (
                <table className="mb-6 min-w-full text-left text-xs divide-y divide-slate-200">
                  <thead>
                    <tr className="text-slate-500 bg-slate-50">
                      <th className="px-3 py-2">Variable</th>
                      <th className="px-3 py-2">Group</th>
                      <th className="px-3 py-2">Mean</th>
                      <th className="px-3 py-2">Std</th>
                      <th className="px-3 py-2">Min</th>
                      <th className="px-3 py-2">Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profile.descriptive_stats.map((row, i) => (
                      <tr key={`${row.variable}-${row.group}-${i}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.variable}</td>
                        <td className="px-3 py-2 text-slate-600 capitalize">{row.group}</td>
                        <td className="px-3 py-2 font-mono">{row.mean !== null && row.mean !== undefined ? row.mean.toFixed(2) : "-"}</td>
                        <td className="px-3 py-2 font-mono">{row.std !== null && row.std !== undefined ? row.std.toFixed(2) : "-"}</td>
                        <td className="px-3 py-2 font-mono">{row.min !== null && row.min !== undefined ? row.min.toFixed(2) : "-"}</td>
                        <td className="px-3 py-2 font-mono">{row.max !== null && row.max !== undefined ? row.max.toFixed(2) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {(!profile.numeric_distributions || profile.numeric_distributions.length === 0) && (
                <p className="text-xs text-slate-400">No numeric covariates with variation to plot.</p>
              )}

              {profile.numeric_distributions?.map((dist) => {
                const chartData = (dist.bin_edges || []).slice(0, -1).map((edge, i) => ({
                  bin: `${edge.toFixed(1)}-${dist.bin_edges[i + 1]?.toFixed(1)}`,
                  treated: dist.treated_counts?.[i] ?? 0,
                  control: dist.control_counts?.[i] ?? 0,
                }));

                return (
                  <div key={dist.variable} className="mb-6">
                    <p className="mb-2 text-sm font-semibold text-slate-700">{dist.variable}</p>
                    <BarChart width={520} height={240} data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bin" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="treated" fill="#2563eb" name="Treated" />
                      <Bar dataKey="control" fill="#f472b6" name="Control" />
                    </BarChart>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: CATEGORICAL */}
          {tab === "categorical" && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              {(!profile.categorical_frequencies || profile.categorical_frequencies.length === 0) ? (
                <p className="text-xs text-slate-400">No categorical covariates selected.</p>
              ) : (
                profile.categorical_frequencies.map((freq) => {
                  const chartData = (freq.categories || []).map((cat, i) => ({
                    category: cat,
                    treated: freq.treated_frequencies?.[i] ?? 0,
                    control: freq.control_frequencies?.[i] ?? 0,
                  }));

                  return (
                    <div key={freq.variable} className="mb-6">
                      <p className="mb-2 text-sm font-semibold text-slate-700">{freq.variable}</p>
                      <BarChart width={520} height={240} data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="category" fontSize={10} />
                        <YAxis fontSize={10} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="treated" fill="#2563eb" name="Treated" />
                        <Bar dataKey="control" fill="#f472b6" name="Control" />
                      </BarChart>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: MISSINGNESS */}
          {tab === "missingness" && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              {(!profile.missingness || profile.missingness.length === 0) ? (
                <p className="text-xs text-slate-400">Nessun dato sulla missingness disponibile.</p>
              ) : (
                <table className="min-w-full text-left text-sm divide-y divide-slate-200">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <th className="px-3 py-2">Variable</th>
                      <th className="px-3 py-2">Treated missing %</th>
                      <th className="px-3 py-2">Control missing %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profile.missingness.map((row) => (
                      <tr key={row.variable} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.variable}</td>
                        <td className="px-3 py-2 font-mono">{((row.treated_missing_pct ?? 0) * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2 font-mono">{((row.control_missing_pct ?? 0) * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 4: CORRELATIONS */}
          {tab === "correlations" && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              {(!profile.correlations?.variables || profile.correlations.variables.length < 2) ? (
                <p className="text-xs text-slate-400">Need at least 2 numeric covariates to compute correlations.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-700">Treated Group</p>
                    <CorrelationTable
                      variables={profile.correlations.variables}
                      matrix={profile.correlations.treated_matrix || []}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-700">Control Group</p>
                    <CorrelationTable
                      variables={profile.correlations.variables}
                      matrix={profile.correlations.control_matrix || []}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Utility per fondere i due profili se vengono chiamati separatamente per Dataset A e Dataset B */
function combineProfiles(pA: PopulationProfile | null, pB: PopulationProfile | null, covariates: string[]): PopulationProfile {
  const statsA = pA?.descriptive_stats || [];
  const statsB = pB?.descriptive_stats || [];

  const combinedStats = [
    ...statsA.map(s => ({ ...s, group: "treated" })),
    ...statsB.map(s => ({ ...s, group: "control" })),
  ];

  return {
    descriptive_stats: combinedStats,
    numeric_distributions: pA?.numeric_distributions || pB?.numeric_distributions || [],
    categorical_frequencies: pA?.categorical_frequencies || pB?.categorical_frequencies || [],
    missingness: covariates.map(cov => {
      const mA = pA?.missingness?.find(m => m.variable === cov)?.treated_missing_pct ?? 0;
      const mB = pB?.missingness?.find(m => m.variable === cov)?.control_missing_pct ?? 0;
      return { variable: cov, treated_missing_pct: mA, control_missing_pct: mB };
    }),
    correlations: {
      variables: pA?.correlations?.variables || covariates,
      treated_matrix: pA?.correlations?.treated_matrix || [],
      control_matrix: pB?.correlations?.control_matrix || [],
    }
  };
}

function CorrelationTable({ variables, matrix }: { variables: string[]; matrix: number[][] }) {
  if (!matrix || matrix.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-1"></th>
            {variables.map((v) => (
              <th key={v} className="p-1 font-semibold text-slate-600">{v}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="p-1 font-semibold text-slate-600">{variables[i]}</td>
              {row.map((val, j) => {
                const alpha = Math.abs(val || 0);
                return (
                  <td
                    key={j}
                    className="p-1 text-center font-mono"
                    style={{
                      backgroundColor: `rgba(37, 99, 235, ${alpha})`,
                      color: alpha > 0.5 ? "#ffffff" : "#000000",
                    }}
                  >
                    {(val ?? 0).toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}