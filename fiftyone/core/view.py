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


import eta.core.data as etad


class DatasetView(etad.DataRecords):
    """DatasetView docs

    """

    _ELE_CLS_FIELD = "_OPERATION_CLS"
    _ELE_ATTR = "operations"

    def __init__(self, **kwargs):
        """Creates the DatasetView"""
        super(DatasetView, self).__init__(DatasetViewOperation, **kwargs)


class DatasetViewOperation(etad.BaseDataRecord):
    """DatasetViewOperation docs

    """

    def __init__(self, **kwargs):
        """Creates the DatasetViewOperation"""
        super(DatasetViewOperation, self).__init__(**kwargs)
