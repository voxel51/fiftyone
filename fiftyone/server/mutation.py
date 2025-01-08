"""
FiftyOne Server mutations.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict
import strawberry as gql
import typing as t

import eta.core.utils as etau

import fiftyone.core.dataset as fod
import fiftyone.core.odm as foo
import fiftyone.core.session.events as fose
from fiftyone.core.state import build_color_scheme
import fiftyone.core.stages as fos
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

from fiftyone.server.aggregations import GroupElementFilter, SampleFilter
from fiftyone.server.color import SetColorScheme
from fiftyone.server.data import Info
from fiftyone.server.events import get_state, dispatch_event
from fiftyone.server.inputs import SelectedLabel
from fiftyone.server.query import (
    SidebarGroup,
    SavedView,
)
from fiftyone.server.scalars import BSON, BSONArray, JSON
from fiftyone.server.view import get_view


_CONVERSION_STAGES = {
    fos.ToClips,
    fos.ToEvaluationPatches,
    fos.ToFrames,
    fos.ToPatches,
    fos.ToTrajectories,
}


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
class Mutation(SetColorScheme):
    @gql.mutation
    async def set_field_visibility_stage(
        self,
        subscription: str,
        session: t.Optional[str],
        stage: t.Optional[BSON],
    ) -> bool:
        await dispatch_event(
            subscription,
            fose.SetFieldVisibilityStage(stage=stage),
        )
        return True

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

        state.color_scheme = build_color_scheme(
            None, state.dataset, state.config
        )
        state.group_id = None
        state.sample_id = None
        state.selected = []
        state.selected_labels = []
        state.spaces = foo.default_workspace_factory()
        state.view = None

        if state.dataset is not None:
            state.group_slice = state.dataset.group_slice

        await dispatch_event(subscription, fose.StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_group_slice(
        self,
        subscription: str,
        session: t.Optional[str],
        slice: t.Optional[str],
    ) -> bool:
        await dispatch_event(subscription, fose.SetGroupSlice(slice=slice))
        return True

    @gql.mutation
    async def set_sample(
        self,
        subscription: str,
        session: t.Optional[str],
        group_id: t.Optional[str],
        id: t.Optional[str],
    ) -> bool:
        await dispatch_event(
            subscription,
            fose.SetSample(group_id=group_id, sample_id=id),
        )
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
        view = await get_view(dataset, stages=stages, awaitable=True)

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
        view._dataset.save()

        state.view = view
        await dispatch_event(subscription, fose.StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_selected(
        self,
        subscription: str,
        session: t.Optional[str],
        selected: t.List[str],
    ) -> bool:
        await dispatch_event(
            subscription, fose.SelectSamples(sample_ids=selected)
        )
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
        await dispatch_event(
            subscription, fose.SelectLabels(labels=selected_labels)
        )
        return True

    @gql.mutation
    async def set_view(
        self,
        subscription: str,
        session: t.Optional[str],
        dataset_name: str,
        view: t.Optional[BSONArray] = None,
        saved_view_slug: t.Optional[str] = None,
        form: t.Optional[StateForm] = None,
    ) -> t.Union[BSONArray, None]:
        state = get_state()
        state.group_id = None
        state.sample_id = None
        state.selected = []
        state.selected_labels = []

        if not dataset_name:
            state.dataset = None
            state.group_slice = None
            state.spaces = foo.default_workspace_factory()
            state.view = None
            await dispatch_event(subscription, fose.StateUpdate(state=state))
            return None

        result_view = None
        ds = fod.load_dataset(dataset_name)
        state.dataset = ds

        # Create the view using the saved view doc if loading a saved view
        if saved_view_slug is not None:
            try:
                doc = ds._get_saved_view_doc(saved_view_slug, slug=True)
                result_view = ds.load_saved_view(doc.name)
            except:
                pass

        # Otherwise, build the view using the params
        if result_view is None:
            result_view = await get_view(
                dataset_name,
                stages=view if view else None,
                filters=form.filters if form else None,
                extended_stages=form.extended if form else None,
                sample_filter=(
                    SampleFilter(
                        group=GroupElementFilter(
                            slice=form.slice, slices=[form.slice]
                        )
                    )
                    if form.slice
                    else None
                ),
                awaitable=True,
            )

            # special case for group datasets where conversion stage is added
            # `result_view` will output a `mixed` media type dataset but a real
            # type, e.g. "image", is needed
            is_in_conversion_stage = False
            if form.add_stages:
                is_in_conversion_stage = any(
                    etau.get_class(stage.get("_cls")) in _CONVERSION_STAGES
                    for stage in form.add_stages
                )

            if result_view.media_type == "mixed" and is_in_conversion_stage:
                result_view._set_media_type(ds.group_media_types[form.slice])

            result_view = _build_result_view(result_view, form)

        # Set view state
        state.view = result_view

        await dispatch_event(
            subscription,
            fose.StateUpdate(state=state),
        )

        return result_view._serialize() if result_view else []

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

        dataset_view = await get_view(
            dataset_name,
            stages=view_stages if view_stages else None,
            filters=form.filters if form else None,
            extended_stages=form.extended if form else None,
            awaitable=True,
        )

        result_view = _build_result_view(dataset_view, form)

        dataset.save_view(
            view_name, result_view, description=description, color=color
        )
        if use_state:
            dataset.reload()
            state.view = dataset.load_saved_view(view_name)
            await dispatch_event(subscription, fose.StateUpdate(state=state))

        return next(
            (
                SavedView.from_doc(view_doc)
                for view_doc in dataset._doc.get_saved_views()
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
            deleted_view_id = dataset._delete_saved_view(view_name)
        else:
            raise ValueError(
                "Attempting to delete non-existent saved view: %s",
                view_name,
            )

        # If the current view is deleted, set the view state to the full
        # dataset view
        state = get_state()
        if (
            view_name
            and state.view is not None
            and state.view.name == view_name
        ):
            state.view = dataset.view()

        await dispatch_event(subscription, fose.StateUpdate(state=state))

        return deleted_view_id

    @gql.mutation
    def update_saved_view(
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
                for view_doc in dataset._doc.get_saved_views()
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
        state.spaces = foo.Space.from_dict(spaces)
        await dispatch_event(subscription, fose.SetSpaces(spaces=spaces))
        return True

    @gql.mutation
    def search_select_fields(
        self, dataset_name: str, meta_filter: t.Optional[JSON]
    ) -> t.List[str]:
        if not meta_filter:
            return []

        state = get_state()
        dataset = state.dataset
        if dataset is None:
            dataset = fod.load_dataset(dataset_name)

        try:
            view = dataset.select_fields(meta_filter=meta_filter)
        except Exception:
            try:
                view = dataset.select_fields(meta_filter)
            except Exception:
                view = dataset

        res = []
        try:
            is_video = dataset.media_type == "video"
            for stage in view._stages:
                res += [
                    st
                    for st in stage.get_selected_fields(view, frames=is_video)
                ]
        except Exception:
            res = []

        return res


def _build_result_view(view, form):
    if form.sample_ids:
        view = fov.make_optimized_select_view(view, form.sample_ids)

    if form.add_stages:
        for d in form.add_stages:
            stage = fos.ViewStage._from_dict(d)
            view = view.add_stage(stage)

    return view
