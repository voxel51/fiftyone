"""
Defines the shared state between the FiftyOne App and SDK.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *
from future.utils import itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import
import logging

from bson import json_util

import eta.core.serial as etas

import fiftyone.core.dataset as fod
import fiftyone.core.view as fov


logger = logging.getLogger(__name__)


class StateDescription(etas.Serializable):
    """A ``StateDescription`` describes the shared state between the FiftyOne
    GUI and the FiftyOne ``fiftyone.core.session.Session``.

    Attributes:
        dataset: (optional) the current ``fiftyone.core.dataset.Dataset``
        selected: (optional) the currently selected samples
        view: (optional) the current view
    """

    def __init__(
        self,
        close=False,
        connected=False,
        dataset=None,
        selected=None,
        view=None,
    ):
        """Creates a StateDescription instance.

        Args:
            close: (optional) whether to close the app
            connected: (optional) whether the session is connected to an app
            dataset: (optional) the current dataset
            selected: (optional) the currently selected samples
            view: (optional) the current view
        """
        self.close = close
        self.connect = connected
        self.dataset = dataset
        self.view = view
        self.selected = selected or []
        self.count = len(dataset) if dataset is not None else 0
        super(StateDescription, self).__init__()

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a ``StateDescription`` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a ``StateDescription``
        """
        close = d.get("close", False)
        connected = d.get("connected", False)

        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.Dataset(dataset.get("name"))

        view_ = d.get("view", None)
        view = None
        if dataset is not None:
            view = fov.DatasetView(dataset)
            if view_ is not None:
                view._pipeline = json_util.loads(view_["view"])

        selected = d.get("selected", [])

        return cls(
            close=close,
            connected=connected,
            dataset=dataset,
            selected=selected,
            view=view,
        )
