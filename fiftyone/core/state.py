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

import fiftyone.core.aggregations as foa
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
        selected_objects (None): the list of currently selected objects
        view (None): the current :class:`fiftyone.core.view.DatasetView`
    """

    def __init__(
        self,
        active_handle=None,
        close=False,
        connected=False,
        dataset=None,
        datasets=None,
        selected=None,
        selected_objects=None,
        view=None,
        filters={},
    ):
        self.close = close
        self.connect = connected
        self.dataset = dataset
        self.view = view
        self.selected = selected or []
        self.selected_objects = selected_objects or []
        self.filters = filters
        self.datasets = datasets or fod.list_datasets()
        self.active_handle = active_handle
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
        active_handle = d.get("active_handle", None)
        close = d.get("close", False)
        connected = d.get("connected", False)
        filters = d.get("filters", {})
        selected = d.get("selected", [])
        selected_objects = d.get("selected_objects", [])

        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.load_dataset(dataset.get("name"))
        stages = d.get("view", [])
        if dataset is not None and stages:
            view = fov.DatasetView(dataset)
            for stage_dict in stages:
                stage = fos.ViewStage._from_dict(stage_dict)
                view = view.add_stage(stage)
        else:
            view = None
        return cls(
            active_handle=active_handle,
            close=close,
            connected=connected,
            dataset=dataset,
            selected=selected,
            selected_objects=selected_objects,
            view=view,
            filters=filters,
            **kwargs
        )


_IGNORE = ("filepath", "media_type", "metadata", "tags")


class DatasetStatistics(object):
    """Encapsulates the aggregation statistics required by the App's dataset
    view.
    """

    def __init__(self, view):
        schemas = [("", view.get_field_schema())]
        aggregations = [foa.Count()]
        if view.media_type == fom.VIDEO:
            schemas.append(("frames.", view.get_frame_field_schema()))
            aggregations.extend(
                [foa.Count("frames"),]
            )
        aggregations.append(foa.CountValues("tags"))
        for prefix, schema in schemas:
            for field_name, field in schema.items():
                if (
                    field_name in _IGNORE
                    or prefix == "frames."
                    and field_name == "frame_number"
                ):
                    continue

                field_name = prefix + field_name
                aggregations.append(foa.Count(field_name))
                if _is_label(field):
                    aggregations.extend(
                        [
                            foa.DistinctLabels(field_name),
                            foa.ConfidenceBounds(field_name),
                        ]
                    )
                elif _meets_type(field, foa._VALUE_FIELDS):
                    aggregations.append(foa.CountValues(field_name))
                elif _meets_type(field, foa._NUMBER_FIELDS):
                    aggregations.append(foa.Bounds(field_name))

        self._aggregations = aggregations

    @property
    def aggregations(self):
        return self._aggregations


def _meets_type(field, t):
    return isinstance(field, t) or (
        isinstance(field, fof.ListField) and isinstance(field.field, t)
    )


def _is_label(field):
    return isinstance(field, fof.EmbeddedDocumentField) and issubclass(
        field.document_type, fol.Label
    )
