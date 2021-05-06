"""
Session class for interacting with the FiftyOne App.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from functools import wraps
import logging
import time
from uuid import uuid4
import webbrowser

from jinja2 import Template

import fiftyone as fo
import fiftyone.constants as focn
import fiftyone.core.dataset as fod
import fiftyone.core.client as foc
from fiftyone.core.config import AppConfig
import fiftyone.core.context as focx
import fiftyone.core.frame as fof
import fiftyone.core.media as fom
import fiftyone.core.plots as fop
import fiftyone.core.sample as fosa
import fiftyone.core.service as fos
import fiftyone.core.utils as fou
import fiftyone.core.view as fov
import fiftyone.utils.templates as fout
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
    dataset=None,
    view=None,
    port=None,
    remote=False,
    desktop=None,
    height=None,
    auto=True,
    config=None,
):
    """Launches the FiftyOne App.

    Note that only one App instance can be opened at a time. If this method is
    called when another App exists, the existing App will be closed.

    Args:
        dataset (None): an optional :class:`fiftyone.core.dataset.Dataset` to
            load
        view (None): an optional :class:`fiftyone.core.view.DatasetView` to
            load
        port (None): the port number to serve the App. If None,
            ``fiftyone.config.default_app_port`` is used
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


def close_app():
    """Closes the FiftyOne App, if necessary.

    If no App is currently open, this method has no effect.
    """
    global _session  # pylint: disable=global-statement
    if _session is not None:
        _session.close()
        _session = None


def _update_state(auto_show=False):
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


