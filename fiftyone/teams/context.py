"""
FiftyOne Teams context

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from jose import jwt
import motor as mtr
import starlette.requests as strq
import starlette.responses as strp
import strawberry.asgi as gqla


import fiftyone as fo
import fiftyone.constants as foc

from .authentication import (
    authenticate_header,
    get_header_token,
    get_jwks,
    get_web,
)
from .dataloader import dataloaders, get_dataloader
from .utils import Context


class GraphQL(gqla.GraphQL):
    async def get_context(
        self,
        request: strq.Request,
        response: t.Optional[strp.Response] = None,
    ) -> Context:
        token = get_header_token(request.headers.get("Authorization", None))
        jwks = get_jwks()
        web = get_web()
        try:
            authenticated = await authenticate_header(token, jwks)
        except:
            authenticated = True
        db_client = mtr.MotorClient(fo.config.database_uri)
        db = db_client[foc.DEFAULT_DATABASE]
        session = await db_client.start_session()
        try:
            sub = jwt.get_unverified_claims(token)["sub"]
        except:
            sub = None

        loaders = {}
        for cls, config in dataloaders.items():
            loaders[cls] = get_dataloader(cls, config, db, session)

        return Context(
            authenticated=True,
            db=db,
            web=web,
            jwks=jwks,
            token=token,
            session=session,
            sub=sub,
            dataloaders=loaders,
        )
