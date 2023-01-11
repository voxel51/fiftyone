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

from fiftyone.server.data import Info
import fiftyone.core.dataset as fod
import fiftyone.core.stages as fos
import fiftyone.core.view as fov

import fiftyone.server.mutation as fosm
from fiftyone.server.query import Dataset
from fiftyone.server.scalars import BSONArray

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
        dataset_name: str,
        view: t.Optional[BSONArray],
        view_name: t.Optional[str],
        saved_view_slug: t.Optional[str],
        changing_saved_view: t.Optional[bool],
        form: t.Optional[fosm.StateForm],
        info: Info,
    ) -> fosm.ViewResponse:

        result_view = None

        if view_name is not None:
            ds = fod.load_dataset(dataset_name)
            if ds.has_saved_view(view_name):
                # Load a saved dataset view by name
                result_view = ds.load_saved_view(view_name)
                view = result_view._serialize()  # serialized view stages

        elif form:
            # convert serialized view_stages to DatasetView
            view = fosm.get_view(
                dataset_name,
                stages=view,
                filters=form.filters,
            )

            if form.slice:
                view = view.select_group_slices([form.slice])

            if form.sample_ids:
                view = fov.make_optimized_select_view(view, form.sample_ids)

            if form.add_stages:
                for d in form.add_stages:
                    stage = fos.ViewStage._from_dict(d)
                    view = view.add_stage(stage)

            if form.extended:
                view = fosm.extend_view(view, form.extended, True)

            result_view = view  # DatasetView
            view = view._serialize()  # serialized view stages

        else:
            # convert serialized view_stages to DatasetView
            view = fosm.get_view(
                dataset_name,
                stages=view,
                filters=form.filters,
            )

            result_view = view
            view = view._serialize()

        dataset = await Dataset.resolver(
            name=dataset_name,
            view=view,
            view_name=view_name
            if view_name
            else result_view.name
            if result_view
            else None,
            info=info,
        )
        return fosm.ViewResponse(
            view=view,
            dataset=dataset,
            view_name=view_name
            if view_name
            else result_view.name
            if result_view
            else None,
            saved_view_slug=saved_view_slug if saved_view_slug else None,
            changing_saved_view=changing_saved_view,
        )
