"""
FiftyOne operators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .operator import Operator, OperatorConfig
from .registry import (
    OperatorRegistry,
    get_operator,
    list_operators,
    operator_exists,
)
from .executor import (
    execute_operator,
    ExecutionOptions,
)

# This enables Sphinx refs to directly use paths imported here
__all__ = [k for k, v in globals().items() if not k.startswith("_")]
