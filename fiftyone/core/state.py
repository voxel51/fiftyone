"""
Core module that define shared state between the FiftyOne GUI and FiftyOne SDK.

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

import eta.core.serial as etas

import fiftyone.core.dataset as fod


logger = logging.getLogger(__name__)


class StateDescription(etas.Serializable):
    """A ``StateDescription`` describes the shared state between the FiftyOne
    GUI and the FiftyOne ``fiftyone.core.session.Session``.

    Attributes:
        dataset: (optional) the current ``fiftyone.core.dataset.Dataset``
        selected: (optional) the currently selected samples
        view: (optional) the current view
    """

    def __init__(self, dataset=None, pipeline=None, selected=None, view=None):
        """Creates a StateDescription instance.

        Args:
            dataset: (optional) the current dataset
            selected: (optional) the currently selected samples
            view: (optional) the current view
        """
        self.dataset = dataset
        self.view = view
        self.selected = []
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
        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.Dataset(dataset.get("name"))

        view = d.get("view", None)

        selected = d.get("selected", [])

        return cls(dataset=dataset, selected=selected, view=view,)
