"""
FiftyOne Data Lens builtin operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.operators.data_lens.config_management_operators import (
    ListLensConfigsOperator, UpsertLensConfigOperator, DeleteLensConfigOperator
)

from fiftyone.operators.data_lens.datasource_connector_operator import DatasourceConnectorOperator

DATA_LENS_OPERATORS = [
    DatasourceConnectorOperator(_builtin=True),
    ListLensConfigsOperator(_builtin=True),
    UpsertLensConfigOperator(_builtin=True),
    DeleteLensConfigOperator(_builtin=True),
]
