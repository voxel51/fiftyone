"""
FiftyOne Teams authentication

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
from inspect import isclass
import aiohttp as aio
from dacite import from_dict
from jose import jwt
from starlette.authentication import (
    AuthCredentials,
    AuthenticationBackend,
    AuthenticationError,
    BaseUser,
    UnauthenticatedUser,
    requires,
)
from starlette.endpoints import HTTPEndpoint, WebSocketEndpoint
from starlette.middleware import Middleware
from starlette.middleware.authentication import AuthenticationMiddleware

import fiftyone.teams as fot
from fiftyone.teams.data import JWKS


ALGORITHMS = ["RS256"]


_jwks: JWKS = None
_web: aio.ClientSession = None


async def on_startup():
    global _web
    _web = aio.ClientSession()

    global _jwks
    _jwks = await set_jwks(_web)


async def on_shutdown():
    global _web
    await _web.close()


def decode(token: str, rsa_key):
    return jwt.decode(
        token,
        rsa_key,
        algorithms=ALGORITHMS,
        audience="api.dev.fiftyone.ai",
        issuer=f"https://login.dev.fiftyone.ai/",
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


async def set_jwks(web: aio.ClientSession):
    async with web.get(
        f"https://login.dev.fiftyone.ai/.well-known/jwks.json"
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
        header = conn.headers.get("Authorization", None)
        cookie = conn.cookies.get("fiftyone-token", None)
        if header:
            token = get_header_token(header)
        elif cookie:
            token = cookie

        try:
            await authenticate_header(token, _jwks)
        except Exception:
            return AuthCredentials([]), UnauthenticatedUser()

        claims = jwt.get_unverified_claims(token)
        return (
            AuthCredentials(["authenticated"]),
            AuthenticatedUser(sub=claims["sub"]),
        )


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
