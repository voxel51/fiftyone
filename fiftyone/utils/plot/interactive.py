"""
Interactive plotting utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import logging
import warnings

import eta.core.utils as etau

import fiftyone.core.context as foc


logger = logging.getLogger(__name__)


class Plot(object):
    """Base class for all plots.

    Args:
        link_type: the link type of the plot
    """

    def __init__(self, link_type):
        self._link_type = link_type
        self._connected = False
        self._disconnected = False
        self._frozen = False

    @property
    def link_type(self):
        """The link type between this plot and a connected session."""
        return self._link_type

    @property
    def supports_session_updates(self):
        """Whether this plot supports automatic updates in response to session
        changes.
        """
        raise NotImplementedError(
            "Subclass must implement supports_session_updates"
        )

    @property
    def is_connected(self):
        """Whether this plot is currently connected."""
        return self._connected

    @property
    def is_disconnected(self):
        """Whether this plot is currently disconnected."""
        return self._disconnected

    @property
    def is_frozen(self):
        """Whether this plot is currently frozen."""
        return self._frozen

    def connect(self):
        """Connects this plot, if necessary."""
        if self.is_connected:
            return

        if self.is_frozen:
            self._reopen()
            self._frozen = False

        self._connect()
        self._connected = True
        self._disconnected = False

    def _connect(self):
        pass

    def show(self, **kwargs):
        """Shows this plot.

        The plot will be connected if necessary.

        Args:
            **kwargs: subclass-specific keyword arguments
        """
        self.connect()
        self._show(**kwargs)

    def _show(self, **kwargs):
        pass

    def _reopen(self):
        pass

    def reset(self):
        """Resets the plot to its default state."""
        raise NotImplementedError("Subclass must implement reset()")

    def freeze(self):
        """Freezes the plot, replacing it with a static image.

        The plot will also be disconnected.

        Only applicable to notebook contexts.
        """
        if not self.is_connected:
            raise ValueError("Plot is not connected")

        if not foc.is_notebook_context():
            raise foc.ContextError("Plots can only be frozen in notebooks")

        self._freeze()
        self._frozen = True

        self.disconnect()

    def _freeze(self):
        pass

    def disconnect(self):
        """Disconnects the plot, if necessary."""
        if not self.is_connected:
            return

        self._disconnect()
        self._connected = False
        self._disconnected = True

    def _disconnect(self):
        pass


class ViewPlot(Plot):
    """Base class for plots that can be automatically populated given a
    :class:`fiftyone.core.collections.SampleCollection` instance.

    Conversely, the state of an :class:`InteractivePlot` can be updated by
    external parties by calling its :meth:`update_view` method.
    """

    def __init__(self):
        super().__init__("view")

    @property
    def supports_session_updates(self):
        return True

    def update_view(self, view):
        """Updates the plot based on the provided view.

        Args:
            view: a :class:`fiftyone.core.collections.SampleCollection`
        """
        if not self.is_connected:
            return

        self._update_view(view)

    def _update_view(self, view):
        raise ValueError("Subclass must implement _update_view()")

    def reset(self):
        """Resets the plot to its default state."""
        self.update_view(None)


class InteractivePlot(Plot):
    """Base class for plots that support selection of their points.

    Whenever a selection is made in an :class:`InteractivePlot`, the plot will
    invoke any selection callback(s) registered on it, reporting to its
    listeners the IDs of its selected points.

    Conversely, the state of an :class:`InteractivePlot` can be updated by
    external parties by calling its :meth:`select_ids` method.

    Args:
        link_type ("samples"): whether this plot is linked to "samples" or
            "labels"
        label_fields (None): an optional label field or list of label fields to
            which points in this plot correspond. Only applicable when linked
            to labels
        init_view (None): a :class:`fiftyone.core.collections.SampleCollection`
            to load when no points are selected in the plot
    """

    def __init__(self, link_type="samples", label_fields=None, init_view=None):
        supported_link_types = ("samples", "labels")
        if link_type not in supported_link_types:
            raise ValueError(
                "Unsupported link_type '%s'; supported values are %s"
                % (link_type, supported_link_types)
            )

        self.label_fields = label_fields
        self.init_view = init_view

        super().__init__(link_type)

    @property
    def selected_ids(self):
        """A list of IDs of the currently selected points.

        An empty list means all points are deselected, and None means default
        state (nothing selected or unselected).

        If the plot is not connected, returns None.
        """
        if not self.is_connected:
            return None

        return self._selected_ids

    @property
    def _selected_ids(self):
        raise NotImplementedError("Subclass must implement _selected_ids")

    def register_selection_callback(self, callback):
        """Registers a selection callback for this plot.

        Selection callbacks are functions that take a single argument
        containing the list of currently selected IDs.

        If a selection callback is registred, this plot should invoke it each
        time their selection is updated.

        Args:
            callback: a selection callback
        """
        self._register_selection_callback(callback)

    def _register_selection_callback(self, callback):
        raise ValueError(
            "Subclass must implement _register_selection_callback()"
        )

    def register_sync_callback(self, callback):
        """Registers a callback that can sync this plot with a
        :class:`SessionPlot` connected to it.

        The typical use case for this function is to serve as the callback for
        a ``sync`` button on the plot.

        Args:
            callback: a function with no arguments
        """
        self._register_sync_callback(callback)

    def _register_sync_callback(self, callback):
        pass

    def register_disconnect_callback(self, callback):
        """Registers a callback that can disconnect this plot from a
        :class:`SessionPlot` connected to it.

        The typical use case for this function is to serve as the callback for
        a ``disconnect`` button on the plot.

        Args:
            callback: a function with no arguments
        """
        self._register_disconnect_callback(callback)

    def _register_disconnect_callback(self, callback):
        pass

    def select_ids(self, ids):
        """Selects the points with the given IDs in this plot.

        Args:
            ids: a list of IDs
        """
        if not self.is_connected:
            return

        self._select_ids(ids)

    def _select_ids(self, ids):
        raise ValueError("Subclass must implement _select_ids()")

    def reset(self):
        """Resets the plot to its default state."""
        self.select_ids(None)


class PlotManager(object):
    """Class that manages communication between a
    :class:`fiftyone.core.session.Session` and one or more :class:`Plot`
    instances.

    Each plot can be linked to either the view, samples, or labels of a
    session:

    -   **View links:** When a plot has ``link_type == "view"``, then, when the
        session's view changes, the plot is updated based on the content of the
        view

    -   **Sample links:** When points are selected in a plot with
        ``link_type == "samples"``, a view containing the corresponding samples
        is loaded in the App. Conversely, when the session's view changes, the
        corresponding points are selected in the plot

    -   **Label links:** When points are selected in a plot with
        ``link_type == "labels"``, a view containing the corresponding labels
        is loaded in the App. Conversely, when the session's view changes, the
        points in the plot corresponding to all labels in the view are selected
        in the plot

    Args:
        session: a :class:`fiftyone.core.session.Session`
    """

    _MIN_UPDATE_DELTA_SECONDS = 0.5
    _LISTENER_NAME = "PlotManager"

    def __init__(self, session):
        self._session = session
        self._plots = {}
        self._init_view = session._collection.view()
        self._current_sample_ids = None
        self._current_labels = None
        self._last_update = None
        self._last_updates = {}
        self._connected = False
        self._disconnected = False

    def __iter__(self):
        return iter(self._plots)

    def __contains__(self, name):
        return name in self._plots

    def __setitem__(self, name, plot):
        self.add(plot, name=name)

    def __getitem__(self, name):
        return self._plots[name]

    def __delitem__(self, name):
        self.remove(name)

    def __bool__(self):
        return bool(self._plots)

    def __len__(self):
        return len(self._plots)

    def keys(self):
        """Returns an iterator over the names of plots in this manager.

        Returns:
            an interator over plot names
        """
        return self._plots.keys()

    def items(self):
        """Returns an iterator over the ``(name, plot)`` pairs in this manager.

        Returns:
            an iterator that emits ``(name, Plot)`` tuples
        """
        return self._plots.items()

    def values(self):
        """Returns an iterator over the plots in this manager.

        Returns:
            an iterator that emits :class:`Plot` instances
        """
        return self._plots.values()

    @property
    def is_connected(self):
        """Whether this manager is currently connected to its plots."""
        return self._connected

    @property
    def is_disconnected(self):
        """Whether this manager is currently disconnected from its plots."""
        return self._disconnected

    @property
    def has_view_links(self):
        """Whether this manager has plots linked to views."""
        return any(
            plot.link_type == "view"
            for plot in self._plots.values()
            if plot.is_connected
        )

    @property
    def has_sample_links(self):
        """Whether this manager has plots linked to samples."""
        return any(
            plot.link_type == "samples"
            for plot in self._plots.values()
            if plot.is_connected
        )

    @property
    def has_label_links(self):
        """Whether this manager has plots linked to labels."""
        return any(
            plot.link_type == "labels"
            for plot in self._plots.values()
            if plot.is_connected
        )

    def add(self, plot, name=None, connect=True, overwrite=True):
        """Adds a plot to this manager.

        Args:
            plot: an :class:`fiftyone.utils.plot.interactive.InteractivePlot`
            name (None): a name for the plot
            connect (True): whether to immediately connect the plot
            overwrite (True): whether to overwrite an existing plot of the same
                name
        """
        if name is None:
            name = "plot %d" % (len(self._plots) + 1)

        if name == "session":
            raise ValueError("Cannot use reserved name 'session' for a plot")

        if name in self._plots:
            if not overwrite:
                raise ValueError("A plot with name '%s' already exists" % name)

            _plot = self.pop(name)
            if _plot.is_connected:
                _plot.disconnect()

        self._plots[name] = plot

        if connect:
            if not self.is_connected:
                self.connect()
            else:
                self._connect_plot(name)
                self._update_plot(name)

    def remove(self, name):
        """Removes the plot from this manager.

        Args:
            name: the name of a plot
        """
        self.pop(name)

    def clear(self):
        """Removes all plots from this manager."""
        plot_names = list(self._plots.keys())
        for name in plot_names:
            self.remove(name)

    def pop(self, name):
        """Removes the plot from this manager and returns it.

        Args:
            name: the name of a plot

        Returns:
            the :class:`Plot`
        """
        if name not in self._plots:
            raise ValueError("No plot with name '%s'" % name)

        plot = self._plots.pop(name)
        plot.disconnect()
        return plot

    def connect(self):
        """Connects this manager to its session and all plots."""
        if self.is_connected:
            return

        for name in self._plots:
            self._connect_plot(name)

        self._session.add_listener(
            self._LISTENER_NAME, self._on_session_update
        )

        self._connected = True
        self._disconnected = False

        self.sync()

    def _connect_plot(self, name):
        plot = self._plots[name]

        if isinstance(plot, ViewPlot):
            # Load current view
            plot.update_view(self._session._collection.view())

        if isinstance(plot, InteractivePlot):
            # Register plot's callbacks

            def _on_plot_selection(ids):
                self._on_plot_selection(name, ids)

            plot.register_selection_callback(_on_plot_selection)
            plot.register_sync_callback(self.sync)
            plot.register_disconnect_callback(self.disconnect)

        plot.connect()

    def disconnect(self):
        """Disconnects this manager from its session and all plots."""
        if not self.is_connected:
            return

        key = self._LISTENER_NAME
        if self._session.has_listener(key):
            self._session.delete_listener(key)

        for name in self._plots:
            self._disconnect_plot(name)

        self._connected = False
        self._disconnected = True

    def _disconnect_plot(self, name):
        plot = self._plots[name]
        plot.disconnect()

    def reset(self):
        """Resets the session and all plots to their default views."""
        if not self.is_connected:
            return

        self._current_sample_ids = None
        self._current_labels = None
        self._update_session(self._init_view)

    def sync(self):
        """Syncs all plots with the session's current view."""
        if not self.is_connected:
            return

        self._update_ids_from_session()
        self._update_plots()

    def freeze(self):
        """Freezes the active App cell and all connected plots, replacing them
        with static images.

        Only applicable to notebook contexts.
        """
        if not self.is_connected:
            return

        self._session.freeze()

        for plot in self._plots.values():
            if plot.is_connected:
                plot.freeze()

        self.disconnect()

    def _on_session_update(self, _):
        if not self.is_connected:
            return

        if not self._ready_for_update("session"):
            return

        self._update_ids_from_session()
        self._update_plots_from_session()

    def _on_plot_selection(self, name, ids):
        plot = self._plots[name]

        if not plot.is_connected:
            return

        if not self._ready_for_update(name):
            return

        if plot.init_view is not None:
            plot_view = plot.init_view.view()
        else:
            plot_view = self._init_view

        if ids is None:
            # Plot is in default state, so reset things here
            self._current_sample_ids = None
            self._current_labels = None
        elif plot.link_type == "labels":
            # Create a view that contains only the selected labels in the plot
            plot_view = plot_view.select_labels(
                ids=ids, fields=plot.label_fields
            )

            field = plot.label_fields
            if field is not None and not etau.is_str(field):
                field = None  # multiple fields; unclear which one to use

            self._current_sample_ids = plot_view.values("id")
            self._current_labels = [
                {"field": field, "label_id": _id} for _id in ids
            ]
        elif plot.link_type == "samples":
            # Create a view that contains only the selected samples in the plot
            plot_view = plot_view.select(ids)

            if self.has_label_links:
                # Other plots need labels, so we need to record all labels in
                # `plot_view` as well
                labels = plot_view._get_selected_labels()
            else:
                labels = None

            self._current_sample_ids = ids
            self._current_labels = labels
        else:
            msg = (
                "Ignoring update from plot '%s' with unsupported link type "
                "'%s'"
            ) % (name, plot.link_type)
            warnings.warn(msg)

        self._update_session(plot_view)
        self._update_plots_from_session()

    def _update_ids_from_session(self):
        session_view = self._session._collection.view()

        # The session is in its default state, so reset all plots
        if session_view == self._init_view:
            self._current_sample_ids = None
            self._current_labels = None
            return

        # If labels are selected in the App, only record those. Otherwise, get
        # all labels in the current view
        if self.has_label_links:
            if self._session.selected_labels:
                self._current_labels = self._session.selected_labels
            else:
                self._current_labels = session_view._get_selected_labels()

        # If samples are selected in the App, only record those. Otherwise, get
        # IDs of all samples in the view
        if self.has_sample_links:
            if self._session.selected:
                self._current_sample_ids = self._session.selected
            else:
                ids = self._session._collection.values("id")
                self._current_sample_ids = ids

    def _update_session(self, view):
        if not self._needs_update("session"):
            return

        with self._session.no_show():
            self._session.view = view

    def _update_plots_from_session(self):
        for name, plot in self._plots.items():
            if plot.supports_session_updates:
                self._update_plot(name)

    def _update_plots(self):
        for name in self._plots:
            self._update_plot(name)

    def _update_plot(self, name):
        plot = self._plots[name]

        if not plot.is_connected:
            return

        if not self._needs_update(name):
            return

        if plot.link_type == "view":
            plot.update_view(self._session._collection.view())
        elif plot.link_type == "samples":
            plot.select_ids(self._current_sample_ids)
        elif plot.link_type == "labels":
            label_ids = self._get_current_label_ids_for_plot(plot)
            plot.select_ids(label_ids)
        else:
            raise ValueError(
                "Plot '%s' has unsupported link type '%s'"
                % (name, plot.link_type)
            )

    def _get_current_label_ids_for_plot(self, plot):
        if self._current_labels is None:
            return None

        label_fields = plot.label_fields

        if not isinstance(label_fields, (list, set, tuple)):
            label_fields = [label_fields]

        return [
            l["label_id"]
            for l in self._current_labels
            if l["field"] in label_fields
        ]

    def _ready_for_update(self, name):
        now = datetime.datetime.utcnow()

        if self._last_update is None:
            is_new_update = True
        else:
            delta = (now - self._last_update).total_seconds()
            is_new_update = delta > self._MIN_UPDATE_DELTA_SECONDS

        if is_new_update:
            self._last_update = now
            self._last_updates[name] = now

        return is_new_update

    def _needs_update(self, name):
        now = datetime.datetime.utcnow()

        last_update = self._last_updates.get(name, None)

        if last_update is None:
            ready = True
        else:
            delta = (now - last_update).total_seconds()
            ready = delta > self._MIN_UPDATE_DELTA_SECONDS

        if ready:
            self._last_updates[name] = now

        return ready
