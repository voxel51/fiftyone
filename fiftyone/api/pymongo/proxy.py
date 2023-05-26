"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
from typing import Any, Iterable, Mapping, Optional, Tuple, Union

from fiftyone.api import client, utils

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
        self.__proxy_api_socket = self.__proxy_api_client__.socket(
            "_pymongo/stream"
        )

        # Initialize remote PyMongo target with current context
        marshalled_ctx = utils.marshall(self.__proxy_api_context__)

        self.__proxy_api_socket.send(marshalled_ctx)

    def __proxy_it__(
        self,
        name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        """Send a marshalled message through a Teams API socket."""

        # Build and marshall the payload so any python objects can be
        # transported over the socket. They will be unmarshalled on server.
        marshalled_payload = utils.marshall((name, args, kwargs))

        # Send marshalled request message
        self.__proxy_api_socket.send(marshalled_payload)

        # Get marshalled response message from the server.
        try:
            marshalled_response = next(self.__proxy_api_socket)
            return self.__proxy_api_handle_reponse__(marshalled_response)
        except StopIteration as err:
            # Explicity re-raising here so that it's known this happens
            raise err

    # pylint: disable-next=missing-function-docstring
    def close(self) -> None:
        if self.__proxy_api_socket is not None:
            self.__proxy_api_socket.close()

    # pylint: disable-next=missing-function-docstring
    def next(self) -> Any:
        try:
            return self.__proxy_it__("next")
        except StopIteration as err:
            # Explicity re-raising here so that it's known this happens
            raise err
