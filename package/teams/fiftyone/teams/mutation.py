"""
FiftyOne Teams mutations.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import logging

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

from fiftyone.server.filters import GroupElementFilter, SampleFilter
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
        saved_view_slug: t.Optional[str],
        form: t.Optional[fosm.StateForm],
        info: Info,
    ) -> fosm.ViewResponse:
        result_view = None
        if saved_view_slug is not None:
            try:
                # Load a DatasetView using a slug
                ds = fod.load_dataset(dataset_name)
                doc = ds._get_saved_view_doc(saved_view_slug, slug=True)
                result_view = ds._load_saved_view_from_doc(doc)
                loaded_at = datetime.datetime.utcnow()
                await _update_view_activity(
                    result_view.name, ds, loaded_at, info
                )
            except:
                pass

        if result_view is None:
            # Update current view with form parameters
            result_view = fosm.get_view(
                dataset_name,
                stages=view if view else None,
                filters=form.filters if form else None,
                extended_stages=form.extended if form else None,
                sample_filter=SampleFilter(
                    group=GroupElementFilter(
                        slice=form.slice, slices=[form.slice]
                    )
                )
                if form.slice
                else None,
            )

        result_view = fosm._build_result_view(result_view, form)
        serialized_view = result_view._serialize()

        dataset = await Dataset.resolver(
            name=dataset_name,
            view=serialized_view,
            saved_view_slug=saved_view_slug,
            info=info,
        )
        return fosm.ViewResponse(dataset=dataset, view=serialized_view)


async def _update_view_activity(
    view_name: str,
    dataset: fod.Dataset,
    loaded_at: datetime.datetime,
    info: Info,
):
    """Record the last load time and total load count
    for a particular saved view and user"""

    db = info.context.db
    uid = info.context.request.user.sub

    if not uid:
        logging.warning("[teams/mutation.py] No id found for the current user")
        uid = "MISSING"

    # use `ObjectId` instead of `name` to avoid issues resolving renamed
    # views and datasets
    view_id = next(
        (
            view.id
            for view in dataset._doc.saved_views
            if view.name == view_name
        ),
        None,
    )
    if not view_id:
        logging.error(
            "[teams/mutation.py] No id found for view_name={} and dataset={}".format(
                view_name, dataset.name
            )
        )
        return

    try:
        # Note: if multi-tab syncing becomes supported, update this to only
        # increase load_count when the difference between the current and
        # previous last_loaded_at is greater than X
        res = await db["views.activity"].find_one_and_update(
            {
                "user_id": uid,
                "view_id": view_id,
                "dataset_id": dataset._doc.id,
            },
            {
                "$set": {
                    "last_loaded_at": loaded_at,
                    "view_name": view_name,
                },
                "$inc": {"load_count": 1},
            },
            projection={
                "_id": True,
                "view_name": True,
                "last_loaded_at": True,
                "load_count": True,
            },
            upsert=True,
        )
        if res:
            return res.get("view_name", None)
    except Exception as e:
        logging.error(
            "[teams/mutation.py] Failed to log view activity to db. "
            "Error: {}".format(e)
        )

    return
