"""
Interactive plotting utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import numpy as np

import fiftyone.core.context as foc


class InteractivePlot(object):
    """Base class for plots that support selection of their points.

    Whenever the user performs a selection in an interactive plot, the plot
    will invoke any selection callback(s) registered on it, reporting to
    listeners the IDs of their selected points.
    """

    def __init__(self):
        self._connected = False
        self._disconnected = False

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
        """Freezes the plot, replacing it with static content in its output
        cell.

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


class SessionPlot(object):
    """Class that manages communication between a
    :class:`fiftyone.core.session.Session` and an :class:`InteractivePlot`
    whose points correspond to the session.

    Plots can be linked to either samples or labels of a session:

    -   Sample selection: If ``link_type == "samples"``, then when points are
        selected, a view containing the corresponding samples will be loaded in
        the App

    -   Label selection: If ``link_type == "labels"``, then when points are
        selected, a view containing the corresponding labels will be loaded in
        the App

    Args:
        session: a :class:`fiftyone.core.session.Session`
        plot: an :class:`InteractivePlot`
        link_type ("samples"): whether this session is linking samples or
            labels. Supported values are ``("samples", "labels")``
        label_fields (None): a field or iterable of fields containing the
            labels in ``plot``. Only applicable when ``link_type`` is "labels"
        bidirectional (True): whether to update ``plot`` in response to
            changes in ``session``
        connect (True): whether to immediately connect the session and plot
    """

    _SAMPLES = "samples"
    _LABELS = "labels"
    _MIN_UPDATE_DELTA_SECONDS = 0.5

    def __init__(
        self,
        session,
        plot,
        link_type="samples",
        label_fields=None,
        bidirectional=True,
        connect=True,
    ):
        _LINK_TYPES = (self._SAMPLES, self._LABELS)
        if link_type not in _LINK_TYPES:
            raise ValueError(
                "Unsupported link_type '%s'; supported values are %s"
                % (link_type, _LINK_TYPES)
            )

        self.session = session
        self.plot = plot
        self.link_type = link_type
        self.label_fields = label_fields
        self.bidirectional = bidirectional

        self._ids = np.array([], dtype=str)
        self._init_view = session._collection.view()
        self._last_update = None
        self._last_updates = {}
        self._connected = False

        if connect:
            self.connect()

    @property
    def is_connected(self):
        """Whether this object is currently connected."""
        return self._connected

    @property
    def is_selecting_samples(self):
        """Whether this session is linked to samples."""
        return self.link_type == self._SAMPLES

    @property
    def is_selecting_labels(self):
        """Whether this session is linked to labels."""
        return self.link_type == self._LABELS

    @property
    def any_selected(self):
        """Whether any points are currently selected, or None if not connected.
        """
        if not self.is_connected:
            return None

        return self._ids.size > 0

    @property
    def selected_ids(self):
        """A list of the IDs of the currently selected samples/labels, or None
        if not connected.
        """
        if not self.is_connected:
            return None

        return list(self._ids)

    def select(self, ids):
        """Selects the points corresponding to the given sample/label IDs.

        Args:
            ids: a list of IDs
        """
        self._select_ids(ids)

    def selected_view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        currently selected samples/labels.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`, or None if no points are
            selected
        """
        if not self.is_connected:
            raise ValueError("Session is not connected")

        if not self.any_selected:
            return None

        if self.is_selecting_samples:
            return self._init_view.select(self.selected_ids)

        if self.is_selecting_labels:
            return self._init_view.select_labels(
                ids=self.selected_ids, fields=self.label_fields
            )

        return None

    def refresh(self):
        """Refreshes the plot and session."""

        self._select_ids(self.selected_ids)

    def reset(self):
        """Resets the plot and session to their initial view."""
        self._select_ids(None)

    def sync(self):
        """Syncs the plot with the session's current view.

        If this session is selecting samples:

        -   If samples are selected in the session (``session.selected``), only
            select those
        -   Otherwise, select all samples in the current view

        If this session is selecting labels:

        -   If labels are selected in the session
            (``session.selected_labels``), only select those
        -   Else if samples are selected (``session.selected``), only select
            their labels
        -   Otherwise, select all labels in the current view
        """
        if not self.is_connected:
            raise ValueError("Session is not connected")

        self._sync()

    def tag_selected(self, tag):
        """Adds the tag to the currently selected samples/labels, if
        necessary.

        Args:
            tag: a tag
        """
        view = self.selected_view()

        if view is None:
            return

        if self.is_selecting_samples:
            view.tag_samples(tag)

        if self.is_selecting_labels:
            view.tag_labels(tag, label_fields=self.label_fields)

        self.session.refresh()

    def untag_selected(self, tag):
        """Removes the tag from the currently selected samples/labels, if
        necessary.

        Args:
            tag: a tag
        """
        view = self.selected_view()

        if view is None:
            return

        if self.is_selecting_samples:
            view.untag_samples(tag)

        if self.is_selecting_labels:
            view.untag_labels(tag, label_fields=self.label_fields)

        self.session.refresh()

    def connect(self):
        """Connects to the plot and session."""
        if self.is_connected:
            return

        self._connected = True

        self.plot.register_selection_callback(self._on_plot_update)
        self.plot.register_sync_callback(self.sync)
        self.plot.register_disconnect_callback(self.disconnect)

        if self.bidirectional:
            self.session.add_listener("plot", self._on_session_update)

    def disconnect(self):
        """Disconnects from the plot and sesssion."""
        if not self.is_connected:
            return

        self.plot.disconnect()

        if self.bidirectional:
            self.session.delete_listener("plot")

        self._connected = False

    def freeze(self):
        """Freezes the session and plot.

        This will also disconnect from the session and plot.
        """
        if not self.is_connected:
            return

        self.session.freeze()
        self.plot.freeze()
        self.disconnect()

    def _ready_for_update(self, source):
        now = datetime.datetime.utcnow()

        if self._last_update is None:
            is_new_update = True
        else:
            delta = (now - self._last_update).total_seconds()
            is_new_update = delta > self._MIN_UPDATE_DELTA_SECONDS

        if is_new_update:
            self._last_update = now
            self._last_updates[source] = now

        return is_new_update

    def _needs_update(self, source):
        now = datetime.datetime.utcnow()

        last_update = self._last_updates.get(source, None)

        if last_update is None:
            ready = True
        else:
            delta = (now - last_update).total_seconds()
            ready = delta > self._MIN_UPDATE_DELTA_SECONDS

        if ready:
            self._last_updates[source] = now

        return ready

    def _on_session_update(self, _):
        if not self.is_connected:
            return

        if not self._ready_for_update("session"):
            return

        self._sync()

    def _on_plot_update(self, ids):
        if not self.is_connected:
            return

        if not self._ready_for_update("plot"):
            return

        self._select_ids(ids)

    def _select_ids(self, ids):
        if not self.is_connected:
            return

        if ids is None:
            ids = []

        self._ids = np.asarray(ids)

        if self._needs_update("plot"):
            self._update_plot()

        if self._needs_update("session"):
            self._update_session()

    def _update_plot(self):
        self.plot.select_ids(self._ids)

    def _update_session(self):
        if self.any_selected:
            view = self.selected_view()
        else:
            view = self._init_view

        # Don't spawn a new App instance in notebook contexts
        with self.session.no_show():
            self.session.view = view

    def _sync(self):
        if self.is_selecting_samples:
            if self.session.selected:
                sample_ids = self.session.selected
            else:
                sample_ids = self.session._collection.values("id")

            self._select_ids(sample_ids)

        if self.is_selecting_labels:
            if self.session.selected_labels:
                label_ids = [
                    o["label_id"] for o in self.session.selected_labels
                ]
            else:
                view = self.session._collection
                if self.session.selected:
                    view = view.select(self.session.selected)

                label_ids = view._get_label_ids(fields=self.label_fields)

            self._select_ids(label_ids)
