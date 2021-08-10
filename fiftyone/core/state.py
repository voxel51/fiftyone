"""
Defines the shared state between the FiftyOne App and backend.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.core.config as foc
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.sample as fosa
import fiftyone.core.stages as fost
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
        filters (None): a dictionary of currently active App filters
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
        foc._set_settings(config, d.get("config", {}))

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
    """

    def __init__(self, view):
        aggs, exists_aggs = self._build(view)
        self._aggregations = aggs
        self._exists_aggregations = exists_aggs

    @property
    def aggregations(self):
        """The list of :class:`fiftyone.core.aggregations.Aggregation`
        instances to run to compute the stats for the view.
        """
        return self._aggregations

    @property
    def exists_aggregations(self):
        """The list of :class:`fiftyone.core.aggregations.Aggregation`
        instances that check whether fields exist.
        """
        return self._exists_aggregations

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
            if field_name not in ("metadata", "tags"):
                result.append((field_name, field))

        if collection.media_type == fom.VIDEO:
            prefix = collection._FRAMES_PREFIX
            frame_schema = collection.get_frame_field_schema()
            for field_name, field in frame_schema.items():
                if field_name not in ("id", "frame_number"):
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

    def _build(self, view):
        F = fo.ViewField
        aggregations = [foa.Count()]
        exists_aggregations = []

        if view.media_type == fom.VIDEO:
            aggregations.extend([foa.Count("frames")])

        aggregations.append(foa.CountValues("tags"))

        def get_exists(path):
            keys = path.split(".")
            if len(keys) > 1:
                keys = keys[0:-1]

            path = ".".join(keys)

            return (
                (F("$%s" % path).type() != "missing") & (F() == None)
            ).if_else(True, None)

        for field_name, field in self.fields(view):
            if _is_label(field):
                path = _expand_labels_path(field_name, field)

                aggregations.append(foa.Count(path))
                label_path = "%s.label" % path
                confidence_path = "%s.confidence" % path
                tags_path = "%s.tags" % path
                aggregations.extend(
                    [
                        foa.CountValues(label_path, _first=200),
                        foa.Bounds(confidence_path),
                        foa.CountValues(tags_path),
                    ]
                )
                exists_aggregations.append(
                    foa.Count(label_path, expr=get_exists(label_path))
                )
                exists_aggregations.append(
                    foa.Count(
                        confidence_path, expr=get_exists(confidence_path)
                    )
                )
            else:
                aggregations.append(foa.Count(field_name))
                exists_aggregations.append(
                    foa.Count(field_name, expr=get_exists(field_name))
                )

                if _meets_type(field, (fof.IntField, fof.FloatField)):
                    aggregations.append(foa.Bounds(field_name))
                elif _meets_type(
                    field,
                    (fof.BooleanField, fof.StringField, fof.ObjectIdField),
                ):
                    aggregations.append(
                        foa.CountValues(field_name, _first=200)
                    )

        return aggregations, exists_aggregations


def _expand_labels_path(root, label_field):
    if issubclass(label_field.document_type, fol._HasLabelList):
        return "%s.%s" % (root, label_field.document_type._LABEL_LIST_FIELD,)

    return root


def _meets_type(field, t):
    return isinstance(field, t) or (
        isinstance(field, fof.ListField) and isinstance(field.field, t)
    )


def _is_label(field):
    return isinstance(field, fof.EmbeddedDocumentField) and issubclass(
        field.document_type, fol.Label
    )
