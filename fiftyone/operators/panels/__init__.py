"""
FiftyOne panels.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .query_performance import (
    QueryPerformancePanel,
    CreateIndexOrSummaryFieldOperator,
    IndexFieldRemovalConfirmationOperator,
    QueryPerformanceConfigConfirmationOperator,
)

QUERY_PERFORMANCE_OPERATORS = [
    CreateIndexOrSummaryFieldOperator(_builtin=True),
    IndexFieldRemovalConfirmationOperator(_builtin=True),
    QueryPerformanceConfigConfirmationOperator(_builtin=True),
]

# This enables Sphinx refs to directly use paths imported here
__all__ = [k for k, v in globals().items() if not k.startswith("_")]