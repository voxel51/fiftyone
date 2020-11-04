"""
Web socket client mixins.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import logging

from tornado.websocket import websocket_connect

from fiftyone.constants import SERVER_IP


# We only want one session to print notifications per namespace and per process
_printer = defaultdict(lambda: None)


class HasClient(object):

    _HC_NAMESPACE = None
    _HC_ATTR_NAME = None
    _HC_ATTR_TYPE = None

    async def __init__(self, port):
        self._port = port
        self._data = None
        self._client = await websocket_connect(
            "ws://%s:%d/%s" % (SERVER_IP, port, self._HC_NAMESPACE),
            on_message_callback=lambda message: setattr(
                self, "_data", self._HC_ATTR_TYPE.from_dict(message["data"])
            ),
        )

    def __getattr__(self, name):
        """Gets the data via the attribute defined by ``_HC_ATTR_NAME``."""
        if name == self._HC_ATTR_NAME:
            return self._data

        return None

    def __setattr__(self, name, value):
        """Sets the data to the attribute defined by ``_HC_ATTR_NAME``."""
        if name == self._HC_ATTR_NAME:
            if self._HC_ATTR_TYPE is not None and not isinstance(
                value, self._HC_ATTR_TYPE
            ):
                raise ValueError(
                    "Client expected type %s, but got type %s"
                    % (self._HC_ATTR_TYPE, type(value))
                )
            self._data = value
            self._client.write_message(
                {"type": "update", "data": value.serialize()}
            )
        else:
            super().__setattr__(name, value)
