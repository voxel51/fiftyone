"""
FiftyOne Server stage definitions

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import strawberry as gql

from fiftyone.core.stages import _STAGES
from fiftyone.server.utils import from_dict


@gql.type
class StageParameter:
    name: str
    type: str
    default: t.Optional[str] = None
    placeholder: t.Optional[str] = None


@gql.type
class StageDefinition:
    name: str
    params: t.List[StageParameter]


def stage_definitions() -> t.List[StageDefinition]:
    return [
        from_dict(
            StageDefinition,
            {"name": stage.__name__, "params": stage._params()},
        )
        for stage in _STAGES
    ]
