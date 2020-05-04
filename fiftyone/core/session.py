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
import fiftyone.core.client as foc
import fiftyone.core.view as fov


def update_state(func):
    def wrapper(self, *args, **kwargs):
        result = func(self, *args, **kwargs)
        self._update_state()
        return result

    return wrapper


class Session(foc.HasClient):
    """Sessions have a 1-to-1 shared state with the GUI."""

    _HC_NAMESPACE = "state"
    _HC_ATTR_NAME = "state"

    DEFAULT_OFFSET = 0
    DEFAULT_LIMIT = 10

    @update_state
    def __init__(
        self,
        offset=DEFAULT_OFFSET,
        limit=DEFAULT_LIMIT,
        dataset=None,
        view=None,
    ):
        super(Session, self).__init__()
        self._offset = offset
        self._limit = limit
        self._dataset = None
        self._view = None

        if dataset is not None and view is not None:
            assert view.dataset == dataset, (
                "Inconsistent dataset and view: %s != %s"
                % (dataset.name, view.dataset.name)
            )

        if view is not None:
            self._view = view
            self._dataset = self._view.dataset
        elif dataset is not None:
            self._dataset = dataset

    # GETTERS #################################################################

    @property
    def offset(self):
        return self._offset

    @property
    def limit(self):
        return self._limit

    @property
    def dataset(self):
        if self.view is not None:
            return self.view.dataset
        return self._dataset

    @property
    def view(self):
        return self._view

    # SETTERS #################################################################

    @offset.setter
    @update_state
    def offset(self, offset):
        self._offset = offset

    @limit.setter
    @update_state
    def limit(self, limit):
        self._limit = limit

    @dataset.setter
    @update_state
    def dataset(self, dataset):
        self._dataset = dataset

    @view.setter
    @update_state
    def view(self, view):
        self._view = view
        self._dataset = self._view.dataset

    # CLEAR STATE #############################################################

    @update_state
    def clear_offset(self):
        self._offset = self.DEFAULT_OFFSET

    @update_state
    def clear_limit(self):
        self._limit = self.clear_limit

    @update_state
    def clear_dataset(self):
        self._dataset = None
        self._view = None

    @update_state
    def clear_view(self):
        self._view = None

    # PRIVATE #################################################################

    def _update_state(self):
        self.state = {
            "dataset_name": self.dataset.name if self.dataset else None,
            "transform_pipeline": self.view._pipeline if self.view else None,
            "page": {
                "offset": self.offset,
                "limit": self.limit,
                "count": self._compute_count(),
            },
            "samples": self._compute_samples(),
        }

    def _get_dataset_or_view(self):
        # view takes precedence over dataset if set
        return self.view if self.view else self.dataset

    def _compute_count(self):
        dataset_or_view = self._get_dataset_or_view()
        if dataset_or_view:
            return len(dataset_or_view)
        return 0

    def _compute_samples(self):
        if not self.dataset:
            return {}

        if self.view:
            view = self.view
        else:
            view = fov.DatasetView(dataset=self.dataset)

        return {
            view_idx: sample.serialize()
            for view_idx, sample in (
                view.offset(self.offset)
                .limit(self.limit)
                .iter_samples_with_view_index()
            )
        }
