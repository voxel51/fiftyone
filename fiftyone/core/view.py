"""
Core module that defines the database view.

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


class DatasetView(etas.Serializable):
    """DatasetView docs

    """

    def __init__(self, operations=[], **kwargs):
        self.operations = operations
        super(DatasetView, self).__init__(**kwargs)

    @classmethod
    def from_dict(cls, d):
        """Constructs an DatasetView from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a DatasetView
        """
        operations = d.get("operations", [])
        operations = [DatasetViewOperation.from_dict(o) for o in operations]

        return super(DatasetView, cls).from_dict(d, operations=operations)


class DatasetViewOperation(etas.Serializable):
    """DatasetViewOperation docs

    """

    def __init__(self, **kwargs):
        super(DatasetViewOperation, self).__init__(**kwargs)

    @classmethod
    def from_dict(cls, d):
        """Constructs an DatasetViewOperation from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a DatasetViewOperation
        """
        return super(DatasetViewOperation, cls).from_dict(d)
