"""
Web socket client mixins.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
from collections import defaultdict
import logging
import requests
from threading import Thread
import time

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
                    self._data = None
                    response = None
                    fiftyone_url = "http://%s:%d/fiftyone" % (
                        SERVER_NAME,
                        port,
                    )

                    while response is None:
                        time.sleep(0.2)
                        try:
                            response = requests.get(fiftyone_url)
                        except:
                            pass

                    self._client = await websocket_connect(url=self._url)
                    continue

                message = json_util.loads(message)
                event = message.pop("type")
                if event == "update":
                    self._data = self._HC_ATTR_TYPE.from_dict(message["state"])
                if event == "notification":
                    self.on_notification(message)

        def run_client():
            io_loop = IOLoop(make_current=True)
            io_loop.run_sync(connect)

        self._thread = Thread(target=run_client, daemon=True)
        self._thread.start()

    def on_notification(self, data):
        if _printer[self._url] is None:
            _printer[self._url] = self

        if _printer[self._url] != self:
            return

        print(data["kind"])
        print()
        print(data["message"])
        print()
        for value in data["session_items"]:
            print(value)

    def __del__(self):
        _printer[self._url] = None
        self._thread.join()

    def __getattr__(self, name):
        """Gets the data via the attribute defined by ``_HC_ATTR_NAME``."""
        if name == self._HC_ATTR_NAME:
            while self._data is None:
                time.sleep(0.2)
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
            while self._data is None:
                time.sleep(0.2)
            self._data = value
            self._client.write_message(
                json_util.dumps({"type": "update", "state": value.serialize()})
            )
        else:
            super().__setattr__(name, value)
