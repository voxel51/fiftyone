"""
FiftyOne Labs

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

import fiftyone.constants as foc

import aiohttp as aioh
from bson import ObjectId
import jwt
import motor
import starlette.applications as srva
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
import starlette.requests as srvr
import starlette.responses as srvre
import strawberry as gql
import strawberry.asgi as gqla
import strawberry.permission as gqlp
import strawberry.types as gqlt


AUTH0_DOMAIN = "dev-uqppzklh.us.auth0.com"
API_AUDIENCE = "api.dev.fiftyone.ai"
ALGORITHMS = ["RS256"]


@dataclass
class Context:
    request: srvr.Request
    response: srvre.Response
    db: motor.MotorDatabase


Info = gqlt.Info[Context, None]


class IsAuthenticated(gqlp.BasePermission):
    message = "Unauthenticated request"

    async def has_permission(
        self, source: t.Any, info: Info, **kwargs
    ) -> bool:
        return info.context.user is not None


def decode(token: str, rsa_key: str):
    payload = jwt.decode(
        token,
        rsa_key,
        algorithms=ALGORITHMS,
        audience=API_AUDIENCE,
        issuer=f"https://{AUTH0_DOMAIN}/",
    )
    print(payload)


async def authenticate_header(
    web: aioh.ClientSession, authorization: str
) -> bool:
    if not authorization:
        return False

    parts = authorization.split()

    if parts[0].lower() != "bearer":
        return False

    if len(parts) == 1:
        return False

    if len(parts) > 2:
        return False

    token = parts[1]

    unverified_header = jwt.get_unverified_header(token)
    rsa_key = {}
    for key in jwks["keys"]:
        if key["kid"] == unverified_header["kid"]:
            rsa_key = {
                "kty": key["kty"],
                "kid": key["kid"],
                "use": key["use"],
                "n": key["n"],
                "e": key["e"],
            }
    if rsa_key:
        try:
            decode(token, rsa_key)
        except jwt.ExpiredSignatureError:
            return False
        except jwt.JWTClaimsError:
            return False
        except Exception:
            return False

        return True

    return False


def has_scope(token: str, scope: str):
    unverified_claims = jwt.get_unverified_claims(token)
    if unverified_claims.get("scope"):
        token_scopes = unverified_claims["scope"].split()
        for token_scope in token_scopes:
            if token_scope == scope:
                return True
    return False


ID = gql.scalar(
    t.NewType("ID", str),
    serialize=lambda v: str(v),
    parse_value=lambda v: ObjectId(v),
)


@gql.type
class Query:
    @gql.field
    def hello(self) -> str:
        return "Hello World"


@gql.interface
class StageParameter:
    _cls: str
    name: str
    kind: str


@gql.interface
class Stage:
    _cls: str
    kwargs: t.List[StageParameter]


@gql.type
class SelectedLabelData:
    id: str
    sample_id: str
    field: str
    frame_number: t.Optional[int]


@gql.type
class Session:
    dataset: t.Optional[str]
    view: t.Optional[t.List[Stage]]
    selected: t.Optional[t.List[str]]
    selected_labels: t.Optional[t.List[SelectedLabelData]]
    user_id: gql.ID


@gql.type
class User:
    id: gql.ID


@gql.type
class Query:
    users: t.List[User]

    @gql.field
    def viewer(self, info: gqlt.Info) -> User:
        return User(id=ObjectId("000000000000000000000000"))


class GraphQL(gqla.GraphQL):
    async def get_context(
        self,
        request: srvr.Request,
        response: t.Optional[srvre.Response] = None,
    ) -> Context:
        authenticate_header(
            request.app.state.web_session, request.headers["Authorization"]
        )

        return Context(request=request, response=response, db=db)


db_client = motor.MotorClient()
db = db_client[foc.DEFAULT_DATABASE]
schema = gql.Schema(query=Query)
jwks: str = None
web: aioh.ClientSession = None


async def get_jwks():
    global web

    if web is None:
        web = aioh.ClientSession()

    async with web.get(
        f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    ) as response:
        return await response.json()


async def on_startup():
    global jwks
    jwks = await get_jwks()


async def on_shutdown():
    global web
    await web.close()


app = srva.Starlette(on_shutdown=[on_shutdown], on_startup=[on_startup])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=[
        "access-control-allow-origin",
        "authorization",
        "content-type",
    ],
)
app.add_route("/graphql", gqla.GraphQL(schema, graphiql=foc.DEV_INSTALL))
