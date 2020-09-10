"""
Session class for interacting with the FiftyOne App.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import logging
import time

import fiftyone.core.client as foc
import fiftyone.core.service as fos
from fiftyone.core.state import StateDescription


logger = logging.getLogger(__name__)

#
# Session globals
#
# _session is the proxy `Session` for `launch_app()` and `close_app()` calls
# _server_services maintains active servers
# _subscribed_sessions maintains sessions subscribed to an active server
#
# Both maps use port as the key, so the main python process is always aware
# of what servers can be killed
#
# Note that a server process is killed via deletion of its
# `fiftyone.core.service.ServerService` instance
#
_session = None
_server_services = {}
_subscribed_sessions = defaultdict(set)


def launch_app(dataset=None, view=None, port=5151, remote=False):
    """Launches the FiftyOne App.

    Only one app instance can be opened at a time. If this method is
    called when another app exists, the existing app is closed.

    Args:
        dataset (None): an optional :class:`fiftyone.core.dataset.Dataset` to
            load
        view (None): an optional :class:`fiftyone.core.view.DatasetView` to
            load
        port (5151): the port number of the server
        remote (False): whether this is a remote session

    Returns:
        a :class:`Session`
    """
    global _session  # pylint: disable=global-statement
    #
    # Note, we always `close_app()` here rather than just calling
    # `session.open()` if a session already exists, because the app may have
    # been closed in some way other than `session.close()` --- e.g., the user
    # closing the GUI --- in which case the underlying Electron process may
    # still exist; in this case, `session.open()` does not seem to reopen the
    # app
    #
    # @todo this can probably be improved
    #
    close_app()

    _session = Session(dataset=dataset, view=view, port=port, remote=remote)

    return _session


def close_app():
    """Closes the FiftyOne App, if necessary.
    If no app is currently open, this method has no effect.
    """
    global _session  # pylint: disable=global-statement
    if _session is not None:
        _session.close()
        _session = None


def _update_state(func):
    def wrapper(self, *args, **kwargs):
        result = func(self, *args, **kwargs)
        self._update_state()
        return result

    return wrapper


class Session(foc.HasClient):
    """Session that maintains a 1-1 shared state with the FiftyOne App.

    **Basic Usage**

    -   Use :func:`launch_app` to launch the app and retrieve its
        corresponding :class:`Session` instance.

    -   To open a dataset in the app, simply set the
        :attr:`Session.dataset` property of the session to your
        :class:`fiftyone.core.dataset.Dataset`.

    -   To load a specific view into your dataset, simply set the
        :attr:`Session.view` property of the session to your
        :class:`fiftyone.core.view.DatasetView`.

    -   Use :meth:`Session.refresh` to refresh the App if you update a dataset
        outside of the App

    -   Use :attr:`Session.selected` to retrieve the IDs of the currently
        selected samples in the app.

    -   Use :func:`Session.close` and :func:`Session.open` to temporarily close
        and reopen the app without creating a new :class:`Session`
        instance.

    -   Use :func:`close_app` to programmatically close the app and
        terminate the session.

    Note that only one session instance can exist at any time.

    Args:
        dataset (None): an optional :class:`fiftyone.core.dataset.Dataset` to
            load
        view (None): an optional :class:`fiftyone.core.view.DatasetView` to
            load
        port (5151): the port to use to connect the FiftyOne App
        remote (False): whether this is a remote session. Remote sessions do
            not launch the FiftyOne App
    """

    _HC_NAMESPACE = "state"
    _HC_ATTR_NAME = "state"
    _HC_ATTR_TYPE = StateDescription

    def __init__(self, dataset=None, view=None, port=5151, remote=False):
        self._port = port
        self._remote = remote
        # maintain a reference to prevent garbage collection
        self._get_time = time.perf_counter
        self._WAIT_INSTRUCTIONS = _WAIT_INSTRUCTIONS
        self._disable_wait_warning = False

        global _server_services  # pylint: disable=global-statement
        if port not in _server_services:
            _server_services[port] = fos.ServerService(port)

        global _subscribed_sessions  # pylint: disable=global-statement
        _subscribed_sessions[port].add(self)

        super().__init__(self._port)

        if view is not None:
            self.view = view
        elif dataset is not None:
            self.dataset = dataset

        if not self._remote:
            self._app_service = fos.AppService(server_port=port)
            logger.info("App launched")
        else:
            logger.info(
                _REMOTE_INSTRUCTIONS.strip()
                % (self.server_port, self.server_port, self.server_port)
            )
        self._start_time = self._get_time()

    def __del__(self):
        """Deletes the Session by removing it from the `_subscribed_sessions`
        global and deleting (stopping) the associated
        :class:`fiftyone.core.service.ServerService` if no other sessions are
        subscribed.
        """
        try:
            if (
                not self._disable_wait_warning
                and self._get_time() - self._start_time < 2.5
            ):
                # logger may already have been garbage-collected
                print(self._WAIT_INSTRUCTIONS)

            global _subscribed_sessions  # pylint: disable=global-statement
            _subscribed_sessions[self._port].discard(self)

            if len(_subscribed_sessions[self._port]) == 0:
                global _server_services  # pylint: disable=global-statement
                if self._port in _server_services:
                    service = _server_services.pop(self._port)
                    service.stop()
        except:
            # e.g. globals were already garbage-collected
            pass

    @property
    def dataset(self):
        """The :class:`fiftyone.core.dataset.Dataset` connected to the session.
        """
        if self.state.view is not None:
            return self.state.view._dataset

        return self.state.dataset

    @dataset.setter
    @_update_state
    def dataset(self, dataset):
        self.state.dataset = dataset
        self.state.view = None
        self.state.selected = []

    @_update_state
    def clear_dataset(self):
        """Clears the current :class:`fiftyone.core.dataset.Dataset` from the
        session, if any.
        """
        self.state.dataset = None

    @property
    def server_port(self):
        """Getter for the port number of the session.
        """
        return self._port

    @property
    def view(self):
        """The :class:`fiftyone.core.view.DatasetView` connected to the
        session, or ``None`` if no view is connected.
        """
        return self.state.view

    @view.setter
    @_update_state
    def view(self, view):
        self.state.view = view
        if view is not None:
            self.state.dataset = self.state.view._dataset

        self.state.selected = []

    @_update_state
    def clear_view(self):
        """Clears the current :class:`fiftyone.core.view.DatasetView` from the
        session, if any.
        """
        self.state.view = None

    @property
    def selected(self):
        """A list of sample IDs of the currently selected samples in the
        FiftyOne App.
        """
        return list(self.state.selected)

    @_update_state
    def refresh(self):
        """Refreshes the FiftyOne App, reloading the current dataset/view."""
        # @todo achieve same behavoir as if CTRL + R were pressed in the App
        pass

    def open(self):
        """Opens the session.

        This opens the FiftyOne App, if necessary.
        """
        if self._remote:
            raise ValueError("Remote sessions cannot launch the FiftyOne App")

        self._app_service.start()

    def close(self):
        """Closes the session.

        This terminates the FiftyOne App, if necessary.
        """
        if self._remote:
            return

        self.state.close = True
        self._update_state()

    def wait(self):
        """Waits for the session to be closed by the user.

        For local sessions, this will wait until the app is closed by the user.
        For remote sessions, this will wait until the server shuts down, which
        typically requires interrupting the calling process with Ctrl-C.
        """
        try:
            if self._remote:
                _server_services[self._port].wait()
            else:
                self._app_service.wait()
        except KeyboardInterrupt:
            self._disable_wait_warning = True
            raise

    # PRIVATE #################################################################

    def _update_state(self):
        # see fiftyone.core.client if you would like to understand this
        self.state = self.state


_REMOTE_INSTRUCTIONS = """
You have launched a remote app on port %d. To connect to this app
from another machine, issue the following command:

fiftyone app connect --destination [<username>@]<hostname> --port %d

where `[<username>@]<hostname>` refers to your current machine. Alternatively,
you can manually configure port forwarding on another machine as follows:

ssh -N -L 5151:127.0.0.1:%d [<username>@]<hostname>

and then connect to the app on that machine using either
`fiftyone app connect` or from Python via `fiftyone.launch_app()`.
"""

_WAIT_INSTRUCTIONS = """
A session appears to have terminated shortly after it was started. If you
intended to start an app instance or a remote session from a script, you
should call `session.wait()` to keep the session (and the script) alive.
"""
