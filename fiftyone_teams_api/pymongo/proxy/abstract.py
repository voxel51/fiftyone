"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
import codecs
import inspect
from typing import Any, Iterable, List, Mapping, Optional, Tuple, Union, Type

import dill as pickle

from fiftyone_teams_api import client


TeamsContext = List[
    Tuple[str, Optional[Iterable[Any]], Optional[Mapping[str, Any]]]
]


class AbstractPymongoProxy(abc.ABC):
    """Abstract class for proxying to remote Pymongo"""

    @abc.abstractmethod
    def teams_api_execute_proxy(
        self,
        attr_name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        """This is the method to execute a method on the request payload in
        Teams API format.
        """

    @property
    @abc.abstractmethod
    def teams_api_client(self) -> client.Client:
        """Client for connecting to Teams API."""

    @property
    @abc.abstractmethod
    def teams_api_ctx(self) -> TeamsContext:
        """A series or method names, args, and kwargs to be applied to each
        prior result starting with MongoClient."""

    @staticmethod
    def _marshall(value: Any) -> str:
        """Marshalls python object into string."""
        return codecs.encode(pickle.dumps(value), "base64").decode()

    @staticmethod
    def _unmarshall(value: Union[str, bytes]) -> Any:
        """Unmarshalls string into python object."""
        if isinstance(value, str):
            value = value.encode()

        return pickle.loads(codecs.decode(value, "base64"))

    def _handle_reponse(self, marshalled_response: Union[str, bytes]) -> Any:
        # Unmarshall server response into python objects.
        response = self._unmarshall(marshalled_response)

        # If the response is an exception, the server purposefully
        # forwarded it as such and the error should be raised.
        if isinstance(response, Exception):
            raise response

        # If the response is the following, the server purposefully
        # forwarded it as such and `self`` should be returned.
        if response == "___pymongoself___":
            return self

        return response


class PymongoProxyMeta(abc.ABCMeta):
    @classmethod
    def __prepare__(mcs, __name: str, __bases: Tuple[Type, ...], **kwds: Any):
        return super().__prepare__(__name, __bases, **kwds)

    def __new__(
        mcs,
        name: Any,
        bases: Any,
        namespace: Any,
        pymongo_cls: Optional[Any] = None,
        **kwargs: Any
    ):
        # Create new class.
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)

        # Concrete implementation inheriting from AbstractPymongoProxy.
        if not inspect.isabstract(cls) and issubclass(
            cls, AbstractPymongoProxy
        ):
            if not pymongo_cls:
                raise ValueError("'pymongo_cls' is required.")

            # Get the public members defined on the class.
            implemented = {
                n for n, _ in inspect.getmembers(cls) if not n.startswith("_")
            }

            # Get the members defined on the Pymongo base class.
            for member_name, member in inspect.getmembers(pymongo_cls):
                # Ignore protected or manually overriden members on the class
                if member_name.startswith("_") or member_name in implemented:
                    continue

                # Dynamically add proxy to remote on member
                if inspect.isfunction(member):
                    setattr(
                        cls, member_name, execute_instance_method(member_name)
                    )
                else:
                    setattr(
                        cls,
                        member_name,
                        property(get_instance_attribute(member_name)),
                    )

            # Explcitly add `pymongo_cls` to base, to pass `isinstance` checks.
            cls.__bases__ = (*bases, pymongo_cls)

        return cls


def get_instance_attribute(attr_name: str) -> Any:
    def inner(inst: AbstractPymongoProxy):
        return inst.teams_api_execute_proxy(attr_name)

    return inner


def execute_instance_method(
    method_name: str, *_, is_async: bool = False
) -> Any:
    if is_async:

        async def ainner(
            inst: AbstractPymongoProxy, *args: Any, **kwargs: Any
        ):
            return inst.teams_api_execute_proxy(method_name, args, kwargs)

        return ainner

    def inner(inst: AbstractPymongoProxy, *args: Any, **kwargs: Any):
        return inst.teams_api_execute_proxy(method_name, args, kwargs)

    return inner


class AbstractPymongoRestProxy(AbstractPymongoProxy, abc.ABC):
    """Abstract class for proxying API requests using request -> response"""

    def teams_api_execute_proxy(
        self,
        attr_name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        # Build payload
        payload = (self.teams_api_ctx, (attr_name, args, kwargs))

        # Marshall the payload so any python objects can be transported over
        # HTTP. They will be unmarshalled on server.
        marshalled_payload = self._marshall(payload)

        # Get marshalled response from the server.
        marshalled_response = self.teams_api_client.post(
            "_pymongo", payload=marshalled_payload
        )

        return self._handle_reponse(marshalled_response)


class AbstractPymongoWebsocketProxy(AbstractPymongoProxy, abc.ABC):
    """Abstract class for proxying API requests using streaming"""

    # pylint: disable=missing-function-docstring

    def __init__(
        self,
        method_name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
    ):
        self._args, self._kwargs = args or tuple(), kwargs or {}

        # Initialize FityOne Teams API client websocket
        self.teams_api_socket = self.teams_api_client.socket("_pymongo/stream")

        # Initialize remote PyMongo target with method name, args, and kwargs
        ctx = [*self.teams_api_ctx, (method_name, self._args, self._kwargs)]

        marshalled_ctx = self._marshall(ctx)

        self.teams_api_socket.send(marshalled_ctx)

    def close(self) -> None:
        self.teams_api_socket.close()

    def next(self) -> Any:
        # Receive response message from FityOne Teams API client websocket
        try:
            return self.teams_api_execute_proxy("next")
        except StopIteration as err:
            # Explicity re-raising here so that it's known this happens
            raise err

    def teams_api_execute_proxy(
        self,
        attr_name: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        # Build and marshall the payload so any python objects can be
        # transported over the socket. They will be unmarshalled on server.
        marshalled_payload = self._marshall((attr_name, args, kwargs))

        # Send marshalled request message
        self.teams_api_socket.send(marshalled_payload)

        # Get marshalled response message from the server.
        try:
            marshalled_response = next(self.teams_api_socket)
            return self._handle_reponse(marshalled_response)
        except StopIteration as err:
            # Explicity re-raising here so that it's known this happens
            raise err
