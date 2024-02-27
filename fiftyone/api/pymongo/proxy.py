"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
from typing import Any, Iterable, Mapping, Optional, Tuple, Union

from fiftyone.api import client, socket, utils
from fiftyone.core import utils as fo_utils

ProxyAPIClient = client.Client
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
    ):
        """Send a marshalled REST request to the Teams API."""

        # Build payload
        payload = (self.__proxy_api_context__, (name, args, kwargs))

        # Marshall the payload so any python objects can be transported over
        # HTTP. They will be unmarshalled on server.
        marshalled_payload = utils.marshall(payload)

        # Get marshalled response from the server.
        marshalled_response = self.__proxy_api_client__.post(
            "_pymongo", payload=marshalled_payload, stream=True
        )

        return self.__proxy_api_handle_reponse__(marshalled_response)

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

    def __proxy_api_handle_reponse__(
        self, marshalled_response: Union[str, bytes]
    ) -> Any:
        """Handle a marshalled respoinse from the Teams API."""

        # Unmarshall server response into python objects.
        response = utils.unmarshall(marshalled_response)

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
        self.__dynamic_batcher = fo_utils.ContentSizeDynamicBatcher(
            None, init_batch_size=100, max_batch_beta=128.0
        )

    def __proxy_it__(
        self,
        name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        """Send a marshalled message through a Teams API socket."""

        # Build and marshall the payload so any python objects can be
        # transported over the socket. They will be unmarshalled on server.
        while True:
            try:
                # Send marshalled request message
                marshalled_payload = utils.marshall((name, args, kwargs))
                self.__proxy_api_socket.send(marshalled_payload)

                # Get marshalled response message from the server.
                marshalled_response = next(self.__proxy_api_socket)
                return self.__proxy_api_handle_reponse__(marshalled_response)
            except socket.SocketDisconnectException as err:
                self.__proxy_socket_connect__()

                # Older version of the API didn't include AttributeErrors as
                # execution errors and instead caused a hard error and
                # disconnect. On the special case of `__next_batch`, cast to
                # AttributeError to match the newer API behavior.
                if name == "__next_batch":
                    raise AttributeError(
                        f"'{self.__class__.__name__}' object has no attribute "
                        "'__next_batch'"
                    ) from err

    # pylint: disable-next=missing-function-docstring
    def close(self) -> None:
        if self.__proxy_api_socket is not None:
            self.__proxy_api_socket.close()

    def __proxy_socket_connect__(self):
        # Initialize FityOne Teams API client websocket
        self.__proxy_api_socket = self.__proxy_api_client__.socket(
            "_pymongo/stream"
        )

        # Initialize remote PyMongo target with current context
        marshalled_ctx = utils.marshall(self.__proxy_api_context__)

        self.__proxy_api_socket.send(marshalled_ctx)

    # pylint: disable-next=missing-function-docstring
    def next(self) -> Any:
        # Batching is disabled, get 'next' from server.
        if not self.__use_next_batching:
            return self.__proxy_it__("next")

        # Batch is unset of empty, attempt to get batch from server. If the
        # result is falsey iterating is done.
        if not self.__next_batch:
            try:
                batch_size = next(self.__dynamic_batcher)
                self.__next_batch = self.__proxy_it__(
                    "__next_batch", kwargs={"batch_size": batch_size}
                )

                if not self.__next_batch:
                    raise StopIteration

                self.__dynamic_batcher.apply_backpressure(self.__next_batch)

            except AttributeError as err:
                # Older versions do not have the API `__next_batch` method.
                # When this happens disable batching and get `next` from the
                # server instead.
                if "object has no attribute '__next_batch'" in str(err):
                    self.__use_next_batching = False
                    return self.__proxy_it__("next")

        # Get 'next' from batch.
        return self.__next_batch.pop(0)
