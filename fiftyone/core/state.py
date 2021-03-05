"""
Defines the shared state between the FiftyOne App and backend.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import eta.core.serial as etas

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
        close (False): whether to close the App
        connected (False): whether the session is connected to an App
        dataset (None): the current :class:`fiftyone.core.dataset.Dataset`
        selected (None): the list of currently selected samples
        selected_labels (None): the list of currently selected labels
        view (None): the current :class:`fiftyone.core.view.DatasetView`
        config (None): an optional :class:`fiftyone.core.config.AppConfig`
        refresh (False): a boolean toggle for forcing an App refresh
    """

    def __init__(
        self,
        active_handle=None,
        close=False,
        connected=False,
        dataset=None,
        datasets=None,
        selected=None,
        selected_labels=None,
        view=None,
        filters={},
        config=None,
        refresh=False,
    ):
        self.config = config or fo.app_config.copy()
        self.close = close
        self.connect = connected
        self.dataset = dataset
        self.view = view
        self.selected = selected or []
        self.selected_labels = selected_labels or []
        self.filters = filters
        self.datasets = datasets or fod.list_datasets()
        self.active_handle = active_handle
        self.refresh = refresh
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
    def from_dict(cls, d, with_config=None, **kwargs):
        """Constructs a :class:`StateDescription` from a JSON dictionary.

        Args:
            d: a JSON dictionary
            with_config: an existing app config to attach and apply settings to

        Returns:
            :class:`StateDescription`
        """
        config = with_config or fo.app_config.copy()
        foc._set_settings(config, d.get("config", {}))

        active_handle = d.get("active_handle", None)
        close = d.get("close", False)
        connected = d.get("connected", False)
        filters = d.get("filters", {})
        selected = d.get("selected", [])
        selected_labels = d.get("selected_labels", [])
        refresh = d.get("refresh", False)

        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.load_dataset(dataset.get("name"))

        stages = d.get("view", None)
        if dataset is not None and stages:
            view = fov.DatasetView._build(dataset, stages)
        else:
            view = None

        return cls(
            active_handle=active_handle,
            config=config,
            close=close,
            connected=connected,
            dataset=dataset,
            selected=selected,
            selected_labels=selected_labels,
            view=view,
            filters=filters,
            refresh=refresh,
            **kwargs
        )


class DatasetStatistics(object):
    """Encapsulates the aggregation statistics required by the App's dataset
    view.
    """

    def __init__(self, view):
        schemas = [("", view.get_field_schema())]
        aggregations = [foa.Count()]
        if view.media_type == fom.VIDEO:
            schemas.append(
                (view._FRAMES_PREFIX, view.get_frame_field_schema())
            )
            aggregations.extend([foa.Count("frames")])

        default_fields = fosa.get_default_sample_fields()
        aggregations.append(foa.CountValues("tags"))
        is_none = (~(fo.ViewField().exists())).if_else(True, None)
        none_aggregations = []
        for prefix, schema in schemas:
            for field_name, field in schema.items():
                if field_name in default_fields or (
                    prefix == view._FRAMES_PREFIX
                    and field_name == "frame_number"
                ):
                    continue

                field_name = prefix + field_name
                if _is_label(field):
                    path = field_name
                    if issubclass(field.document_type, fol._HasLabelList):
                        path = "%s.%s" % (
                            path,
                            field.document_type._LABEL_LIST_FIELD,
                        )

                    aggregations.append(foa.Count(path))
                    label_path = "%s.label" % path
                    confidence_path = "%s.confidence" % path
                    aggregations.extend(
                        [
                            foa.Distinct(label_path),
                            foa.Bounds(confidence_path),
                        ]
                    )
                    none_aggregations.append(
                        foa.Count(label_path, expr=is_none)
                    )
                    none_aggregations.append(
                        foa.Count(confidence_path, expr=is_none)
                    )
                else:
                    aggregations.append(foa.Count(field_name))
                    aggregations.append(foa.Count(field_name))
                    none_aggregations.append(
                        foa.Count(field_name, expr=is_none)
                    )

                    if _meets_type(field, (fof.IntField, fof.FloatField)):
                        aggregations.append(foa.Bounds(field_name))
                    elif _meets_type(field, fof.StringField):
                        aggregations.append(foa.Distinct(field_name))

        self._aggregations = aggregations + none_aggregations
        self._none_len = len(none_aggregations)

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
