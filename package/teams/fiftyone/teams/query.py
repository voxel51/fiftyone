"""
FiftyOne Teams query

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from dacite import Config, from_dict
import motor.motor_asyncio as mtr
import strawberry as gql


from fiftyone.server.data import Info
import fiftyone.server.query as fosq
import fiftyone.server.mixins as fosm

import fiftyone.teams as fot
from fiftyone.teams.authentication import (
    IsAuthenticated,
    authenticate_gql_class,
    AuthenticatedUser,
)


@gql.type
class User(fosm.HasCollection):
    id: gql.ID
    email: str
    family_name: t.Optional[str]
    given_name: t.Optional[str]

    @staticmethod
    def get_collection_name():
        return "users"


@gql.type
class TeamsConfig:
    client_id: str
    organization: str


authenticate_gql_class(fosq.Query)


@gql.type
class Query(fosq.Query):
    @gql.field
    def teams_config(self, info: Info) -> TeamsConfig:
        return from_dict(TeamsConfig, fot.teams_config.serialize())

    @gql.field(permission_classes=[IsAuthenticated])
    async def viewer(self, info: Info) -> User:
        db = info.context.db
        request_user: AuthenticatedUser = info.context.request.user
        users: mtr.AsyncIOMotorCollection = db.users
        user = await users.find_one({"sub": request_user.sub})
        user["id"] = user.pop("_id")
        return from_dict(User, user, config=Config(check_types=False))
