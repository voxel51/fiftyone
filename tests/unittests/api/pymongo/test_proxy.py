""" Tests for pymongo proxy classes."""
from unittest import mock

import pytest

from fiftyone.api.pymongo.proxy import PymongoWebsocketProxy


class TestProxy(PymongoWebsocketProxy):
    def __proxy_api_client__(self):
        return None

    def __proxy_api_context__(self):
        return None


@pytest.fixture
def mock_socket_connect():
    with mock.patch(
        "fiftyone.api.socket.Socket"
    ) as mock_socket, mock.patch.object(
        PymongoWebsocketProxy, "__proxy_socket_connect__"
    ) as mock_connect:
        mock_socket_instance = mock.Mock()
        mock_socket.return_value = mock_socket_instance

        yield {
            "socket_instance": mock_socket_instance,
            "connect": mock_connect,
        }


@pytest.mark.parametrize("override_batching", [True, False])
def test_init_with_override_batching(mock_socket_connect, override_batching):
    # pylint: disable=no-member
    import fiftyone as fo

    with (
        mock.patch.object(fo.config, "default_batcher", "static"),
        mock.patch.object(fo.config, "batcher_static_size", 100000),
        mock.patch.object(
            fo.config, "override_api_dynamic_batching", override_batching
        ),
    ):
        proxy = TestProxy()
        if override_batching:
            assert (
                proxy._PymongoWebsocketProxy__dynamic_batcher.__class__.__name__
                == "StaticBatcher"
            )
            assert (
                proxy._PymongoWebsocketProxy__dynamic_batcher.batch_size
                == 100000
            )
        else:
            assert (
                proxy._PymongoWebsocketProxy__dynamic_batcher.__class__.__name__
                == "ContentSizeDynamicBatcher"
            )
            assert (
                proxy._PymongoWebsocketProxy__dynamic_batcher.init_batch_size
                == 100
            )
            assert (
                proxy._PymongoWebsocketProxy__dynamic_batcher.max_batch_beta
                == 128.0
            )
        assert proxy._PymongoWebsocketProxy__next_batch == []
        assert proxy._PymongoWebsocketProxy__use_next_batching is True
        mock_socket_connect["connect"].assert_called_once()
