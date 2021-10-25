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


def build_app_aggregations(view, filters):
    """
    Builds the aggregations required by App components

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: a `dict` defining the current App filters

    Returns:
        a `dict` mapping field paths to aggregation `dict`s
    """
    # @todo optmizie by removing unnecessary extended view aggregations, e.g. Bounds
    aggregations = {"": foa.Count()}
    for path, field in view.get_field_schema().items():
        aggregations.update(_build_field_aggregations(path, field, filters))

    return aggregations


def _build_field_aggregations(path: str, field: fof.Field, filters: dict):
    aggregations = []
    if _meets_type(
        field,
        (fof.DateField, fof.DateTimeField, fof.FloatField, fof.IntField,),
    ):
        aggregations.append(foa.Bounds(path))
    elif _meets_type(field, fof.BooleanField):
        aggregations.append(foa.CountValues(path, _first=3))
    elif _meets_type(field, (fof.StringField, fof.ObjectIdField)):
        aggregations.append(_get_categorical_aggregation(path, filters))

    aggregations.append(fo.Count(path))

    aggregations = {
        path: {
            aggregations.__class__.__name__: aggregation
            for aggregation in aggregations
        }
    }

    if _meets_type(field, fof.EmbeddedDocumentField):
        for subfield_name, subfield in field.get_field_schema().items():
            aggregations.update(
                _build_field_aggregations(
                    ".".join([path, subfield_name]), subfield, filters
                )
            )

    return aggregations


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
