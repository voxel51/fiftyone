"""
Interactive plotting utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import logging

import eta.core.utils as etau

import fiftyone.core.context as foc


logger = logging.getLogger(__name__)


class InteractivePlot(object):
    """Base class for plots that support selection of their points.

    Whenever the user performs a selection in an interactive plot, the plot
    will invoke any selection callback(s) registered on it, reporting to
    listeners the IDs of their selected points.

    Args:
        link_type ("samples"): whether this plot is linked to "samples" or
            "labels"
        label_fields (None): an optional list of label fields to which points
            in this plot correspond. Only applicable when linked to labels
    """

    _LINK_TYPES = ("samples", "labels")

    def __init__(self, link_type="samples", label_fields=None):
        if link_type not in self._LINK_TYPES:
            raise ValueError(
                "Unsupported link_type '%s'; supported values are %s"
                % (link_type, self._LINK_TYPES)
            )

        self._connected = False
        self._disconnected = False
        self._link_type = link_type
        self._label_fields = label_fields

    @property
    def link_type(self):
        """Whether this plot is linked to samples or labels."""
        return self._link_type

    @property
    def label_fields(self):
        """An optional list of label fields to which points in this plot
        correspond.

        Always ``None`` when this plot is linked to samples.
        """
        return self._label_fields

    @property
    def supports_bidirectional_updates(self):
        """Whether this plot supports automatic updates in response to session
        changes.
        """
        raise NotImplementedError(
            "Subclass must implement supports_bidirectional_updates"
        )

    @property
    def is_connected(self):
        """Whether this plot is currently connected."""
        return self._connected

    @property
    def any_selected(self):
        """Whether any points are currently selected, or ``None`` if the plot
        is not connected.
        """
        if not self.is_connected:
            return None

        return self._any_selected

    @property
    def _any_selected(self):
        raise NotImplementedError("Subclass must implement _any_selected")

    @property
    def selected_ids(self):
        """A list of IDs of the currently selected points, or ``None`` if the
        plot is not connected.
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

    def show(self):
        """Shows this plot."""
        if self._disconnected:
            raise ValueError("Plot has been disconnected")

        if self.is_connected:
            return

        self._show()
        self._connected = True

    def _show(self):
        pass

    def reset(self):
        """Resets the plot to its initial state."""
        self.select_ids([])

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
        self.disconnect()

    def _freeze(self):
        pass

    def disconnect(self):
        """Disconnects the plot."""
        if not self.is_connected:
            return

        self._disconnect()
        self._connected = False
        self._disconnected = True

    def _disconnect(self):
        pass


