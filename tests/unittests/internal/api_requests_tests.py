"""
Unit tests for internal requests module.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest import mock

import pytest
from aiohttp.http_exceptions import InvalidHeader

import fiftyone.internal
from fiftyone.internal import api_requests
from fiftyone.internal.constants import ENCRYPTION_KEY_ENV_VAR
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
        "fiftyone.internal.api_requests.aiohttp.ClientSession",
        new_callable=MockClientSession,
    ) as mock_session:
        mock_session.post = mock_post
        yield mock_session


@pytest.fixture(autouse=False, scope="function")
def mock_post():
    with mock.patch(
        "fiftyone.internal.api_requests.aiohttp.ClientSession.post"
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

        actual = await api_requests.make_request(
            self.URL, access_token, query, variables
        )

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

        actual = await api_requests.make_request(
            self.URL, None, query, variables
        )

        assert actual == expected

    @pytest.mark.asyncio
    async def test_make_request_no_auth(self, mocker):
        query = "some_query"
        variables = {"var1": "value1"}
        mocker.patch.dict(os.environ, clear=True)

        with pytest.raises(InvalidHeader):
            _ = await api_requests.make_request(
                self.URL, None, query, variables
            )


api_url = f"{api_requests._API_URL}/graphql/v1"


class TestResolveUser:
    @pytest.mark.asyncio
    @mock.patch.object(api_requests, "make_request")
    async def test_resolve_operator_user_without_args(self, mock_make_request):
        mock_make_request.return_value = {"data": {"viewer": {"id": "123"}}}
        user = await api_requests.resolve_operation_user()
        mock_make_request.assert_called_with(
            api_url, None, api_requests._VIEWER_QUERY, variables={}
        )
        assert user == {"id": "123", "_request_token": None}

        # Test TTL caching
        mock_make_request.return_value = None
        user_two = await api_requests.resolve_operation_user()
        assert user_two == {"id": "123", "_request_token": None}
        mock_make_request.assert_called_once()

    @pytest.mark.asyncio
    @mock.patch.object(api_requests, "make_request")
    async def test_resolve_operator_user_with_id(self, mock_make_request):
        mock_make_request.return_value = {"data": {"user": {"id": "123"}}}
        user = await api_requests.resolve_operation_user(id="123")
        mock_make_request.assert_called_with(
            api_url,
            None,
            api_requests._USER_QUERY,
            variables={"userId": "123"},
        )
        assert user == {"id": "123", "_request_token": None}

        # Test exception is raised if user cannot be resolved when it is expected to be resolvable
        os.environ["FIFTYONE_INTERNAL_SERVICE"] = "true"
        mock_make_request.side_effect = Exception
        with pytest.raises(Exception) as e:
            await api_requests.resolve_operation_user(id="345")

        assert str(e.value) == "Failed to resolve user for the operation"

    @pytest.mark.asyncio
    @mock.patch.object(api_requests, "make_request")
    async def test_resolve_operator_user_with_dataset(self, mock_make_request):
        mock_make_request.return_value = {
            "data": {"dataset": {"viewer": {"id": "123"}}}
        }
        user = await api_requests.resolve_operation_user(dataset="123")
        mock_make_request.assert_called_with(
            api_url,
            None,
            api_requests._DATASET_VIEWER_QUERY,
            variables={"dataset": "123"},
        )
        assert user == {"id": "123", "_request_token": None}

    @pytest.mark.asyncio
    @mock.patch.object(api_requests, "make_request")
    async def test_resolve_operator_user(self, mock_make_request):
        mock_make_request.return_value = {
            "data": {"dataset": {"user": {"id": "123"}}}
        }
        user = await api_requests.resolve_operation_user(
            id="123", dataset="456"
        )
        mock_make_request.assert_called_with(
            api_url,
            None,
            api_requests._DATASET_USER_QUERY,
            variables={"userId": "123", "dataset": "456"},
        )
        assert user == {"id": "123", "_request_token": None}

        # Test with token
        mock_make_request.return_value = {
            "data": {"dataset": {"viewer": {"id": "789"}}}
        }
        user = await api_requests.resolve_operation_user(
            dataset="789", token="token"
        )
        mock_make_request.assert_called_with(
            api_url,
            "token",
            api_requests._DATASET_VIEWER_QUERY,
            variables={"dataset": "789"},
        )
        assert user == {"id": "789", "_request_token": "token"}

    @pytest.mark.asyncio
    @mock.patch.object(api_requests, "resolve_user")
    async def test_resolve_operation_user2(self, resolve_user_mock):
        dataset = "dataset"
        token = "tok"
        expected = {
            "id": "test_user",
            "email": "testuser@voxel51.com",
            "name": "TEST USER",
        }
        resolve_user_mock.return_value = expected.copy()
        expected.update({"_request_token": token})

        #####
        result = await api_requests.resolve_operation_user(
            expected["id"], dataset, token
        )
        #####

        resolve_user_mock.assert_called_once_with(
            id=expected["id"], dataset=dataset, token=token
        )
        assert result == expected


class TestResolveDatasetPermission:
    @mock.patch.object(api_requests, "_get_key_or_token")
    @mock.patch.object(api_requests.api_client, "Client")
    def test_get_dataset_permission(self, ClientMock, _get_key_or_token_mock):
        dataset = "dataset123"
        user = "user123"

        client_mock = ClientMock.return_value
        client_mock.post_graphql_request.return_value = {
            "dataset": {"user": {"activePermission": "MANAGE"}}
        }
        key, token = mock.Mock(), mock.Mock()
        _get_key_or_token_mock.return_value = key, token
        assert (
            api_requests.get_dataset_permissions_for_user(dataset, user)
            == "MANAGE"
        )
        client_mock.post_graphql_request.assert_called_with(
            api_requests._DATASET_USER_PERMISSION_QUERY,
            variables={"dataset": dataset, "userId": user},
        )
        _get_key_or_token_mock.assert_called_once()
        ClientMock.assert_called_with(
            api_requests._API_URL, key=key, token=token
        )

        # Test TTL caching
        client_mock.post_graphql_request.return_value = None
        assert (
            api_requests.get_dataset_permissions_for_user(dataset, user)
            == "MANAGE"
        )
        client_mock.post_graphql_request.assert_called_once()


class TestCreateDatasetWithPermissions:
    @mock.patch.object(api_requests, "_get_key_or_token")
    @mock.patch.object(api_requests.api_client, "Client")
    def test_get_dataset_permission(self, ClientMock, _get_key_or_token_mock):
        dataset = "dataset123"
        user = "user123"

        client_mock = ClientMock.return_value
        client_mock.post_graphql_request.return_value = {
            "createDataset": {"name": dataset}
        }
        key, token = mock.Mock(), mock.Mock()
        _get_key_or_token_mock.return_value = key, token

        #####
        assert api_requests.create_dataset_with_user_permissions(dataset, user)
        #####

        client_mock.post_graphql_request.assert_called_with(
            api_requests._CREATE_DATASET_MUTATION,
            variables={"dataset": dataset, "userId": user},
        )
        _get_key_or_token_mock.assert_called_once()
        ClientMock.assert_called_with(
            api_requests._API_URL, key=key, token=token
        )

        # Test 2
        client_mock.post_graphql_request.return_value = {"createDataset": None}

        #####
        assert not api_requests.create_dataset_with_user_permissions(
            dataset, user
        )
        #####


class TestListDatasetsForUser:
    @mock.patch.object(api_requests, "_get_key_or_token")
    @mock.patch.object(api_requests.api_client, "Client")
    def test_list_datasets_for_user_default(
        self, ClientMock, _get_key_or_token_mock
    ):
        user = "user123"

        key, token = mock.Mock(), mock.Mock()
        _get_key_or_token_mock.return_value = key, token

        client_mock = ClientMock.return_value
        client_mock.post_graphql_connectioned_request.return_value = [
            {"name": "ds1"},
            {"name": "ds2"},
        ]

        #####
        assert api_requests.list_datasets_for_user(user) == ["ds1", "ds2"]
        #####

        # assert results
        _get_key_or_token_mock.assert_called_once()
        ClientMock.assert_called_once_with(
            api_requests._API_URL, key=key, token=token
        )
        client_mock.post_graphql_connectioned_request.assert_called_once_with(
            api_requests._LIST_DATASETS_FOR_USER_QUERY,
            "user.datasetsConnection",
            variables={"userId": user},
        )

    @mock.patch.object(api_requests, "_get_key_or_token")
    @mock.patch.object(api_requests.api_client, "Client")
    def test_list_datasets_for_user_one_tag(
        self, ClientMock, _get_key_or_token_mock
    ):
        user = "user123"

        key, token = mock.Mock(), mock.Mock()
        _get_key_or_token_mock.return_value = key, token

        client_mock = ClientMock.return_value
        client_mock.post_graphql_connectioned_request.return_value = [
            {"name": "ds1", "tags": ["tag1", "tag2"]},
            {"name": "ds2", "tags": ["tag1"]},
        ]

        #####
        assert api_requests.list_datasets_for_user(user, tags="tag1") == [
            "ds1",
            "ds2",
        ]
        #####

        # assert results
        _get_key_or_token_mock.assert_called_once()
        ClientMock.assert_called_once_with(
            api_requests._API_URL, key=key, token=token
        )
        client_mock.post_graphql_connectioned_request.assert_called_once_with(
            api_requests._LIST_DATASETS_FOR_USER_QUERY,
            "user.datasetsConnection",
            variables={
                "userId": user,
                "search": {"term": "tag1", "fields": "tags"},
            },
        )

    @mock.patch.object(api_requests, "_get_key_or_token")
    @mock.patch.object(api_requests.api_client, "Client")
    def test_list_datasets_for_user_multiple_tags(
        self, ClientMock, _get_key_or_token_mock
    ):
        user = "user123"

        key, token = mock.Mock(), mock.Mock()
        _get_key_or_token_mock.return_value = key, token

        client_mock = ClientMock.return_value
        client_mock.post_graphql_connectioned_request.side_effect = [
            [
                {"name": "ds1", "tags": ["tag1"]},
                {"name": "ds2", "tags": ["tag1", "tag2"]},
                {"name": "false", "tags": ["tag11"]},
            ],
            [
                {"name": "ds2", "tags": ["tag1", "tag2"]},
                {"name": "ds3", "tags": ["tag2", "tag3"]},
            ],
        ]

        #####
        assert api_requests.list_datasets_for_user(
            user, tags=["tag1", "tag2"]
        ) == ["ds1", "ds2", "ds3"]
        #####

        # assert results
        _get_key_or_token_mock.assert_called_once()
        ClientMock.assert_called_once_with(
            api_requests._API_URL, key=key, token=token
        )
        client_mock.post_graphql_connectioned_request.assert_has_calls(
            [
                mock.call(
                    api_requests._LIST_DATASETS_FOR_USER_QUERY,
                    "user.datasetsConnection",
                    variables={
                        "userId": user,
                        "search": {"term": "tag1", "fields": "tags"},
                    },
                ),
                mock.call(
                    api_requests._LIST_DATASETS_FOR_USER_QUERY,
                    "user.datasetsConnection",
                    variables={
                        "userId": user,
                        "search": {"term": "tag2", "fields": "tags"},
                    },
                ),
            ]
        )

    @mock.patch.object(api_requests, "_get_key_or_token")
    @mock.patch.object(api_requests.api_client, "Client")
    def test_list_datasets_for_user_glob_patt(
        self, ClientMock, _get_key_or_token_mock
    ):
        user = "user123"

        key, token = mock.Mock(), mock.Mock()
        _get_key_or_token_mock.return_value = key, token

        client_mock = ClientMock.return_value
        client_mock.post_graphql_connectioned_request.return_value = [
            {"name": "fiftyone"},
            {"name": "fiftytwo"},
            {"name": "fiftyone1"},
            {"name": "zfiftyone other - 1 - 23"},
        ]

        #####
        assert api_requests.list_datasets_for_user(
            user, glob_patt="*fiftyone*1*"
        ) == [
            "fiftyone1",
            "zfiftyone other - 1 - 23",
        ]
        #####

        # assert results
        _get_key_or_token_mock.assert_called_once()
        ClientMock.assert_called_once_with(
            api_requests._API_URL, key=key, token=token
        )
        client_mock.post_graphql_connectioned_request.assert_called_once_with(
            api_requests._LIST_DATASETS_FOR_USER_QUERY,
            "user.datasetsConnection",
            variables={
                "userId": user,
                "search": {"term": "fiftyone 1", "fields": "name"},
            },
        )

    @mock.patch.object(api_requests, "_get_key_or_token")
    @mock.patch.object(api_requests.api_client, "Client")
    def test_list_datasets_for_user_complex_glob_patt(
        self, ClientMock, _get_key_or_token_mock
    ):
        user = "user123"

        key, token = mock.Mock(), mock.Mock()
        _get_key_or_token_mock.return_value = key, token

        client_mock = ClientMock.return_value
        client_mock.post_graphql_connectioned_request.return_value = [
            {"name": "ds1"},
            {"name": "ds2"},
            {"name": "dsZ"},
            {"name": " ds3"},
        ]

        #####
        assert api_requests.list_datasets_for_user(
            user, glob_patt="ds[1-9]"
        ) == ["ds1", "ds2"]
        #####

        # assert results
        _get_key_or_token_mock.assert_called_once()
        ClientMock.assert_called_once_with(
            api_requests._API_URL, key=key, token=token
        )
        client_mock.post_graphql_connectioned_request.assert_called_once_with(
            api_requests._LIST_DATASETS_FOR_USER_QUERY,
            "user.datasetsConnection",
            variables={"userId": user},
        )

    @mock.patch.object(api_requests, "_get_key_or_token")
    @mock.patch.object(api_requests.api_client, "Client")
    def test_list_datasets_for_user_tags_and_patt(
        self, ClientMock, _get_key_or_token_mock
    ):
        user = "user123"

        key, token = mock.Mock(), mock.Mock()
        _get_key_or_token_mock.return_value = key, token

        client_mock = ClientMock.return_value
        client_mock.post_graphql_connectioned_request.side_effect = [
            [
                {"name": "ds1", "tags": ["tag1"]},
                {"name": "ds2", "tags": ["tag1", "tag2"]},
            ],
            [
                {"name": "ds2", "tags": ["tag1", "tag2"]},
                {"name": "dataset", "tags": ["tag2", "tag3"]},
            ],
        ]

        #####
        assert api_requests.list_datasets_for_user(
            user, tags=["tag1", "tag2"], glob_patt="ds*"
        ) == ["ds1", "ds2"]
        #####

        # assert results
        _get_key_or_token_mock.assert_called_once()
        ClientMock.assert_called_once_with(
            api_requests._API_URL, key=key, token=token
        )
        client_mock.post_graphql_connectioned_request.assert_has_calls(
            [
                mock.call(
                    api_requests._LIST_DATASETS_FOR_USER_QUERY,
                    "user.datasetsConnection",
                    variables={
                        "userId": user,
                        "search": {"term": "tag1", "fields": "tags"},
                    },
                ),
                mock.call(
                    api_requests._LIST_DATASETS_FOR_USER_QUERY,
                    "user.datasetsConnection",
                    variables={
                        "userId": user,
                        "search": {"term": "tag2", "fields": "tags"},
                    },
                ),
            ]
        )
