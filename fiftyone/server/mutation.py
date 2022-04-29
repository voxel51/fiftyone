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

from fiftyone.server.data import Info
from fiftyone.server.events import get_state, dispatch_event
from fiftyone.server.query import Dataset


@gql.type
class Mutation:
    @gql.mutation
    async def set_dataset(
        self, subscription: str, name: t.Optional[str], info: Info
    ) -> bool:
        state = get_state()
        dataset = await Dataset.resolver(name, info) if name else None

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
    async def store_teams_submission(self) -> bool:
        etas.write_json({"submitted": True}, foc.TEAMS_PATH)
        return True
