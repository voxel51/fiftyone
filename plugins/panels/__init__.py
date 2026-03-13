"""
Builtin panels.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .model_evaluation import EvaluationPanel
from .similarity_search import SimilaritySearchPanel


def register(p):
    p.register(EvaluationPanel)
    p.register(SimilaritySearchPanel)
