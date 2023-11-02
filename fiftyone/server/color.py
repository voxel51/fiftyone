"""
FiftyOne Server coloring

| Copyright 2017-2023, Voxel51, Inc.
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


@gql.type
class ValueColor:
    color: str
    value: str


@gql.type
class MaskColor:
    color: str
    idx: t.Optional[int]


@gql.type
class ColorTuple:
    color: str
    value: float


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


@gql.input
class ValueColorInput:
    color: str
    value: str


@gql.input
class MaskColorInput:
    color: str
    idx: t.Optional[int]


@gql.input
class ColorTupleInput:
    color: str
    value: float


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
    color_by: t.Optional[str] = None
    fields: t.Optional[t.List[CustomizeColorInput]] = None
    label_tags: t.Optional[LabelTagColorInput] = None
    multicolor_keypoints: t.Optional[bool] = None
    opacity: t.Optional[float] = None
    show_skeletons: t.Optional[bool] = None
    default_mask_targets_colors: t.Optional[t.List[MaskColorInput]] = None


@gql.type
class SetColorScheme:
    @gql.field
    async def set_color_scheme(
        self,
        subscription: str,
        color_scheme: ColorSchemeInput,
    ) -> bool:
        state = get_state()
        state.color_scheme = _to_odm_color_scheme(color_scheme)

        await dispatch_event(
            subscription, fose.SetColorScheme(color_scheme=color_scheme)
        )
        return True

    @gql.field
    async def set_dataset_color_scheme(
        self,
        subscription: str,
        dataset_name: str,
        color_scheme: t.Optional[ColorSchemeInput] = None,
    ) -> None:
        def run():
            dataset = fo.load_dataset(dataset_name)
            dataset.app_config.color_scheme = (
                _to_odm_color_scheme(color_scheme) if color_scheme else None
            )
            dataset.save()

        await fou.run_sync_task(run)
        await dispatch_event(subscription, fose.SetDatasetColorScheme())


def _to_odm_color_scheme(color_scheme: ColorSchemeInput):
    return foo.ColorScheme(
        color_pool=color_scheme.color_pool,
        color_by=color_scheme.color_by,
        multicolor_keypoints=color_scheme.multicolor_keypoints,
        opacity=color_scheme.opacity,
        show_skeletons=color_scheme.show_skeletons,
        default_mask_targets_colors=[
            asdict(f) for f in color_scheme.default_mask_targets_colors
        ]
        if color_scheme.default_mask_targets_colors
        else [],
        fields=[asdict(f) for f in color_scheme.fields]
        if color_scheme.fields
        else [],
        label_tags=asdict(color_scheme.label_tags)
        if color_scheme.label_tags
        else {},
    )
