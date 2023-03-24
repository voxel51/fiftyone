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

import asyncio
from dacite import from_dict

import eta.core.utils as etau

import fiftyone.core.json as foj
import fiftyone.core.state as fos


EventType = t.Union[
    "CaptureNotebookCell",
    "CloseSession",
    "DeactivateNotebookCell",
    "ReactivateNotebookCell",
    "SelectSamples",
    "SelectLabels",
    "SetGroupSlice",
    "SetSpaces",
    "StateUpdate",
]

_camel_to_snake = re.compile(r"(?<!^)(?=[A-Z])")
_SCREENSHOTS: t.Dict[str, "Screenshot"] = {}


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

    @staticmethod
    async def from_data_async(
        event_name: str, data: t.Union[str, dict]
    ) -> EventType:
        def run():
            return Event.from_data(event_name, data)

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, run)


@dataclass
class LabelData:
    label_id: str
    field: str
    sample_id: str
    frame_number: t.Optional[int] = None


@dataclass
class Screenshot:
    bytes: bytes
    max_width: int


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
class Ping(Event):
    """Ping (builtin) event"""


@dataclass
class ReactivateNotebookCell(Event):
    """Reactivate notebook cell event"""

    subscription: str


@dataclass
class Refresh(Event):
    """Refresh event"""


@dataclass
class SelectSamples(Event):
    """Select samples event"""

    sample_ids: t.List[str]


@dataclass
class SelectLabels(Event):
    """Select labels event"""

    labels: t.List[LabelData]


@dataclass
class SetSpaces(Event):
    """Set spaces event"""

    spaces: t.Dict


@dataclass
class SetGroupSlice(Event):
    """Set group slice eventt"""

    slice: str


@dataclass
class StateUpdate(Event):
    """State update event"""

    state: fos.StateDescription


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
    async def from_dict(cls, d: dict) -> "ListenPayload":
        init = d["initializer"]

        if isinstance(init, dict) and "_CLS" in init:
            d["initializer"] = await _load_state(init)

        return from_dict(cls, d)


def add_screenshot(event: CaptureNotebookCell) -> None:
    data = event.src.split(",")[1].encode()
    _SCREENSHOTS[event.subscription] = Screenshot(
        base64.decodebytes(data), event.width
    )


def dict_factory(data: t.List[t.Tuple[str, t.Any]]) -> t.Dict[str, t.Any]:
    return dict(
        (k, v.serialize() if isinstance(v, fos.StateDescription) else v)
        for k, v in data
    )


def get_screenshot(subscription: str, pop=False) -> Screenshot:
    return (
        _SCREENSHOTS.pop(subscription) if pop else _SCREENSHOTS[subscription]
    )


async def _load_state(data: dict):
    def run():
        return fos.StateDescription.from_dict(data)

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, run)
