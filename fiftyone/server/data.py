"""
FiftyOne Server data

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

import motor.motor_asyncio as mtr
import starlette.requests as strq
import starlette.responses as strp
import strawberry.types as gqlt
from strawberry.dataloader import DataLoader

from fiftyone.server.mixins import HasCollection


HasCollectionType = t.TypeVar("HasCollectionType", bound=HasCollection)


@dataclass
class Context:
    db: mtr.AsyncIOMotorDatabase
    session: mtr.AsyncIOMotorClientSession
    dataloaders: t.Dict[HasCollection, DataLoader[str, HasCollection]]
    request: strq.Request
    response: strp.Response


Info = gqlt.Info[Context, None]
