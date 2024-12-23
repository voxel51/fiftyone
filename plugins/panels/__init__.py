"""
Builtin panels.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .data_lens import (
    DatasourceConnectorOperator,
    ListLensConfigsOperator,
    UpsertLensConfigOperator,
    DeleteLensConfigOperator,
)
from .model_evaluation import EvaluationPanel


def register(p):
    p.register(EvaluationPanel)
    p.register(DatasourceConnectorOperator)
    p.register(ListLensConfigsOperator)
    p.register(UpsertLensConfigOperator)
    p.register(DeleteLensConfigOperator)
