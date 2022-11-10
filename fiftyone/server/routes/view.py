"""
FiftyOne Server ``/view`` route.
| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
import fiftyone.core.view as fov
from fiftyone.core.session.events import StateUpdate

import fiftyone.server.events as fose
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from fiftyone.server.decorators import route


class View(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        # print("GET REQUEST:\n\trequest: \n\t\turl:{}\n\t\tquery_params:{}\n\tdata:{}\n".format(
        #         request.url, request.query_params, data))
        subscription = data.get("subscription")
        dataset_name = data.get("dataset")
        view_name = data.get("name")
        dataset = fo.load_dataset(dataset_name)
        view = dataset.load_view(view_name)

        state = fose.get_state()
        state.view = view

        await fose.dispatch_event(subscription, StateUpdate(state=state))

    @route
    async def post(self, request: Request, data: dict):
        # print('POST REQUEST:\n\trequest:{}\n\tdata:{}\n'.format(request,
        #                                                         data))

        dataset_name = data.get("dataset", None)
        dataset = fo.load_dataset(dataset_name)
        view_stages = data.get("view", None)
        view_name = data.get("name")
        description = data.get("description")
        view = fov.DatasetView._build(dataset, view_stages)

        dataset.save_view(view_name, view, description=description)

        return {"success": True}
