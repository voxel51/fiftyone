"""
Session Server-sent events client

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
from enum import Enum
import logging
from retrying import retry
from threading import Thread
import time
import typing as t

import requests
import sseclient

from fiftyone.core.json import FiftyOneJSONEncoder
import fiftyone.core.state as fos


logger = logging.getLogger(__name__)


@retry(wait_fixed=500, stop_max_delay=5000)
def _ping(url: str) -> None:
    requests.get(url)


class Events(Enum):
    pass


@dataclass(frozen=True)
class Client:
    address: str
    port: int
    event_handler: t.Callable[[str, dict], None]

    def __post_init__(self) -> None:
        self._state: t.Optional[fos.StateDescription] = None
        self._listeners: t.Dict[str, t.Callable] = {}

        def run_client() -> None:
            def subscribe() -> None:
                response = requests.post(
                    f"{self.origin}/state",
                    stream=True,
                    headers={"Accept": "text/event-stream"},
                )
                source = sseclient.SSEClient(response)
                for message in source.events():
                    self._handle_event(message)

            while True:
                try:
                    _ping(f"{self.origin}/fiftyone")
                    subscribe()
                except Exception:
                    print(
                        "\r\nCould not connect session, trying again "
                        "in 10 seconds\r\n"
                    )
                    time.sleep(10)

        self._thread = Thread(target=run_client, daemon=True)
        self._thread.start()

    @property
    def has_listeners(self) -> bool:
        return bool(self._listeners)

    @property
    def origin(self) -> str:
        return f"http://{self.address}:{self.port}"

    @property
    def state(self) -> t.Optional[fos.StateDescription]:
        return self._state

    @state.setter
    def state(self, state: fos.StateDescription) -> None:
        self._state = state
        self._update_listeners()

        _post(self.origin, {"state": state})

    def has_listener(self, key: str) -> bool:
        return key in self._listeners

    def get_listeners(self) -> t.Dict[str, t.Callable]:
        return self._listeners

    def add_listener(self, key: str, callback: t.Callable) -> None:
        self._listeners[key] = callback

    def delete_listener(self, key: str) -> None:
        self._listeners.pop(key, None)

    def delete_listeners(self) -> None:
        self._listeners = {}

    def _update_listeners(self) -> None:
        for callback in self._listeners.values():
            callback(self)

    def _handle_event(self, event: sseclient.Event) -> None:
        message = FiftyOneJSONEncoder.loads(event.data)

        if event.event == "Update":
            config = None
            if self._state:
                message["state"]["config"] = self._state.config.serialize()
                config = self._state.config

            self._state = self._state.from_dict(
                message["state"], with_config=config
            )
            self._update_listeners()


def _post(origin: str, data: dict) -> None:
    requests.post(f"{origin}/update", data=FiftyOneJSONEncoder.dumps(data))
