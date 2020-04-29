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


def update_state(func):
    def wrapper(self, *args, **kwargs):
        result = func(self, *args, **kwargs)
        self._update_state()
        return result

    return wrapper


# @todo(Tyler) TEMP
# class Session(voxc.HasClient):
class Session:
    """Sessions have a 1-to-1 shared state with the GUI."""

    _HC_NAMESPACE = "state"
    _HC_ATTR_NAME = "state"

    @update_state
    def __init__(self, offset=0, limit=10):
        super(Session, self).__init__()
        self.offset = offset
        self.limit = limit

    @property
    def dataset(self):
        if not hasattr(self, "_dataset"):
            self._dataset = None
        return self._dataset

    @dataset.setter
    @update_state
    def dataset(self, dataset):
        self._dataset = dataset

    @property
    def view(self):
        if not hasattr(self, "_view"):
            self._view = None
        return self._view

    @view.setter
    @update_state
    def view(self, view):
        self._view = view
        self._dataset = self._view.dataset

    @property
    def query(self):
        if not hasattr(self, "_query"):
            self._query = None
        return self._query

    @query.setter
    @update_state
    def query(self, query):
        self._query = query

    @update_state
    def clear_dataset(self):
        self._dataset = None
        self._view = None

    @update_state
    def clear_view(self):
        self._view = None

    @update_state
    def clear_query(self):
        self._query = None

    # def count(self, dataset_or_view=None):
    #     """Count the number of samples returned by this query
    #
    #     Args:
    #         dataset_or_view: the fiftyone.core.dataset.(Dataset or DatasetView)
    #             to be queried
    #     """
    #     pipeline = self._pipeline + [{"$count": "count"}]
    #     result = next(dataset_or_view._c.aggregate(pipeline))["count"]
    #     dataset_or_view.state = {"pipeline": pipeline, "count": result}
    #     return result

    # PRIVATE #################################################################

    def _update_state(self):
        # view takes precedence over dataset if set
        view_or_dataset = self.view if self.view else self.dataset

        if self.query and view_or_dataset:
            count = self.query.count(view_or_dataset)
        elif view_or_dataset:
            count = len(view_or_dataset)
        else:
            count = 0

        self.state = {
            "dataset_name": self.dataset.name if self.dataset else None,
            "view_tag": self.view.tag if self.view else None,
            "query": self.query._pipeline if self.query else None,
            "page": {
                "offset": self.offset,
                "limit": self.limit,
                "count": count,
            },
            "samples": [],
        }
