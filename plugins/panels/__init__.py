"""
Builtin panels.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.internal.features.registry import is_feature_enabled

from .model_evaluation import EvaluationPanel
from .similarity_search import SimilaritySearchPanel


def register(p):
    p.register(EvaluationPanel)

    if is_feature_enabled("VFF_SIMILARITY_SEARCH"):
        p.register(SimilaritySearchPanel)
