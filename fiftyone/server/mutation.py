"""
FiftyOne Server mutations

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql
import typing as t

import fiftyone as fo
from fiftyone.core.session.events import StateUpdate

from fiftyone.server.data import Info
from fiftyone.server.events import get_state, dispatch_event
from fiftyone.server.query import Dataset


@gql.type
class Mutation:
    @gql.mutation
    async def set_dataset(
        self, subscription: str, name: t.Optional[str], info: Info
    ) -> None:
        state = get_state()
        dataset = await Dataset.resolver(name, info) if name else None

        if dataset == state.dataset:
            return None

        if name and dataset is None:
            return None

        state.dataset = dataset
        state.selected = []
        state.selected_labels = []
        state.view = None
        await dispatch_event(subscription, StateUpdate(state=state))
