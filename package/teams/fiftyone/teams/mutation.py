"""
FiftyOne Teams mutations.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dacite import Config, from_dict
import motor.motor_asyncio as mtr
from pymongo import ReturnDocument
import strawberry as gql
import typing as t

import fiftyone as fo

from fiftyone.server.data import Info
import fiftyone.core.view as fov

from fiftyone.teams.permissions import IsAuthenticated
from fiftyone.teams.query import User

from fiftyone.server.mutation import ViewResponse
from fiftyone.server.query import Dataset
from fiftyone.server.scalars import JSONArray


@gql.input
class UserInput:
    email: str
    sub: t.Optional[str]
    family_name: t.Optional[str] = None
    given_name: t.Optional[str] = None


@gql.type
class Mutation:
    @gql.mutation(permission_classes=[IsAuthenticated])
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

    @gql.mutation
    async def set_view(
        self,
        subscription: str,
        session: t.Optional[str],
        view: JSONArray,
        dataset: str,
        info: Info,
    ) -> ViewResponse:
        view_result = fov.DatasetView._build(fo.load_dataset(dataset), view)
        dataset_result = await Dataset.resolver(dataset, view, info)
        return ViewResponse(
            view=view_result._serialize(), dataset=dataset_result
        )
