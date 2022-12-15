"""
FiftyOne Server mutations

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import asdict
import strawberry as gql
import typing as t

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.odm as foo
from fiftyone.core.session.events import StateUpdate
import fiftyone.core.stages as fos
import fiftyone.core.view as fov
import fiftyone.core.dataset as fod

from fiftyone.server.data import Info
from fiftyone.server.events import get_state, dispatch_event
from fiftyone.server.filters import GroupElementFilter, SampleFilter
from fiftyone.server.query import Dataset, SidebarGroup, SavedView
from fiftyone.server.scalars import BSON, BSONArray, JSON
from fiftyone.server.view import get_view, extend_view


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
    view_name: t.Optional[str] = None
    saved_view_slug: t.Optional[str] = None
    changing_saved_view: t.Optional[bool] = False


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
        state.dataset = fo.load_dataset(name) if name is not None else None
        state.selected = []
        state.selected_labels = []
        state.view = None
        state.view_name = view_name if view_name is not None else None
        await dispatch_event(subscription, StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_sidebar_groups(
        self,
        dataset: str,
        stages: BSONArray,
        sidebar_groups: t.List[SidebarGroupInput],
    ) -> bool:
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
        view_name: t.Optional[str],
        saved_view_slug: t.Optional[str],
        changing_saved_view: t.Optional[bool],
        form: t.Optional[StateForm],
        info: Info,
    ) -> ViewResponse:
        state = get_state()
        state.selected = []
        state.selected_labels = []

        if view_name is not None and state.dataset.has_saved_view(view_name):
            # Load a saved view by name
            state.view = state.dataset.load_saved_view(view_name)
            if isinstance(state.dataset, fod.Dataset):
                state.saved_views = state.dataset._doc.saved_views
            else:
                state.saved_views = []

        elif form:
            # Update current view with form parameters
            view = get_view(
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
                view = extend_view(view, form.extended, True)

            state.view = view
            view = view._serialize()

        else:
            # Apply a list of view stages to dataset if provided
            state.view = fov.DatasetView._build(state.dataset, view)

        state.saved_view_slug = saved_view_slug or None

        await dispatch_event(
            subscription,
            StateUpdate(
                state=state,
                update=True,
                changing_saved_view=changing_saved_view,
            ),
        )
        dataset = await Dataset.resolver(
            name=dataset_name,
            view=view,
            view_name=view_name if view_name else state.view.name,
            info=info,
        )
        return ViewResponse(
            view=state.view._serialize(),
            dataset=dataset,
            view_name=state.view.name,
            saved_view_slug=saved_view_slug,
            changing_saved_view=changing_saved_view,
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
        view_name: t.Optional[str],
        slice: str,
        info: Info,
    ) -> Dataset:
        state = get_state()
        state.dataset.group_slice = slice
        await dispatch_event(subscription, StateUpdate(state=state))
        return await Dataset.resolver(
            name=state.dataset.name,
            view=view,
            view_name=view_name if view_name else state.view.name,
            info=info,
        )

    @gql.mutation
    async def save_view(
        self,
        subscription: str,
        session: t.Optional[str],
        view_name: str,
        view_stages: t.Optional[BSONArray] = None,
        dataset_name: t.Optional[str] = None,
        description: t.Optional[str] = None,
        color: t.Optional[str] = None,
    ) -> t.Optional[SavedView]:
        state = get_state()
        dataset = state.dataset
        use_state = True
        if dataset is None:
            use_state = False
            # teams is stateless so dataset will be null
            dataset = fo.load_dataset(dataset_name)
            print("loaded dataset:", dataset)

        if dataset is None:
            raise ValueError(
                "[mutation: saved_view] Missing dataset "
                "reference for creating saved view with name = "
                "{}".format(view_name)
            )
        # view arg required to be an instance of
        # `fiftyone.core.view.DatasetView`
        if use_state:
            print("stateful save_view called.")

            dataset.save_view(
                view_name, state.view, description=description, color=color
            )
            dataset.reload()
            state.view = dataset.load_saved_view(view_name)
            state.view_name = view_name
            await dispatch_event(subscription, StateUpdate(state=state))
        else:
            view = get_view(dataset_name, stages=view_stages)
            print("stateless save_view called. created view:\n", view)
            dataset.save_view(
                view_name, view, description=description, color=color
            )

        return next(
            (
                saved_view
                for saved_view in dataset._doc.saved_views
                if saved_view.name == view_name
            ),
            None,
        )

    # TODO: return an id or the object that was deleted?
    # https://stackoverflow.com/questions/58889341/what-should-be-the-graphql-mutation-return-type-when-there-is-no-data-to-return#:~:text=For%20deletions%2C%20it's%20common%20to,to%20better%20encapsulate%20client%20errors.
    @gql.mutation
    async def delete_saved_view(
        self, subscription: str, session: t.Optional[str], view_name: str
    ) -> t.Optional[str]:
        state = get_state()
        dataset = state.dataset
        if dataset.has_saved_views and dataset.has_saved_view(view_name):
            deleted_view_id = state.dataset.delete_saved_view(view_name)
        else:
            raise ValueError(
                "Attempting to delete non-existent saved view: %s",
                view_name,
            )

        # If the current view is deleted, set the view state to the full
        # dataset view
        if state.view_name == view_name:
            state.view = dataset.view()
            state.view_name = None

        # TODO: confirm StateUpdate is unnecessary
        await dispatch_event(subscription, StateUpdate(state=state))

        return deleted_view_id

    @gql.mutation
    def update_saved_view(
        self,
        view_name: str,
        subscription: t.Optional[str],
        session: t.Optional[str],
        updated_info: SavedViewInfo,
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
        dataset = state.dataset
        updated_info = asdict(updated_info)

        if dataset.has_saved_views and dataset.has_saved_view(view_name):
            dataset.update_saved_view_info(view_name, updated_info)
        else:
            raise ValueError(
                "Attempting to update fields on non-existent saved view: "
                "%s",
                view_name,
            )
        dataset.reload()
        name = (
            updated_info["name"]
            if "name" in updated_info and updated_info["name"] is not None
            else view_name
        )
        # Return updated saved_view, which may not be the currently loaded
        # view in state.view
        return next(
            (
                saved_view
                for saved_view in dataset._doc.saved_views
                if saved_view.name == name
            ),
            None,
        )
