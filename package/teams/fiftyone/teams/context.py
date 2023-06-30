"""
FiftyOne Teams context

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import motor.motor_asyncio as mtr
import starlette.requests as strq
import starlette.responses as strp
import strawberry.asgi as gqla

import fiftyone as fo
from fiftyone.core.odm import get_async_db_client, get_async_db_conn

from fiftyone.server.dataloader import dataloaders, get_dataloader
from fiftyone.server.data import Context


class GraphQL(gqla.GraphQL):
    async def get_context(
        self,
        request: strq.Request,
        response: strp.Response,
    ) -> Context:
        db_client = get_async_db_client()
        db = get_async_db_conn()
        session: mtr.AsyncIOMotorClientSession = (
            await db_client.start_session()
        )

        loaders = {}
        for cls, config in dataloaders.items():
            loaders[cls] = get_dataloader(cls, config, db)

        return Context(
            db=db,
            dataloaders=loaders,
            request=request,
            response=response,
        )
