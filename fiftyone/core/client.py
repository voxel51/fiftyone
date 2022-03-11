"""
Web socket client mixins.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from distutils.debug import DEBUG
import logging
from retrying import retry
from threading import Thread
import time

import requests
import sseclient

from fiftyone.core.json import FiftyOneJSONEncoder


logger = logging.getLogger(__name__)


@retry(wait_fixed=500, stop_max_delay=5000)
def _ping(url):
    requests.get(url)


class HasClient(object):

    _HC_ATTR_NAME = None
    _HC_ATTR_TYPE = None

    def __init__(self, port, address):
        self._port = port
        self._address = address or "localhost"
        self._data = None
        self._origin = f"http://{self._address}:{self._port}"
        self._listeners = {}
        self._connected = True

        fiftyone_url = f"{self._origin}/fiftyone"

        def run_client() -> None:
            def subscribe() -> None:
                response = requests.post(
                    f"{self._origin}/state",
                    stream=True,
                    headers={"Accept": "text/event-stream"},
                )
                source = sseclient.SSEClient(response)
                self._connected = True
                for message in source.events():
                    self._handle_event(message)

            while True:
                try:
                    _ping(fiftyone_url)
                    subscribe()
                except Exception as e:
                    raise e
                    logger.debug(e)

                    self._connected = False
                    print(
                        "\r\nCould not connect session, trying again "
                        "in 10 seconds\r\n"
                    )
                    time.sleep(10)

        self._thread = Thread(target=run_client, daemon=True)
        self._thread.start()

    def __getattr__(self, name):
        """Gets the data via the attribute defined by ``_HC_ATTR_NAME``."""
        if name == self._HC_ATTR_NAME:
            if not self._connected:
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

            self._data = value
            self._update_listeners()

            self._post({"state": value.serialize()})
        else:
            super().__setattr__(name, value)

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

    def _handle_event(self, event: sseclient.Event):
        # message = FiftyOneJSONEncoder.loads(event.data)
        return
        if event.event == "Update":
            config = None
            if self._data:
                message["state"]["config"] = self._data.config.serialize()
                config = self._data.config

            self._data = self._HC_ATTR_TYPE.from_dict(
                message["state"], with_config=config
            )
            self._update_listeners()

    def _post(self, data):
        requests.post(f"{self._origin}/update", json=data)
