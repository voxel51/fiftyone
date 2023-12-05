import os
from unittest import mock

import pytest
from aiohttp.http_exceptions import InvalidHeader

from fiftyone.internal.constants import ENCRYPTION_KEY_ENV_VAR
from fiftyone.internal.requests import make_request
from fiftyone.internal.util import get_api_url


class MockClientSession:
    def __init__(self):
        self.post = mock.MagicMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


@pytest.fixture(autouse=False, scope="function")
def mock_client_session(mock_post):
    with mock.patch(
        "fiftyone.internal.requests.aiohttp.ClientSession",
        new_callable=MockClientSession,
    ) as mock_session:
        mock_session.post = mock_post
        yield mock_session


@pytest.fixture(autouse=False, scope="function")
def mock_post():
    with mock.patch(
        "fiftyone.internal.requests.aiohttp.ClientSession.post"
    ) as mock_post:
        yield mock_post


class TestMakeRequest:
    URL = get_api_url()

    @pytest.mark.asyncio
    async def test_make_request_with_access_token(self, mock_post):
        access_token = "my_token"
        query = "some_query"
        variables = {"var1": "value1"}

        expected = {"result": {"value1": {}}}

        mock_post.return_value.__aenter__.return_value.json = mock.AsyncMock()
        mock_post.return_value.__aenter__.return_value.status = 200
        mock_post.return_value.__aenter__.return_value.json.return_value = (
            expected
        )

        actual = await make_request(self.URL, access_token, query, variables)

        assert actual == expected

    @pytest.mark.asyncio
    async def test_make_request_as_internal_service(self, mock_post, mocker):

        query = "some_query"
        variables = {"var1": "value1"}
        expected = {"result": {"value1": {}}}

        mocker.patch.dict(
            os.environ,
            {
                "FIFTYONE_API_KEY": "my-api-key",
                "FIFTYONE_INTERNAL_SERVICE": "True",
                ENCRYPTION_KEY_ENV_VAR: "my-encryption-key",
            },
        )

        mock_post.return_value.__aenter__.return_value.json = mock.AsyncMock()
        mock_post.return_value.__aenter__.return_value.status = 200
        mock_post.return_value.__aenter__.return_value.json.return_value = (
            expected
        )

        actual = await make_request(self.URL, None, query, variables)

        assert actual == expected

    @pytest.mark.asyncio
    async def test_make_request_no_auth(self, mocker):
        query = "some_query"
        variables = {"var1": "value1"}
        mocker.patch.dict(os.environ, clear=True)

        with pytest.raises(InvalidHeader):
            _ = await make_request(self.URL, None, query, variables)
