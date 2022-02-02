"""
FiftyOne Labs

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import aiohttp as aioh
from bson import ObjectId
import jwt

import starlette.applications as srva
import starlette.requests as srvr
import strawberry as gql
import strawberry.asgi as gqla
import strawberry.permission as gqlp
import strawberry.types as gqlt


AUTH0_DOMAIN = "dev-uqppzklh.us.auth0.com"
API_AUDIENCE = "api.dev.fiftyone.ai"
ALGORITHMS = ["RS256"]


class IsAuthenticated(gqlp.BasePermission):
    message = "Unauthenticated request"

    async def has_permission(
        self, source: t.Any, info: gqlt.Info, **kwargs
    ) -> bool:
        request: srvr.Request = info.context["request"]

        return authenticate_header(
            request.app.state, request.headers["Authorization"]
        )


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

    async with web.get(
        f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    ) as response:
        jwks = response.json()

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
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=ALGORITHMS,
                audience=API_AUDIENCE,
                issuer=f"https://{AUTH0_DOMAIN}/",
            )
            print("PAYLOAD", payload)
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
    user_id: ID


@gql.type
class User:
    id: ID


@gql.type
class Query:
    sessions: t.List[Session]


class GraphQL(gqla.GraphQL):
    async def get_context(
        self, request: srvr.Request, response: t.Optional[srvr.Response] = None
    ) -> t.Any:
        authenticate_header(
            request.app.state.web, request.headers["Authorization"]
        )

        return {"request": request, "response": response}


schema = gql.Schema(query=Query)
graphql_app = gqla.GraphQL(schema)


async def on_startup():
    app.state.web = aioh.ClientSession()


async def on_shutdown():
    web: aioh.ClientSession = app.state.web
    await web.close()


app = srva.Starlette(on_shutdown=on_shutdown, on_startup=on_startup)
app.add_route("/graphql", graphql_app)