class InteractivePlotManager(object):
    """Class that manages communication between a
    :class:`fiftyone.core.session.Session` and one or more
    :class:`InteractivePlot` instances.

    Each plot can be linked to either the samples or labels of a session:

    -   Sample selection: When points are selected in a plot with
        ``link_type == "samples"``, a view containing the corresponding samples
        is loaded in the App. Conversely, when the session's view changes, the
        corresponding points are selected in the plot

    -   Label selection: When points are selected in a plot with
        ``link_type == "labels"``, a view containing the corresponding labels
        is loaded in the App. Conversely, when the session's view changes, the
        points in the plot corresponding to all labels in the view are selected
        in the plot

    Args:
        session: a :class:`fiftyone.core.session.Session`
        connect (True): whether to immediately connect the manager
    """

    _MIN_UPDATE_DELTA_SECONDS = 0.5

    def __init__(self, session, connect=True):
        self.session = session
        self.plots = {}

        self._init_view = session._collection.view()
        self._current_sample_ids = None
        self._current_labels = None
        self._last_update = None
        self._last_updates = {}
        self._connected = False

        if connect:
            self.connect()

    @property
    def is_connected(self):
        """Whether this manager is currently connected to its plots."""
        return self._connected

    @property
    def has_sample_links(self):
        """Whether this manager has plots linked to samples."""
        return any(
            plot.plot.link_type == "samples"
            for plot in self.plots.values()
            if plot.plot.is_connected
        )

    @property
    def has_label_links(self):
        """Whether this manager has plots linked to labels."""
        return any(
            plot.plot.link_type == "labels"
            for plot in self.plots.values()
            if plot.plot.is_connected
        )

    def add_plot(self, plot, name):
        """Adds a plot to this manager.

        Args:
            plot: an :class:`fiftyone.utils.plot.interactive.InteractivePlot`
            name: a name for the plot
        """
        if name == "session":
            raise ValueError("Cannot use reserved name 'session' for a plot")

        if name in self.plots:
            raise ValueError(
                "A plot with name '%s' already exists; you must disconnect "
                "it before adding a new plot under this name" % name
            )

        self.plots[name] = _ManagedPlot(
            plot, name, bidirectional=plot.supports_bidirectional_updates
        )

        if self.is_connected:
            self._connect_plot(name)

    def remove_plot(self, name):
        """Removes a plot from this manager.

        Args:
            name: the name of a plot
        """
        self.pop_plot(name)

    def remove_plots(self):
        """Remove all plots from this manager."""
        plot_names = list(self.plots.keys())
        for name in plot_names:
            self.remove_plot(name)

    def pop_plot(self, name):
        """Removes the plot from this manager and returns it.

        Args:
            name: the name of a plot

        Returns:
            the :class:`fiftyone.utils.plot.interactive.InteractivePlot`
        """
        if name not in self.plots:
            raise ValueError("No plot found with name '%s'" % name)

        plot = self.plots.pop(name)

        if plot.bidirectional and plot.listener_name is not None:
            self.session.delete_listener(plot.listener_name)

        return plot.plot

    def connect(self):
        """Connects this manager to its session and all plots."""
        if self.is_connected:
            return

        for name in self.plots:
            self._connect_plot(name)

        self._connected = True

    def _connect_plot(self, name):
        plot = self.plots[name]

        def _on_plot_selection(ids):
            self._on_plot_selection(name, ids)

        plot.plot.register_selection_callback(_on_plot_selection)
        plot.plot.register_sync_callback(self.sync)
        plot.plot.register_disconnect_callback(self.disconnect)

        if plot.bidirectional:
            if self.session.has_listener(name):
                logger.warning(
                    "Overwriting existing listener with key '%s'", name
                )

            plot.listener_name = name
            self.session.add_listener(name, self._on_session_update)

    def disconnect(self):
        """Connects this manager from its session and all plots."""
        if not self.is_connected:
            return

        for name in self.plots:
            self._disconnect_plot(name)

        self._connected = False

    def _disconnect_plot(self, name):
        plot = self.plots[name]

        if plot.bidirectional:
            self.session.delete_listener(plot.listener_name)

        plot.plot.disconnect()

    def reset(self):
        """Resets the session and all plots to their initial view."""
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
        self._update_all_plots()

    def freeze(self):
        """Freezes the active App cell and all connected plots, replacing them
        with static images.

        This will also disconnect the manager and all plots.

        Only applicable to notebook contexts.
        """
        if not self.is_connected:
            return

        self.session.freeze()

        for plot in self.plots.values():
            if plot.plot.is_connected:
                plot.plot.freeze()

        self.disconnect()

    def _on_session_update(self, _):
        if not self.is_connected:
            return

        if not self._ready_for_update("session"):
            return

        self._update_ids_from_session()

        # Can't update unidirectional plots in this callback, which isn't
        # running in the main process
        self._update_bidirectional_plots()

    def _on_plot_selection(self, name, ids):
        plot = self.plots[name].plot

        if not plot.is_connected:
            return

        if not self._ready_for_update(name):
            return

        if plot.link_type == "labels":
            plot_view = self._init_view.select_labels(
                ids=ids, fields=plot.label_fields
            )

            field = plot.label_fields
            if field is not None and not etau.is_str(field):
                field = None  # multiple fields; unclear which one to use

            self._current_labels = [
                {"field": field, "label_id": _id} for _id in ids
            ]
        else:
            plot_view = self._init_view.select(ids)
            self._current_sample_ids = ids

        self._update_session(plot_view)

        # Can't update unidirectional plots in this callback, which isn't
        # running in the main process
        self._update_bidirectional_plots()

    def _update_ids_from_session(self):
        if self.has_label_links:
            if self.session.selected_labels:
                self._current_labels = self.session.selected_labels
            else:
                view = self.session._collection
                self._current_labels = view._get_selected_labels()

        if self.session.selected:
            self._current_sample_ids = self.session.selected
        else:
            self._current_sample_ids = self.session._collection.values("id")

    def _update_session(self, view):
        if not self._needs_update("session"):
            return

        with self.session.no_show():
            self.session.view = view

    def _update_all_plots(self):
        for name in self.plots:
            self._update_plot(name)

    def _update_bidirectional_plots(self):
        for name, plot in self.plots.items():
            if plot.bidirectional:
                self._update_plot(name)

    def _update_plot(self, name):
        if not self._needs_update(name):
            return

        plot = self.plots[name].plot

        if plot.link_type == "labels":
            label_ids = self._get_current_label_ids(plot.label_fields)
            plot.select_ids(label_ids)
        else:
            plot.select_ids(self._current_sample_ids)

    def _get_current_label_ids(self, label_fields):
        if self._current_labels is None:
            return None

        if not isinstance(label_fields, (list, set, tuple)):
            label_fields = [label_fields]

        return [
            l["label_id"]
            for l in self._current_labels
            if label_fields is None or l["field"] in label_fields
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


class _ManagedPlot(object):
    """Internal class for tracking the state of an :class:`InteractivePlot`
    connected to a :class:`InteractivePlotManager`.
    """

    def __init__(self, plot, name, bidirectional, listener_name=None):
        self.plot = plot
        self.name = name
        self.bidirectional = bidirectional
        self.listener_name = listener_name
