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
class ParameterDefinition:
    name: str
    type: str
    default: t.Optional[str] = None
    placeholder: t.Optional[str] = None


@gql.type
class StageDefinition:
    name: str
    params: t.List[ParameterDefinition]


def stage_definitions_resolver():
    return [
        StageDefinition(
            stage.__name__, from_dict(ParameterDefinition, stage._params())
        )
        for stage in _STAGES
    ]
