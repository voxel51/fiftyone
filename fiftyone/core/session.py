"""
Core Module for `fiftyone` Session class

"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import
import fiftyone.core.client as voxc
import fiftyone.core.dataset as voxd


class Session(object):
    def __init__(self, offset=0, limit=10):
        self.offset = offset
        self.limit = limit

    @property
    def dataset(self):
        if not hasattr(self, "_dataset"):
            self._dataset = None
        return self._dataset

    @dataset.setter
    def dataset(self, dataset):
        self._dataset = dataset

    @property
    def view(self):
        if not hasattr(self, "_view"):
            self._view = None
        return self._view

    @view.setter
    def view(self, view):
        self._view = view

    @property
    def query(self):
        if not hasattr(self, "_query"):
            self._query = None
        return self._query

    @query.setter
    def query(self, query):
        self._query = query

    def clear_dataset(self):
        self._dataset = None

    def clear_view(self):
        self._view = None

    def clear_query(self):
        self._query = None
