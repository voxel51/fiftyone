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

from fiftyone.server.data import Info
import fiftyone.server.query as fosq
import fiftyone.server.mixins as fosm
import fiftyone.server.paginator as fosp


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


class Query(fosq.Query):
    @gql.field
    async def viewer(self, info: Info) -> User:
        db = info.context.db
        users: motor.MotorCollection = db.users
        user = await users.find_one({"sub": info.context.sub})
        user["id"] = user.pop("_id")
        return from_dict(User, user, config=Config(check_types=False))
