"""
Interactive plotting utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np

import fiftyone.core.context as foc
import fiftyone.core.utils as fou


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
        self._ensure_accept_callbacks()
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
        self._ensure_accept_callbacks()
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
        self._ensure_accept_callbacks()
        self._register_disconnect_callback(callback)

    def _register_disconnect_callback(self, callback):
        pass

    def _ensure_accept_callbacks(self):
        if self.is_connected:
            raise ValueError(
                "Cannot register callback while plot is connected"
            )

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

    def draw(self):
        """Redraws the plot, if necessary."""
        if not self.is_connected:
            raise ValueError("Plot is not connected")

        self._draw()

    def _draw(self):
        pass

    def select_ids(self, ids):
        """Selects the points with the given IDs in this plot.

        Args:
            ids: a list of IDs
        """
        if not self.is_connected:
            raise ValueError("Plot is not connected")

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
        self._lock_session = False
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

        if self._lock_session:
            return

        if self.is_selecting_samples:
            if self.session.selected:
                sample_ids = self.session.selected
            else:
                sample_ids = self.session._collection.values("id")

            # Lock the session so that it is not updated, since we are
            # responding to the state of the current session
            with fou.SetAttributes(self, _lock_session=True):
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

            # Lock the session so that it is not updated, since we are
            # responding to the state of the current session
            with fou.SetAttributes(self, _lock_session=True):
                self._select_ids(label_ids)

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

        self.refresh()

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

        self.refresh()

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

    def connect(self):
        """Connects to the plot and session."""
        if self.is_connected:
            return

        def _select_ids_from_plot(ids):
            self._select_ids(ids, update_plot=False)

        self.plot.register_selection_callback(_select_ids_from_plot)
        self.plot.register_sync_callback(self.sync)
        self.plot.register_disconnect_callback(self.disconnect)

        if self.bidirectional:
            self.session.add_listener("plot", self._onsessionupdate)

        self._connected = True

    def refresh(self):
        """Refreshes the plot and session."""
        self.plot.draw()
        self._update_session()

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

    def _onsessionupdate(self, _):
        self.sync()

    def _select_ids(self, ids, update_plot=True):
        if not self.is_connected:
            return

        if ids is None:
            ids = []

        ids = np.asarray(ids)

        if update_plot:
            self.plot.select_ids(ids)

        self._ids = ids
        self.refresh()

    def _update_session(self):
        if self._lock_session:
            return

        with fou.SetAttributes(self, _lock_session=True):
            if self.any_selected:
                view = self.selected_view()
            else:
                view = self._init_view

            # Don't spawn a new App instance in notebook contexts here
            with self.session.no_show():
                self.session.view = view
