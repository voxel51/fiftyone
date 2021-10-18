"""
Defines the shared state between the FiftyOne App and backend.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

from mongoengine.base import document

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou
import fiftyone.core.view as fov


logger = logging.getLogger(__name__)


class StateDescription(etas.Serializable):
    """Class that describes the shared state between the FiftyOne App and
    a corresponding :class:`fiftyone.core.session.Session`.

    Args:
        datasets (None): the list of available datasets
        dataset (None): the current :class:`fiftyone.core.dataset.Dataset`
        view (None): the current :class:`fiftyone.core.view.DatasetView`
        filters (None): a dictionary of currently active field filters
        settings (None): a dictionary of the current field settings, if any
        connected (False): whether the session is connected to an App
        active_handle (None): the UUID of the currently active App. Only
            applicable in notebook contexts
        selected (None): the list of currently selected samples
        selected_labels (None): the list of currently selected labels
        config (None): an optional :class:`fiftyone.core.config.AppConfig`
        refresh (False): a boolean toggle for forcing an App refresh
        close (False): whether to close the App
    """

    def __init__(
        self,
        datasets=None,
        dataset=None,
        view=None,
        filters=None,
        settings=None,
        connected=False,
        active_handle=None,
        selected=None,
        selected_labels=None,
        config=None,
        refresh=False,
        close=False,
    ):
        self.datasets = datasets or fod.list_datasets()
        self.dataset = dataset
        self.view = view
        self.filters = filters or {}
        self.connected = connected
        self.active_handle = active_handle
        self.selected = selected or []
        self.selected_labels = selected_labels or []
        self.config = config or fo.app_config.copy()
        self.refresh = refresh
        self.close = close

    def serialize(self, reflective=False):
        with fou.disable_progress_bars():
            d = super().serialize(reflective=reflective)

            _dataset = None
            _view = None
            _view_cls = None

            if self.dataset is not None:
                _dataset = self.dataset._serialize()

                if self.view is not None:
                    _view = self.view._serialize()
                    _view_cls = etau.get_class_name(self.view)

                    # If the view uses a temporary dataset, we must use its
                    # media type and field schemas
                    if self.view._dataset != self.dataset:
                        _tmp = self.view._dataset._serialize()
                        _dataset["media_type"] = _tmp["media_type"]
                        _dataset["sample_fields"] = _tmp["sample_fields"]
                        _dataset["frame_fields"] = _tmp["frame_fields"]

            d["dataset"] = _dataset
            d["view"] = _view
            d["view_cls"] = _view_cls
            d["config"]["timezone"] = fo.config.timezone

            if self.config.colorscale:
                d["colorscale"] = self.config.get_colormap()

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
            dataset = fod.load_dataset(dataset.get("name"))

        stages = d.get("view", None)
        if dataset is not None and stages:
            view = fov.DatasetView._build(dataset, stages)
        else:
            view = None

        filters = d.get("filters", {})
        connected = d.get("connected", False)
        active_handle = d.get("active_handle", None)
        selected = d.get("selected", [])
        selected_labels = d.get("selected_labels", [])

        config = with_config or fo.app_config.copy()
        for field, value in d.get("config", {}).items():
            setattr(config, field, value)

        timezone = d.get("config", {}).get("timezone", None)
        if timezone:
            fo.config.timezone = timezone

        close = d.get("close", False)
        refresh = d.get("refresh", False)

        return cls(
            dataset=dataset,
            view=view,
            filters=filters,
            connected=connected,
            active_handle=active_handle,
            selected=selected,
            selected_labels=selected_labels,
            config=config,
            refresh=refresh,
            close=close,
        )


class DatasetStatistics(object):
    """Class that encapsulates the aggregation statistics required by the App's
    dataset view.

    Args:
        view: a :class:`fiftyone.core.view.DatasetView`
        filters (None): An options dict of filters defined by the App
    """

    def __init__(self, view, filters=None):
        self._aggregations = self._build(view, filters)

    @property
    def aggregations(self):
        """The list of :class:`fiftyone.core.aggregations.Aggregation`
        instances to run to compute the stats for the view.
        """
        return self._aggregations

    @classmethod
    def fields(cls, collection):
        """Returns the list of filterable fields on the provided
        :class:`fiftyone.core.collections.SampleCollection`.

        Args:
            collection: a :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a list of ``(path, field)`` tuples
        """
        result = []

        schema = collection.get_field_schema()
        for field_name, field in schema.items():
            if field_name == "metadata":
                continue

            result.append((field_name, field))

        if collection.media_type != fom.VIDEO:
            return result

        prefix = collection._FRAMES_PREFIX
        frame_schema = collection.get_frame_field_schema()

        for field_name, field in frame_schema.items():
            if field_name in ("id", "frame_number"):
                continue

            result.append((prefix + field_name, field))

        return result

    @classmethod
    def labels(cls, collection):
        """Returns the list of label fields on the provided
        :class:`fiftyone.core.collections.SampleCollection`.

        Args:
            collection: a :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a list of ``(path, field)`` tuples
        """
        return [
            (path, field)
            for (path, field) in cls.fields(collection)
            if _is_label(field)
        ]

    @classmethod
    def get_label_aggregations(cls, collection):
        labels = cls.labels(collection)
        count_aggs = []
        for path, field in labels:
            path = _expand_labels_path(path, field)
            count_aggs.append(foa.Count(path))

        tag_aggs = []
        for path, field in labels:
            path = _expand_labels_path(path, field)
            tag_aggs.append(foa.CountValues("%s.tags" % path))

        return count_aggs, tag_aggs

    def _build(self, view, filters):
        aggregations = [foa.Count()]

        if view.media_type == fom.VIDEO:
            aggregations.append(foa.Count("frames"))

        for field_name, field in self.fields(view):
            path = field_name

            if _is_label(field):
                path = _expand_labels_path(field_name, field)
                aggregations.extend(
                    [foa.Count(path), foa.CountValues("%s.tags" % path)]
                )
                if _has_confidence(field):
                    confidence_path = "%s.confidence" % path
                    aggregations.extend(
                        [
                            foa.Bounds(confidence_path),
                            foa.Count(confidence_path),
                        ]
                    )

                if _has_label(field):
                    label_path = "%s.label" % path
                    include_labels = (
                        None
                        if filters is None or label_path not in filters
                        else filters[label_path]["values"]
                    )
                    aggregations.extend(
                        [
                            foa.CountValues(
                                label_path, _first=200, _include=include_labels
                            ),
                            foa.Count(label_path),
                        ]
                    )

                if _has_support(field):
                    support_path = "%s.support" % path
                    aggregations.extend(
                        [foa.Bounds(support_path), foa.Count(support_path)]
                    )

            elif _meets_type(
                field,
                (
                    fof.DateField,
                    fof.DateTimeField,
                    fof.FloatField,
                    fof.IntField,
                ),
            ):
                aggregations.append(foa.Bounds(field_name))
            elif _meets_type(field, fof.BooleanField):
                aggregations.append(foa.CountValues(field_name, _first=3))
            elif _meets_type(field, (fof.StringField, fof.ObjectIdField)):
                aggregations.append(
                    _get_categorical_aggregation(path, filters)
                )

            aggregations.append(fo.Count(path))

        return aggregations


def _expand_labels_path(root, label_field):
    if issubclass(label_field.document_type, fol._HasLabelList):
        return "%s.%s" % (root, label_field.document_type._LABEL_LIST_FIELD,)

    return root


def _get_categorical_aggregation(path, filters):
    include = (
        None
        if filters is None or path not in filters or path == "tags"
        else filters[path]["values"]
    )
    return foa.CountValues(path, _first=200, _include=include)


def _meets_type(field, t):
    return isinstance(field, t) or (
        isinstance(field, fof.ListField) and isinstance(field.field, t)
    )


def _is_label(field):
    return isinstance(field, fof.EmbeddedDocumentField) and issubclass(
        field.document_type, fol.Label
    )


def _has_confidence(field):
    ltype = (
        fol._LABEL_LIST_TO_SINGLE_MAP[field.document_type]
        if field.document_type in fol._LABEL_LIST_TO_SINGLE_MAP
        else field.document_type
    )
    return hasattr(ltype, "confidence")


def _has_label(field):
    ltype = (
        fol._LABEL_LIST_TO_SINGLE_MAP[field.document_type]
        if field.document_type in fol._LABEL_LIST_TO_SINGLE_MAP
        else field.document_type
    )
    return hasattr(ltype, "label")


def _has_support(field):
    ltype = (
        fol._LABEL_LIST_TO_SINGLE_MAP[field.document_type]
        if field.document_type in fol._LABEL_LIST_TO_SINGLE_MAP
        else field.document_type
    )
    return hasattr(ltype, "support")
