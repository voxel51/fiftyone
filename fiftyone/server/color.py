"""
FiftyOne Server coloring

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict
from enum import Enum
import typing as t

from bson import ObjectId
import strawberry as gql

import fiftyone as fo
import fiftyone.core.session.events as fose
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou

from fiftyone.server.events import dispatch_event, get_state
from fiftyone.server.utils import from_dict

fop = fou.lazy_import("fiftyone.core.plots.plotly")


@gql.type
class ValueColor:
    color: str
    value: str


@gql.type
class MaskColor:
    color: str
    intTarget: int


@gql.type
class CustomizeColor:
    path: str
    valueColors: t.Optional[t.List[ValueColor]] = None
    colorByAttribute: t.Optional[str] = None
    fieldColor: t.Optional[str] = None
    maskTargetsColors: t.Optional[t.List[MaskColor]] = None


@gql.type
class LabelTagColor:
    fieldColor: t.Optional[str] = None
    valueColors: t.Optional[t.List[ValueColor]] = None


@gql.type
class ColorscaleList:
    color: str
    value: float


@gql.type
class Colorscale:
    path: str
    name: t.Optional[str] = None
    list: t.Optional[t.List[ColorscaleList]] = None

    @gql.field
    def rgb(self) -> t.Optional[t.List[t.List[int]]]:
        data = self.name or [
            [item.value, item.color] for item in self.list or []
        ]
        if data:
            return fop.get_colormap(data)


@gql.type
class DefaultColorscale:
    name: t.Optional[str] = None
    list: t.Optional[t.List[ColorscaleList]] = None

    @gql.field
    def rgb(self) -> t.Optional[t.List[t.List[int]]]:
        data = self.name or [
            [item.value, item.color] for item in self.list or []
        ]
        if data:
            return fop.get_colormap(data)


@gql.enum
class ColorBy(Enum):
    field = "field"
    instance = "instance"
    value = "value"


@gql.type
class ColorScheme:
    id: gql.ID = gql.field(default_factory=lambda: str(ObjectId()))
    color_pool: t.List[str]
    color_by: t.Optional[ColorBy] = None
    fields: t.Optional[t.List[CustomizeColor]] = None
    label_tags: t.Optional[LabelTagColor] = None
    multicolor_keypoints: t.Optional[bool] = None
    opacity: t.Optional[float] = None
    show_skeletons: t.Optional[bool] = None
    default_mask_targets_colors: t.Optional[t.List[MaskColor]] = None
    colorscales: t.Optional[t.List[Colorscale]] = None
    default_colorscale: t.Optional[DefaultColorscale] = None


@gql.input
class ValueColorInput:
    color: str
    value: str


@gql.input
class MaskColorInput:
    color: str
    intTarget: int


@gql.input
class ColorscaleListInput:
    color: str
    value: t.Optional[float]


@gql.input
class ColorscaleInput:
    path: str
    name: t.Optional[str] = None
    list: t.Optional[t.List[ColorscaleListInput]] = None


@gql.input
class DefaultColorscaleInput:
    name: t.Optional[str] = None
    list: t.Optional[t.List[ColorscaleListInput]] = None


@gql.input
class CustomizeColorInput:
    path: str
    valueColors: t.Optional[t.List[ValueColorInput]] = None
    colorByAttribute: t.Optional[str] = None
    fieldColor: t.Optional[str] = None
    maskTargetsColors: t.Optional[t.List[MaskColorInput]] = None


@gql.input
class LabelTagColorInput:
    fieldColor: t.Optional[str] = None
    valueColors: t.Optional[t.List[ValueColorInput]] = None


@gql.input
class ColorSchemeInput:
    color_pool: t.List[str]
    id: t.Optional[gql.ID] = None
    color_by: t.Optional[str] = None
    fields: t.Optional[t.List[CustomizeColorInput]] = None
    label_tags: t.Optional[LabelTagColorInput] = None
    multicolor_keypoints: t.Optional[bool] = None
    opacity: t.Optional[float] = None
    show_skeletons: t.Optional[bool] = None
    default_mask_targets_colors: t.Optional[t.List[MaskColorInput]] = None
    colorscales: t.Optional[t.List[ColorscaleInput]] = None
    default_colorscale: t.Optional[DefaultColorscaleInput] = None


@gql.type
class SetColorScheme:
    @gql.field
    async def set_color_scheme(
        self,
        subscription: str,
        color_scheme: ColorSchemeInput,
    ) -> ColorScheme:
        if color_scheme.id is None:
            color_scheme.id = str(ObjectId())

        state = get_state()
        state.color_scheme = _to_odm_color_scheme(color_scheme)
        await dispatch_event(
            subscription, fose.SetColorScheme(color_scheme=color_scheme)
        )
        return from_dict(ColorScheme, asdict(color_scheme))

    @gql.field
    async def set_dataset_color_scheme(
        self,
        subscription: str,
        dataset_name: str,
        color_scheme: t.Optional[ColorSchemeInput] = None,
    ) -> t.Optional[ColorScheme]:
        if color_scheme and color_scheme.id is None:
            color_scheme.id = str(ObjectId())

        def run():
            dataset = fo.load_dataset(dataset_name)
            dataset.app_config.color_scheme = (
                _to_odm_color_scheme(color_scheme) if color_scheme else None
            )
            dataset.save()

        await fou.run_sync_task(run)
        await dispatch_event(subscription, fose.SetDatasetColorScheme())

        if color_scheme is None:
            return None

        return from_dict(ColorScheme, asdict(color_scheme))


def _to_odm_color_scheme(color_scheme: ColorSchemeInput):
    return foo.ColorScheme(
        color_pool=color_scheme.color_pool,
        color_by=color_scheme.color_by,
        multicolor_keypoints=color_scheme.multicolor_keypoints,
        opacity=color_scheme.opacity,
        show_skeletons=color_scheme.show_skeletons,
        default_mask_targets_colors=(
            [asdict(f) for f in color_scheme.default_mask_targets_colors]
            if color_scheme.default_mask_targets_colors
            else []
        ),
        fields=(
            [asdict(f) for f in color_scheme.fields]
            if color_scheme.fields
            else []
        ),
        colorscales=(
            [asdict(f) for f in color_scheme.colorscales]
            if color_scheme.colorscales
            else []
        ),
        label_tags=(
            asdict(color_scheme.label_tags) if color_scheme.label_tags else {}
        ),
        default_colorscale=(
            asdict(color_scheme.default_colorscale)
            if color_scheme.default_colorscale
            else {}
        ),
    )
