"""
Defines the shared state between the FiftyOne App and backend.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import typing as t

from dataclasses import asdict
from mongoengine.base import BaseDict, BaseList
import strawberry as gql

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.clips as foc
from fiftyone.core.config import AppConfig
import fiftyone.core.dataset as fod
from fiftyone.core.odm.dataset import ColorScheme
from fiftyone.core.odm.workspace import Space
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
import fiftyone.core.view as fov
from fiftyone.server.scalars import JSON


logger = logging.getLogger(__name__)


class StateDescription(etas.Serializable):
    """Class that describes the shared state between the FiftyOne App and
    a corresponding :class:`fiftyone.core.session.Session`.

    Args:
        color_scheme (None): a :class:`fiftyone.core.odm.dataset.ColorScheme`
        config (None): an optional :class:`fiftyone.core.config.AppConfig`
        dataset (None): the current :class:`fiftyone.core.dataset.Dataset`
        field_visibility_stage (None): a field visibility stage
        group_id (None): a :attr:`fiftyone.core.groups.Group.id`
        group_slice (None): a :attr:`fiftyone.core.groups.Group.name`
        sample_id (None): a :attr:`fiftyone.core.sample.Sample.id`
        selected (None): the list of currently selected samples
        selected_labels (None): the list of currently selected labels
        spaces (None): a :class:`fiftyone.core.odm.workspace.Space`
        view (None): the current :class:`fiftyone.core.view.DatasetView`
        view_name (None): the name of the view if the current view is a
            saved view
    """

    def __init__(
        self,
        color_scheme=None,
        config=None,
        dataset=None,
        field_visibility_stage=None,
        group_id=None,
        group_slice=None,
        sample_id=None,
        selected=None,
        selected_labels=None,
        spaces=None,
        view=None,
        view_name=None,
    ):
        self.config = config or fo.app_config.copy()

        if dataset is not None:
            dataset.reload()
        self.dataset = dataset

        self.color_scheme = color_scheme or build_color_scheme()
        self.field_visibility_stage = field_visibility_stage

        self.group_id = group_id
        if group_slice is None and view is not None:
            group_slice = view.group_slice
        self.group_slice = group_slice

        self.sample_id = sample_id
        self.selected = selected or []
        self.selected_labels = selected_labels or []
        self.spaces = spaces

        self.view = (
            dataset.load_saved_view(view_name)
            if dataset is not None and view_name
            else view
        )

    def serialize(self, reflective=True):
        with fou.disable_progress_bars():
            d = super().serialize(reflective=reflective)

            if self.dataset is not None:
                d["dataset"] = self.dataset.name
                collection = self.dataset
                if self.view is not None:
                    collection = self.view

                    # @todo update App so this isn't needed?
                    if isinstance(self.view, foc.TrajectoriesView):
                        _view_cls = etau.get_class_name(foc.ClipsView)
                    else:
                        _view_cls = etau.get_class_name(self.view)

                    d["view"] = self.view._serialize()
                    d["view_cls"] = _view_cls

                    d["view_name"] = self.view.name  # None for unsaved views
                    if d.get("view_name") is not None:
                        d["saved_view_slug"] = fou.to_slug(self.view.name)

                d["sample_fields"] = [
                    asdict(field)
                    for field in serialize_fields(
                        collection.get_field_schema(flat=True)
                    )
                ]
                d["frame_fields"] = [
                    asdict(field)
                    for field in serialize_fields(
                        collection.get_frame_field_schema(flat=True)
                    )
                ]

            d["config"]["timezone"] = fo.config.timezone

            if self.config.colorscale:
                d["colorscale"] = self.config.get_colormap()

            if isinstance(self.spaces, Space):
                d["spaces"] = self.spaces.to_dict()

            if isinstance(self.color_scheme, ColorScheme):
                d["color_scheme"] = self.color_scheme.to_dict(False)

            if self.field_visibility_stage:
                d["field_visibility_stage"] = self.field_visibility_stage

            return d

    def attributes(self):
        return list(
            filter(
                lambda a: a not in {"dataset", "view"}, super().attributes()
            )
        )

    @classmethod
    def from_dict(cls, d):
        """Constructs a :class:`StateDescription` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            :class:`StateDescription`
        """
        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.load_dataset(dataset)

        stages = d.get("view", None)
        view = None
        view_name = d.get("view_name", None)
        if dataset is not None:
            if view_name:
                try:
                    view = dataset.load_saved_view(view_name)
                except Exception as e:
                    dataset.reload()
                    view = dataset.load_saved_view(view_name)

            elif stages:
                try:
                    view = fov.DatasetView._build(dataset, stages)
                except:
                    dataset.reload()
                    view = fov.DatasetView._build(dataset, stages)

        config = (
            fo.AppConfig.from_dict(d["config"])
            if d.get("config", None)
            else None
        )

        for field, value in d.get("config", {}).items():
            setattr(config, field, value)

        fo.config.timezone = d.get("config", {}).get("timezone", None)

        spaces = d.get("spaces", None)
        if spaces is not None:
            spaces = Space.from_dict(spaces)

        color_scheme = d.get("color_scheme", None)
        if color_scheme:
            color_scheme = ColorScheme.from_dict(color_scheme)

        return cls(
            color_scheme=color_scheme,
            config=config,
            dataset=dataset,
            field_visibility_stage=d.get("field_visibility_stage", None),
            group_id=d.get("group_id", None),
            group_slice=d.get("group_slice", None),
            sample_id=d.get("sample_id", None),
            selected=d.get("selected", []),
            selected_labels=d.get("selected_labels", []),
            spaces=spaces,
            view=view,
        )


@gql.type
class SampleField:
    ftype: str
    path: str
    subfield: t.Optional[str]
    embedded_doc_type: t.Optional[str]
    db_field: t.Optional[str]
    description: t.Optional[str]
    info: t.Optional[JSON]


def serialize_fields(schema: t.Dict) -> t.List[SampleField]:
    data = []

    if schema:
        for path, field in schema.items():
            if isinstance(field, fo.EmbeddedDocumentField):
                embedded_doc_type = etau.get_class_name(field.document_type)
            elif (
                isinstance(field, fo.ListField)
                and field.field
                and isinstance(field.field, fo.EmbeddedDocumentField)
            ):
                embedded_doc_type = etau.get_class_name(
                    field.field.document_type
                )
            else:
                embedded_doc_type = None

            if (
                isinstance(field, (fo.DictField, fo.ListField))
                and field.field is not None
            ):
                subfield = etau.get_class_name(field.field)
            else:
                subfield = None

            data.append(
                SampleField(
                    path=path,
                    db_field=field.db_field,
                    ftype=etau.get_class_name(field),
                    embedded_doc_type=embedded_doc_type,
                    subfield=subfield,
                    description=field.description,
                    info=(
                        _convert_mongoengine_data(field.info)
                        if isinstance(field.info, BaseDict)
                        else field.info
                    ),
                )
            )

    return data


def _convert_mongoengine_data(data):
    if isinstance(data, BaseDict):
        return {k: _convert_mongoengine_data(v) for k, v in data.items()}

    if isinstance(data, BaseList):
        return [_convert_mongoengine_data(v) for v in data]

    return data


def build_color_scheme(
    color_scheme: t.Optional[foo.ColorScheme] = None,
    dataset: t.Optional[fod.Dataset] = None,
    app_config: t.Optional[AppConfig] = None,
) -> foo.ColorScheme:
    if color_scheme is None:
        if dataset is not None and dataset.app_config.color_scheme is not None:
            color_scheme = dataset.app_config.color_scheme.copy()
        else:
            color_scheme = foo.ColorScheme()

    if app_config is None:
        app_config = fo.app_config

    if not color_scheme.color_by:
        color_scheme.color_by = app_config.color_by

    if not color_scheme.color_pool:
        color_scheme.color_pool = app_config.color_pool

    if color_scheme.multicolor_keypoints is None:
        color_scheme.multicolor_keypoints = app_config.multicolor_keypoints

    if color_scheme.opacity is None:
        color_scheme.opacity = 0.7

    if color_scheme.show_skeletons is None:
        color_scheme.show_skeletons = app_config.show_skeletons

    return color_scheme
