"""
FiftyOne Server context

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import starlette.requests as strq
import starlette.responses as strp
import strawberry.asgi as gqla


import fiftyone as fo
from fiftyone.core.odm import get_async_db_client

from fiftyone.server.data import Context
from fiftyone.server.dataloader import dataloaders, get_dataloader


class GraphQL(gqla.GraphQL):
    async def get_context(
        self, request: strq.Request, response: strp.Response
    ) -> Context:
        db_client = get_async_db_client()
        db = db_client[fo.config.database_name]
        session = await db_client.start_session()
        loaders = {}
        for cls, config in dataloaders.items():
            loaders[cls] = get_dataloader(cls, config, db, session)

        return Context(
            db=db,
            session=session,
            dataloaders=loaders,
            request=request,
            response=response,
        )
