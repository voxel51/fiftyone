"""
FiftyOne Teams queries.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from bson import ObjectId
from dacite import Config, from_dict
import motor
import strawberry as gql
from fiftyone.labs.authentication import has_scope

from fiftyone.labs.pagination import Connection, get_pagination_resolver

from .context import Info
from .interfaces import Stage
from .mixins import HasPagination
from .pagination import Connection


ID = gql.scalar(
    t.NewType("ID", str),
    serialize=lambda v: str(v),
    parse_value=lambda v: ObjectId(v),
)


@gql.type
class Dataset(HasPagination):
    name: str

    @staticmethod
    def get_collection_name():
        return "datasets"


@gql.type
class SelectedLabelData:
    id: str
    sample_id: str
    field: str
    frame_number: t.Optional[int]


@gql.type
class Session:
    dataset: t.Optional[str]
    view: t.Optional[t.List[Stage]]
    selected: t.Optional[t.List[str]]
    selected_labels: t.Optional[t.List[SelectedLabelData]]
    user_id: gql.ID


@gql.type
class User(HasPagination):
    id: gql.ID
    datasets: Connection[Dataset] = gql.field(
        resolver=get_pagination_resolver(Dataset)
    )
    email: str
    family_name: str
    given_name: str

    @staticmethod
    def get_collection_name():
        return "users"


@gql.type
class Query:
    users: Connection[User] = gql.field(resolver=get_pagination_resolver(User))
    datasets: Connection[Dataset] = gql.field(
        resolver=get_pagination_resolver(Dataset)
    )

    @gql.field
    async def viewer(self, info: Info) -> User:
        db = info.context.db
        users: motor.MotorCollection = db.users
        user = await users.find_one({"sub": info.context.sub})
        user["id"] = user.pop("_id")
        return from_dict(User, user, config=Config(check_types=False))
