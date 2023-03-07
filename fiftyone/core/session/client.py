"""
Session server-sent events client.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from dataclasses import asdict, dataclass
import logging
from retrying import retry
from threading import Thread
import time
import typing as t

import requests
import sseclient
from uuid import uuid4

import fiftyone.constants as foc
import fiftyone.core.state as fos

from fiftyone.core.json import stringify
from fiftyone.core.session.events import (
    Event,
    EventType,
    ListenPayload,
    dict_factory,
)


logger = logging.getLogger(__name__)


@retry(wait_fixed=500, stop_max_delay=10000)
def _ping(url: str) -> None:
    requests.get(url)


@dataclass
class Client:
    address: str
    auto: bool
    desktop: bool
    port: int
    remote: bool
    start_time: float

    def __post_init__(self) -> None:
        self._subscription = str(uuid4())
        self._connected = True
        self._listeners: t.Dict[str, t.Set[t.Callable]] = defaultdict(set)

    def run(self, state: fos.StateDescription) -> None:
        """Runs the client subscription in a background thread

        Arg:
            state: the initial state description
        """
        if hasattr(self, "_thread"):
            raise RuntimeError("Client is already running")

        def run_client() -> None:
            def subscribe() -> None:
                response = requests.post(
                    f"{self.origin}/events",
                    stream=True,
                    headers={
                        "Accept": "text/event-stream",
                        "Content-type": "application/json",
                    },
                    json=asdict(
                        ListenPayload(
                            events=[
                                "capture_notebook_cell",
                                "close_session",
                                "reactivate_notebook_cell",
                                "reload_session",
                                "state_update",
                            ],
                            initializer=state.serialize(),
                            subscription=self._subscription,
                        )
                    ),
                )
                source = sseclient.SSEClient(response)
                for message in source.events():
                    event = Event.from_data(message.event, message.data)
                    self._dispatch_event(event)

            while True:
                try:
                    _ping(f"{self.origin}/fiftyone")
                    self._connected = True
                    subscribe()
                except Exception as e:
                    if foc.DEV_INSTALL:
                        raise e

                    self._connected = False
                    print(
                        "\r\nCould not connect session, trying again "
                        "in 10 seconds\r\n"
                    )
                    time.sleep(10)

        self._thread = Thread(target=run_client, daemon=True)
        self._thread.start()

    @property
    def origin(self) -> str:
        """The origin of the server"""
        return f"http://{self.address}:{self.port}"

    def send_event(self, event: EventType) -> None:
        """Sends an event to the server

        Args:
            event: the event
        """
        if not self._connected:
            raise RuntimeError("Client is not connected")

        self._post_event(event)
        self._dispatch_event(event)

    def add_event_listener(
        self, event_name: str, listener: t.Callable
    ) -> None:
        """Adds an event listener callback for the provided event name. Events
        sent from client and from the server connection will be dispatched to
        the listener

        Args:
            event_name: the event name
            listener: the listener callback
        """
        self._listeners[event_name].add(listener)

    def remove_event_listener(
        self, event_name: str, listener: t.Callable
    ) -> None:
        """Removes an event listener callback for the provided event name if
        it has been registered

        Args:
            event_name: the event name
            listener: the listener callback
        """
        self._listeners[event_name].discard(listener)

    def _dispatch_event(self, event: EventType) -> None:
        for listener in self._listeners[event.get_event_name()]:
            listener(event)

    def _post_event(self, event: Event) -> None:
        response = requests.post(
            f"{self.origin}/event",
            headers={"Content-type": "application/json"},
            json={
                "event": event.get_event_name(),
                "data": stringify(asdict(event, dict_factory=dict_factory)),
                "subscription": self._subscription,
            },
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"Failed to post event `{event.get_event_name()}` to {self.origin}/event"
            )
