"""
FiftyOne Teams mutations.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
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
from fiftyone.server.scalars import BSONArray

from fiftyone.teams.query import User

from fiftyone.internal.requests import make_request
from fiftyone.internal.util import get_api_url

logger = logging.getLogger(__name__)

_API_URL = get_api_url()


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
    ) -> BSONArray:
        result_view = None
        if saved_view_slug is not None:
            try:
                # Load a DatasetView using a slug
                ds = fod.load_dataset(dataset_name)
                doc = ds._get_saved_view_doc(saved_view_slug, slug=True)
                result_view = ds._load_saved_view_from_doc(doc)
                await _update_view_activity(result_view.name, ds, info)
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
        return result_view._serialize()


UPDATE_VIEW_ACTIVITY_MUTATION = """
mutation (
    $datasetId: String!
    $viewId: String!
    $viewName: String!
    ) {
    updateViewActivity(
        datasetId: $datasetId
        viewId: $viewId
        viewName: $viewName
    )
}
"""


async def _update_view_activity(
    view_name: str,
    dataset: fod.Dataset,
    info: Info,
):
    """Record the last load time and total load count
    for a particular saved view and user"""

    uid = info.context.request.user.sub
    token = info.context.request.headers.get("Authorization", None)

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
            "[teams/mutation.py] No id found for view_name={} and "
            "dataset={}".format(view_name, dataset.name)
        )
        return

    try:
        # attempt to log the view, but don't throw an error if it fails since
        # it's not necessary for loading the view
        await make_request(
            f"{_API_URL}/graphql/v1",
            token,
            UPDATE_VIEW_ACTIVITY_MUTATION,
            variables={
                "datasetId": str(dataset._doc.id),
                "viewId": str(view_id),
                "viewName": view_name,
            },
        )

    except Exception as e:
        logger.error(
            f"[teams/mutation.py] Failed to log view activity for "
            f"{view_name}\nError: {e}"
        )

    return
