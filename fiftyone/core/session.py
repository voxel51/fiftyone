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
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import
import fiftyone.core.client as foc
import fiftyone.core.service as fos
from fiftyone.core.state import StateDescription
import fiftyone.core.view as fov

# global session singleton
session = None


def launch_dashboard(dataset=None, view=None):
    """Luanches the FiftyOne App.

    Args:
        dataset: (optional) the dataset
        view: (optional) the view

    Returns:
        a Session instance
    """
    global session
    session = Session()
    session.dataset = dataset
    session.view = view
    return session


def update_state(func):
    """Update state descorator.

    Args:
        func: the Session method to decorate

    Returns:
        the wrapped function
    """

    def wrapper(self, *args, **kwargs):
        result = func(self, *args, **kwargs)
        self._update_state()
        return result

    return wrapper


class Session(foc.HasClient):
    """Sessions have a 1-to-1 shared state with the GUI."""

    _HC_NAMESPACE = "state"
    _HC_ATTR_NAME = "state"
    _HC_ATTR_TYPE = StateDescription

    DEFAULT_OFFSET = 0
    DEFAULT_LIMIT = 10

    def __init__(
        self,
        offset=DEFAULT_OFFSET,
        limit=DEFAULT_LIMIT,
        dataset=None,
        view=None,
    ):
        if session is not None:
            raise ValueError("Only one session is permitted")
        self._server_service = fos.ServerService()
        self._app_service = fos.AppService()
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
    def selected(self):
        return list(self.state.selected)

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
        self.state.selected = []

    @view.setter
    @update_state
    def view(self, view):
        self._view = view
        if view is not None:
            self._dataset = self._view.dataset
        else:
            self._view = None
        self.state.selected = []

    # CLEAR STATE #############################################################

    @update_state
    def clear_offset(self):
        self._offset = self.DEFAULT_OFFSET

    @update_state
    def clear_limit(self):
        self._limit = self.DEFAULT_LIMIT

    @update_state
    def clear_dataset(self):
        self._dataset = None

    @update_state
    def clear_view(self):
        self._view = None

    # PRIVATE #################################################################

    def _update_state(self):
        self.state = StateDescription(
            dataset=self._dataset,
            view=self._view,
            selected=self.state.selected,
        )

    def _compute_count(self):
        dataset_or_view = self.view if self.view else self.dataset
        if dataset_or_view:
            return len(dataset_or_view)
        return 0

    def _compute_samples(self):
        if not self.dataset:
            return {}

        view = (
            self.view if self.view else fov.DatasetView(dataset=self.dataset)
        )

        view = view.offset(self.offset).take(self.limit)

        return {
            idx: sample.get_backing_doc_dict(extended=True)
            for idx, sample in view.iter_samples_with_index()
        }
