"""
FiftyOne Server mutations.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import asdict
import strawberry as gql
import typing as t

import eta.core.serial as etas

import fiftyone.constants as foc
import fiftyone.core.dataset as fod
import fiftyone.core.odm as foo
from fiftyone.core.session.events import StateUpdate
from fiftyone.core.spaces import default_spaces, Space
import fiftyone.core.stages as fos
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

from fiftyone.server.data import Info
from fiftyone.server.events import get_state, dispatch_event
from fiftyone.server.query import Dataset, SidebarGroup, SavedView
from fiftyone.server.scalars import BSON, BSONArray, JSON
from fiftyone.server.view import get_view, extend_view


def _build_result_view(result_view, form):
    if form.slice:
        result_view = result_view.select_group_slices([form.slice])

    if form.sample_ids:
        result_view = fov.make_optimized_select_view(
            result_view, form.sample_ids
        )

    if form.extended:
        result_view = extend_view(result_view, form.extended, True)

    if form.add_stages:
        for d in form.add_stages:
            stage = fos.ViewStage._from_dict(d)
            result_view = result_view.add_stage(stage)

    return result_view


@gql.input
class SelectedLabel:
    field: str
    label_id: str
    sample_id: str
    frame_number: t.Optional[int] = None


@gql.type
class ViewResponse:
    view: BSONArray
    dataset: Dataset


@gql.input
class SidebarGroupInput(SidebarGroup):
    pass


@gql.input
class StateForm:
    add_stages: t.Optional[BSONArray] = None
    filters: t.Optional[JSON] = None
    sample_ids: t.Optional[t.List[str]] = None
    labels: t.Optional[t.List[SelectedLabel]] = None
    extended: t.Optional[BSON] = None
    slice: t.Optional[str] = None


@gql.input
class SavedViewInfo:
    name: t.Optional[str] = None
    description: t.Optional[str] = None
    color: t.Optional[str] = None


@gql.type
class Mutation:
    @gql.mutation
    async def set_dataset(
        self,
        subscription: str,
        session: t.Optional[str],
        name: t.Optional[str],
        view_name: t.Optional[str],
        info: Info,
    ) -> bool:
        state = get_state()
        state.dataset = fod.load_dataset(name) if name is not None else None
        state.selected = []
        state.selected_labels = []
        state.view = None
        state.view_name = view_name if view_name is not None else None
        state.spaces = default_spaces
        await dispatch_event(subscription, StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_sidebar_groups(
        self,
        subscription: str,
        session: t.Optional[str],
        dataset: str,
        stages: BSONArray,
        sidebar_groups: t.List[SidebarGroupInput],
    ) -> bool:
        state = get_state()
        view = get_view(dataset, stages=stages)

        current = (
            {
                group.name: group.expanded
                for group in view._dataset.app_config.sidebar_groups
            }
            if view._dataset.app_config.sidebar_groups is not None
            else {}
        )

        view._dataset.app_config.sidebar_groups = [
            foo.SidebarGroupDocument(
                name=group.name,
                expanded=current.get(group.name, None),
                paths=group.paths,
            )
            for group in sidebar_groups
        ]

        view._dataset._doc.save()
        state.view = view
        await dispatch_event(subscription, StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_selected(
        self,
        subscription: str,
        session: t.Optional[str],
        selected: t.List[str],
    ) -> bool:
        state = get_state()

        state.selected = selected
        await dispatch_event(subscription, StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_selected_labels(
        self,
        subscription: str,
        session: t.Optional[str],
        selected_labels: t.List[SelectedLabel],
    ) -> bool:
        state = get_state()

        state.selected_labels = [asdict(l) for l in selected_labels]
        await dispatch_event(subscription, StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_view(
        self,
        subscription: str,
        session: t.Optional[str],
        dataset_name: str,
        view: t.Optional[BSONArray],
        saved_view_slug: t.Optional[str],
        form: t.Optional[StateForm],
        info: Info,
    ) -> ViewResponse:
        state = get_state()
        state.selected = []
        state.selected_labels = []

        result_view = None

        # Load saved views
        if saved_view_slug is not None:
            try:
                ds = fod.load_dataset(dataset_name)
                doc = ds._get_saved_view_doc(saved_view_slug, slug=True)
                result_view = ds._load_saved_view_from_doc(doc)
            except:
                pass

        if result_view is None:
            # Update current view with form parameters
            result_view = get_view(
                dataset_name,
                stages=view if view else None,
                filters=form.filters if form else None,
            )

        # Set view state
        result_view = _build_result_view(result_view, form)
        slug = (
            fou.to_slug(result_view.name)
            if result_view.name
            else saved_view_slug
        )
        state.view = result_view
        state.view_name = result_view.name
        state.saved_view_slug = slug
        await dispatch_event(
            subscription,
            StateUpdate(state=state),
        )

        final_view = []
        if state and state.view:
            final_view = state.view._serialize()

        dataset = await Dataset.resolver(
            name=dataset_name,
            view=final_view,
            saved_view_slug=slug,
            info=info,
        )
        return ViewResponse(
            dataset=dataset,
            view=final_view,
        )

    @gql.mutation
    async def store_teams_submission(self) -> bool:
        etas.write_json({"submitted": True}, foc.TEAMS_PATH)
        return True

    @gql.mutation
    async def set_group_slice(
        self,
        subscription: str,
        session: t.Optional[str],
        view: BSONArray,
        slice: str,
        info: Info,
        view_name: t.Optional[str] = None,
    ) -> Dataset:
        state = get_state()
        state.dataset.group_slice = slice
        await dispatch_event(subscription, StateUpdate(state=state))
        return await Dataset.resolver(
            name=state.dataset.name,
            view=view,
            saved_view_slug=fou.to_slug(view_name)
            if view_name
            else fou.to_slug(state.view.name)
            if state.view
            else None,
            info=info,
        )

    @gql.mutation
    async def create_saved_view(
        self,
        subscription: str,
        session: t.Optional[str],
        view_name: str,
        view_stages: t.Optional[BSONArray] = None,
        form: t.Optional[StateForm] = None,
        dataset_name: t.Optional[str] = None,
        description: t.Optional[str] = None,
        color: t.Optional[str] = None,
    ) -> t.Optional[SavedView]:
        state = get_state()
        dataset = state.dataset
        use_state = dataset is not None
        if dataset is None:
            dataset = fod.load_dataset(dataset_name)

        if dataset is None:
            raise ValueError(
                "[mutation: saved_view] Missing dataset "
                "reference for creating saved view with name = "
                "{}".format(view_name)
            )

        dataset_view = get_view(
            dataset_name,
            stages=view_stages if view_stages else None,
            filters=form.filters if form else None,
        )
        # view arg required to be an instance of
        # `fiftyone.core.view.DatasetView`
        result_view = _build_result_view(dataset_view, form)
        dataset.save_view(
            view_name, result_view, description=description, color=color
        )
        if use_state:
            dataset.reload()
            state.view = dataset.load_saved_view(view_name)
            state.view_name = view_name
            await dispatch_event(subscription, StateUpdate(state=state))

        return next(
            (
                SavedView.from_doc(view_doc)
                for view_doc in dataset._doc.saved_views
                if view_doc.name == view_name
            ),
            None,
        )

    @gql.mutation
    async def delete_saved_view(
        self,
        subscription: str,
        session: t.Optional[str],
        view_name: str,
        dataset_name: t.Optional[str],
    ) -> t.Optional[str]:
        if not dataset_name:
            raise ValueError(
                "Attempting to delete a saved view (%s) without a "
                "dataset reference.",
                view_name,
            )

        dataset = fod.load_dataset(dataset_name)
        if not dataset:
            raise ValueError(f"No dataset found with name {dataset_name}")

        if dataset.has_saved_view(view_name):
            deleted_view_id = dataset.delete_saved_view(view_name)
        else:
            raise ValueError(
                "Attempting to delete non-existent saved view: %s",
                view_name,
            )

        # If the current view is deleted, set the view state to the full
        # dataset view
        state = get_state()
        if view_name and state.view_name == view_name:
            state.view = dataset.view()
            state.view_name = None

        await dispatch_event(subscription, StateUpdate(state=state))

        return deleted_view_id

    @gql.mutation
    async def update_saved_view(
        self,
        view_name: str,
        subscription: t.Optional[str],
        session: t.Optional[str],
        updated_info: SavedViewInfo,
        dataset_name: t.Optional[str] = None,
    ) -> t.Optional[SavedView]:
        """Updates the editable fields of a saved view

        Args:
            subscription: str identifier used for syncing App state
            session: str identifier use for syncing App state
            view_name: name of the existing saved view
            updated_info: input type with values only for fields requiring
            update

        """
        state = get_state()
        if state is None or state.dataset is None:
            dataset = fod.load_dataset(dataset_name)
        else:
            dataset = state.dataset

        updated_info = asdict(updated_info)

        if dataset.has_saved_view(view_name):
            dataset.update_saved_view_info(view_name, updated_info)
        else:
            raise ValueError(
                "Attempting to update fields on non-existent saved view: "
                "%s",
                view_name,
            )
        dataset.reload()
        current_name = (
            updated_info["name"]
            if "name" in updated_info and updated_info["name"] is not None
            else view_name
        )
        # Return updated saved_view, which may not be the currently loaded
        # view in state.view
        return next(
            (
                SavedView.from_doc(view_doc)
                for view_doc in dataset._doc.saved_views
                if view_doc.name == current_name
            ),
            None,
        )

    @gql.mutation
    async def set_spaces(
        self,
        subscription: str,
        session: t.Optional[str],
        spaces: BSON,
    ) -> bool:
        state = get_state()
        state.spaces = Space.from_dict(spaces)
        await dispatch_event(subscription, StateUpdate(state=state))
        return True
