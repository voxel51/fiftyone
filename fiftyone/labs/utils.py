"""
FiftyOne Teams utils.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

import aiohttp as aio
import motor as mtr
import strawberry.types as gqlt
from strawberry.dataloader import DataLoader

from .mixins import HasCollection


GenericID = t.TypeVar("GenericID")
HasCollectionType = t.TypeVar("HasCollectionType", bound=HasCollection)


@dataclass
class Key:
    alg: str
    kty: str
    use: str
    n: str
    e: str
    kid: str
    x5t: str
    x5c: t.List[str]


@dataclass
class JWKS:
    keys: t.List[Key]


@dataclass
class Context:
    authenticated: bool
    db: mtr.MotorDatabase
    web: aio.ClientSession
    jwks: JWKS
    session: mtr.motor_tornado.MotorClientSession
    token: str
    sub: str
    dataloaders: t.Dict[
        t.Type[HasCollectionType], DataLoader[HasCollectionType]
    ]


Info = gqlt.Info[Context, None]
