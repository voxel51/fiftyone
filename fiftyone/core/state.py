"""
Defines the shared state between the FiftyOne App and SDK.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
import logging

from bson import json_util

import eta.core.serial as etas

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.media as fom
import fiftyone.core.stages as fos
import fiftyone.core.utils as fou
import fiftyone.core.view as fov


logger = logging.getLogger(__name__)


class StateDescription(etas.Serializable):
    """Class that describes the shared state between the FiftyOne App and
    a corresponding :class:`fiftyone.core.session.Session`.

    Attributes:
        dataset: the current :class:`fiftyone.core.session.Session`
        selected: the list of currently selected samples
        view: the current :class:`fiftyone.core.view.DatasetView`

    Args:
        close (False): whether to close the app
        connected (False): whether the session is connected to an app
        dataset (None): the current :class:`fiftyone.core.dataset.Dataset`
        selected (None): the list of currently selected samples
        view (None): the current :class:`fiftyone.core.view.DatasetView`
    """

    def __init__(
        self,
        close=False,
        connected=False,
        dataset=None,
        selected=None,
        view=None,
    ):
        self.close = close
        self.connect = connected
        self.dataset = dataset
        self.view = view
        self.selected = selected or []
        self.view_count = (
            len(view)
            if view is not None
            else len(dataset)
            if dataset is not None
            else 0
        )
        super().__init__()

    def serialize(self, reflective=False):
        """Serializes the state into a dictionary.

        Args:
            reflective: whether to include reflective attributes when
                serializing the object. By default, this is False
        Returns:
            a JSON dictionary representation of the object
        """
        with fou.disable_progress_bars():
            d = super().serialize(reflective=reflective)
            d["dataset"] = (
                self.dataset._serialize() if self.dataset is not None else None
            )
            d["view"] = (
                self.view._serialize() if self.view is not None else None
            )
            return d

    def attributes(self):
        """Returns list of attributes to be serialize"""
        return list(
            filter(
                lambda a: a not in {"dataset", "view"}, super().attributes()
            )
        )

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a :class:`StateDescription` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            :class:`StateDescription`
        """
        close = d.get("close", False)
        connected = d.get("connected", False)

        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.load_dataset(dataset.get("name"))

        view_ = d.get("view", None)
        view = None
        if dataset is not None:
            view = fov.DatasetView(dataset)
            if view_ is not None:
                view._stages = [
                    fos.ViewStage._from_dict(s) for s in view_["view"]
                ]

        selected = d.get("selected", [])

        return cls(
            close=close,
            connected=connected,
            dataset=dataset,
            selected=selected,
            view=view,
            **kwargs
        )


