"""
FiftyOne teams authentication tests

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from unittest import mock

import pytest
from jose import ExpiredSignatureError

from package.teams.fiftyone.teams.authenticate import authenticate

VERIFICATION_KEY = "secret"
payload = {
    "sub": "65aea1dcc3c610f14a0dc84b",
    "name": "LocalUser",
    "email": "localuser@voxel51.com",
    "orgId": "65a9d30d0df3946d755227a5",
    "exp": 1805981615,
}
# generated via https://jwt.io/
valid_token = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NWFlYTFkY2MzYzYxMGYxNGEwZGM4NGIi"
    "LCJuYW1lIjoiTG9jYWxVc2VyIiwiZW1haWwiOiJsb2NhbHVzZXJAdm94ZWw1MS5jb20iLCJvcmdJZCI6I"
    "jY1YTlkMzBkMGRmMzk0NmQ3NTUyMjdhNSIsImV4cCI6MTgwNTk4MTYxNX0.uIsTp5PklxT1KfptEHsIbZ"
    "gwaJbsDKxqLajfacG2bHw"
)
expired_token = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NWFlYTFkY2MzYzYxMGYxNGEwZGM4"
    "NGIiLCJuYW1lIjoiTG9jYWxVc2VyIiwiZW1haWwiOiJsb2NhbHVzZXJAdm94ZWw1MS5jb20iLCJvc"
    "mdfaWQiOiI2NWE5ZDMwZDBkZjM5NDZkNzU1MjI3YTUiLCJleHAiOjE2MDU5ODE2MTV9.Yn6ZLH4or"
    "biGWoNuJyhO13kcbFnlCXMHSHvtiWvKQCw"
)


class TestAuthenticate:
    """test token decoder"""

    def test_okay(self):
        with mock.patch.dict(
            os.environ, {"FIFTYONE_AUTH_SECRET": VERIFICATION_KEY}
        ):
            decoded = authenticate(valid_token)
            assert decoded == payload

    def test_expired(self):
        with mock.patch.dict(
            os.environ, {"FIFTYONE_AUTH_SECRET": VERIFICATION_KEY}
        ):
            with pytest.raises(ExpiredSignatureError):
                _ = authenticate(expired_token)
