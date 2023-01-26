"""
FiftyOne Server filter inputs

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql
from strawberry.schema_directive import Location
import typing as t


@gql.schema_directive(locations=[Location.INPUT_OBJECT])
class OneOf:
    pass


@gql.input
class GroupElementFilter:
    id: t.Optional[str] = None
    slice: t.Optional[str] = None


@gql.input  # oneof not working
class SampleFilter:
    id: t.Optional[str] = None
    group: t.Optional[GroupElementFilter] = None
