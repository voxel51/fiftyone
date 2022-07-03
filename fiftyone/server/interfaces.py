"""
FiftyOne Server interfaces

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import strawberry as gql


@gql.interface
class StageParameter:
    _cls: str
    name: str
    kind: str


@gql.interface
class Stage:
    _cls: str
    kwargs: t.List[StageParameter]
