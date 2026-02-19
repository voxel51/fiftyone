"""
Builtin panels.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .model_evaluation import EvaluationPanel
from .similarity_search import SimilaritySearchPanel
from .similarity_search.operators import (
    InitSimilarityRunOperator,
    ListSimilarityRunsOperator,
    SimilaritySearchOperator,
)


def register(p):
    p.register(EvaluationPanel)
    p.register(SimilaritySearchPanel)
    p.register(SimilaritySearchOperator)
    p.register(ListSimilarityRunsOperator)
    p.register(InitSimilarityRunOperator)
