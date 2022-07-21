"""
FiftyOne Server filter inputs

| Copyright 2017-2022, Voxel51, Inc.
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
    group_field: str
    id: str
    group: str


@gql.input(directives=[OneOf])  # oneof not working
class SampleFilter:
    id: t.Optional[str] = None
    group: t.Optional[GroupElementFilter] = None