class StateDescriptionWithDerivables(StateDescription):
    """This class extends :class:`StateDescription` to include information that
    does not define the state but needs to be fetched/computed and passed to
    the frontend application, such as derived statistics (number of sample
    occurrences with a given tag, etc.)

    The python process should only ever see instances of
    :class:`StateDescription` and the app should only ever see instances of
    :class:`StateDescriptionWithDerivables` with the server acting as the
    broker.
    """

    def __init__(self, filter_stages={}, with_stats=True, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.filter_stages = filter_stages
        view = self.view if self.view is not None else self.dataset
        if view is None or not with_stats:
            return

        self.field_schema = self._get_field_schema()
        self.labels = self._get_label_fields(view)
        if view.media_type == fom.VIDEO:
            self.frame_labels = _get_field_count(
                view, view.get_field_schema()["frames"]
            )
        self.tags = list(sorted(view.get_tags()))
        self.view_stats = get_view_stats(view)

        extended_view = view
        for stage_dict in self.filter_stages.values():
            extended_view = extended_view.add_stage(
                fos.ViewStage._from_dict(stage_dict)
            )

        if extended_view == view:
            self.extended_view_stats = {}
        else:
            self.extended_view_stats = get_view_stats(extended_view)
        self.extended_view_count = (
            len(extended_view) if extended_view != view else None
        )

    @classmethod
    def from_dict(cls, d, **kwargs):
        kwargs["filter_stages"] = d.get("filter_stages", {})
        kwargs["with_stats"] = d.get("with_stats", True)
        return super().from_dict(d, **kwargs)

    def _get_view_stats(self, view):
        if self.view is not None:
            return get_view_stats(view)

        return {}

    def _get_field_schema(self):
        if self.dataset is None:
            return {}

        return {
            name: str(field)
            for name, field in self.dataset.get_field_schema().items()
        }

    @staticmethod
    def _get_label_fields(view):
        label_fields = []

        for k, v in view.get_field_schema().items():
            if view.media_type == fom.VIDEO and k == "frames":
                continue
            d = {"field": k}
            if isinstance(v, fof.EmbeddedDocumentField):
                d["cls"] = v.document_type.__name__

            label_fields.append(d)

        return sorted(label_fields, key=lambda field: field["field"])


def get_view_stats(dataset_or_view):
    """Counts instances of each tag and each field within the samples of a
    view.

    Args:
        dataset_or_view: a :class:`fiftyone.core.view.DatasetView` or
            :class:`fiftyone.core.dataset.Dataset` instance

    Returns:
        a dictionary with structure::

            {
                'tags': {
                    '<TAG 1>': <COUNT>,
                    '<TAG 2>': <COUNT>,
                    ...
                },
                'custom_fields': {
                    '<FIELD 1>': <COUNT>,
                    '<FIELD 2>': <COUNT>,
                    ...
                }
            }
    """
    if isinstance(dataset_or_view, fod.Dataset):
        view = dataset_or_view.view()
    else:
        view = dataset_or_view

    custom_fields_schema = view.get_field_schema().copy()
    for field_name in fod.Dataset.get_default_sample_fields(
        include_private=True
    ):
        custom_fields_schema.pop(field_name, None)

    return {
        "tags": {tag: len(view.match_tag(tag)) for tag in view.get_tags()},
        "custom_fields": {
            field_name: _get_field_count(view, field)
            for field_name, field in custom_fields_schema.items()
        },
        "labels": _get_label_field_derivables(view),
        "numeric_field_bounds": _get_numeric_field_bounds(view),
    }


def _get_label_field_derivables(view):
    label_fields = _get_label_fields(view)
    confidence_bounds = _get_label_confidence_bounds(view)
    classes = {
        field.name: _get_label_classes(view, field) for field in label_fields
    }
    return {
        field.name: {
            "confidence_bounds": confidence_bounds[field.name],
            "classes": classes[field.name],
        }
        for field in label_fields
    }


def _get_label_classes(view, field):
    pipeline = []
    is_list = False
    path = "$%s" % field.name
    if issubclass(field.document_type, fol.Classifications):
        path = "%s.classifications" % path
        is_list = True
    elif issubclass(field.document_type, fol.Detections):
        path = "%s.detections" % path
        is_list = True

    if is_list:
        pipeline.append(
            {"$unwind": {"path": path, "preserveNullAndEmptyArrays": True}}
        )

    path = "%s.label" % path
    pipeline.append({"$group": {"_id": None, "labels": {"$addToSet": path}}})

    try:
        return next(view.aggregate(pipeline))["labels"]
    except StopIteration:
        pass


def _get_label_fields(view):
    def _filter(field):
        if not isinstance(field, fof.EmbeddedDocumentField):
            return False

        if issubclass(field.document_type, fol.ImageLabel):
            return True

        return False

    return list(filter(_filter, view.get_field_schema().values()))


def _get_bounds(fields, view, facets):
    if len(facets) == 0:
        return {}

    pipeline = [{"$facet": facets}]

    try:
        result = next(view.aggregate(pipeline))
    except StopIteration:
        return {}
    bounds = {}
    for field in fields:
        try:
            bounds[field.name] = [
                round(float(result[field.name][0]["min"]), 2),
                round(float(result[field.name][0]["max"]), 2),
            ]
        except:
            bounds[field.name] = [None, None]

    return bounds


def _get_numeric_field_bounds(view):
    numeric_fields = list(
        filter(
            lambda f: type(f) in {fof.FloatField, fof.IntField},
            view.get_field_schema().values(),
        )
    )
    path = "$%s"
    facets = {
        field.name: [
            {
                "$group": {
                    "_id": None,
                    "min": {"$min": path % field.name},
                    "max": {"$max": path % field.name},
                }
            }
        ]
        for field in numeric_fields
    }

    return _get_bounds(numeric_fields, view, facets)


def _get_label_confidence_bounds(view):
    fields = _get_label_fields(view)
    facets = {}
    for field in fields:
        is_list = False
        path = "$%s" % field.name
        if issubclass(field.document_type, fol.Classifications):
            path = "%s.classifications" % path
            is_list = True
        elif issubclass(field.document_type, fol.Detections):
            path = "%s.detections" % path
            is_list = True

        facet_pipeline = []
        if is_list:
            facet_pipeline.append(
                {"$unwind": {"path": path, "preserveNullAndEmptyArrays": True}}
            )

        path = "%s.confidence" % path
        facet_pipeline.append(
            {
                "$group": {
                    "_id": None,
                    "min": {"$min": path},
                    "max": {"$max": path},
                }
            },
        )
        facets[field.name] = facet_pipeline

    return _get_bounds(fields, view, facets)


def _get_field_count(view, field):
    if isinstance(field, fof.EmbeddedDocumentField) or (
        view.media_type == fom.VIDEO and field.name == "frames"
    ):
        extra_stage = []
        if field.name == "frames":
            array_field = {"$objectToArray": "$%s" % field.name}
        elif issubclass(field.document_type, fol.Classifications):
            array_field = "$%s.classifications" % field.name
        elif issubclass(field.document_type, fol.Detections):
            array_field = "$%s.detections" % field.name
        elif issubclass(field.document_type, fol.Polylines):
            array_field = "$%s.polylines" % field.name
        elif issubclass(field.document_type, fol.Keypoint):
            array_field = "$%s.points" % field.name
        elif issubclass(field.document_type, fol.Keypoints):
            array_field = "$%s.keypoints" % field.name
            extra_stage = [
                {"$unwind": array_field},
            ]
            array_field = "%s.points" % array_field
        else:
            array_field = None

        if array_field:
            # sum of lengths of arrays for each document
            pipeline = [
                {
                    "$group": {
                        "_id": None,
                        "totalCount": {
                            "$sum": {
                                "$cond": {
                                    "if": {"$isArray": array_field},
                                    "then": {"$size": array_field},
                                    "else": 0,
                                }
                            }
                        },
                    }
                }
            ]
            pipeline = extra_stage + pipeline
            try:
                return next(view.aggregate(pipeline))["totalCount"]
            except StopIteration:
                return 0

    return len(view.exists(field.name))
