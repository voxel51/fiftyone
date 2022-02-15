"""
FiftyOne Server notebook routes

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.server.decorators import route
from fiftyone.server.state import get_state, set_state


_notebook_clients = {}


def get_notebook(client):
    return _notebook_clients.get(client, None)


def set_notebook(client, value):
    _notebook_clients[client] = value


class Notebook(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict) -> dict:
        handle_id = request.query_params.get("handle_id")
        if handle_id in set(_notebook_clients.values()):
            return {"exists": True}

    @route
    async def post(self, request: Request, data: dict) -> dict:
        handle_id = request.query_params.get("handle_id")
        state = get_state()

        state.active_handle = handle_id
        set_state(state)
