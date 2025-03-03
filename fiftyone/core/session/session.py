"""
Session class for interacting with the FiftyOne App.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import defaultdict
from dataclasses import asdict
from functools import wraps
import logging
import os
import time
import typing as t
from uuid import uuid4
import webbrowser

from dacite import from_dict

try:
    import IPython.display
except:
    pass

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.core.odm.dataset as food
from fiftyone.core.odm.workspace import default_workspace_factory, Space
import fiftyone.constants as focn
import fiftyone.core.dataset as fod
from fiftyone.core.config import AppConfig
import fiftyone.core.context as focx
import fiftyone.core.plots as fop
import fiftyone.core.service as fos
from fiftyone.core.state import build_color_scheme, StateDescription
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

import fiftyone.core.session.client as fosc
from fiftyone.core.session.events import (
    CaptureNotebookCell,
    CloseSession,
    DeactivateNotebookCell,
    LabelData,
    ReactivateNotebookCell,
    Refresh,
    SelectLabels,
    SelectSamples,
    SetColorScheme,
    SetDatasetColorScheme,
    SetSample,
    SetSpaces,
    SetGroupSlice,
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

See https://docs.voxel51.com/user_guide/app.html#remote-sessions
for more information about remote sessions.
"""

_WAIT_INSTRUCTIONS = """
A session appears to have terminated shortly after it was started. If you
intended to start an App instance or a remote session from a script, you should
call `session.wait()` to keep the session (and the script) alive.
"""

_WELCOME_MESSAGE = """
Welcome to

███████╗██╗███████╗████████╗██╗   ██╗ ██████╗ ███╗   ██╗███████╗
██╔════╝██║██╔════╝╚══██╔══╝╚██╗ ██╔╝██╔═══██╗████╗  ██║██╔════╝
█████╗  ██║█████╗     ██║    ╚████╔╝ ██║   ██║██╔██╗ ██║█████╗
██╔══╝  ██║██╔══╝     ██║     ╚██╔╝  ██║   ██║██║╚██╗██║██╔══╝
██║     ██║██║        ██║      ██║   ╚██████╔╝██║ ╚████║███████╗
╚═╝     ╚═╝╚═╝        ╚═╝      ╚═╝    ╚═════╝ ╚═╝  ╚═══╝╚══════╝ v{0}

If you're finding FiftyOne helpful, here's how you can get involved:

|
|  ⭐⭐⭐ Give the project a star on GitHub ⭐⭐⭐
|  https://github.com/voxel51/fiftyone
|
|  🚀🚀🚀 Join the FiftyOne Discord community 🚀🚀🚀
|  https://community.voxel51.com/
|
"""


