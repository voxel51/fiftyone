"""
FiftyOne Teams context.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

import aiohttp as aio
import motor as mtr
import starlette.requests as strq
import starlette.responses as strp
import strawberry.asgi as gqla
import strawberry.types as gqlt

import fiftyone as fo
import fiftyone.constants as foc

from .authentication import JWKS, authenticate_header, get_jwks, get_token

_jwks: JWKS = None
_web: aio.ClientSession = None


@dataclass
class Context:
    authenticated: bool
    db: mtr.MotorDatabase
    web: aio.ClientSession
    jwks: JWKS
    session: mtr.motor_tornado.MotorClientSession
    token: str


Info = gqlt.Info[Context, None]


async def on_startup():
    global _web
    _web = aio.ClientSession()

    global _jwks
    _jwks = await get_jwks(_web)


async def on_shutdown():
    global _web
    await _web.close()


class GraphQL(gqla.GraphQL):
    async def get_context(
        self,
        request: strq.Request,
        response: t.Optional[strp.Response] = None,
    ) -> Context:
        token = get_token(request.headers["Authorization"])
        authenticated = await authenticate_header(token, _jwks)
        db_client = mtr.MotorClient(fo.config.database_uri)
        db = db_client[foc.DEFAULT_DATABASE]
        session = await db_client.start_session(snapshot=True)

        return Context(
            authenticated=authenticated,
            db=db,
            web=_web,
            jwks=_jwks,
            token=token,
            session=session,
        )
