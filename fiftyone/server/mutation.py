"""
FiftyOne Server mutations

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql
import typing as t

import eta.core.serial as etas

import fiftyone.constants as foc
from fiftyone.core.session.events import StateUpdate
import fiftyone.core.view as fov

from fiftyone.server.data import Info
from fiftyone.server.events import get_state, dispatch_event
from fiftyone.server.query import Dataset
from fiftyone.server.scalars import JSONArray


@gql.input
class SelectedLabel:
    field: str
    frame_number: t.Optional[int]
    label_id: str
    sample_id: str


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
        dataset = await Dataset.resolver(name, [], info) if name else None

        if dataset == state.dataset:
            return False

        if name and dataset is None:
            return False

        state.dataset = dataset
        state.selected = []
        state.selected_labels = []
        state.view = None
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

        state.selected_labels = selected_labels
        await dispatch_event(subscription, StateUpdate(state=state))
        return True

    @gql.mutation
    async def set_view(
        self, subscription: str, session: t.Optional[str], view: JSONArray
    ) -> JSONArray:
        state = get_state()

        state.selected = []
        state.selected_labels = []
        state.view = fov.DatasetView._build(state.dataset, view)
        await dispatch_event(subscription, StateUpdate(state=state))
        return view

    @gql.mutation
    async def store_teams_submission(self) -> bool:
        etas.write_json({"submitted": True}, foc.TEAMS_PATH)
        return True
