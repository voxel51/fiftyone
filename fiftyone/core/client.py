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
from retrying import retry
from threading import Thread
import time

from bson import json_util
from tornado import gen
from tornado.ioloop import IOLoop
from tornado.websocket import websocket_connect

from fiftyone.constants import SERVER_NAME


logging.getLogger("tornado").setLevel(logging.ERROR)


# We only want one session to print notifications per namespace and per process
_printer = defaultdict(lambda: None)


@retry(wait_fixed=500, stop_max_delay=5000)
def _ping(url):
    requests.get(url)


class HasClient(object):

    _HC_NAMESPACE = None
    _HC_ATTR_NAME = None
    _HC_ATTR_TYPE = None

    def __init__(self, port):
        self._port = port
        self._data = None
        self._client = None
        self._initial_connection = True
        self._url = "ws://%s:%d/%s" % (SERVER_NAME, port, self._HC_NAMESPACE)

        async def connect():
            try:
                self._client = await websocket_connect(url=self._url)
                self._initial_connection = False
            except:
                return

            while True:
                message = await self._client.read_message()

                global _printer
                if _printer[self._url] is None:
                    _printer[self._url] = self

                if message is None and _printer[self._url] == self:
                    print("\r\nSession disconnected, trying to reconnect\r\n")
                    fiftyone_url = "http://%s:%d/fiftyone" % (
                        SERVER_NAME,
                        port,
                    )

                    self._client = None
                    while not self._client:
                        try:
                            _ping(fiftyone_url)
                            self._client = await websocket_connect(
                                url=self._url
                            )
                        except:
                            print(
                                "\r\nCould not connect session, trying again in 10 seconds\r\n"
                            )
                            time.sleep(10)

                    if message is None and _printer[self._url] == self:
                        print("\r\nSession reconnected\r\n")
                    continue

                message = json_util.loads(message)
                event = message.pop("type")
                if event == "update":
                    self._data = self._HC_ATTR_TYPE.from_dict(message["state"])
                if event == "notification":
                    self.on_notification(message)
                if event == "capture":
                    self.on_capture(message)
                if event == "reactivate":
                    self.on_reactivate(message)

        def run_client():
            io_loop = IOLoop(make_current=True)
            io_loop.run_sync(connect)

        self._thread = Thread(target=run_client, daemon=True)
        self._thread.start()

    def on_notification(self, data):
        global _printer
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

    def _capture(self, data):
        raise NotImplementedError("subclasses must implement capture()")

    def on_capture(self, data):
        self._capture(data)

    def _capture(self, data):
        raise NotImplementedError("subclasses must implement reactivate()")

    def on_reactivate(self, data):
        self._reactivate(data)

    def __del__(self):
        _printer[self._url] = None

    def __getattr__(self, name):
        """Gets the data via the attribute defined by ``_HC_ATTR_NAME``."""
        if name == self._HC_ATTR_NAME:
            if self._client is None and not self._initial_connection:
                raise RuntimeError("Session is not connected")
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
            if self._client is None and not self._initial_connection:
                raise RuntimeError("Session is not connected")
            while self._data is None:
                time.sleep(0.2)
            self._data = value
            self._client.write_message(
                json_util.dumps({"type": "update", "state": value.serialize()})
            )
        else:
            super().__setattr__(name, value)
