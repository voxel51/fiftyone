"""
FiftyOne Teams mutations.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dacite import Config, from_dict
from fiftyone.teams.authentication import (
    IsAuthenticated,
    authenticate_gql_class,
)
import motor.motor_asyncio as mtr
from pymongo import ReturnDocument
import strawberry as gql
import typing as t

import fiftyone as fo

from fiftyone.server.data import Info
import fiftyone.core.view as fov


import fiftyone.server.mutation as fosm
from fiftyone.server.query import Dataset
from fiftyone.server.scalars import JSONArray


from fiftyone.teams.query import User


@gql.input
class UserInput:
    email: str
    sub: t.Optional[str]
    family_name: t.Optional[str] = None
    given_name: t.Optional[str] = None


authenticate_gql_class(fosm.Mutation)


@gql.type
class Mutation(fosm.Mutation):
    @gql.mutation
    async def login(self, user: UserInput, info: Info) -> User:
        db = info.context.db
        users: mtr.AsyncIOMotorCollection = db.users
        updated_user = await users.find_one_and_update(
            {"sub": user.sub},
            {
                "$set": {
                    "email": user.email,
                    "family_name": user.family_name,
                    "given_name": user.given_name,
                    "sub": user.sub,
                }
            },
            return_document=ReturnDocument.AFTER,
            upsert=True,
        )

        updated_user["id"] = updated_user.pop("_id")
        return from_dict(User, updated_user, config=Config(check_types=False))

    @gql.mutation(permission_classes=[IsAuthenticated])
    async def set_view(
        self,
        subscription: str,
        session: t.Optional[str],
        view: JSONArray,
        dataset: str,
        info: Info,
    ) -> fosm.ViewResponse:
        return fosm.ViewResponse(
            fov.DatasetView._build(
                fo.load_dataset(dataset), view
            )._serialize(),
            await Dataset.resolver(dataset, view, info),
        )
