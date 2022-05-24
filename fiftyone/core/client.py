"""
Web socket client mixins.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio  # pylint: disable=unused-import
from collections import defaultdict
import logging
import requests
from retrying import retry
from threading import Thread
import time

from bson import json_util
from tornado.ioloop import IOLoop
from tornado.websocket import websocket_connect


logging.getLogger("tornado").setLevel(logging.ERROR)


# We want one session to lead per namespace and per process
_leader = defaultdict(lambda: None)


@retry(wait_fixed=500, stop_max_delay=5000)
def _ping(url):
    requests.get(url)


class HasClient(object):

    _HC_NAMESPACE = None
    _HC_ATTR_NAME = None
    _HC_ATTR_TYPE = None

    def __init__(self, port, address):
        self._port = port
        self._address = address or "localhost"
        self._data = None
        self._client = None
        self._initial_connection = True
        self._url = "ws://%s:%d/%s" % (
            self._address,
            self._port,
            self._HC_NAMESPACE,
        )
        self._listeners = {}

        async def connect():
            try:
                self._client = await websocket_connect(url=self._url)
                self._initial_connection = False
            except:
                return

            while True:
                message = await self._client.read_message()

                global _leader
                if _leader[self._url] is None:
                    _leader[self._url] = self

                if message is None and _leader[self._url] == self:
                    print("\r\nSession disconnected, trying to reconnect\r\n")
                    fiftyone_url = "http://%s:%d/fiftyone" % (
                        self._address,
                        self._port,
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
                                "\r\nCould not connect session, trying again "
                                "in 10 seconds\r\n"
                            )
                            time.sleep(10)

                    if message is None and _leader[self._url] == self:
                        print("\r\nSession reconnected\r\n")

                    continue

                message = json_util.loads(message)
                event = message.pop("type")

                if event == "update":
                    config = None
                    if self._data:
                        message["state"][
                            "config"
                        ] = self._data.config.serialize()
                        config = self._data.config

                    self._data = self._HC_ATTR_TYPE.from_dict(
                        message["state"], with_config=config
                    )
                    self._update_listeners()

                if event == "notification":
                    self.on_notification(message)

                if event == "capture":
                    self.on_capture(message)

                if event == "reactivate":
                    self.on_reactivate(message)

                if event == "reload":
                    self.on_reload()

                if event == "close":
                    self.on_close()

        def run_client():
            io_loop = IOLoop(make_current=True)
            io_loop.run_sync(connect)

        self._thread = Thread(target=run_client, daemon=True)
        self._thread.start()

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
            self._update_listeners()

            self._client.write_message(
                json_util.dumps({"type": "update", "state": value.serialize()})
            )
        else:
            super().__setattr__(name, value)

    def __del__(self):
        _leader[self._url] = None

    def on_capture(self, data):
        self._capture(data)

    def _capture(self, data):
        raise NotImplementedError("subclasses must implement _capture()")

    def on_close(self):
        self._close()

    def _close(self):
        raise NotImplementedError("subclasses must implement _close()")

    def on_reactivate(self, data):
        self._reactivate(data)

    def _reactivate(self, data):
        raise NotImplementedError("subclasses must implement _reactivate()")

    def on_reload(self):
        if not _is_leader(self):
            return

        self._reload()

    def _reload(self):
        raise NotImplementedError("subclasses must implement _reload()")

    @property
    def has_listeners(self):
        return bool(self._listeners)

    def has_listener(self, key):
        return key in self._listeners

    def get_listeners(self):
        return self._listeners

    def add_listener(self, key, callback):
        self._listeners[key] = callback

    def delete_listener(self, key):
        self._listeners.pop(key, None)

    def delete_listeners(self):
        self._listeners = {}

    def _update_listeners(self):
        for callback in self._listeners.values():
            callback(self)


def _is_leader(client):
    global _leader
    if _leader[client._url] is None:
        _leader[client._url] = client

    return _leader[client._url] == client
