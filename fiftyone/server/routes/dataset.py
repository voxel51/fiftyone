"""
FiftyOne Server /dataset route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from strawberry import subscription

import fiftyone.core.session.events as fose

from fiftyone.server.decorators import route
from fiftyone.server.events import dispatch_event, get_state


class DatasetData(t.TypedDict):
    name: str
    subscription: str


class Dataset(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: DatasetData) -> t.Dict:
        state = get_state()
        print("HELLO", state.dataset)
        state.dataset = data["name"]
        state.view = None
        state.selected = []
        state.selected_labels = []
        await dispatch_event(
            data["subscription"],
            fose.StateUpdate(state=state),
        )

        return {}
