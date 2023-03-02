"""
FiftyOne Server /sort route

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import asdict

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.server.decorators import route
import fiftyone.server.events as fose
from fiftyone.server.query import serialize_dataset
import fiftyone.server.view as fosv


class Sort(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset_name = data.get("dataset", None)
        filters = data.get("filters", {})
        stages = data.get("view", None)
        subscription = data.get("subscription", None)
        fosv.get_view(
            dataset_name,
            stages=stages,
            filters=filters,
            extended_stages={
                "fiftyone.core.stages.SortBySimilarity": data["extended"]
            },
        )
        state = fose.get_state()
        state.selected = []

        await fose.dispatch_event(subscription, fose.StateUpdate(state))
        return {
            "dataset": asdict(
                await serialize_dataset(
                    dataset_name=dataset_name,
                    serialized_view=stages,
                )
            ),
            "state": state,
        }
