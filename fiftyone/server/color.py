"""
FiftyOne Server coloring

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import asdict
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
class CustomizeColor:
    path: str
    valueColors: t.Optional[t.List[ValueColor]] = None
    colorByAttribute: t.Optional[str] = None
    fieldColor: t.Optional[str] = None


@gql.type
class ColorScheme:
    id: gql.ID = gql.field(default_factory=lambda: str(ObjectId()))
    color_pool: t.List[str]
    color_by: t.Optional[str] = None
    opacity: t.Optional[float] = None
    use_multi_color_keypoints: t.Optional[bool] = None
    show_keypoint_skeleton: t.Optional[bool] = None
    fields: t.Optional[t.List[CustomizeColor]] = None


@gql.input
class ValueColorInput:
    color: str
    value: str


@gql.input
class CustomizeColorInput:
    path: str
    valueColors: t.Optional[t.List[ValueColorInput]] = None
    colorByAttribute: t.Optional[str] = None
    fieldColor: t.Optional[str] = None


@gql.input
class ColorSchemeInput:
    color_pool: t.List[str]
    color_by: t.Optional[str] = None
    opacity: t.Optional[float] = None
    use_multi_color_keypoints: t.Optional[bool] = None
    show_keypoint_skeleton: t.Optional[bool] = None
    fields: t.Optional[t.List[CustomizeColorInput]] = None


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
                foo.ColorScheme(
                    color_pool=color_scheme.color_pool,
                    color_by=color_scheme.color_by,
                    opacity=color_scheme.opacity,
                    use_multi_color_keypoints=color_scheme.use_multi_color_keypoints,
                    show_keypoint_skeleton=color_scheme.show_keypoint_skeleton,
                    fields=[asdict(f) for f in color_scheme.fields]
                    if color_scheme.fields
                    else None,
                )
                if color_scheme
                else None
            )
            dataset.save()

        await fou.run_sync_task(run)
        await dispatch_event(subscription, fose.SetDatasetColorScheme())


def _to_odm_color_scheme(color_scheme: ColorSchemeInput):
    return foo.ColorScheme(
        color_pool=color_scheme.color_pool,
        color_by=color_scheme.color_by if color_scheme.color_by else None,
        opacity=color_scheme.opacity if color_scheme.opacity else None,
        use_multi_color_keypoints=color_scheme.use_multi_color_keypoints
        if color_scheme.use_multi_color_keypoints
        else None,
        show_keypoint_skeleton=color_scheme.show_keypoint_skeleton
        if color_scheme.show_keypoint_skeleton
        else None,
        fields=[asdict(f) for f in color_scheme.fields]
        if color_scheme.fields
        else [],
    )
