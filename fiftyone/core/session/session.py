"""
Session class for interacting with the FiftyOne App

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from functools import wraps
import logging
from packaging.version import Version
import pkg_resources
import time
import typing as t
import webbrowser
from uuid import uuid4

try:
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

import fiftyone.core.session.client as fosc
from fiftyone.core.session.events import (
    CaptureNotebookCell,
    CloseSession,
    DeactivateNotebookCell,
    ReactivateNotebookCell,
    RefreshApp,
    StateUpdate,
)

import fiftyone.core.session.notebooks as fosn


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
    elif focx.is_notebook_context():
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


def update_state(auto_show: bool = False) -> t.Callable:
    """:class:`Session` method decorator for triggering state update events

    Args:
        auto_show (False): whether the method should show a new notebook App cell as
            well, if ``auto`` is ``True``

    Returns:
        the decorated method
    """

    def decorator(func: t.Callable) -> t.Callable:
        @wraps(func)
        def wrapper(
            session: "Session", *args: t.Tuple, **kwargs: dict
        ) -> t.Any:
            if auto_show and session.auto and focx.is_notebook_context():
                session.freeze()
            result = func(session, *args, **kwargs)
            session._client.send_event(StateUpdate(state=session._state))
            if auto_show and session.auto and focx.is_notebook_context():
                session.show()

            return result

        return wrapper

    return decorator


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
        dataset: t.Union[fod.Dataset, fov.DatasetView] = None,
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

        self._plots: t.Optional[fop.PlotManager] = None
        self._wait_closed = False

        # Maintain a reference to prevent garbage collection
        self._get_time = time.perf_counter
        self._disable_wait_warning = False
        self._notebook_cells: t.Dict[str, fosn.NotebookCell] = {}

        if desktop is None:
            desktop = (
                fo.config.desktop_app
                if not focx.is_notebook_context()
                else False
            )

        self.plots = plots

        self._state = StateDescription(
            config=config,
            dataset=view._root_dataset if view is not None else dataset,
            view=view,
        )
        self._client = fosc.Client(
            address=address,
            auto=auto,
            desktop=desktop,
            port=port,
            remote=remote,
            start_time=self._get_time(),
        )
        self._client.run(self._state)
        _attach_listeners(self)
        _register_session(self)

        if self.auto and focx.is_notebook_context():
            self.show(height=config.notebook_height)

        if self.remote:
            if focx.is_notebook_context():
                raise ValueError(
                    "Remote sessions cannot be run from a notebook"
                )

            return

        if self.desktop:
            if focx.is_notebook_context():
                raise ValueError(
                    "Cannot open a Desktop App instance from a %s notebook"
                    % focx._get_context()
                )

            if not focn.DEV_INSTALL:
                import_desktop()

            self._app_service = fos.AppService(
                server_port=port, server_address=address
            )
            return

        if not focx.is_notebook_context():
            self.open()
            return

    def _validate(
        self,
        dataset: t.Optional[t.Union[fod.Dataset, fov.DatasetView]],
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
                and self._get_time() - self._client.start_time < 2.5
            ):
                # logger may already have been garbage-collected
                print(_WAIT_INSTRUCTIONS)

            _unregister_session(self)
        except:
            # e.g. globals were already garbage-collected
            pass

    @property
    def auto(self) -> bool:
        """The auto setting for the session."""
        return self._client.auto

    @auto.setter
    def auto(self, auto: bool) -> None:
        self._client.auto = auto

    @property
    def server_port(self) -> int:
        """The server port for the session."""
        return self._client.port

    @property
    def server_address(self) -> str:
        """The server address for the session, or None if not specified."""
        return self._client.address

    @property
    def remote(self) -> bool:
        """Whether the session is remote."""
        return self._client.remote

    @property
    def desktop(self) -> bool:
        """Whether the session is connected to a desktop App."""
        return self._client.desktop

    @property
    def url(self) -> str:
        """The URL of the session."""
        return focx.get_url(self.server_address, self.server_port)

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
        return self._state.config

    @config.setter  # type: ignore
    @update_state()
    def config(self, config: t.Optional[AppConfig]) -> None:
        if config is None:
            config = fo.app_config.copy()

        if not isinstance(config, AppConfig):
            raise ValueError(
                "`Session.config` must be a %s or None; found %s"
                % (AppConfig, type(config))
            )

        self._state.config = config

    @property
    def _collection(self) -> t.Union[fod.Dataset, fov.DatasetView, None]:
        if self.view is not None:
            return self.view

        return self.dataset

    @property
    def dataset(self) -> t.Union[fod.Dataset, None]:
        """The :class:`fiftyone.core.dataset.Dataset` connected to the session."""
        return self._state.dataset

    @dataset.setter  # type: ignore
    @update_state(auto_show=True)
    def dataset(self, dataset: t.Union[fod.Dataset, None]) -> None:
        if dataset is not None and not isinstance(dataset, fod.Dataset):
            raise ValueError(
                "`Session.dataset` must be a %s or None; found %s"
                % (fod.Dataset, type(dataset))
            )

        if dataset is not None:
            dataset._reload()

        self._state.dataset = dataset
        self._state.view = None
        self._state.selected = []
        self._state.selected_labels = []

    @update_state()
    def clear_dataset(self) -> None:
        """Clears the current :class:`fiftyone.core.dataset.Dataset` from the
        session, if any.
        """
        self._state.dataset = None

    @property
    def view(self) -> t.Union[fov.DatasetView, None]:
        """The :class:`fiftyone.core.view.DatasetView` connected to the
        session, or ``None`` if no view is connected.
        """
        return self._state.view

    @view.setter  # type: ignore
    @update_state(auto_show=True)
    def view(self, view: t.Union[fov.DatasetView, None]) -> None:
        if view is not None and not isinstance(view, fov.DatasetView):
            raise ValueError(
                "`Session.view` must be a %s or None; found %s"
                % (fov.DatasetView, type(view))
            )

        self._state.view = view

        if view is not None:
            view._root_dataset._reload()
            self._state.dataset = view._root_dataset

        self._state.selected = []
        self._state.selected_labels = []

    @update_state()
    def clear_view(self) -> None:
        """Clears the current :class:`fiftyone.core.view.DatasetView` from the
        session, if any.
        """
        self._state.view = None

    @property
    def has_plots(self) -> bool:
        """Whether this session has any attached plots."""
        return bool(self._plots)

    @property
    def plots(self) -> t.Union[fop.PlotManager, None]:
        """The :class:`fiftyone.core.plots.manager.PlotManager` instance that
        manages plots attached to this session.
        """
        return self._plots

    @plots.setter
    def plots(self, plots: t.Optional[fop.PlotManager]) -> None:
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

    @update_state()
    def refresh(self) -> None:
        """Refreshes the current App window."""
        self._client.send_event(RefreshApp())

    @property
    def selected(self) -> t.List[str]:
        """A list of sample IDs of the currently selected samples in the App,
        if any.
        """
        return list(self._state.selected)

    @selected.setter  # type: ignore
    @update_state()
    def selected(self, sample_ids: t.List[str]) -> None:
        self._state.selected = list(sample_ids) if sample_ids else []

    @update_state()
    def clear_selected(self) -> None:
        """Clears the currently selected samples, if any."""
        self._state.selected = []

    @update_state()
    def select_samples(
        self,
        ids: t.Optional[t.Union[str, t.Iterable[str]]] = None,
        tags: t.Optional[t.Union[str, t.Iterable[str]]] = None,
    ) -> None:
        """Selects the specified samples in the current view in the App,

        Args:
            ids (None): an ID or iterable of IDs of samples to select
            tags (None): a tag or iterable of tags of samples to select
        """
        if tags is not None and self._collection:
            ids = self._collection.match_tags(tags).values("id")

        if ids is None:
            ids = []

        self._state.selected = list(ids)

    @property
    def selected_labels(self) -> t.List[dict]:
        """A list of labels currently selected in the App.

        Items are dictionaries with the following keys:

        -   ``label_id``: the ID of the label
        -   ``sample_id``: the ID of the sample containing the label
        -   ``field``: the field name containing the label
        -   ``frame_number``: the frame number containing the label (only
            applicable to video samples)
        """
        return list(self._state.selected_labels)

    @selected_labels.setter  # type: ignore
    @update_state()
    def selected_labels(self, labels: dict) -> None:
        self._state.selected_labels = list(labels) if labels else []

    @update_state()
    def select_labels(
        self,
        labels: t.Optional[t.List[dict]] = None,
        ids: t.Optional[t.Union[str, t.Iterable[str]]] = None,
        tags: t.Optional[t.Union[str, t.Iterable[str]]] = None,
        fields: t.Optional[t.Union[str, t.Iterable[str]]] = None,
    ) -> None:
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
        if labels is None and self._collection:
            labels = self._collection._get_selected_labels(
                ids=ids, tags=tags, fields=fields
            )

        self._state.selected_labels = list(labels or [])

    @update_state()
    def clear_selected_labels(self) -> None:
        """Clears the currently selected labels, if any."""
        self._state.selected_labels = []

    @update_state()
    def tag_selected_samples(self, tag: str) -> None:
        """Adds the tag to the currently selected samples, if necessary.

        The currently selected labels are :attr:`Session.selected`.

        Args:
            tag: a tag
        """
        if self._collection is not None:
            self._collection.select(self.selected).tag_samples(tag)

    @update_state()
    def untag_selected_samples(self, tag: str) -> None:
        """Removes the tag from the currently selected samples, if necessary.

        The currently selected labels are :attr:`Session.selected`.

        Args:
            tag: a tag
        """
        if self._collection is not None:
            self._collection.select(self.selected).untag_samples(tag)

    @update_state()
    def tag_selected_labels(self, tag: str) -> None:
        """Adds the tag to the currently selected labels, if necessary.

        The currently selected labels are :attr:`Session.selected_labels`.

        Args:
            tag: a tag
        """
        if self._collection is not None:
            self._collection.select_labels(
                labels=self.selected_labels
            ).tag_labels(tag)

    @update_state()
    def untag_selected_labels(self, tag: str) -> None:
        """Removes the tag from the currently selected labels, if necessary.

        The currently selected labels are :attr:`Session.selected_labels`.

        Args:
            tag: a tag
        """
        if self._collection is not None:
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
        if self._collection is None:
            return None

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
        if self._collection and self.dataset is not None:
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

        if self.remote:
            type_ = "remote"
        elif focx.is_colab_context():
            type_ = "colab"
        elif focx.is_databricks_context():
            type_ = "databricks"
        elif self.desktop:
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
        if self.remote:
            logger.warning("Remote sessions cannot open new App windows")
            return

        if self.plots:
            self.plots.connect()

        if focx.is_notebook_context():
            self.show()
            return

        if self.desktop:
            self._app_service.start()
            return

        self.open_tab()

    def open_tab(self) -> None:
        """Opens the App in a new tab of your browser.

        This method can be called from Jupyter notebooks and in desktop App
        mode to override the default location of the App.
        """
        if self.remote:
            logger.warning("Remote sessions cannot open new App windows")
            return

        if focx.is_notebook_context():
            IPython.display.display(
                IPython.display.Javascript(
                    "window.open('{url}');".format(url=self.url)
                )
            )
            return

        webbrowser.open(self.url, new=2)

    @update_state()
    def show(self, height: int = None) -> str:
        """Opens the App in the output of the current notebook cell.

        This method has no effect in non-notebook contexts.

        Args:
            height (None): a height, in pixels, for the App
        """
        if not focx.is_notebook_context() or self.desktop:
            return

        self.freeze()
        if self.dataset is not None:
            self.dataset._reload()

        if height is None:
            height = self.config.notebook_height

        uuid = str(uuid4())
        self._notebook_cells[uuid] = fosn.NotebookCell(
            address=self.server_address,
            handle=IPython.display.DisplayHandle(display_id=uuid),
            height=height,
            port=self.server_port,
            subscription=uuid,
        )

        fosn.display(self._notebook_cells[uuid])
        return uuid

    def no_show(self) -> fou.SetAttributes:
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
        return fou.SetAttributes(self, auto=False)

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
        if focx.is_notebook_context():
            logger.warning("Notebook sessions cannot wait")
            return

        try:
            if wait < 0:
                while True:
                    time.sleep(10)
            elif self.remote or not self._client.desktop:
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
        if self.remote:
            return

        self._client.send_event(CloseSession())
        self.plots.disconnect()

    def freeze(self) -> None:
        """Screenshots the active App cell, replacing it with a static image.

        Only applicable to notebook contexts.
        """
        if not focx.is_notebook_context():
            logger.warning("Only notebook sessions can be frozen")
            return

        self._client.send_event(DeactivateNotebookCell())
        self.plots.freeze()


def _attach_listeners(session: "Session"):
    on_close_session: t.Callable[[CloseSession], None] = lambda event: setattr(
        session, "_wait_closed", True
    )
    session._client.add_event_listener("close_session", on_close_session)

    on_state_update: t.Callable[[StateUpdate], None] = lambda event: setattr(
        session, "_state", event.state
    )
    session._client.add_event_listener("state_update", on_state_update)

    if focx.is_notebook_context() and not focx.is_colab_context():

        def on_capture_notebook_cell(event: CaptureNotebookCell) -> None:
            fosn.capture(session._notebook_cells[event.subscription], event)

        session._client.add_event_listener(
            "capture_notebook_cell", on_capture_notebook_cell
        )

        def on_reactivate_notebook_cell(event: ReactivateNotebookCell) -> None:
            session._client.send_event(DeactivateNotebookCell())
            fosn.display(
                session._notebook_cells[event.subscription], reactivate=True
            )

        session._client.add_event_listener(
            "reactivate_notebook_cell", on_reactivate_notebook_cell
        )


def import_desktop() -> None:
    """Attempts to import :mod:`fiftyone.desktop`

    Raises:
        RuntimeError: If matching ``fiftyone-desktop`` version is not
        installed
    """
    try:
        # pylint: disable=unused-import
        import fiftyone.desktop
    except ImportError as e:
        raise RuntimeError(
            "You must `pip install fiftyone[desktop]` in order to launch the "
            "desktop App"
        ) from e

    # Get `fiftyone-desktop` requirement for current `fiftyone` install
    fiftyone_dist = pkg_resources.get_distribution("fiftyone")
    requirements = fiftyone_dist.requires(extras=["desktop"])
    desktop_req = [r for r in requirements if r.name == "fiftyone-desktop"][0]

    desktop_dist = pkg_resources.get_distribution("fiftyone-desktop")

    if not desktop_req.specifier.contains(
        Version(desktop_dist.version).base_version
    ):
        raise RuntimeError(
            "fiftyone==%s requires fiftyone-desktop%s, but you have "
            "fiftyone-desktop==%s installed.\n"
            "Run `pip install fiftyone[desktop]` to install the proper "
            "desktop package version"
            % (
                fiftyone_dist.version,
                desktop_req.specifier,
                desktop_dist.version,
            )
        )


def _register_session(session: Session) -> None:
    global _server_services  # pylint: disable=global-statement
    if session.server_port not in _server_services:
        _server_services[session.server_port] = fos.ServerService(
            session.server_port,
            address=session.server_address,
            do_not_track=fo.config.do_not_track,
        )

    global _subscribed_sessions  # pylint: disable=global-statement
    _subscribed_sessions[session.server_port].add(session)


def _unregister_session(session: Session) -> None:
    global _subscribed_sessions  # pylint: disable=global-statement
    _subscribed_sessions[session.server_port].discard(session)

    if len(_subscribed_sessions[session.server_port]) == 0:
        global _server_services  # pylint: disable=global-statement
        if session.server_port in _server_services:
            service = _server_services.pop(session.server_port)
            service.stop()
