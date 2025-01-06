"""
FiftyOne Server paginator

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import ObjectId
import motor.motor_asyncio as mtr
import typing as t

import strawberry as gql
from strawberry import UNSET

import fiftyone.core.odm as foo

from fiftyone.server.constants import LIST_LIMIT
from fiftyone.server.data import Info, T
from fiftyone.server.utils import from_dict

C = t.TypeVar("C")


@gql.type
class PageInfo(t.Generic[C]):
    has_next_page: bool
    has_previous_page: bool
    start_cursor: t.Optional[C]
    end_cursor: t.Optional[C]


@gql.type
class Edge(t.Generic[T, C]):
    cursor: C
    node: T


@gql.type
class Connection(t.Generic[T, C]):
    page_info: PageInfo[C]
    edges: t.List[Edge[T, C]]
    total: t.Optional[int] = None


async def get_items(
    collection: mtr.AsyncIOMotorCollection,
    from_db: t.Callable[[dict], T],
    key: str,
    filters: t.List[dict],
    search: str,
    first: int = LIST_LIMIT,
    after: t.Optional[str] = UNSET,
) -> Connection[T, str]:
    start = list(filters)
    first = first or LIST_LIMIT
    if search:
        start += [{"$match": {"name": {"$regex": search}}}]

    start += [{"$sort": {key: 1}}]

    if after:
        start += [{"$match": {"_id": {"$gt": ObjectId(after)}}}]

    pipelines = [
        start + [{"$limit": first + 1}],
        start + [{"$count": "total"}],
    ]

    data = await foo.aggregate(collection, pipelines)
    results, total = data
    edges = []

    for doc in results:
        _id = doc["_id"]
        edges.append(Edge(node=from_db(doc), cursor=str(_id)))

    has_next_page = False
    if len(edges) > first:
        edges = edges[:-1]
        has_next_page = True

    return Connection(
        page_info=PageInfo(
            has_previous_page=False,
            has_next_page=has_next_page,
            start_cursor=edges[0].cursor if edges else None,
            end_cursor=edges[-1].cursor if len(edges) > 1 else None,
        ),
        edges=edges,
        total=total[0]["total"] if total else 0,
    )


def get_paginator_resolver(
    cls: t.Type[T], key: str, filters: t.List[dict], collection: str
) -> t.Callable[[t.Optional[int], t.Optional[str], Info], Connection[T, str],]:
    async def paginate(
        search: t.Optional[str],
        first: t.Optional[int] = LIST_LIMIT,
        after: t.Optional[str] = None,
        info: Info = None,
    ):
        def from_db(doc: dict) -> t.Optional[T]:
            doc = cls.modifier(doc)
            return from_dict(cls, doc)

        return await get_items(
            info.context.db[collection],
            from_db,
            key,
            filters,
            search,
            first,
            after,
        )

    return paginate
