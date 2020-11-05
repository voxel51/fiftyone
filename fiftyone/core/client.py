"""
Web socket client mixins.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
from collections import defaultdict
import logging
from threading import Thread

from bson import json_util
from tornado import gen
from tornado.ioloop import IOLoop
from tornado.websocket import websocket_connect

from fiftyone.constants import SERVER_NAME


# We only want one session to print notifications per namespace and per process
_printer = defaultdict(lambda: None)


class HasClient(object):

    _HC_NAMESPACE = None
    _HC_ATTR_NAME = None
    _HC_ATTR_TYPE = None

    def __init__(self, port):
        self._port = port
        self._data = None
        self._client = None
        self._url = "ws://%s:%d/%s" % (SERVER_NAME, port, self._HC_NAMESPACE)

        async def connect():
            self._client = await websocket_connect(url=self._url)

            while True:
                message = await self._client.read_message()

                if message is None:
                    # None message means the connection was closed
                    break

                message = json_util.loads(message)
                if message["type"] == "update":
                    self._data = self._HC_ATTR_TYPE.from_dict(message["data"])

        def run_client():
            io_loop = IOLoop(make_current=True)
            io_loop.run_sync(connect)

        thread = Thread(target=run_client, daemon=True)
        thread.start()

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
                json_util.dumps({"type": "update", "data": value.serialize()})
            )
        else:
            super().__setattr__(name, value)
