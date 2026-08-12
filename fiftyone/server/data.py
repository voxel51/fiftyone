"""
FiftyOne Server data

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

from pymongo.asynchronous.database import AsyncDatabase
import starlette.requests as strq
import starlette.responses as strp
import strawberry.types as gqlt
from strawberry.dataloader import DataLoader


T = t.TypeVar("T")


@dataclass
class Context:
    db: AsyncDatabase
    dataloaders: t.Dict[t.Type[t.Any], DataLoader[str, t.Type[t.Any]]]
    request: strq.Request
    response: strp.Response


Info = gqlt.Info[Context, None]
