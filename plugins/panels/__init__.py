"""
Builtin panels.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.internal.features.registry import is_feature_enabled

from .model_evaluation import EvaluationPanel


def register(p):
    p.register(EvaluationPanel)

    if is_feature_enabled("VFF_SIMILARITY_SEARCH"):
        from .similarity_search import SimilaritySearchPanel
        from .similarity_search.operators import (
            InitSimilarityRunOperator,
            ListSimilarityRunsOperator,
            SimilaritySearchOperator,
        )

        p.register(SimilaritySearchPanel)
        p.register(SimilaritySearchOperator)
        p.register(ListSimilarityRunsOperator)
        p.register(InitSimilarityRunOperator)
