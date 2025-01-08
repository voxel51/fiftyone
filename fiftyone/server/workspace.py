"""
FiftyOne Server workspace.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime
import typing as t

import strawberry as gql

from fiftyone.server.scalars import BSON


@gql.type
class Workspace:
    id: gql.ID

    color: t.Optional[str]
    child: BSON
    dataset_id: gql.ID
    created_at: t.Optional[datetime]
    description: t.Optional[str]
    name: t.Optional[str]
    last_modified_at: t.Optional[datetime]
    last_loaded_at: t.Optional[datetime]
    slug: t.Optional[str]
