from distutils.command.config import config
from bson import ObjectId
from dacite import Config, from_dict
import motor as mtr
import motor.motor_tornado as mtrt
import typing as t

import strawberry
from strawberry.arguments import UNSET

from fiftyone.labs.context import Info
from fiftyone.labs.mixins import HasPagination


GenericType = t.TypeVar("GenericType", bound=HasPagination, covariant=True)


@strawberry.type
class Connection(t.Generic[GenericType]):
    page_info: "PageInfo"
    edges: list["Edge[GenericType]"]


@strawberry.type
class PageInfo:
    has_next_page: bool
    has_previous_page: bool
    start_cursor: t.Optional[str]
    end_cursor: t.Optional[str]


@strawberry.type
class Edge(t.Generic[GenericType]):
    node: GenericType
    cursor: str


Cursor = str


async def get_items(
    collection: mtr.MotorCollection,
    session: mtrt.MotorClientSession,
    from_db: t.Callable[[dict], GenericType],
    first: int = 10,
    after: t.Optional[Cursor] = UNSET,
) -> Connection[GenericType]:
    d = {}
    if after:
        d = {"_id": {"$gt": ObjectId()}}

    edges = []
    async for doc in collection.find(d).sort(
        {"_id": 1}, session=session
    ).limit(first + 1):
        edges.append(Edge(node=from_db(doc), cursor=str(doc["_id"])))

    return Connection(
        page_info=PageInfo(
            has_previous_page=False,
            has_next_page=len(edges) > first,
            start_cursor=edges[0].cursor if edges else None,
            end_cursor=edges[-2].cursor if len(edges) > 1 else None,
        ),
        edges=edges[:-1],
    )


def get_pagination_resolver(
    cls: t.Type[GenericType],
) -> t.Callable[[int, t.Optional[Cursor], Info], Connection[GenericType]]:
    async def paginate(first: int, after: t.Optional[Cursor], info: Info):
        def from_db(doc: dict):
            doc["id"] = doc.pop("_id")
            return from_dict(cls, doc, config=Config(check_types=False))

        return get_items(
            info.db[cls.get_collection_name()],
            info.session,
            from_db,
            first,
            after,
        )

    return paginate
