"""
Session events.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import base64
from dataclasses import dataclass
import re
import typing as t

from dacite import from_dict

import eta.core.utils as etau

import fiftyone.core.json as foj
import fiftyone.core.state as fos


EventType = t.Union[
    "CaptureNotebookCell",
    "CloseSession",
    "DeactivateNotebookCell",
    "ReactivateNotebookCell",
    "StateUpdate",
]

_camel_to_snake = re.compile(r"(?<!^)(?=[A-Z])")


@dataclass
class Event:
    """Base server event"""

    @classmethod
    def get_event_name(cls) -> str:
        return _camel_to_snake.sub("_", cls.__name__).lower()

    @staticmethod
    def from_data(event_name: str, data: t.Union[str, dict]) -> EventType:
        if event_name == Ping.get_event_name():
            return Ping()

        if isinstance(data, str):
            data = foj.FiftyOneJSONEncoder.loads(data)

        event_cls = etau.get_class(
            "".join(word.title() for word in event_name.split("_")),
            "fiftyone.core.session.events",
        )

        if event_cls == StateUpdate:
            data["state"] = fos.StateDescription.from_dict(data["state"])

        return from_dict(event_cls, data)


@dataclass
class CaptureNotebookCell(Event):
    """Capture notebook cell screenshot event"""

    subscription: str
    src: str
    width: int


@dataclass
class CloseSession(Event):
    """Close session event"""


@dataclass
class DeactivateNotebookCell(Event):
    """Deactivate notebook cell event"""


@dataclass
class ReactivateNotebookCell(Event):
    """Reactivate notebook cell event"""

    subscription: str


@dataclass
class StateUpdate(Event):
    """State update event"""

    state: fos.StateDescription
    refresh: bool = False


@dataclass
class Ping(Event):
    """Ping (builtin) event"""


@dataclass
class AppInitializer:
    dataset: t.Optional[str] = None
    view: t.Optional[str] = None


@dataclass
class ListenPayload:
    """A an initialization payload for an event listener request"""

    initializer: t.Union[AppInitializer, None, fos.StateDescription]
    events: t.List[str]
    subscription: str
    polling: t.Optional[bool] = False

    @classmethod
    def from_dict(cls, d: dict) -> "ListenPayload":
        init = d["initializer"]

        if isinstance(init, dict) and "_CLS" in init:
            d["initializer"] = fos.StateDescription.from_dict(init)

        return from_dict(cls, d)


def dict_factory(data: t.List[t.Tuple[str, t.Any]]) -> t.Dict[str, t.Any]:
    return dict(
        (k, v.serialize() if isinstance(v, fos.StateDescription) else v)
        for k, v in data
    )


@dataclass
class Screenshot:
    bytes: bytes
    max_width: int


_SCREENSHOTS: t.Dict[str, Screenshot] = {}


def add_screenshot(event: CaptureNotebookCell) -> None:
    data = event.src.split(",")[1].encode()
    _SCREENSHOTS[event.subscription] = Screenshot(
        base64.decodebytes(data), event.width
    )


def get_screenshot(subscription: str, pop=False) -> Screenshot:
    return (
        _SCREENSHOTS.pop(subscription) if pop else _SCREENSHOTS[subscription]
    )
