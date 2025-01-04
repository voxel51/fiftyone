"""
Builtin panels.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .model_evaluation import EvaluationPanel

### TEAMS-ONLY below
from .model_evaluation.evaluation import EvaluateModelAsync, EvaluateModel

from .data_lens import (
    DatasourceConnectorOperator,
    ListLensConfigsOperator,
    UpsertLensConfigOperator,
    DeleteLensConfigOperator,
)
from .query_performance import (
    CreateIndexOrSummaryFieldOperator,
    IndexFieldRemovalConfirmationOperator,
    GetQueryPerformanceConfigConfirmationOperator,
    QueryPerformancePanel,
    SummaryFieldUpdateOperator,
)
from .data_quality import DataQualityPanel
from .data_quality.operators import (
    ComputeBlurriness,
    ComputeBrightness,
    ComputeAspectRatio,
    ComputeEntropy,
    ComputeExactDuplicates,
    ComputeNearDuplicates,
)


def register(p):
    p.register(EvaluationPanel)
    ### TEAMS-ONLY below
    p.register(EvaluateModelAsync)
    p.register(EvaluateModel)
    p.register(DatasourceConnectorOperator)
    p.register(ListLensConfigsOperator)
    p.register(UpsertLensConfigOperator)
    p.register(DeleteLensConfigOperator)
    p.register(QueryPerformancePanel)
    p.register(CreateIndexOrSummaryFieldOperator)
    p.register(IndexFieldRemovalConfirmationOperator)
    p.register(GetQueryPerformanceConfigConfirmationOperator)
    p.register(SummaryFieldUpdateOperator)
    p.register(DataQualityPanel)
    p.register(ComputeBlurriness)
    p.register(ComputeBrightness)
    p.register(ComputeAspectRatio)
    p.register(ComputeEntropy)
    p.register(ComputeExactDuplicates)
    p.register(ComputeNearDuplicates)
