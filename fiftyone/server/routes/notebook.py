"""
FiftyOne Server notebook routes

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.requests import Request

from fiftyone.server.state import StateHandler
import fiftyone.server.utils as fosu


_notebook_clients = {}


def get_notebook(client):
    """Get a notebook client

    Args:
        client: notebook client
    """
    return _notebook_clients.get(client, None)


def set_notebook(client, value):
    """Set a notebook client

    Args:
        client: notebook client
        value: notebook value
    """
    _notebook_clients[client] = value


async def notebook(request: Request, data: dict) -> dict:
    handle_id = request.query_params.get("handleId")
    if handle_id in set(_notebook_clients.values()):
        return {"exists": True}


async def reactive(request: Request, data: dict) -> dict:
    handle_id = request.query_params.get("handle_id")
    StateHandler.state["active_handle"] = handle_id
    global _deactivated_clients
    _deactivated_clients.discard(handle_id)
    for client in StateHandler.clients:
        client.write_message({"type": "reactivate", "handle": handle_id})

    return {}
