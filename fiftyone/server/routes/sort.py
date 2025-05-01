"""
FiftyOne Server /sort route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.core.session.events import StateUpdate
import fiftyone.core.stages as fos

from fiftyone.server.decorators import route
import fiftyone.server.events as fose
import fiftyone.server.view as fosv
from fiftyone.server.filters import GroupElementFilter, SampleFilter


class Sort(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset_name = data.get("dataset", None)
        filters = data.get("filters", {})
        stages = data.get("view", None)
        subscription = data.get("subscription", None)
        slice = data.get("slice", None)

        view = await fosv.get_view(
            dataset_name,
            stages=stages,
            filters=filters,
            extended_stages={
                "fiftyone.core.stages.SortBySimilarity": data["extended"]
            },
            sample_filter=(
                SampleFilter(group=GroupElementFilter(slice=slice))
                if slice is not None
                else None
            ),
            awaitable=True,
        )

        state = fose.get_state()
        state.selected = []
        state.selected_labels = []

        await fose.dispatch_event(subscription, StateUpdate(state))

        # return the new sort by stage
        for stage in reversed(view._stages):
            if isinstance(stage, fos.SortBySimilarity):
                return stage._serialize(include_uuid=False)

        raise ValueError("sorting not found")
