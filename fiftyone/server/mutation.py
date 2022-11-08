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

from fiftyone.server.data import Info
from fiftyone.server.events import get_state, dispatch_event
from fiftyone.server.filters import GroupElementFilter, SampleFilter
from fiftyone.server.query import Dataset, SidebarGroup
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


@gql.type
class Mutation:
    @gql.mutation
    async def set_dataset(
        self,
        subscription: str,
        session: t.Optional[str],
        name: t.Optional[str],
        info: Info,
    ) -> bool:
        state = get_state()
        state.dataset = fo.load_dataset(name) if name is not None else None
        state.selected = []
        state.selected_labels = []
        state.view = None
        await dispatch_event(subscription, StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_sidebar_groups(
        self,
        dataset: str,
        stages: BSONArray,
        sidebar_groups: t.List[SidebarGroupInput],
    ) -> bool:
        view = get_view(dataset, stages)

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
        view: BSONArray,
        dataset: str,
        form: t.Optional[StateForm],
        info: Info,
    ) -> ViewResponse:
        state = get_state()
        state.selected = []
        state.selected_labels = []
        if form:
            view = get_view(
                dataset,
                view,
                form.filters,
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
            state.view = fov.DatasetView._build(state.dataset, view)

        await dispatch_event(subscription, StateUpdate(state=state))
        dataset = await Dataset.resolver(state.dataset.name, view, info)
        return ViewResponse(view=state.view._serialize(), dataset=dataset)

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
    ) -> Dataset:
        state = get_state()
        state.dataset.group_slice = slice
        await dispatch_event(subscription, StateUpdate(state=state))
        return await Dataset.resolver(state.dataset.name, view, info)
