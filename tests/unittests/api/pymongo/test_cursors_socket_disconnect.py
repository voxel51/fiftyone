"""Test pymongo proxy cursor socket disconnect"""

import copy
import functools
import itertools
from typing import Any, List
from unittest import mock

import pytest

import fiftyone.api.motor
import fiftyone.api.pymongo
import fiftyone.api.pymongo.command_cursor
import fiftyone.api.pymongo.cursor
from fiftyone.api import client, socket, utils


@pytest.fixture(name="api_client", autouse=True)
def fixture_api_client():
    """Mocked API client"""
    with mock.patch.object(client, "Client") as m:
        yield m.return_value


@pytest.fixture(name="mongo_client")
def fixture_mongo_client(request):
    """MongoClient or AsyncIOMotorClient"""

    if request.param == "pymongo":
        cls = fiftyone.api.pymongo.MongoClient
    elif request.param == "motor":
        cls = fiftyone.api.motor.AsyncIOMotorClient
    else:
        raise ValueError

    return cls(__teams_api_uri=mock.Mock(), __teams_api_key=mock.Mock())


@pytest.fixture(name="mongo_cursor_getter")
def fixture_mongo_cursor(request, mongo_client):
    """Cursor or CommandCursor"""

    collection = mongo_client.get_database("test-db").get_collection(
        "test-coll"
    )
    match = {"color": "yellow"}
    if request.param == "cursor":
        return functools.partial(collection.find, match)
    elif request.param == "command_cursor":
        return functools.partial(collection.aggregate, [{"$match": match}])

    raise ValueError


@pytest.mark.parametrize(
    "mongo_cursor_getter",
    [
        pytest.param("cursor"),
        pytest.param("command_cursor"),
    ],
    indirect=True,
)
@pytest.mark.parametrize(
    "mongo_client",
    [pytest.param("pymongo"), pytest.param("motor")],
    indirect=True,
)
class TestSocketDisconnect:
    """Test socket disconnect cases"""

    @pytest.fixture(name="raw_data")
    def fixture_raw_data(self):
        "Raw data"
        return list(range(1, 26))

    @staticmethod
    def create_mock_socket(next_return_values: List[Any]) -> mock.Mock:
        """Create a mock Socket"""
        m = mock.Mock(spec=socket.Socket)
        m.send = mock.Mock()
        m.__next__ = mock.Mock(
            side_effect=[utils.marshall(value) for value in next_return_values]
        )
        return m

    @pytest.mark.asyncio
    async def test_auto_reconnect(
        self, mongo_cursor_getter, api_client, raw_data
    ):
        """Test automatic reconnection and all data is retrieved"""
        # Set up underlying sockets
        raw_data_it = iter(raw_data)
        batches = []
        while batch := list(itertools.islice(raw_data_it, 5)):
            batches.append(batch)

        batches_first_half, batches_second_half = (
            batches[: (batch_middle := len(batches) // 2)],
            batches[batch_middle:],
        )

        failing_socket = self.create_mock_socket(
            [
                *batches_first_half,
                socket.SocketDisconnectException("something went wrong"),
            ]
        )
        follow_through_socket = self.create_mock_socket(batches_second_half)
        api_client.socket.side_effect = [failing_socket, follow_through_socket]

        # Get cursor
        cursor = mongo_cursor_getter()

        api_context = copy.deepcopy(cursor.__proxy_api_context__)

        # Context doesn't have skip
        if isinstance(
            cursor, fiftyone.api.pymongo.command_cursor.AbstractCommandCursor
        ):
            assert all(
                key != "$skip" for key in api_context[-1][2]["pipeline"][-1]
            )
        else:
            assert api_context[-1][2]["skip"] == 0

        # Connected with context
        failing_socket.send.assert_called_with(utils.marshall(api_context))

        #####
        if isinstance(
            cursor,
            (
                fiftyone.api.motor.AsyncIOMotorCursor,
                fiftyone.api.motor.AsyncIOMotorCommandCursor,
            ),
        ):
            values = [value async for value in cursor]
        else:
            values = [value for value in cursor]
        #####

        assert values == raw_data

        # Connected to initial socket and reconnected to new socket on error.
        assert api_client.socket.call_count == 2

        # Initial context + successful calls to "_next_batch" + error call to
        # "_next_batch"
        failing_socket.send.call_count = 2 + len(batches_first_half)

        # Expected number of items that were processed by original socket.
        skip = sum(len(batch) for batch in batches_first_half)

        # Reconnected with original context + skip stage
        if isinstance(
            cursor,
            fiftyone.api.pymongo.command_cursor.AbstractCommandCursor,
        ):
            api_context[-1][2]["pipeline"].append({"$skip": skip})
        else:
            api_context[-1][2]["skip"] = skip

        assert follow_through_socket.send.mock_calls[0] == mock.call(
            utils.marshall(api_context)
        )

        # Initial context + successful calls to "_next_batch"
        failing_socket.send.call_count = 1 + len(batches_second_half)
