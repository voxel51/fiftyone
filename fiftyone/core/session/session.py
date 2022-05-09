"""
Session class for interacting with the FiftyOne App

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from dataclasses import dataclass
from functools import wraps
import logging
import time
import typing as t
import webbrowser

try:
    import IPython
    import IPython.display
except:
    pass

import fiftyone as fo
import fiftyone.constants as focn
import fiftyone.core.dataset as fod
from fiftyone.core.config import AppConfig
import fiftyone.core.context as focx
import fiftyone.core.plots as fop
import fiftyone.core.service as fos
import fiftyone.core.utils as fou
import fiftyone.core.view as fov
from fiftyone.core.state import StateDescription

from .client import Client


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

_APP_DESKTOP_MESSAGE = """
Desktop App launched.
"""

_APP_WEB_MESSAGE = """
App launched. Point your web browser to http://localhost:{0}
"""

_APP_NOTEBOOK_MESSAGE = """
Session launched. Run `session.show()` to open the App in a cell output.
"""

_REMOTE_INSTRUCTIONS = """
You have launched a remote App on port {0}. To connect to this App from another
machine, issue the following command to configure port forwarding:

ssh -N -L 5151:127.0.0.1:{0} [<username>@]<hostname>

where `[<username>@]<hostname>` refers to your current machine. The App can
then be viewed in your browser at http://localhost:5151.

Alternatively, if you have FiftyOne installed on your local machine, just run:

fiftyone app connect --destination [<username>@]<hostname> --port {0}

See https://voxel51.com/docs/fiftyone/user_guide/app.html#remote-sessions
for more information about remote sessions.
"""

_WAIT_INSTRUCTIONS = """
A session appears to have terminated shortly after it was started. If you
intended to start an App instance or a remote session from a script, you should
call `session.wait()` to keep the session (and the script) alive.
"""


def launch_app(
    dataset: fod.Dataset = None,
    view: fov.DatasetView = None,
    port: int = None,
    address: str = None,
    remote: bool = False,
    desktop: bool = None,
    height: int = None,
    auto: bool = True,
    config: AppConfig = None,
) -> "Session":
    """Launches the FiftyOne App.

    Note that only one App instance can be opened at a time. If this method is
    called when another App exists, the existing App will be closed.

    Args:
        dataset (None): an optional :class:`fiftyone.core.dataset.Dataset` or
            :class:`fiftyone.core.view.DatasetView` to load
        view (None): an optional :class:`fiftyone.core.view.DatasetView` to
            load
        port (None): the port number to serve the App. If None,
            ``fiftyone.config.default_app_port`` is used
        address (None): the address to serve the App. If None,
            ``fiftyone.config.default_app_address`` is used
        remote (False): whether this is a remote session, and opening the App
            should not be attempted
        desktop (None): whether to launch the App in the browser (False) or as
            a desktop App (True). If None, ``fiftyone.config.desktop_app`` is
            used. Not applicable to notebook contexts
        height (None): an optional height, in pixels, at which to render App
            instances in notebook cells. Only applicable in notebook contexts
        auto (True): whether to automatically show a new App window
            whenever the state of the session is updated. Only applicable
            in notebook contexts
        config (None): an optional :class:`fiftyone.core.config.AppConfig` to
            control fine-grained default App settings

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

    _session = Session(
        dataset=dataset,
        view=view,
        port=port,
        address=address,
        remote=remote,
        desktop=desktop,
        height=height,
        auto=auto,
        config=config,
    )

    if _session.remote:
        logger.info(_REMOTE_INSTRUCTIONS.strip().format(_session.server_port))
    elif _session.desktop:
        logger.info(_APP_DESKTOP_MESSAGE.strip())
    elif focx._get_context() != focx._NONE:
        if not auto:
            logger.info(_APP_NOTEBOOK_MESSAGE.strip())
    else:
        logger.info(_APP_WEB_MESSAGE.strip().format(_session.server_port))

    return _session


def close_app() -> None:
    """Closes the FiftyOne App, if necessary.

    If no App is currently open, this method has no effect.
    """
    global _session  # pylint: disable=global-statement
    if _session is not None:
        _session.close()
        _session = None


def _update_state(auto_show: bool = False) -> t.Callable:
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            result = func(self, *args, **kwargs)
            if auto_show:
                self._auto_show()

            self._update_state()
            return result

        return wrapper

    return decorator


@dataclass
class NotebookCell:
    subscription: str
    active: bool
    handle: IPython.display.DisplayHandle


