"""
FiftyOne Server context

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import starlette.requests as strq
import starlette.responses as strp
import strawberry.asgi as gqla


from fiftyone.core.odm import get_async_db_conn

from fiftyone.server.data import Context
from fiftyone.server.dataloader import dataloaders, get_dataloader


def get_context(
    request: t.Optional[strq.Request] = None,
    response: t.Optional[strp.Response] = None,
    use_global_db_client: bool = False,
):
    db = get_async_db_conn(use_global=use_global_db_client)
    loaders = {}
    for cls, config in dataloaders.items():
        loaders[cls] = get_dataloader(cls, config, db)

    return Context(
        db=db, dataloaders=loaders, request=request, response=response
    )


class GraphQL(gqla.GraphQL):
    async def get_context(
        self, request: strq.Request, response: strp.Response
    ) -> Context:
        return get_context(request=request, response=response)
