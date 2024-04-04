"""
FiftyOne token authentication

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from jose import jwt

from fiftyone.teams import teams_config


_ALGORITHMS = ["HS256"]


def authenticate(token: str):
    return jwt.decode(
        token,
        teams_config.auth_secret,
        algorithms=_ALGORITHMS,
    )
