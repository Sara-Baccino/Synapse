from __future__ import annotations
import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from scipy.special import logit
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

from synapse_matching.representation.base import RepresentationAlgorithm, RepresentationOutput

__all__ = ["PropensityScoreConfig", "PropensityScoreRepresentation"]


class PropensityScoreConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    poly_degree: int = 3
    regularization_c: float = Field(default=0.5)
    max_iter: int = 5000
    random_state: int | None = 42


class PropensityScoreRepresentation(RepresentationAlgorithm):
    def fit_transform(self, X: np.ndarray, treatment: np.ndarray, config: PropensityScoreConfig) -> RepresentationOutput:
        pipeline = Pipeline([
            ("poly", PolynomialFeatures(degree=config.poly_degree, interaction_only=False, include_bias=False)),
            ("scaler", StandardScaler()),
            ("logistic", LogisticRegression(
                max_iter=config.max_iter, random_state=config.random_state,
                penalty="l2", solver="lbfgs", C=config.regularization_c,
            )),
        ])
        pipeline.fit(X, treatment)
        ps = np.clip(pipeline.predict_proba(X)[:, 1], 1e-6, 1 - 1e-6)

        return RepresentationOutput(
            representation=ps,
            feature_names=["propensity_score"],
            metadata={"method": "logistic", "poly_degree": config.poly_degree, "regularization_c": config.regularization_c},
            transformations=[f"logistic_propensity_score(poly_degree={config.poly_degree})"],
            representation_logit=logit(ps),
            model=pipeline,
        )