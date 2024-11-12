"""
FiftyOne server cache tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from cachetools import TLRUCache
from unittest import TestCase
from unittest.mock import call, MagicMock

from fiftyone.server.cache import create_tlru_cache


ONE = call("one")
TWO = call("two")
CALLS = [ONE, TWO]


class ServerMetadataTests(TestCase):
    def test_server_cache(self):
        mock_callable = MagicMock()
        mock_timer = MagicMock()
        mock_ttu = MagicMock()

        mock_timer.return_value = 0
        mock_ttu.return_value = 1
        cache = create_tlru_cache(
            mock_callable, TLRUCache(2, mock_ttu, mock_timer)
        )

        cache("one")
        cache("two")

        mock_callable.assert_has_calls(CALLS)

        cache("one")
        mock_callable.assert_has_calls(CALLS)

        mock_timer.return_value = 1
        cache("one")
        mock_callable.assert_has_calls(CALLS + [call("one")])

        cache("two")
        mock_callable.assert_has_calls(CALLS * 2)
