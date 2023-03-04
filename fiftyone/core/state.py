"""
Defines the shared state between the FiftyOne App and backend.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import json_util
from dataclasses import asdict
import json
import logging
import typing as t

import strawberry as gql

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.media as fom
import fiftyone.core.utils as fou
import fiftyone.core.view as fov
from fiftyone.core.spaces import Space
from fiftyone.server.scalars import JSON


logger = logging.getLogger(__name__)


class StateDescription(etas.Serializable):
    """Class that describes the shared state between the FiftyOne App and
    a corresponding :class:`fiftyone.core.session.Session`.

    Args:
        config (None): an optional :class:`fiftyone.core.config.AppConfig`
        dataset (None): the current :class:`fiftyone.core.dataset.Dataset`
        selected (None): the list of currently selected samples
        selected_labels (None): the list of currently selected labels
        view (None): the current :class:`fiftyone.core.view.DatasetView`
        view_name (None): the name of the view if the current view is a
        saved view
    """

    def __init__(
        self,
        config=None,
        dataset=None,
        selected=None,
        selected_labels=None,
        view=None,
        saved_view_slug=None,
        view_name=None,
        spaces=None,
    ):
        self.config = config or fo.app_config.copy()
        self.dataset = dataset
        self.selected = selected or []
        self.selected_labels = selected_labels or []
        self.view = view
        self.view_name = view_name
        self.saved_view_slug = saved_view_slug
        self.spaces = spaces

    def serialize(self, reflective=True):
        with fou.disable_progress_bars():
            d = super().serialize(reflective=reflective)

            if self.dataset is not None:
                d["dataset"] = self.dataset.name
                collection = self.dataset
                if self.view is not None:
                    collection = self.view
                    d["view"] = json.loads(
                        json_util.dumps(self.view._serialize())
                    )
                    d["view_cls"] = etau.get_class_name(self.view)

                    d["view_name"] = self.view.name  # None for unsaved views

                d["sample_fields"] = serialize_fields(
                    collection.get_field_schema(flat=True), dicts=True
                )
                d["frame_fields"] = serialize_fields(
                    collection.get_frame_field_schema(flat=True), dicts=True
                )

                view = self.view if self.view is not None else self.dataset
                if view.media_type == fom.GROUP:
                    d["group_slice"] = view.group_slice

            d["config"]["timezone"] = fo.config.timezone

            if self.config.colorscale:
                d["colorscale"] = self.config.get_colormap()

            if isinstance(self.spaces, Space):
                d["spaces"] = self.spaces.to_json()

            return d

    def attributes(self):
        return list(
            filter(
                lambda a: a not in {"dataset", "view"}, super().attributes()
            )
        )

    @classmethod
    def from_dict(cls, d, with_config=None):
        """Constructs a :class:`StateDescription` from a JSON dictionary.

        Args:
            d: a JSON dictionary
            with_config (None): an existing
                :class:`fiftyone.core.config.AppConfig` to attach and apply
                settings to

        Returns:
            :class:`StateDescription`
        """
        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.load_dataset(dataset)

        stages = d.get("view", None)
        if dataset is not None and stages:
            view = fov.DatasetView._build(dataset, stages)
        else:
            view = None

        view_name = d.get("view_name", None)

        group_slice = d.get("group_slice", None)
        if group_slice:
            if dataset is not None:
                dataset.group_slice = group_slice

            if view is not None:
                view.group_slice = group_slice

        config = with_config or fo.app_config.copy()
        for field, value in d.get("config", {}).items():
            setattr(config, field, value)

        fo.config.timezone = d.get("config", {}).get("timezone", None)

        spaces = d.get("spaces", None)

        if spaces is not None:
            spaces = Space.from_dict(json_util.loads(spaces))

        return cls(
            config=config,
            dataset=dataset,
            selected=d.get("selected", []),
            selected_labels=d.get("selected_labels", []),
            view=view,
            view_name=view_name,
            spaces=spaces,
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


def serialize_fields(schema: t.Dict, dicts=False) -> t.List[SampleField]:
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

            if field.info is not None:
                # Converts mongoengine types to primitives
                info = json.loads(json.dumps(field.info))
            else:
                info = None

            data.append(
                SampleField(
                    path=path,
                    db_field=field.db_field,
                    ftype=etau.get_class_name(field),
                    embedded_doc_type=embedded_doc_type,
                    subfield=subfield,
                    description=field.description,
                    info=info,
                )
            )

    if dicts:
        return [asdict(f) for f in data]

    return data
