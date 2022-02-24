"""
FiftyOne Teams query

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from dacite import Config, from_dict
import motor
import strawberry as gql

import fiftyone as fo

from fiftyone.server.dataclasses import Info
import fiftyone.server.query as fosq
import fiftyone.server.mixins as fosm
import fiftyone.server.paginator as fosp


@gql.type
class User(fosm.HasCollection):
    id: gql.ID
    datasets: fosp.Connection[fosq.Dataset] = gql.field(
        resolver=fosp.get_paginator_resolver(
            fosq.Dataset,
            "name",
            fosq.DATASET_FILTER_STAGE,
        )
    )
    email: str
    family_name: str
    given_name: str

    @gql.field
    def colorscale(self) -> t.Optional[t.List[t.List[int]]]:
        if fo.app_config.colorscale:
            return fo.app_config.get_colormap()

        return None

    @gql.field
    def config(self) -> fosq.AppConfig:
        d = fo.app_config.serialize()
        d["timezone"] = fo.config.timezone
        return from_dict(fosq.AppConfig, d, config=Config(check_types=False))

    @staticmethod
    def get_collection_name():
        return "users"


class Query(fosq.Query):
    @gql.field
    async def viewer(self, info: Info) -> User:
        db = info.context.db
        users: motor.MotorCollection = db.users
        user = await users.find_one({"sub": info.context.sub})
        user["id"] = user.pop("_id")
        return from_dict(User, user, config=Config(check_types=False))