def launch_app(
    dataset: fod.Dataset = None,
    view: fov.DatasetView = None,
    sample_id: str = None,
    group_id: str = None,
    spaces: Space = None,
    color_scheme: food.ColorScheme = None,
    plots: fop.PlotManager = None,
    port: int = None,
    address: str = None,
    remote: bool = False,
    browser: str = None,
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
        sample_id (None): an optional :class:`fiftyone.core.sample.Sample` ID
            to load in the modal
        group_id (None): an optional :class:`fiftyone.core.groups.Group` ID
            to load in the modal
        spaces (None): an optional :class:`fiftyone.core.odm.workspace.Space`
            instance defining a space configuration to load
        color_scheme (None): an optional
            :class:`fiftyone.core.odm.dataset.ColorScheme` defining a custom
            color scheme to use
        plots (None): an optional
            :class:`fiftyone.core.plots.manager.PlotManager` to connect to this
            session
        port (None): the port number to serve the App. If None,
            ``fiftyone.config.default_app_port`` is used
        address (None): the address to serve the App. If None,
            ``fiftyone.config.default_app_address`` is used
        remote (False): whether this is a remote session, and opening the App
            should not be attempted
        browser (None): an optional browser to use to open the App. If None,
            the default browser will be used. Refer to list of supported
            browsers at https://docs.python.org/3/library/webbrowser.html
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
    _session = Session(
        dataset=dataset,
        view=view,
        sample_id=sample_id,
        group_id=group_id,
        spaces=spaces,
        color_scheme=color_scheme,
        plots=plots,
        port=port,
        address=address,
        remote=remote,
        browser=browser,
        height=height,
        auto=auto,
        config=config,
    )

    if _session.remote:
        logger.info(_REMOTE_INSTRUCTIONS.strip().format(_session.server_port))
    elif focx.is_notebook_context():
        if not auto:
            logger.info(_APP_NOTEBOOK_MESSAGE.strip())
    else:
        logger.info(_APP_WEB_MESSAGE.strip().format(_session.server_port))

    _log_welcome_message_if_allowed()

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
        auto_show (False): whether the method should show a new notebook App
            cell as well, if ``auto`` is ``True``

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

    -   To load a specific sample in the modal, simply set the
        :attr:`Session.sample_id` property of the session to the ID of the
        :class:`fiftyone.core.sample.Sample`.

    -   To load a specific group in the modal, simply set the
        :attr:`Session.group_id` property of the session to the ID of the
        :class:`fiftyone.core.groups.Group`.

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
        sample_id (None): an optional :class:`fiftyone.core.sample.Sample` ID
            to load in the modal
        group_id (None): an optional :class:`fiftyone.core.groups.Group` ID
            to load in the modal
        spaces (None): an optional :class:`fiftyone.core.odm.workspace.Space`
            instance defining a space configuration to load
        color_scheme (None): an optional
            :class:`fiftyone.core.odm.dataset.ColorScheme` defining a custom
            color scheme to use
        plots (None): an optional
            :class:`fiftyone.core.plots.manager.PlotManager` to connect to this
            session
        port (None): the port number to serve the App. If None,
            ``fiftyone.config.default_app_port`` is used
        address (None): the address to serve the App. If None,
            ``fiftyone.config.default_app_address`` is used
        remote (False): whether this is a remote session, and opening the App
            should not be attempted
        browser (None): an optional browser to use to open the App. If None,
            the default browser will be used. Refer to list of supported
            browsers at https://docs.python.org/3/library/webbrowser.html
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
        sample_id: str = None,
        group_id: str = None,
        spaces: Space = None,
        color_scheme: food.ColorScheme = None,
        plots: fop.PlotManager = None,
        port: int = None,
        address: str = None,
        remote: bool = False,
        browser: str = None,
        height: int = None,
        auto: bool = True,
        config: AppConfig = None,
        view_name: str = None,
    ) -> None:
        focx.init_context()

        if isinstance(dataset, fov.DatasetView):
            view = dataset
            dataset = dataset._root_dataset

        self._validate(dataset, view, spaces, color_scheme, plots, config)

        if port is None:
            port = fo.config.default_app_port

        if (
            address is not None
            and address != "0.0.0.0"
            and focx.is_databricks_context()
        ):
            logger.warning(
                "A session address != 0.0.0.0 was provided, but databricks "
                "requires 0.0.0.0"
            )

        if address is None:
            if fou.is_container() or focx.is_databricks_context():
                address = "0.0.0.0"
            else:
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

        self.plots = plots

        final_view_name = view_name
        if not final_view_name and view and view.name:
            final_view_name = view.name

        if spaces is None:
            spaces = default_workspace_factory()

        self._state = StateDescription(
            dataset=view._root_dataset if view is not None else dataset,
            view=view,
            view_name=final_view_name,
            sample_id=sample_id,
            group_id=group_id,
            group_slice=_pull_group_slice(dataset, view),
            spaces=spaces,
            color_scheme=build_color_scheme(color_scheme, dataset, config),
            config=config,
        )
        self._client = fosc.Client(
            address=address,
            auto=auto,
            port=port,
            remote=remote,
            start_time=self._get_time(),
        )
        self._client.open(self._state)
        _attach_listeners(self)
        _register_session(self)

        if self.auto and focx.is_notebook_context():
            self.show(height=config.notebook_height)

        self.browser = browser

        if self.remote:
            if focx.is_notebook_context():
                raise ValueError(
                    "Remote sessions cannot be run from a notebook"
                )

            return

        if not focx.is_notebook_context():
            self.open()
            return

    def _validate(
        self,
        dataset: t.Optional[t.Union[fod.Dataset, fov.DatasetView]],
        view: t.Optional[fov.DatasetView],
        spaces: t.Optional[Space],
        color_scheme: t.Optional[food.ColorScheme],
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

        if spaces is not None and not isinstance(spaces, Space):
            raise ValueError(
                "`spaces` must be a %s or None; found %s"
                % (Space, type(spaces))
            )

        if color_scheme is not None and not isinstance(
            color_scheme, food.ColorScheme
        ):
            raise ValueError(
                "`color_scheme` must be a %s or None; found %s"
                % (food.ColorScheme, type(color_scheme))
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

            self._client.close()
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
    def url(self) -> str:
        """The URL of the session."""
        return focx.get_url(
            self.server_address,
            self.server_port,
            proxy_url=self.config.proxy_url,
        )

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
    def group_id(self) -> t.Optional[str]:
        """The current :class:`fiftyone.core.groups.Group` ID in the modal, if
        any.
        """
        return self._state.group_id

    @group_id.setter  # type: ignore
    def group_id(self, group_id: t.Optional[str]) -> None:
        if group_id is not None and not isinstance(group_id, str):
            raise ValueError(f"unexpected group id value '{group_id}'")

        self._state.group_id = group_id
        self._client.send_event(SetSample(group_id=group_id))

    @property
    def sample_id(self) -> t.Optional[str]:
        """The current :class:`fiftyone.core.sample.Sample` ID in the modal, if
        any.
        """
        return self._state.sample_id

    @sample_id.setter  # type: ignore
    def sample_id(self, sample_id: t.Optional[str]) -> None:
        if sample_id is not None and not isinstance(sample_id, str):
            raise ValueError(f"unexpected sample id value '{sample_id}'")

        self._state.sample_id = sample_id
        self._client.send_event(SetSample(sample_id=sample_id))

    @property
    def spaces(self) -> Space:
        """The layout state for the session."""
        return self._state.spaces

    @spaces.setter  # type: ignore
    def spaces(self, spaces: t.Optional[Space]) -> None:
        if spaces is None:
            spaces = default_workspace_factory()

        if not isinstance(spaces, Space):
            raise ValueError(
                "`Session.spaces` must be a %s or None; found %s"
                % (Space, type(spaces))
            )

        self._state.spaces = spaces
        self._client.send_event(SetSpaces(spaces=spaces.to_dict()))

    def load_workspace(self, workspace: str) -> None:
        """Loads the given saved workspace.

        Args:
            workspace: the name of a saved workspace
        """
        spaces = self.dataset.load_workspace(workspace)
        self.spaces = spaces

    @property
    def color_scheme(self) -> food.ColorScheme:
        """The color scheme for the session."""
        return self._state.color_scheme

    @color_scheme.setter  # type: ignore
    def color_scheme(self, color_scheme: t.Optional[food.ColorScheme]) -> None:
        if color_scheme is None:
            color_scheme = build_color_scheme(None, self.dataset, self.config)

        if not isinstance(color_scheme, food.ColorScheme):
            raise ValueError(
                "`Session.color_scheme` must be a %s or None; found %s"
                % (food.ColorScheme, type(color_scheme))
            )

        self._state.color_scheme = color_scheme
        self._client.send_event(SetColorScheme.from_odm(color_scheme))

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

        self._set_dataset(dataset)

    @update_state()
    def clear_dataset(self) -> None:
        """Clears the current :class:`fiftyone.core.dataset.Dataset` from the
        session, if any.
        """
        self._set_dataset(None)

    def _set_dataset(self, dataset):
        if dataset is not None:
            dataset._reload()
            self._state.group_slice = dataset.group_slice
        else:
            self._state.group_slice = None

        self._state.color_scheme = build_color_scheme(
            None, dataset, self.config
        )
        self._state.dataset = dataset
        self._state.group_id = None
        self._state.sample_id = None
        self._state.spaces = default_workspace_factory()
        self._state.selected = []
        self._state.selected_labels = []
        self._state.view = None

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

        self._set_view(view)

    @update_state()
    def clear_view(self) -> None:
        """Clears the current :class:`fiftyone.core.view.DatasetView` from the
        session, if any.
        """
        self._set_view(None)

    def _set_view(self, view):
        if view is None:
            self._state.group_slice = None
            self._state.view = None
            self._state.view_name = None
        else:
            if view._root_dataset != self.dataset:
                self._set_dataset(view._root_dataset)

            self._state.group_slice = view.group_slice
            self._state.view = view
            self._state.view_name = view.name

        self._state.group_id = None
        self._state.sample_id = None
        self._state.selected = []
        self._state.selected_labels = []

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

    def refresh(self) -> None:
        """Refreshes the current App window."""
        self._client.send_event(Refresh(state=self._state))

    @property
    def selected(self) -> t.List[str]:
        """A list of sample IDs of the currently selected samples in the App,
        if any.
        """
        return list(self._state.selected)

    @selected.setter  # type: ignore
    def selected(self, sample_ids: t.List[str]) -> None:
        self._state.selected = list(sample_ids) if sample_ids else []
        self._client.send_event(SelectSamples(sample_ids))

    def clear_selected(self) -> None:
        """Clears the currently selected samples, if any."""
        self._state.selected = []
        self._client.send_event(SelectSamples([]))

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
        self._client.send_event(SelectSamples(self._state.selected))

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
    def selected_labels(self, labels: dict) -> None:
        self._state.selected_labels = list(labels) if labels else []
        self._client.send_event(
            from_dict(SelectLabels, dict(labels=self._state.selected_labels))
        )

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

        self.selected_labels = list(labels or [])

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
        else:
            type_ = None

        if self.group_id:
            elements.append(("Group:", self.group_id))
        elif self.sample_id:
            elements.append(("Sample:", self.sample_id))

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
        -   Other (non-remote): opens the App in a new browser tab
        """
        _register_session(self)

        if not self._client.is_open:
            self._client.open(self._state)

        if self.plots:
            self.plots.connect()

        if focx.is_notebook_context():
            self.show()
            return

        self.open_tab()

    def open_tab(self) -> None:
        """Opens the App in a new tab of your browser.

        This method can be called from Jupyter notebooks to override the
        default location of the App.
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

        if self.browser is None:
            webbrowser.open(self.url, new=2)
        else:
            # open in a specified browser
            webbrowser.get(self.browser).open(self.url, new=2)

    @update_state()
    def show(self, height: int = None) -> None:
        """Opens the App in the output of the current notebook cell.

        This method has no effect in non-notebook contexts.

        Args:
            height (None): a height, in pixels, for the App
        """
        if not focx.is_notebook_context():
            return

        self.freeze()
        if self.dataset is not None:
            self.dataset._reload()

        if height is None:
            height = self.config.notebook_height

        uuid = str(uuid4())
        cell = fosn.NotebookCell(
            address=self.server_address,
            handle=IPython.display.DisplayHandle(display_id=uuid),
            height=height,
            port=self.server_port,
            subscription=uuid,
        )

        self._notebook_cells[uuid] = cell
        fosn.display(self._client, cell, self.config.proxy_url)

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

        All connected windows (tabs) must be closed before this method will
        unblock.

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
            else:
                self._wait_closed = False
                while not self._wait_closed:
                    time.sleep(wait)
        except KeyboardInterrupt:
            self._disable_wait_warning = True
            raise

    def close(self) -> None:
        """Closes the session and terminates the App, if necessary."""
        if self._client.is_open and focx.is_notebook_context():
            self.freeze()

        self.plots.disconnect()
        self.__del__()

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
    on_close_session: t.Callable[[CloseSession], None] = lambda _: setattr(
        session, "_wait_closed", True
    )
    session._client.add_event_listener("close_session", on_close_session)

    on_refresh: t.Callable[[Refresh], None] = lambda event: _on_refresh(
        session, event.state
    )
    session._client.add_event_listener("refresh", on_refresh)

    on_state_update: t.Callable[[StateUpdate], None] = lambda event: setattr(
        session, "_state", event.state
    )
    session._client.add_event_listener("state_update", on_state_update)

    on_select_samples: t.Callable[
        [SelectSamples], None
    ] = lambda event: setattr(session._state, "selected", event.sample_ids)
    session._client.add_event_listener("select_samples", on_select_samples)

    on_select_labels: t.Callable[
        [SelectLabels], None
    ] = lambda event: _on_select_labels(session._state, event)
    session._client.add_event_listener("select_labels", on_select_labels)

    on_set_color_scheme: t.Callable[
        [SetColorScheme], None
    ] = lambda event: setattr(session._state, "color_scheme", event.to_odm())
    session._client.add_event_listener("set_color_scheme", on_set_color_scheme)

    on_set_dataset_color_scheme: t.Callable[
        [SetDatasetColorScheme], None
    ] = lambda _: _on_refresh(session, None)
    session._client.add_event_listener(
        "set_dataset_color_scheme", on_set_dataset_color_scheme
    )

    on_set_group_slice: t.Callable[
        [SetGroupSlice], None
    ] = lambda event: setattr(
        session._state.dataset,
        "group_slice",
        event.slice,
    )
    session._client.add_event_listener("set_group_slice", on_set_group_slice)

    def on_set_sample(event: SetSample) -> None:
        session._state.sample_id = event.sample_id
        session._state.group_id = event.group_id

    session._client.add_event_listener("set_sample", on_set_sample)

    on_set_spaces: t.Callable[[SetSpaces], None] = lambda event: setattr(
        session._state,
        "spaces",
        Space.from_dict(event.spaces),
    )
    session._client.add_event_listener("set_spaces", on_set_spaces)

    if focx.is_notebook_context() and not focx.is_colab_context():

        def on_capture_notebook_cell(event: CaptureNotebookCell) -> None:
            event.subscription in session._notebook_cells and fosn.capture(
                session._notebook_cells[event.subscription],
                event,
                proxy_url=session.config.proxy_url,
            )

        session._client.add_event_listener(
            "capture_notebook_cell", on_capture_notebook_cell
        )

        def on_reactivate_notebook_cell(event: ReactivateNotebookCell) -> None:
            cell = session._notebook_cells.get(event.subscription, None)
            if cell is not None:
                fosn.display(session._client, cell, reactivate=True)

        session._client.add_event_listener(
            "reactivate_notebook_cell", on_reactivate_notebook_cell
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


def _log_welcome_message_if_allowed():
    """Logs a welcome message the first time this function is called on a
    machine with a new FiftyOne version installed, if allowed.
    """
    if os.environ.get("FIFTYONE_SERVER", None):
        return

    try:
        last_version = etas.load_json(focn.WELCOME_PATH)["version"]
    except:
        last_version = None

    if focn.VERSION == last_version:
        return

    logger.info(_WELCOME_MESSAGE.format(focn.VERSION))

    try:
        etas.write_json({"version": focn.VERSION}, focn.WELCOME_PATH)
    except:
        pass


def _on_refresh(session: Session, state: t.Optional[StateDescription]):
    if state:
        session._state = state

    if session.dataset is not None:
        session.dataset.reload()


def _on_select_labels(state: StateDescription, event: SelectLabels):
    setattr(state, "selected_labels", [asdict(data) for data in event.labels])


def _pull_group_slice(
    dataset: t.Optional[fod.Dataset], view: t.Optional[fov.DatasetView]
) -> t.Union[None, str]:
    if view is not None:
        return view.group_slice

    if dataset is not None:
        return dataset.group_slice

    return None
