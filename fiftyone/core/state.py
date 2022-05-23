"""
Defines the shared state between the FiftyOne App and backend.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.utils as fou
import fiftyone.core.view as fov


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
    """

    def __init__(
        self,
        config=None,
        dataset=None,
        selected=None,
        selected_labels=None,
        view=None,
    ):
        self.config = config or fo.app_config.copy()
        self.dataset = dataset
        self.selected = selected or []
        self.selected_labels = selected_labels or []
        self.view = view

    def serialize(self, reflective=False):
        with fou.disable_progress_bars():
            d = super().serialize(reflective=reflective)

            if self.dataset is not None:
                d["dataset"] = self.dataset.name
                if self.view is not None:
                    d["view"] = self.view._serialize()
                    d["view_cls"] = etau.get_class_name(self.view)

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
            dataset = fod.load_dataset(dataset)

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
            selected=d.get("selected", []),
            selected_labels=d.get("selected_labels", []),
            view=view,
        )
