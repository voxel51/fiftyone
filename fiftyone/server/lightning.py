"""
FiftyOne Server lightning queries

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass
from datetime import date, datetime
import typing as t

import strawberry as gql

import fiftyone.core.fields as fof
from fiftyone.core.utils import run_sync_task

import fiftyone.server.constants as foc
from fiftyone.server.data import Info
from fiftyone.server.scalars import BSON, JSON
from fiftyone.server.view import get_view


@gql.input
class LightningPathInput:
    path: str

    exclude: t.Optional[t.List[str]] = gql.field(
        description="exclude these values from results", default=None
    )
    filters: t.Optional[BSON] = None
    first: t.Optional[int] = foc.LIST_LIMIT
    index: t.Optional[str] = None
    max_documents_search: t.Optional[int] = None
    search: t.Optional[str] = None


@gql.input
class LightningInput:
    dataset: str
    match: t.Optional[JSON] = None
    paths: t.List[LightningPathInput]
    slice: t.Optional[str] = None


@gql.interface
class LightningResult:
    path: str


@gql.type
class BooleanLightningResult(LightningResult):
    false: bool
    none: bool
    true: bool


@gql.type
class DateLightningResult(LightningResult):
    max: t.Optional[date]
    min: t.Optional[date]
    none: bool


@gql.type
class DateTimeLightningResult(LightningResult):
    max: t.Optional[datetime]
    min: t.Optional[datetime]
    none: bool


@gql.type
class FloatLightningResult(LightningResult):
    inf: bool
    max: t.Optional[float]
    min: t.Optional[float]
    nan: bool
    ninf: bool
    none: bool


@gql.type
class IntLightningResult(LightningResult):
    max: t.Optional[float]
    min: t.Optional[float]
    none: bool


@gql.type
class ObjectIdLightningResult(LightningResult):
    values: t.Optional[t.List[t.Optional[str]]] = None


@gql.type
class StringLightningResult(LightningResult):
    values: t.Optional[t.List[t.Optional[str]]] = None


LightningResults = t.Annotated[
    t.Union[
        BooleanLightningResult,
        DateLightningResult,
        DateTimeLightningResult,
        FloatLightningResult,
        IntLightningResult,
        ObjectIdLightningResult,
        StringLightningResult,
    ],
    gql.union("LightningResults"),
]


async def lightning_resolver(
    input: LightningInput, info: Info
) -> t.List[LightningResults]:
    # Lazy import to avoid an import-time cycle:
    # ``fiftyone.server.db`` → ``MongoGridAdapter`` →
    # ``fiftyone.server.db._mongo_lightning`` → this module. The
    # adapter is resolved at request time, after all modules have
    # finished loading.
    from fiftyone.server.db import get_grid_adapter

    run = lambda: get_view(input.dataset, reload=True)
    dataset = await run_sync_task(run)
    dataset = dataset._dataset
    return await get_grid_adapter().lightning(dataset, input=input)
