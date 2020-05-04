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

import eta.core.serial as etas

import fiftyone.core.dataset as fod


class StateDescription(etas.Serializable):
    """A StateDescription describes the shared state between the FiftyOne GUI
    and the FiftyOne Session.

    Attributes:
        dataset: (optional) the current dataset
        view: (optional) the current view
        pipeline: (optional) the current pipeline (or query)
    """

    def __init__(self, dataset=None, view=None, pipeline=None):
        """Creates a StateDescription instance.

        Args:
            dataset: (optional) the current dataset
            view: (optional) the current view
            pipeline: (optional) the current pipeline (or query)
        """
        self.dataset = dataset
        self.view = view
        self.pipeline = pipeline or []

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a StateDescription from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a StateDescription
        """
        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.Dataset(dataset)

        view = d.get("view", None)

        pipeline = d.get("pipeline", None)

        return cls(dataset=dataset, view=view, pipeline=pipeline)
