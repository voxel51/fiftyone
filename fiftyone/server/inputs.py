"""
FiftyOne Server shared GraphQL input types.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t
import strawberry as gql


@gql.input
class SelectedLabel:
    label_id: gql.ID
    field: str
    sample_id: gql.ID
    frame_number: t.Optional[int] = None
