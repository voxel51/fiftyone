"""
Defines the shared state between the FiftyOne App and backend.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import logging

import eta.core.serial as etas
import eta.core.utils as etau
from graphql import subscribe

import fiftyone as fo
import fiftyone.core.dataset as fod
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
    """

    def __init__(
        self,
        config=None,
        dataset=None,
        refresh=False,
        selected=None,
        selected_labels=None,
        view=None,
    ):
        self.config = config or fo.app_config.copy()
        self.dataset = dataset
        self.refresh = refresh
        self.selected = selected or []
        self.selected_labels = selected_labels or []
        self.view = view

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

        config = with_config or fo.app_config.copy()
        for field, value in d.get("config", {}).items():
            setattr(config, field, value)

        timezone = d.get("config", {}).get("timezone", None)
        if timezone:
            fo.config.timezone = timezone

        return cls(
            config=config,
            dataset=dataset,
            refresh=d.get("refresh", False),
            selected=d.get("selected", []),
            selected_labels=d.get("selected_labels", []),
            view=view,
        )