class Session(object):
    """Session that maintains a 1-1 shared state with the FiftyOne App.

    **Basic Usage**

    -   Use :func:`launch_app` to launch the App and retrieve its
        corresponding :class:`Session` instance.

    -   To open a dataset in the App, simply set the
        :attr:`Session.dataset` property of the session to your
        :class:`fiftyone.core.dataset.Dataset`.

    -   To load a specific view into your dataset, simply set the
        :attr:`Session.view` property of the session to your
        :class:`fiftyone.core.view.DatasetView`.

    -   To attach/remove interactive plots, use the methods exposed on the
        :attr:`Session.plots` property of the session.

    -   Use :meth:`Session.refresh` to refresh the App if you update a dataset
        outside of the App

    -   Use :attr:`Session.selected` to retrieve the IDs of the currently
        selected samples in the App.

    -   Use :attr:`Session.selected_labels` to retrieve the IDs of the
        currently selected labels in the App.

    -   In notebook contexts, use :func:`Session.freeze` to replace the App and
        any attached plots with static images.

    -   Use :func:`Session.close` and :func:`Session.open` to temporarily close
        and reopen the App without creating a new :class:`Session`
        instance.

    -   Use :func:`close_app` to programmatically close the App and
        terminate the session.

    Args:
        dataset (None): an optional :class:`fiftyone.core.dataset.Dataset` or
            :class:`fiftyone.core.view.DatasetView` to load
        view (None): an optional :class:`fiftyone.core.view.DatasetView` to
            load
        plots (None): an optional
            :class:`fiftyone.core.plots.manager.PlotManager` to connect to this
            session
        port (None): the port number to serve the App. If None,
            ``fiftyone.config.default_app_port`` is used
        address (None): the address to serve the App. If None,
            ``fiftyone.config.default_app_address`` is used
        remote (False): whether this is a remote session, and opening the App
            should not be attempted
        desktop (None): whether to launch the App in the browser (False) or as
            a desktop App (True). If None, ``fiftyone.config.desktop_app`` is
            used. Not applicable to notebook contexts (e.g., Jupyter and Colab)
        height (None): an optional height, in pixels, at which to render App
            instances in notebook cells. Only applicable in notebook contexts
        auto (True): whether to automatically show a new App window
            whenever the state of the session is updated. Only applicable
            in notebook contexts
        config (None): an optional :class:`fiftyone.core.config.AppConfig` to
            control fine-grained default App settings
    """

    def __init__(
        self,
        dataset: fod.Dataset = None,
        view: fov.DatasetView = None,
        plots: fop.PlotManager = None,
        port: int = None,
        address: str = None,
        remote: bool = False,
        desktop: bool = None,
        height: int = None,
        auto: bool = True,
        config: AppConfig = None,
    ) -> None:
        # Allow `dataset` to be a view
        if isinstance(dataset, fov.DatasetView):
            view = dataset
            dataset = dataset._root_dataset

        self._validate(dataset, view, plots, config)

        if port is None:
            port = fo.config.default_app_port

        if address is None:
            address = fo.config.default_app_address

        if config is None:
            config = fo.app_config.copy()

        if height is not None:
            config.notebook_height = height

        state = StateDescription
        state.config = config

        self._context = focx._get_context()
        self._plots = None
        self._remote = remote
        self._wait_closed = False
        self._client = Client(address, port)

        # Maintain a reference to prevent garbage collection
        self._get_time = time.perf_counter

        self._WAIT_INSTRUCTIONS = _WAIT_INSTRUCTIONS
        self._disable_wait_warning = False
        self._auto = auto
        self._handles: t.Dict[str, NotebookCell] = {}

        global _server_services  # pylint: disable=global-statement
        if port not in _server_services:
            _server_services[port] = fos.ServerService(
                port, address=address, do_not_track=fo.config.do_not_track
            )

        global _subscribed_sessions  # pylint: disable=global-statement
        _subscribed_sessions[port].add(self)

        if desktop is None:
            if self._context == focx._NONE:
                desktop = fo.config.desktop_app
            else:
                desktop = False

        self._desktop = desktop
        self._start_time = self._get_time()

        if view is not None:
            state.view = view
            state.dataset = view._root_dataset
        elif dataset is not None:
            state.dataset = dataset

        if state.dataset is not None:
            state.dataset._reload()

        state.datasets = fod.list_datasets()
        state.active_handle = self._auto_show(height=config.notebook_height)

        self.plots = plots
        self.state = state

        if self._remote:
            if self._context != focx._NONE:
                raise ValueError(
                    "Remote sessions cannot be run from a notebook"
                )

            return

        if self._desktop:
            if (
                self._context == focx._COLAB
                or self._context == focx._DATABRICKS
            ):
                raise ValueError(
                    "Cannot open a Desktop App instance from a %s notebook"
                    % self._context
                )

            if not focn.DEV_INSTALL:
                _import_desktop()

            self._app_service = fos.AppService(
                server_port=port, server_address=address
            )
            return

        if self._context == focx._NONE:
            self.open()
            return

    def _validate(
        self,
        dataset: t.Optional[fod.Dataset],
        view: t.Optional[fov.DatasetView],
        plots: t.Optional[fop.PlotManager],
        config: t.Optional[AppConfig],
    ) -> None:
        if dataset is not None and not isinstance(dataset, fod.Dataset):
            raise ValueError(
                "`dataset` must be a %s or None; found %s"
                % (fod.Dataset, type(dataset))
            )

        if view is not None and not isinstance(view, fov.DatasetView):
            raise ValueError(
                "`view` must be a %s or None; found %s"
                % (fov.DatasetView, type(view))
            )

        if plots is not None and not isinstance(plots, fop.PlotManager):
            raise ValueError(
                "`plots` must be a %s or None; found %s"
                % (fop.PlotManager, type(plots))
            )

        if config is not None and not isinstance(config, AppConfig):
            raise ValueError(
                "`config` must be a %s or None; found %s"
                % (AppConfig, type(config))
            )

    def __repr__(self) -> str:
        return self.summary()

    def __del__(self) -> None:
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
        d = getattr(super(), "__del__", None)
        d and d()

    @property
    def server_port(self) -> int:
        """The server port for the session."""
        return self._port

    @property
    def server_address(self) -> str:
        """The server address for the session, or None if not specified."""
        return self._client.address

    @property
    def remote(self) -> bool:
        """Whether the session is remote."""
        return self._remote

    @property
    def desktop(self) -> bool:
        """Whether the session is connected to a desktop App."""
        return self._desktop

    @property
    def url(self) -> str:
        """The URL of the session."""
        if self._context == focx._COLAB:
            # pylint: disable=no-name-in-module,import-error
            from google.colab.output import eval_js

            return eval_js(
                "google.colab.kernel.proxyPort(%d)" % self.server_port
            )

        if self._context == focx._DATABRICKS:
            return f"{_get_databricks_proxy_url(self.server_port)}"

        address = self.server_address or "localhost"
        return "http://%s:%d/" % (address, self.server_port)

    @property
    def config(self) -> AppConfig:
        """The current :class:`fiftyone.core.config.AppConfig`.

        For changes to a session's config to take effect in the App,
        a call to :meth:`Session.refresh` or another state-updating action
        such as `session.view = my_view` must occur.

        Example usage::

            import fiftyone as fo

            dataset, session = fo.quickstart()

            # change the show confidence setting and push the change to the App
            session.config.show_confidence = False
            session.refresh()
        """
        return self.state.config

    @config.setter
    def config(self, config: t.Optional[AppConfig]) -> None:
        if config is None:
            config = fo.app_config.copy()

        if not isinstance(config, AppConfig):
            raise ValueError(
                "`Session.config` must be a %s or None; found %s"
                % (AppConfig, type(config))
            )

        self.state.config = config

    @property
    def _collection(self) -> t.Union[fod.Dataset, fov.DatasetView, None]:
        if self.view is not None:
            return self.view

        return self.dataset

    @property
    def dataset(self) -> t.Union[fod.Dataset, None]:
        """The :class:`fiftyone.core.dataset.Dataset` connected to the session."""
        return self.state.dataset

    @dataset.setter
    @_update_state(auto_show=True)
    def dataset(self, dataset):
        if dataset is not None and not isinstance(dataset, fod.Dataset):
            raise ValueError(
                "`Session.dataset` must be a %s or None; found %s"
                % (fod.Dataset, type(dataset))
            )

        if dataset is not None:
            dataset._reload()

        self.state.dataset = dataset
        self.state.view = None
        self.state.selected = []
        self.state.selected_labels = []
        self.state.filters = {}

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
        return self.state.view

    @view.setter
    @_update_state(auto_show=True)
    def view(self, view):
        if view is not None and not isinstance(view, fov.DatasetView):
            raise ValueError(
                "`Session.view` must be a %s or None; found %s"
                % (fov.DatasetView, type(view))
            )

        self.state.view = view

        if view is not None:
            self.state.dataset = self.state.view._root_dataset
            self.state.dataset._reload()

        self.state.selected = []
        self.state.selected_labels = []
        self.state.filters = {}

    def clear_view(self):
        """Clears the current :class:`fiftyone.core.view.DatasetView` from the
        session, if any.
        """
        self.view = None

    @property
    def has_plots(self):
        """Whether this session has any attached plots."""
        return bool(self._plots)

    @property
    def plots(self):
        """The :class:`fiftyone.core.plots.manager.PlotManager` instance that
        manages plots attached to this session.
        """
        return self._plots

    @plots.setter
    def plots(self, plots):
        if plots is not None and not isinstance(plots, fop.PlotManager):
            raise ValueError(
                "`Session.plots` must be a %s or None; found %s"
                % (fop.PlotManager, type(plots))
            )

        if plots is None:
            plots = fop.PlotManager(self)
        else:
            plots._set_session(self)

        self._plots = plots

    @_update_state()
    def refresh(self):
        """Refreshes the current App window."""
        self.state.refresh = not self.state.refresh

    @property
    def selected(self):
        """A list of sample IDs of the currently selected samples in the App,
        if any.
        """
        return list(self.state.selected)

    @selected.setter
    @_update_state()
    def selected(self, sample_ids):
        self.state.selected = list(sample_ids) if sample_ids else []

    @_update_state()
    def clear_selected(self):
        """Clears the currently selected samples, if any."""
        self.state.selected = []

    @_update_state()
    def select_samples(self, ids=None, tags=None):
        """Selects the specified samples in the current view in the App,

        Args:
            ids (None): an ID or iterable of IDs of samples to select
            tags (None): a tag or iterable of tags of samples to select
        """
        if tags is not None:
            ids = self._collection.match_tags(tags).values("id")

        if ids is None:
            ids = []

        self.state.selected = list(ids)

    @property
    def selected_labels(self):
        """A list of labels currently selected in the App.

        Items are dictionaries with the following keys:

        -   ``label_id``: the ID of the label
        -   ``sample_id``: the ID of the sample containing the label
        -   ``field``: the field name containing the label
        -   ``frame_number``: the frame number containing the label (only
            applicable to video samples)
        """
        return list(self.state.selected_labels)

    @selected_labels.setter
    @_update_state()
    def selected_labels(self, labels):
        self.state.selected_labels = list(labels) if labels else []

    @_update_state()
    def select_labels(self, labels=None, ids=None, tags=None, fields=None):
        """Selects the specified labels in the current view in the App.

        This method uses the same interface as
        :meth:`fiftyone.core.collections.SampleCollection.select_labels` to
        specify the labels to select.

        Args:
            labels (None): a list of dicts specifying the labels to select
            ids (None): an ID or iterable of IDs of the labels to select
            tags (None): a tag or iterable of tags of labels to select
            fields (None): a field or iterable of fields from which to select
        """
        if labels is None:
            labels = self._collection._get_selected_labels(
                ids=ids, tags=tags, fields=fields
            )

        self.state.selected_labels = list(labels)

    @_update_state()
    def clear_selected_labels(self):
        """Clears the currently selected labels, if any."""
        self.state.selected_labels = []

    @_update_state()
    def tag_selected_samples(self, tag):
        """Adds the tag to the currently selected samples, if necessary.

        The currently selected labels are :attr:`Session.selected`.

        Args:
            tag: a tag
        """
        self._collection.select(self.selected).tag_samples(tag)

    @_update_state()
    def untag_selected_samples(self, tag):
        """Removes the tag from the currently selected samples, if necessary.

        The currently selected labels are :attr:`Session.selected`.

        Args:
            tag: a tag
        """
        self._collection.select(self.selected).untag_samples(tag)

    @_update_state()
    def tag_selected_labels(self, tag):
        """Adds the tag to the currently selected labels, if necessary.

        The currently selected labels are :attr:`Session.selected_labels`.

        Args:
            tag: a tag
        """
        self._collection.select_labels(labels=self.selected_labels).tag_labels(
            tag
        )

    @_update_state()
    def untag_selected_labels(self, tag):
        """Removes the tag from the currently selected labels, if necessary.

        The currently selected labels are :attr:`Session.selected_labels`.

        Args:
            tag: a tag
        """
        self._collection.select_labels(
            labels=self.selected_labels
        ).untag_labels(tag)

    @property
    def selected_view(self) -> t.Optional[fov.DatasetView]:
        """A :class:`fiftyone.core.view.DatasetView` containing the currently
        selected content in the App.

        The selected view is defined as follows:

        -   If both samples and labels are selected, the view will contain only
            the :attr:`selected_labels` from within the :attr:`selected`
            samples
        -   If samples are selected, the view will only contain the
            :attr:`selected` samples
        -   If labels are selected, the view will only contain the
            :attr:`selected_labels`
        -   If no samples or labels are selected, the view will be ``None``
        """
        if self.selected:
            view = self._collection.select(self.selected)

            if self.selected_labels:
                return view.select_labels(labels=self.selected_labels)

            return view

        if self.selected_labels:
            return self._collection.select_labels(labels=self.selected_labels)

        return None

    def summary(self) -> str:
        """Returns a string summary of the session.

        Returns:
            a string summary
        """
        if self.dataset:
            etype = self._collection._elements_str
            elements = [
                ("Dataset:", self.dataset.name),
                ("Media type:", self.dataset.media_type),
                ("Num %s:" % etype, len(self._collection)),
                ("Selected %s:" % etype, len(self.selected)),
                ("Selected labels:", len(self.selected_labels)),
            ]
        else:
            elements = [("Dataset:", "-")]

        if self._remote:
            type_ = "remote"
        elif self._context == focx._COLAB:
            type_ = "colab"
        elif self._context == focx._DATABRICKS:
            type_ = "databricks"
        elif self._desktop:
            type_ = "desktop"
        else:
            type_ = None

        if type_ is None:
            elements.append(("Session URL:", self.url))
        else:
            elements.append(("Session type:", type_))

        elements = fou.justify_headings(elements)
        lines = ["%s %s" % tuple(e) for e in elements]

        if self.view:
            lines.extend(["View stages:", self.view._make_view_stages_str()])

        if self.plots:
            lines.append(self.plots.summary())

        return "\n".join(lines)

    def open(self) -> None:
        """Opens the App, if necessary.

        The behavior of this method depends on your context:

        -   Notebooks: calls :meth:`Session.show` to open a new App window in
            the output of your current cell
        -   Desktop: opens the desktop App, if necessary
        -   Other (non-remote): opens the App in a new browser tab
        """
        if self._remote:
            logger.warning("Remote sessions cannot open new App windows")
            return

        if self.plots:
            self.plots.connect()

        if self._context != focx._NONE:
            self.show()
            return

        if self._desktop:
            self._app_service.start()
            return

        self.open_tab()

    def open_tab(self) -> None:
        """Opens the App in a new tab of your browser.

        This method can be called from Jupyter notebooks and in desktop App
        mode to override the default location of the App.
        """
        if self._remote:
            logger.warning("Remote sessions cannot open new App windows")
            return

        if self._context != focx._NONE:
            import IPython.display

            IPython.display.display(
                IPython.display.Javascript(
                    "window.open('{url}');".format(url=self.url)
                )
            )
            return

        webbrowser.open(self.url, new=2)

    @_update_state()
    def show(self, height: int = None) -> None:
        """Opens the App in the output of the current notebook cell.

        This method has no effect in non-notebook contexts.

        Args:
            height (None): a height, in pixels, for the App
        """
        self._show(height)

    def no_show(self):
        """Returns a context manager that temporarily prevents new App
        instances from being opened in the current notebook cell when methods
        are run that normally would show new App windows.

        This method has no effect in non-notebook contexts.

        Examples::

            import fiftyone as fo

            dataset = foz.load_zoo_dataset("quickstart")
            session = fo.launch_app(dataset)

            # (new cell)

            # Opens a new App instance
            session.view = dataset.take(100)

            # (new cell)

            # Does not open a new App instance
            with session.no_show():
                session.view = dataset.take(100)

        Returns:
            a context manager
        """
        return fou.SetAttributes(self, _auto=False)

    def wait(self, wait: float = 3) -> None:
        """Blocks execution until the App is closed by the user.

        For browser Apps, all connected windows (tabs) must be closed before
        this method will unblock.

        For desktop Apps, all positive ``wait`` values are equivalent;
        execution will immediately unblock when the App is closed.

        Args:
            wait (3): the number of seconds to wait for a new App connection
                before returning if all connections are lost. If negative, the
                process will wait forever, regardless of connections
        """
        if self._context != focx._NONE:
            logger.warning("Notebook sessions cannot wait")
            return

        try:
            if wait < 0:
                while True:
                    time.sleep(10)
            elif self._remote or not self._desktop:
                self._wait_closed = False
                while not self._wait_closed:
                    time.sleep(wait)
            else:
                self._app_service.wait()
        except KeyboardInterrupt:
            self._disable_wait_warning = True
            raise

    def close(self) -> None:
        """Closes the session and terminates the App, if necessary."""
        if self._remote:
            return

        self.plots.disconnect()

        self.state.close = True
        self._update_state()

    def freeze(self) -> None:
        """Screenshots the active App cell, replacing it with a static image.

        Only applicable to notebook contexts.
        """
        if self._context == focx._NONE:
            logger.warning("Only notebook sessions can be frozen")
            return

        freeze(self)
