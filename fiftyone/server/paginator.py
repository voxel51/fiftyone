"""
FiftyOne Server paginator

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
from dacite import Config, from_dict
import motor.motor_asyncio as mtr
import typing as t

import strawberry as gql
from strawberry.arguments import UNSET

import fiftyone.core.odm as foo

from fiftyone.server.data import Info, HasCollectionType


@gql.type
class PageInfo:
    has_next_page: bool
    has_previous_page: bool
    start_cursor: t.Optional[str]
    end_cursor: t.Optional[str]


@gql.type
class Edge(t.Generic[HasCollectionType]):
    node: HasCollectionType
    cursor: str


@gql.type
class Connection(t.Generic[HasCollectionType]):
    page_info: PageInfo
    edges: t.List[Edge[HasCollectionType]]
    total: int


Cursor = str


async def get_items(
    collection: mtr.AsyncIOMotorCollection,
    session: mtr.AsyncIOMotorClientSession,
    from_db: t.Callable[[dict], HasCollectionType],
    key: str,
    filters: t.List[dict],
    search: str,
    first: int = 10,
    after: t.Optional[Cursor] = UNSET,
) -> Connection[HasCollectionType]:
    start = list(filters)
    if search:
        start += [{"$match": {"name": {"$regex": search}}}]

    start += [{"$sort": {key: 1}}]

    if after:
        start += [{"$match": {"_id": {"$gt": ObjectId(after)}}}]

    edges = []

    pipelines = [
        start + [{"$limit": first + 1}],
        start + [{"$count": "total"}],
    ]

    data = await foo.aggregate(collection, pipelines)
    results, total = data
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
    cls: t.Type[HasCollectionType], key: str, filters: t.List[dict]
) -> t.Callable[
    [t.Optional[int], t.Optional[Cursor], Info],
    Connection[HasCollectionType],
]:
    async def paginate(
        search: t.Optional[str],
        first: t.Optional[int] = 10,
        after: t.Optional[Cursor] = None,
        info: Info = None,
    ):
        def from_db(doc: dict) -> t.Optional[HasCollectionType]:
            doc = cls.modifier(doc)
            return from_dict(cls, doc, config=Config(check_types=False))

        return await get_items(
            info.context.db[cls.get_collection_name()],
            info.context.session,
            from_db,
            key,
            filters,
            search,
            first,
            after,
        )

    return paginate
