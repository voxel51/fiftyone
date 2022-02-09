"""
FiftyOne Teams authentication.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import aiohttp as aio
from dacite import from_dict
from jose import jwt

from .utils import JWKS


AUTH0_DOMAIN = "dev-uqppzklh.us.auth0.com"
API_AUDIENCE = "api.dev.fiftyone.ai"
ALGORITHMS = ["RS256"]


def decode(token: str, rsa_key):
    return jwt.decode(
        token,
        rsa_key,
        algorithms=ALGORITHMS,
        audience=API_AUDIENCE,
        issuer=f"https://{AUTH0_DOMAIN}/",
    )


def get_token(authorization: str):
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
    has_scope(token, "Eee")
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


async def get_jwks(web: aio.ClientSession):
    async with web.get(
        f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    ) as response:
        data = await response.json()
        return from_dict(JWKS, data)
