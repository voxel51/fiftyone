"""
FiftyOne Server /select route

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from fiftyone.core.session.events import StateUpdate

from fiftyone.server.decorators import route
import fiftyone.server.events as fose


class Select(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        ids = data.get("ids", None)
        labels = data.get("labels", None)
        subscription: str = data.get("subscription")

        state = fose.get_state()

        if ids is not None:
            state.selected = ids

        if labels is not None:
            state.selected_labels = labels

        await fose.dispatch_event(subscription, StateUpdate(state=state))