class Session(foc.HasClient):
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
        dataset (None): an optional :class:`fiftyone.core.dataset.Dataset` to
            load
        view (None): an optional :class:`fiftyone.core.view.DatasetView` to
            load
        plots (None): an optional
            :class:`fiftyone.core.plots.manager.PlotManager` to connect to this
            session
        port (None): the port number to serve the App. If None,
            ``fiftyone.config.default_app_port`` is used
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

    _HC_NAMESPACE = "state"
    _HC_ATTR_NAME = "state"
    _HC_ATTR_TYPE = StateDescription

    def __init__(
        self,
        dataset=None,
        view=None,
        plots=None,
        port=None,
        remote=False,
        desktop=None,
        height=None,
        auto=True,
        config=None,
    ):
        self._validate(dataset, view, plots, config)

        if port is None:
            port = fo.config.default_app_port

        if config is None:
            config = fo.app_config.copy()

        if height is not None:
            config.notebook_height = height

        state = self._HC_ATTR_TYPE()
        state.config = config

        self._context = focx._get_context()
        self._plots = None
        self._port = port
        self._remote = remote

        # Maintain a reference to prevent garbage collection
        self._get_time = time.perf_counter

        self._WAIT_INSTRUCTIONS = _WAIT_INSTRUCTIONS
        self._disable_wait_warning = False
        self._auto = auto
        self._handles = {}
        self._colab_img_counter = defaultdict(int)

        global _server_services  # pylint: disable=global-statement
        if port not in _server_services:
            _server_services[port] = fos.ServerService(
                port, do_not_track=fo.config.do_not_track
            )

        global _subscribed_sessions  # pylint: disable=global-statement
        _subscribed_sessions[port].add(self)
        super().__init__(self._port)

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
            if self._context == focx._COLAB:
                raise ValueError(
                    "Cannot open a Desktop App instance from a Colab notebook"
                )

            try:
                import fiftyone.desktop  # pylint: disable=unused-import
            except ImportError as e:
                if not focn.DEV_INSTALL:
                    raise ValueError(
                        "You must install the 'fiftyone-desktop' package "
                        "in order to launch a desktop App instance"
                    ) from e

            self._app_service = fos.AppService(server_port=port)
            return

        if self._context == focx._NONE:
            self.open()
            return

    def _validate(self, dataset, view, plots, config):
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

    def __repr__(self):
        return self.summary()

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
        super().__del__()

    @property
    def server_port(self):
        """The server port for the session."""
        return self._port

    @property
    def remote(self):
        """Whether the session is remote."""
        return self._remote

    @property
    def desktop(self):
        """Whether the session is connected to a desktop App."""
        return self._desktop

    @property
    def url(self):
        """The URL of the session."""
        if self._context == focx._COLAB:
            # pylint: disable=no-name-in-module,import-error
            from google.colab.output import eval_js

            url = eval_js(
                "google.colab.kernel.proxyPort(%d)" % self.server_port
            )
            return "%s?fiftyoneColab=true" % url

        return "http://localhost:%d/" % self.server_port

    @property
    def config(self):
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
    def config(self, config):
        if config is None:
            config = fo.app_config.copy()

        if not isinstance(config, AppConfig):
            raise ValueError(
                "`Session.config` must be a %s or None; found %s"
                % (AppConfig, type(config))
            )

        self.state.config = config

    @property
    def _collection(self):
        if self.view is not None:
            return self.view

        return self.dataset

    @property
    def dataset(self):
        """The :class:`fiftyone.core.dataset.Dataset` connected to the session.
        """
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

        The currently selected labels are :meth:`Sesssion.selected`.

        Args:
            tag: a tag
        """
        self._collection.select(self.selected).tag_samples(tag)

    @_update_state()
    def untag_selected_samples(self, tag):
        """Removes the tag from the currently selected samples, if necessary.

        The currently selected labels are :meth:`Sesssion.selected`.

        Args:
            tag: a tag
        """
        self._collection.select(self.selected).untag_samples(tag)

    @_update_state()
    def tag_selected_labels(self, tag):
        """Adds the tag to the currently selected labels, if necessary.

        The currently selected labels are :meth:`Sesssion.selected_labels`.

        Args:
            tag: a tag
        """
        self._collection.select_labels(labels=self.selected_labels).tag_labels(
            tag
        )

    @_update_state()
    def untag_selected_labels(self, tag):
        """Removes the tag from the currently selected labels, if necessary.

        The currently selected labels are :meth:`Sesssion.selected_labels`.

        Args:
            tag: a tag
        """
        self._collection.select_labels(
            labels=self.selected_labels
        ).untag_labels(tag)

    def summary(self):
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

    def open(self):
        """Opens the App, if necessary.

        The behavior of this method depends on your context:

        -   Notebooks: calls :meth:`Session.show` to open an App window in the
            output of your current cell
        -   Desktop: the desktop App will be opened, if necessary
        -   Other (non-remote): the App will be opened in a new browser tab
        """
        if self._remote:
            raise ValueError("Remote sessions cannot launch the App")

        if self.plots:
            self.plots.connect()

        if self._context != focx._NONE:
            self.show()
            return

        if self._desktop:
            self._app_service.start()
            return

        self.open_tab()

    def open_tab(self):
        """Opens the App in a new tab of your default browser.

        This method can be called from Jupyter notebooks and from desktop App
        mode to override the default behavior of :meth:`Session.open`.

        This method cannot be called on remote sessions or from Colab
        notebooks.
        """
        if self._remote:
            raise ValueError("Remote sessions cannot launch the App")

        if self._context == focx._COLAB:
            raise ValueError(
                "Cannot open the App in a dedicated tab from Colab notebooks"
            )

        webbrowser.open(self.url, new=2)

    @_update_state()
    def show(self, height=None):
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

    def wait(self):
        """Blocks execution until the session is closed by the user.

        For local sessions, this will wait until the App is closed by the user.

        For remote sessions, this will wait until the server shuts down, which
        typically requires interrupting the calling process with Ctrl-C.
        """
        try:
            if self._remote or not self._desktop:
                try:
                    _server_services[self._port].wait()
                except:
                    while True:
                        time.sleep(1)
            else:
                self._app_service.wait()
        except KeyboardInterrupt:
            self._disable_wait_warning = True
            raise

    def close(self):
        """Closes the session and terminates the App, if necessary."""
        if self._remote:
            return

        self.plots.disconnect()

        self.state.close = True
        self._update_state()

    def freeze(self):
        """Screenshots the active App cell, replacing it with a static image.

        Only applicable to notebook contexts.
        """
        if self._context == focx._NONE:
            raise ValueError("Only notebook sessions can be frozen")

        self.state.active_handle = None

        self._update_state()
        self.plots.freeze()

    def _auto_show(self, height=None):
        if self._auto and self._context != focx._NONE:
            return self._show(height=height)

        return None

    def _capture(self, data):
        from IPython.display import HTML

        if self._context == focx._COLAB:
            return

        handle = data["handle"]
        if data["handle"] in self._handles:
            self._handles[handle]["target"].update(
                HTML(
                    fout._SCREENSHOT_HTML.render(
                        handle=handle,
                        image=data["src"],
                        url=self._base_url(),
                        max_width=data["width"],
                    )
                )
            )

    def _base_url(self):
        if self._context == focx._COLAB:
            # pylint: disable=no-name-in-module,import-error
            from google.colab.output import eval_js

            return eval_js(
                "google.colab.kernel.proxyPort(%d)" % self.server_port
            )

        return "http://localhost:%d/" % self.server_port

    def _reactivate(self, data):
        handle = data["handle"]
        self.state.active_handle = handle
        if handle in self._handles:
            source = self._handles[handle]
            _display(
                self,
                source["target"],
                handle,
                self._port,
                source["height"],
                update=True,
            )

    def _reload(self):
        if self.dataset is None:
            return

        self.dataset._reload()
        self.dataset._reload_docs()

    def _show(self, height=None):
        if self._context == focx._NONE or self._desktop:
            return

        if self.dataset is not None:
            self.dataset._reload()

        import IPython.display

        handle = IPython.display.display(display_id=True)
        uuid = str(uuid4())

        # @todo isn't it bad to set this here? The first time this is called
        # is before `self.state` has been initialized
        self.state.active_handle = uuid

        if height is None:
            height = self.config.notebook_height

        self._handles[uuid] = {"target": handle, "height": height}

        _display(self, handle, uuid, self._port, height)
        return uuid

    def _update_state(self):
        self.state.datasets = fod.list_datasets()

        # See ``fiftyone.core.client`` to understand this
        self.state = self.state


def _display(session, handle, uuid, port, height, update=False):
    """Displays a running FiftyOne instance."""
    funcs = {focx._COLAB: _display_colab, focx._IPYTHON: _display_ipython}
    fn = funcs[focx._get_context()]
    fn(session, handle, uuid, port, height, update=update)


def _display_ipython(session, handle, uuid, port, height, update=False):
    import IPython.display

    src = "http://localhost:%d/?notebook=true&handleId=%s" % (port, uuid)
    iframe = IPython.display.IFrame(src, height=height, width="100%")
    if update:
        handle.update(iframe)
    else:
        handle.display(iframe)


def _display_colab(session, handle, uuid, port, height, update=False):
    """Display a FiftyOne instance in a Colab output frame.

    The Colab VM is not directly exposed to the network, so the Colab runtime
    provides a service worker tunnel to proxy requests from the end user's
    browser through to servers running on the Colab VM: the output frame may
    issue requests to https://localhost:<port> (HTTPS only), which will be
    forwarded to the specified port on the VM.

    It does not suffice to create an `iframe` and let the service worker
    redirect its traffic (`<iframe src="https://localhost:6006">`), because for
    security reasons service workers cannot intercept iframe traffic. Instead,
    we manually fetch the FiftyOne index page with an XHR in the output frame,
    and inject the raw HTML into `document.body`.
    """
    import IPython.display

    # pylint: disable=no-name-in-module,import-error
    from google.colab import output

    style_text = Template(fout._SCREENSHOT_STYLE).render(handle=uuid)
    html = Template(fout._SCREENSHOT_COLAB).render(
        style=style_text, handle=uuid
    )
    script = Template(fout._SCREENSHOT_COLAB_SCRIPT).render(
        port=port, handle=uuid, height=height
    )

    handle.display(IPython.display.HTML(html))
    output.eval_js(script)

    def capture(img, width):
        idx = session._colab_img_counter[uuid]
        session._colab_img_counter[uuid] = idx + 1
        with output.redirect_to_element("#focontainer-%s" % uuid):
            # pylint: disable=undefined-variable,bad-format-character
            display(
                IPython.display.HTML(
                    """
                <img id='fo-%s%d' class='foimage' src='%s'
                    style='width: 100%%; max-width: %dpx'/>
                <style>
                #fo-%s%d {
                    display: none;
                }
                </style>
                """
                    % (uuid, idx, img, width, uuid, idx - 1)
                )
            )

    output.register_callback("fiftyone.%s" % uuid.replace("-", "_"), capture)
