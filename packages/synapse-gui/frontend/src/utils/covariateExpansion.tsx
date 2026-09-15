/**
 * synapse-gui frontend covariateExpansion
 * -------------------------------------------
 * A DataConfig column name is not always the name MatchingModule will
 * actually see: one-hot encoding (Transformers._one_hot_to_polars)
 * replaces the original column with "<name>__<category>" columns.
 * Referencing the pre-encoding name in matching_covariates/
 * evaluation_covariates/outcome_covariates crashes the run with
 * "unable to find column" once matching actually executes.
 *
 * sklearn's OneHotEncoder(categories="auto") sorts categories the same
 * way column_stats already sorts distinct_values (Polars .sort()), so
 * this reproduces the exact expanded names deterministically without
 * needing the fitted encoder itself. Ordinal encoding keeps the column
 * name unchanged, so it's returned as-is.
 *
 * Used by both DataSection (default matching-covariate derivation) and
 * MatchingDesignSection (the Covariates role table), so the one-hot fix
 * lives in exactly one place.
 */

import type { ColumnInfoDTO, ColumnStatsDTO } from "../types/api";

export function expandColumnToCovariateNames(column: ColumnInfoDTO, stats: ColumnStatsDTO[]): string[] {
  if (column.encoding.enabled && column.encoding.method === "one_hot") {
    const distinctValues = stats.find((s) => s.name === column.name)?.distinct_values ?? [];
    return distinctValues.map((value) => `${column.name}__${value}`);
  }
  return [column.name];
}