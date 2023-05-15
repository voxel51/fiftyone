"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import types
import wrapt
from .operator import Operator, OperatorConfig
from .registry import register_operator
from .executor import execute_operator

# This enables Sphinx refs to directly use paths imported here
# and ignore functions marked as depreciated
__all__ = [k for k, v in globals().items() if not k.startswith("_")]
