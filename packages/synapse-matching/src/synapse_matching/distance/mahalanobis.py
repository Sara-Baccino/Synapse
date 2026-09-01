"""
synapse_matching.distance.mahalanobis
--------------------------------------------

Mahalanobis distance, migrated from the legacy match_mahalanobis_ps
(distance-computation block only). Preserves the exact fallback to a
regularized pseudo-inverse when the covariance matrix is singular
(common with collinear covariates or one-hot-encoded categoricals).
"""

from __future__ import annotations
from typing import Literal
import numpy as np
from scipy.spatial.distance import cdist

from synapse_matching.distance.base import DistanceMetric
from synapse_matching.exceptions import MatchingError

__all__ = ["MahalanobisDistance"]

_REGULARIZATION_EPSILON = 1e-6


class MahalanobisDistance(DistanceMetric):
    """Requires all-numerical columns (see DistanceMetric._check_all_numerical).
    Raises MatchingError explicitly if the pooled data has fewer rows
    than columns (covariance matrix cannot be meaningfully estimated),
    rather than silently falling back to a degenerate result.
    """

    def compute(self, X_treated, X_control, column_names, column_types) -> np.ndarray:
        self._check_all_numerical(column_names, column_types)

        X_all = np.vstack([X_treated, X_control])
        n_obs, n_cov = X_all.shape
        min_required = n_cov + 2  # need a real margin beyond n_covariates, not just n_obs > n_cov
        if n_obs < min_required:
            raise MatchingError(
                f"MahalanobisDistance requires at least {min_required} observations "
                f"(covariates + 2) to reliably estimate a covariance matrix; got {n_obs} "
                f"observations for {n_cov} covariates. Reduce the number of matching "
                "covariates or use EuclideanDistance instead."
            )

        cov_matrix = np.cov(X_all.T)
        cov_matrix = np.atleast_2d(cov_matrix)

        try:
            inv_cov = np.linalg.inv(cov_matrix)
        except np.linalg.LinAlgError:
            inv_cov = np.linalg.inv(cov_matrix + np.eye(cov_matrix.shape[0]) * _REGULARIZATION_EPSILON)

        return cdist(X_treated, X_control, metric="mahalanobis", VI=inv_cov)