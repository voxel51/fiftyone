"""
Session events.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import base64
from dataclasses import asdict, dataclass
import re
import typing as t

import asyncio
from bson import json_util
from dacite import from_dict

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.odm.dataset as foo
import fiftyone.core.state as fos
from fiftyone.core.utils import lazy_import, run_sync_task

fop = lazy_import("fiftyone.core.plots.plotly")


EventType = t.Union[
    "CaptureNotebookCell",
    "CloseSession",
    "DeactivateNotebookCell",
    "ReactivateNotebookCell",
    "SelectSamples",
    "SelectLabels",
    "SetColorScheme",
    "SetGroupSlice",
    "SetSample",
    "SetSpaces",
    "StateUpdate",
    "SetFieldVisibilityStage",
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
            data = json_util.loads(data)

        event_cls = etau.get_class(
            "".join(word.title() for word in event_name.split("_")),
            "fiftyone.core.session.events",
        )

        if event_cls in {Refresh, StateUpdate}:
            data["state"] = fos.StateDescription.from_dict(data["state"])

        return from_dict(
            event_cls,
            data,
        )

    @staticmethod
    async def from_data_async(
        event_name: str, data: t.Union[str, dict]
    ) -> EventType:
        def run():
            return Event.from_data(event_name, data)

        return await run_sync_task(run)

    def serialize(self):
        return _asdict(self)


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

    state: fos.StateDescription


@dataclass
class SelectLabels(Event):
    """Select labels event"""

    labels: t.List[LabelData]


@dataclass
class SelectSamples(Event):
    """Select samples event"""

    sample_ids: t.List[str]


@dataclass
class ValueColor:
    color: str
    value: str


@dataclass
class MaskColor:
    color: str
    intTarget: t.Optional[int]


@dataclass
class CustomizeColor:
    path: str
    fieldColor: t.Optional[str] = None
    colorByAttribute: t.Optional[str] = None
    valueColors: t.Optional[t.List[ValueColor]] = None
    maskTargetsColors: t.Optional[t.List[MaskColor]] = None


@dataclass
class ColorscaleList:
    value: float
    color: str


@dataclass
class Colorscale:
    path: str
    name: t.Optional[str] = None
    list: t.Optional[t.List[ColorscaleList]] = None

    def serialize(self):
        d = _asdict(self)
        d["rgb"] = _serialize_rgb_colorscale(self.name, self.list)


@dataclass
class DefaultColorscale:
    name: t.Optional[str] = None
    list: t.Optional[t.List[ColorscaleList]] = None

    def serialize(self):
        d = _asdict(self)
        d["rgb"] = _serialize_rgb_colorscale(self.name, self.list)


@dataclass
class LabelTagsColors:
    fieldColor: t.Optional[str] = None
    valueColors: t.Optional[t.List[ValueColor]] = None


@dataclass
class ColorScheme:
    color_pool: t.Optional[t.List[str]] = None
    color_by: t.Optional[str] = None
    multicolor_keypoints: t.Optional[bool] = None
    opacity: t.Optional[float] = None
    show_skeletons: t.Optional[bool] = None
    fields: t.Optional[t.List[CustomizeColor]] = None
    default_mask_targets_colors: t.Optional[t.List[MaskColor]] = None
    colorscales: t.Optional[t.List[Colorscale]] = None
    default_colorscale: t.Optional[DefaultColorscale] = None
    label_tags: t.Optional[LabelTagsColors] = None

    def serialize(self):
        if self.default_colorscale:
            self.default_colorscale = self.default_colorscale.serialize()

        if self.colorscales:
            self.colorscales = [
                colorscale.serialize() for colorscale in self.colorscales
            ]


@dataclass
class SetColorScheme(Event):
    """Set color scheme event"""

    color_scheme: ColorScheme

    @classmethod
    def from_odm(cls, color_scheme: foo.ColorScheme):
        return cls(color_scheme=from_dict(ColorScheme, color_scheme.to_dict()))

    def to_odm(self):
        fields = (
            [asdict(field) for field in self.color_scheme.fields]
            if self.color_scheme.fields
            else None
        )
        colorscales = (
            [
                asdict(colorscales)
                for colorscales in self.color_scheme.colorscales
            ]
            if self.color_scheme.colorscales
            else None
        )
        default_mask_targets_colors = (
            [
                asdict(target)
                for target in self.color_scheme.default_mask_targets_colors
            ]
            if self.color_scheme.default_mask_targets_colors
            else None
        )
        default_colorscale = (
            asdict(self.color_scheme.default_colorscale)
            if self.color_scheme.default_colorscale
            else None
        )
        label_tags = (
            asdict(self.color_scheme.label_tags)
            if self.color_scheme.label_tags
            else None
        )

        return foo.ColorScheme(
            color_pool=self.color_scheme.color_pool,
            color_by=self.color_scheme.color_by,
            fields=fields,
            default_mask_targets_colors=default_mask_targets_colors,
            label_tags=label_tags,
            colorscales=colorscales,
            default_colorscale=default_colorscale,
            multicolor_keypoints=self.color_scheme.multicolor_keypoints,
            opacity=self.color_scheme.opacity,
            show_skeletons=self.color_scheme.show_skeletons,
        )


@dataclass
class SetDatasetColorScheme(Event):
    """Set dataset color scheme event"""

    pass


@dataclass
class SetSample(Event):
    """Set sample event"""

    group_id: t.Optional[str] = None
    sample_id: t.Optional[str] = None


@dataclass
class SetSpaces(Event):
    """Set spaces event"""

    spaces: t.Dict


@dataclass
class SetGroupSlice(Event):
    """Set group slice eventt"""

    slice: str


@dataclass
class SetFieldVisibilityStage(Event):
    stage: t.Optional[t.Dict] = None


@dataclass
class StateUpdate(Event):
    """State update event"""

    state: fos.StateDescription


@dataclass
class AppInitializer:
    dataset: t.Optional[str] = None
    group_id: t.Optional[str] = None
    group_slice: t.Optional[str] = None
    sample_id: t.Optional[str] = None
    view: t.Optional[str] = None
    workspace: t.Optional[str] = None


@dataclass
class ListenPayload:
    """An initialization payload for an event listener request"""

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
        (k, v.serialize() if isinstance(v, etas.Serializable) else v)
        for k, v in data
    )


def get_screenshot(subscription: str, pop=False) -> Screenshot:
    return (
        _SCREENSHOTS.pop(subscription) if pop else _SCREENSHOTS[subscription]
    )


def _asdict(d):
    return asdict(d, dict_factory=dict_factory)


async def _load_state(data: dict):
    def run():
        return fos.StateDescription.from_dict(data)

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, run)


def _serialize_rgb_colorscale(
    name: t.Optional[str], values: t.Optional[t.List[ColorscaleList]]
):
    return fop.get_colormap(
        name or [[item.value, item.color] for item in values]
    )
