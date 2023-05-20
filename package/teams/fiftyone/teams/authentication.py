"""
FiftyOne Teams authentication

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import typing as t
from dataclasses import dataclass
from inspect import isclass

import aiohttp as aio
from dacite import from_dict
from jose import jwt
from starlette.authentication import (
    AuthCredentials,
    AuthenticationBackend,
    BaseUser,
    UnauthenticatedUser,
    requires,
)
from starlette.endpoints import HTTPEndpoint, WebSocketEndpoint
from starlette.middleware import Middleware
from starlette.middleware.authentication import AuthenticationMiddleware
from strawberry.field import StrawberryField as Field
import strawberry.permission as gqlp

from fiftyone.server.data import Info

import fiftyone.teams as fot
from fiftyone.teams.data import JWKS


ALGORITHMS = ["RS256"]


_jwks: JWKS = None
_web: aio.ClientSession = None


async def on_startup():
    global _web
    _web = aio.ClientSession(trust_env=True)

    global _jwks
    _jwks = await set_jwks(_web)


async def on_shutdown():
    global _web
    await _web.close()


def _ensure_trailing_slash(url: str):
    if not url:
        raise ValueError("Missing url")
    return url if url.endswith("/") else url + "/"


def decode(token: str, rsa_key):
    domain = _ensure_trailing_slash(fot.teams_config.domain)
    return jwt.decode(
        token,
        rsa_key,
        algorithms=ALGORITHMS,
        audience=fot.teams_config.audience,
        issuer=f"https://{domain}",
    )


def get_header_token(authorization: str):
    if not authorization:
        return False

    parts = authorization.split()

    if parts[0].lower() != "bearer":
        return False

    if len(parts) == 1:
        return False

    if len(parts) > 2:
        return False

    return parts[1]


async def authenticate_header(token: str, jwks: JWKS) -> bool:
    unverified_header = jwt.get_unverified_header(token)

    rsa_key = {}
    for key in jwks.keys:
        if key.kid == unverified_header["kid"]:
            rsa_key = {
                "kty": key.kty,
                "kid": key.kid,
                "use": key.use,
                "n": key.n,
                "e": key.e,
            }
    if not rsa_key:
        raise ValueError(
            "Unable to authenticate header. Missing matching jwk key ID (kid). "
            "Verify the value for FIFTYONE_TEAMS_DOMAIN is correct."
        )
    if rsa_key:
        try:
            decode(token, rsa_key)
        except jwt.ExpiredSignatureError:
            raise ValueError(
                "Unable to authenticate header. "
                "Encountered jwt.ExpiredSignatureError"
            )
        except jwt.JWTClaimsError:
            raise ValueError(
                "Unable to authenticate header. Encountered jwt.JWTClaimsError. "
                "Verify the values for your FiftyOneTeamsConfig are correct."
            )
        except Exception as e:
            raise ValueError(
                "Unable to authenticate header. Uncaught exception: {}".format(
                    e
                )
            )

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


async def set_jwks(web: aio.ClientSession):
    async with web.get(
        f"https://{fot.teams_config.domain}/.well-known/jwks.json"
    ) as response:
        data = await response.json()
        return from_dict(JWKS, data)


def get_jwks():
    return _jwks


def get_web():
    return _web


@dataclass
class AuthenticatedUser(BaseUser):
    sub: str

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def display_name(self) -> str:
        return self.sub


class Authentication(AuthenticationBackend):
    async def authenticate(self, conn):
        token = None
        header = conn.headers.get("Authorization", None)
        cookie = conn.cookies.get("fiftyone-token", None)
        if header:
            token = get_header_token(header)
        elif cookie:
            token = cookie
        else:
            # Can't throw an error here because token may not be present upon
            # first load, and we don't want to get stuck here.
            pass
        if token:
            try:
                authenticated = await authenticate_header(token, _jwks)
                if authenticated:
                    claims = jwt.get_unverified_claims(token)
                    return (
                        AuthCredentials(["authenticated"]),
                        AuthenticatedUser(sub=claims["sub"]),
                    )
            except ValueError:
                ...
            except Exception as e:
                logging.error(
                    "Uncaught authentication exception: {}".format(e)
                )

        return AuthCredentials([]), UnauthenticatedUser()


def authenticate_route(endpoint):
    wrapper = requires(["authenticated"])

    def set_methods(methods):
        for method in methods:
            func = getattr(endpoint, method, None)

            if func:
                setattr(endpoint, method, wrapper(func))

        return endpoint

    if isclass(endpoint) and issubclass(endpoint, HTTPEndpoint):
        return set_methods(["get", "post"])

    if isclass(endpoint) and issubclass(endpoint, WebSocketEndpoint):
        return set_methods(["on_connect", "on_receive", "on_disconnect"])

    return wrapper(endpoint)


middleware = [Middleware(AuthenticationMiddleware, backend=Authentication())]


class IsAuthenticated(gqlp.BasePermission):
    message = "Unauthenticated request"

    async def has_permission(
        self, source: t.Any, info: Info, **kwargs: t.Dict
    ) -> bool:
        return isinstance(info.context.request.user, AuthenticatedUser)


def authenticate_gql_class(query: t.Type[t.Any]) -> t.Type[t.Any]:
    fields: t.List[Field] = query._type_definition._fields
    for field in fields:
        field.permission_classes = [IsAuthenticated]

    return query
