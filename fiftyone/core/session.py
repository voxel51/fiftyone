"""
Session class for interacting with the FiftyOne App.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import fiftyone.core.client as foc
import fiftyone.core.service as fos
from fiftyone.core.state import StateDescription


logger = logging.getLogger(__name__)

# Global session singleton
session = None


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
    global session  # pylint: disable=global-statement
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

    session = Session(dataset=dataset, view=view, port=port, remote=remote)

    return session


def close_app():
    """Closes the FiftyOne App, if necessary.
    If no app is currently open, this method has no effect.
    """
    global session  # pylint: disable=global-statement

    if session is not None:
        session.close()
        session = None


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
        port (5151): the port to use to connect the FiftyOne app.
        remote (False): whether this is a remote session. Remote sessions do
            not launch the FiftyOne app
    """

    _HC_NAMESPACE = "state"
    _HC_ATTR_NAME = "state"
    _HC_ATTR_TYPE = StateDescription

    def __init__(self, dataset=None, view=None, port=5151, remote=False):
        if session is not None:
            raise ValueError("Only one session is permitted")

        self._close = False
        self._dataset = None
        self._view = None
        self._port = port
        self._remote = remote

        super().__init__(self._port)

        if view is not None:
            self.view = view
        elif dataset is not None:
            self.dataset = dataset

        if not self._remote:
            self._app_service = fos.AppService()
            logger.info("App launched")
        else:
            logger.info(
                _REMOTE_INSTRUCTIONS.strip()
                % (self.server_port, self.server_port, self.server_port)
            )

    @property
    def dataset(self):
        """The :class:`fiftyone.core.dataset.Dataset` connected to the session.
        """
        if self.view is not None:
            return self.view._dataset

        return self._dataset

    @dataset.setter
    @_update_state
    def dataset(self, dataset):
        self._dataset = dataset
        self._view = None
        self.state.selected = []

    @_update_state
    def clear_dataset(self):
        """Clears the current :class:`fiftyone.core.dataset.Dataset` from the
        session, if any.
        """
        self.dataset = None

    @property
    def view(self):
        """The :class:`fiftyone.core.view.DatasetView` connected to the
        session, or ``None`` if no view is connected.
        """
        return self._view

    @view.setter
    @_update_state
    def view(self, view):
        self._view = view
        if view is not None:
            self._dataset = self._view._dataset

        self.state.selected = []

    @_update_state
    def clear_view(self):
        """Clears the current :class:`fiftyone.core.view.DatasetView` from the
        session, if any.
        """
        self.view = None

    @property
    def selected(self):
        """A list of sample IDs of the currently selected samples in the
        FiftyOne app.
        """
        return list(self.state.selected)

    def open(self):
        """Opens the session.

        This opens the FiftyOne App, if necessary.
        """
        if self._remote:
            raise ValueError("Remote sessions cannot launch the FiftyOne app")

        self._app_service.start()

    def close(self):
        """Closes the session.

        This terminates the FiftyOne App, if necessary.
        """
        if self._remote:
            return

        self._close = True
        self._update_state()

    def wait(self):
        """Waits for the FiftyOne App to be closed by the user.

        This requires a local (not remote) session.
        """
        if self._remote:
            raise ValueError("Cannot `wait()` for remote sessions to close")

        self._app_service.wait()

    # PRIVATE #################################################################

    def _update_state(self):
        # pylint: disable=attribute-defined-outside-init
        self.state = StateDescription(
            close=self._close,
            dataset=self._dataset,
            view=self._view,
            selected=self.state.selected,
        )


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
