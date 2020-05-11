"""
Session class for interacting with the FiftyOne Dashboard.

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

import atexit
import signal

import fiftyone.core.client as foc
import fiftyone.core.service as fos
from fiftyone.core.state import StateDescription
import fiftyone.core.view as fov


# Global session singleton
session = None


def launch_dashboard(dataset=None, view=None):
    """Launches the FiftyOne Dashboard.

    Only one dashboard instance can be opened at a time. If this method is
    called when another dashboard exists, the existing dashboard is closed.

    Args:
        dataset (None): an optionl :class:`fiftyone.core.dataset.Dataset` to
            load
        view (None): an optionl :class:`fiftyone.core.view.DatasetView` to
            load

    Returns:
        a :class:`Session`
    """
    global session  # pylint: disable=global-statement

    #
    # Note, we always `close_dashboard()` here rather than just calling
    # `session.open()` if a session already exists, because the app may have
    # been closed in some way other than `session.close()` --- e.g., the user
    # closing the GUI --- in which case the underlying Electron process may
    # still exist; in this case, `session.open()` does not seem to reopen the
    # app
    #
    # @todo this can probably be improved
    #
    close_dashboard()

    session = Session(dataset=dataset, view=view)

    # Ensure that the session (and therefore the app) is closed whenever the
    # Python process exits
    _close_on_exit(session)

    return session


def close_dashboard():
    """Closes the FiftyOne Dashboard, if necessary.

    If no dashboard is currently open, this method has no effect.
    """
    global session  # pylint: disable=global-statement

    if session is not None:
        session.close()


def _update_state(func):
    def wrapper(self, *args, **kwargs):
        result = func(self, *args, **kwargs)
        self._update_state()
        return result

    return wrapper


class Session(foc.HasClient):
    """Session that maintains a 1-1 shared state with the FiftyOne Dashboard.

    **Basic Usage**

    -   Use :func:`launch_dashboard` to launch the dashboard and retrieve its
        corresponding :class:`Session` instance.

    -   To open a dataset in the dashboard, simply set the
        :attr:`Session.dataset` property of the session to your
        :class:`fiftyone.core.dataset.Dataset`.

    -   To load a specific view into your dataset, simply set the
        :attr:`Session.view` property of the session to your
        :class:`fiftyone.core.view.DatasetView`.

    -   Use :attr:`Session.selected` to retrieve the IDs of the currently
        selected samples in the dashboard.

    -   Use :func:`Session.close` and :func:`Session.open` to temporarily close
        and reopen the dashboard without creating a new :class:`Session`
        instance.

    -   Use :func:`close_dashboard` to programmatically close the dashboard and
        teriminate the session.

    Note that only one session instance can exist at any time.

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
        self._close = False
        self._dataset = None
        self._view = None

        super(Session, self).__init__()

        if view is not None:
            self.view = view
        elif dataset is not None:
            self.dataset = dataset

    def open(self):
        """Opens the session.

        This opens the FiftyOne Dashboard, if necessary.
        """
        self._app_service.start()

    def close(self):
        """Closes the session.

        This terminates the FiftyOne Dashboard, if necessary.
        """
        self._close = True
        self._update_state()
        self._app_service.stop()

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
        self._view = None
        self.state.selected = []

    @view.setter
    @_update_state
    def view(self, view):
        self._view = view
        if view is not None:
            self._dataset = self._view._dataset

        self.state.selected = []

    # CLEAR STATE #############################################################

    @_update_state
    def clear_dataset(self):
        """Clears the current :class:`fiftyone.core.dataset.Dataset` from the
        session, if any.
        """
        self.dataset = None

    @_update_state
    def clear_view(self):
        """Clears the current :class:`fiftyone.core.view.DatasetView` from the
        session, if any.
        """
        self.view = None

    # PRIVATE #################################################################

    def _update_state(self):
        # pylint: disable=attribute-defined-outside-init
        self.state = StateDescription(
            close=self._close,
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


def _close_on_exit(session):
    def handle_exit():
        try:
            session.close()
        except:
            pass

    atexit.register(handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)
    signal.signal(signal.SIGINT, handle_exit)
