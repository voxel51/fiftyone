"""
Builtin panels.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .model_evaluation import EvaluationPanel


def register(p):
    p.register(EvaluationPanel)
