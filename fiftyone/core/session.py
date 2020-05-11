"""
Session class for the FiftyOne app.

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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import fiftyone.core.client as foc
import fiftyone.core.service as fos
from fiftyone.core.state import StateDescription


# Global session singleton
session = None


def launch_dashboard(dataset=None, view=None):
    """Luanches the FiftyOne dashboard.

    Args:
        dataset (None): an optionl :class:`fiftyone.core.dataset.Dataset` to
            load
        view (None): an optionl :class:`fiftyone.core.view.DatasetView` to
            load

    Returns:
        a :class:`Session`
    """
    global session  # pylint: disable=global-statement
    session = Session()
    session.dataset = dataset
    session.view = view
    return session


def _update_state(func):
    def wrapper(self, *args, **kwargs):
        result = func(self, *args, **kwargs)
        self._update_state()
        return result

    return wrapper


class Session(foc.HasClient):
    """Session class that maintains a 1-1 shared state with the FiftyOne app.

    Args:
        dataset (None): an optionl :class:`fiftyone.core.dataset.Dataset` to
            load
        view (None): an optionl :class:`fiftyone.core.view.DatasetView` to
            load
    """

    _HC_NAMESPACE = "state"
    _HC_ATTR_NAME = "state"
    _HC_ATTR_TYPE = StateDescription

    def __init__(self, dataset=None, view=None):
        if session is not None:
            raise ValueError("Only one session is permitted")

        self._app_service = fos.AppService()
        self._dataset = None
        self._view = None

        super(Session, self).__init__()

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
    def dataset(self):
        """The :class:`fiftyone.core.dataset.Dataset` connected to the session.
        """
        if self.view is not None:
            return self.view._dataset

        return self._dataset

    @property
    def view(self):
        """The :class:`fiftyone.core.view.DatasetView` connected to the
        session, or ``None`` if no view is connected.
        """
        return self._view

    @property
    def selected(self):
        """A list of sample IDs of the currently selected samples in the
        FiftyOne app.
        """
        return list(self.state.selected)

    # SETTERS #################################################################

    @dataset.setter
    @_update_state
    def dataset(self, dataset):
        self._dataset = dataset
        self.state.selected = []

    @view.setter
    @_update_state
    def view(self, view):
        self._view = view
        if view is not None:
            self._dataset = self._view._dataset
        else:
            self._view = None

        self.state.selected = []

    # CLEAR STATE #############################################################

    @_update_state
    def clear_dataset(self):
        """Clears the current :class:`fiftyone.core.dataset.Dataset` from the
        session, if any.
        """
        self._dataset = None
        self._view = None

    @_update_state
    def clear_view(self):
        """Clears the current :class:`fiftyone.core.view.DatasetView` from the
        session, if any.
        """
        self._view = None

    # PRIVATE #################################################################

    def _update_state(self):
        self.state = StateDescription(
            dataset=self._dataset,
            view=self._view,
            selected=self.state.selected,
        )
