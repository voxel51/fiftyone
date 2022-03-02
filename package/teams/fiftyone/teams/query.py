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

import fiftyone as fo

from fiftyone.server.data import Info
import fiftyone.server.query as fosq
import fiftyone.server.mixins as fosm
import fiftyone.server.paginator as fosp

import fiftyone.teams as fot
from fiftyone.teams.authentication import AuthenticatedUser
from fiftyone.teams.permissions import IsAuthenticated


@gql.type
class User(fosm.HasCollection):
    id: gql.ID
    datasets: fosp.Connection[fosq.Dataset] = gql.field(
        resolver=fosp.get_paginator_resolver(
            fosq.Dataset, "name", fosq.DATASET_FILTER_STAGE,
        )
    )
    email: str
    family_name: str
    given_name: str

    @staticmethod
    def get_collection_name():
        return "users"


@gql.type
class TeamsConfig:
    organization: str


@gql.type
class Query:
    @gql.field
    def teamsConfig(self, info: Info) -> TeamsConfig:
        return from_dict(TeamsConfig, fot.teams_config.serialize())

    @gql.field(permission_classes=[IsAuthenticated])
    def colorscale(self) -> t.Optional[t.List[t.List[int]]]:
        if fo.app_config.colorscale:
            return fo.app_config.get_colormap()

        return None

    @gql.field(permission_classes=[IsAuthenticated])
    def config(self) -> fosq.AppConfig:
        d = fo.app_config.serialize()
        d["timezone"] = fo.config.timezone
        return from_dict(fosq.AppConfig, d, config=Config(check_types=False))

    dataset = gql.field(
        resolver=fosq.Dataset.resolver, permission_classes=[IsAuthenticated]
    )
    datasets: fosq.Connection[fosq.Dataset] = gql.field(
        resolver=fosq.get_paginator_resolver(
            fosq.Dataset, "name", fosq.DATASET_FILTER_STAGE,
        ),
        permission_classes=[IsAuthenticated],
    )

    @gql.field(permission_classes=[IsAuthenticated])
    async def viewer(self, info: Info) -> User:
        db = info.context.db
        request_user: AuthenticatedUser = info.context.request.user
        users: mtr.AsyncIOMotorCollection = db.users
        user = await users.find_one({"sub": request_user.sub})
        user["id"] = user.pop("_id")
        return from_dict(User, user, config=Config(check_types=False))
