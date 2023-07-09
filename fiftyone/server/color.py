"""
FiftyOne Server coloring

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import strawberry as gql

import fiftyone.core.session.events as fose
import fiftyone.core.odm as foo

from fiftyone.server.events import dispatch_event, get_state


@gql.type
class ValueColor:
    color: str
    value: str


@gql.type
class CustomizeColor:
    path: str
    field_color: str
    value_colors: t.List[ValueColor]
    color_by_attribute: bool = False


@gql.type
class ColorScheme:
    color_pool: t.List[str]
    fields: t.List[CustomizeColor]


@gql.input
class ValueColorInput:
    color: str
    value: str


@gql.input
class CustomizeColorInput:
    path: str
    field_color: str
    color_by_attribute: bool = False
    value_colors: t.List[ValueColorInput]


@gql.input
class ColorSchemeInput:
    color_pool: t.List[str]
    fields: t.List[CustomizeColorInput]


@gql.type
class SetColorScheme:
    @gql.field
    async def set_color_scheme(
        self,
        subscription: str,
        color_scheme: ColorSchemeInput,
    ) -> bool:
        state = get_state()
        state.color_scheme = foo.ColorScheme(
            color_pool=color_scheme.color_pool,
            fields=color_scheme.fields,
        )

        await dispatch_event(
            subscription, fose.SetColorScheme(color_scheme=color_scheme)
        )
        return True
