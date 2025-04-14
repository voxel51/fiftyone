"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from typing import Any, Iterable, Mapping, Optional, Tuple

import fiftyone as fo
from fiftyone.api import client, socket, utils
from fiftyone.core import utils as fo_utils

ProxyAPIClient = client.PymongoClient
ProxyAPIContext = Iterable[
    Tuple[str, Optional[Iterable[Any]], Optional[Mapping[str, Any]]]
]


class PymongoProxyMeta(utils.ProxyMeta):
    """Metaclass for wrapping Pymongo public methods with proxy"""


class PymongoRestProxy(utils.IProxy, abc.ABC, metaclass=PymongoProxyMeta):
    """Proxy Pymongo instance methods through a Teams API REST endpoint."""

    def __init__(self, *args: Any, **kwargs: Any):
        self._proxy_init_args = args or []
        self._proxy_init_kwargs = kwargs or {}

    def __proxy_it__(
        self,
        name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
        is_idempotent: bool = True,
    ):
        """Send a REST request to the Teams API."""

        payload = (self.__proxy_api_context__, (name, args, kwargs))

        response = self.__proxy_api_client__.post(
            "_pymongo",
            payload=payload,
            stream=True,
            is_idempotent=is_idempotent,
        )

        return self.__proxy_api_handle_response__(response)

    @property
    @abc.abstractmethod
    def __proxy_api_client__(self) -> ProxyAPIClient:
        """Client for connecting to Teams API."""

    @property
    @abc.abstractmethod
    def __proxy_api_context__(self) -> ProxyAPIContext:
        """A series of method names, args, and kwargs to be applied
        sequentially starting with MongoClient to be passed to the Teams API,
        in which a context can be derived.
        """

    def __proxy_api_handle_response__(self, response: Any) -> Any:
        """Handle a response from the Teams API."""

        # If the response is an exception, the server purposefully
        # forwarded it as such and the error should be raised.
        if isinstance(response, Exception):
            raise response

        # If the response is the following, the server purposefully
        # forwarded it as such and `self`` should be returned.
        if response == "___pymongoself___":
            return self

        return response


class PymongoWebsocketProxy(PymongoRestProxy, abc.ABC):
    """Proxy Pymongo instance methods through a Teams API Websocket."""

    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, **kwargs)

        # Initialize FityOne Teams API client websocket
        self.__proxy_api_socket: socket.Socket = None
        self.__proxy_socket_connect__()

        self.__next_batch = []
        self.__use_next_batching = True

        if fo.config.override_api_dynamic_batching:
            # Use the same batcher configured for the sdk.
            # In some cases, particularly when the items within each batch are not large,
            # configuring a static batcher with a large batch size may
            # be more efficient than using a dynamic batcher.
            self.__dynamic_batcher = fo_utils.get_default_batcher(None)
        else:
            # Use a dynamic batcher to determine the batch size based on the
            # content size of the data being sent over the socket.
            self.__dynamic_batcher = fo_utils.ContentSizeDynamicBatcher(
                None, init_batch_size=100, max_batch_beta=128.0
            )

    def __proxy_it__(
        self,
        name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
        get_size: bool = False,
    ) -> Any:
        """Send a message through a Teams API socket."""

        while True:
            try:
                self.__proxy_api_socket.send((name, args, kwargs))
                result = next(self.__proxy_api_socket)
                return (
                    (
                        result[0],
                        self.__proxy_api_handle_response__(result[1]),
                    )
                    if get_size
                    else self.__proxy_api_handle_response__(result[1])
                )
            except socket.SocketDisconnectException:
                self.__proxy_socket_connect__()

    # pylint: disable-next=missing-function-docstring
    def close(self) -> None:
        if self.__proxy_api_socket is not None:
            self.__proxy_api_socket.close()

    def __proxy_socket_connect__(self):
        # Initialize FityOne Teams API client websocket
        self.__proxy_api_socket = self.__proxy_api_client__.socket(
            "_pymongo/stream"
        )

        self.__proxy_api_socket.send(self.__proxy_api_context__)

    # pylint: disable-next=missing-function-docstring
    def next(self) -> Any:
        # Batching is disabled, get 'next' from server.
        if not self.__use_next_batching:
            return self.__proxy_it__("next")

        # Batch is unset if empty, attempt to get batch from server. If the
        # result is falsey iterating is done.
        if not self.__next_batch:
            try:
                batch_size = next(self.__dynamic_batcher)
                next_batch_size, self.__next_batch = self.__proxy_it__(
                    "__next_batch",
                    kwargs={"batch_size": batch_size},
                    get_size=True,
                )

                if not self.__next_batch:
                    raise StopIteration

                self.__dynamic_batcher.apply_backpressure(next_batch_size)

            except AttributeError as err:
                # Older versions do not have the API `__next_batch` method.
                # When this happens disable batching and get `next` from the
                # server instead.
                if "object has no attribute '__next_batch'" in str(err):
                    self.__use_next_batching = False
                    return self.__proxy_it__("next")

        # Get 'next' from batch.
        return self.__next_batch.pop(0)
