"""
FiftyOne Server dataclasses

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

import motor as mtr
import strawberry.types as gqlt
from strawberry.dataloader import DataLoader

from fiftyone.server.mixins import HasCollection


HasCollectionType = t.TypeVar("HasCollectionType", bound=HasCollection)


@dataclass
class Context:
    db: mtr.MotorDatabase
    session: mtr.motor_tornado.MotorClientSession
    dataloaders: t.Dict[HasCollection, DataLoader[str, HasCollection]]


Info = gqlt.Info[Context, None]
