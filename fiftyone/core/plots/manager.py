"""
Session plot manager.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import itertools
import logging
import warnings

import eta.core.utils as etau

import fiftyone.core.patches as fop

from .base import ResponsivePlot, ViewPlot, InteractivePlot


logger = logging.getLogger(__name__)


class PlotManager(object):
    """Class that manages communication between a
    :class:`fiftyone.core.session.Session` and one or more
    :class:`ResponsivePlot` instances.

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

    _MIN_UPDATE_DELTA_SECONDS = 1
    _LISTENER_NAME = "plots"

    def __init__(self, session):
        self._session = None
        self._plots = {}
        self._aggs = {}
        self._current_sample_ids = None
        self._current_labels = None
        self._last_session_view = None
        self._last_update = None
        self._last_updates = {}
        self._connected = False
        self._disconnected = False

        self._set_session(session)

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return self.summary()

    def __iter__(self):
        return iter(self._plots)

    def __contains__(self, name):
        return name in self._plots

    def __setitem__(self, name, plot):
        self.attach(plot, name=name)

    def __getitem__(self, name):
        return self._plots[name]

    def __delitem__(self, name):
        self.remove(name)

    def __bool__(self):
        return bool(self._plots)

    def __len__(self):
        return len(self._plots)

    def _set_session(self, session):
        if self.is_connected:
            self.disconnect()

        self._session = session

        if self._plots:
            self.connect()

    def summary(self):
        """Returns a string summary of this manager.

        Returns:
            a string summary
        """
        if not self._plots:
            return "No plots"

        elements = []

        connected_plots = [
            name for name, p in self._plots.items() if p.is_connected
        ]
        if connected_plots:
            elements.append("Connected plots:")
            elements.extend(self._summarize_plots(connected_plots))

        disconnected_plots = [
            name for name, p in self._plots.items() if not p.is_connected
        ]
        if disconnected_plots:
            elements.append("Disconnected plots:")
            elements.extend(self._summarize_plots(disconnected_plots))

        return "\n".join(elements)

    def _summarize_plots(self, names):
        maxlen = max(len(name) for name in names) + 1
        fmt = "    %%-%ds %%s" % maxlen

        elements = []
        for name in names:
            plot = self._plots[name]
            elements.append(fmt % (name + ":", etau.get_class_name(plot)))

        return elements

    def keys(self):
        """Returns an iterator over the names of plots in this manager.

        Returns:
            an interator over plot names
        """
        return self._plots.keys()

    def items(self):
        """Returns an iterator over the ``(name, plot)`` pairs in this manager.

        Returns:
            an iterator that emits ``(name, ResponsivePlot)`` tuples
        """
        return self._plots.items()

    def values(self):
        """Returns an iterator over the plots in this manager.

        Returns:
            an iterator that emits :class:`ResponsivePlot` instances
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

    def attach(self, plot, name=None, connect=True, overwrite=True):
        """Attaches a plot to this manager.

        Args:
            plot: a :class:`fiftyone.core.plots.base.ResponsivePlot`
            name (None): an optional name for the plot
            connect (True): whether to immediately connect the plot
            overwrite (True): whether to overwrite an existing plot of the same
                name
        """
        if not isinstance(plot, ResponsivePlot):
            # @todo add docs link to error message
            raise ValueError(
                "Plots must be subclasses of %s; but found %s. You may be "
                "working in an environment that does not support interactivity"
                % (ResponsivePlot, type(plot))
            )

        same_plots = [(n, p) for n, p in self._plots.items() if p is plot]
        if same_plots:
            current_name = same_plots[0][0]
            if name is not None and name != current_name:
                logger.warning(
                    "Plot is already attached under name '%s'", current_name
                )

            return

        if name is None:
            name = "plot%d" % (len(self._plots) + 1)

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
                self._update_plots([name])

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
            the :class:`ResponsivePlot`
        """
        if name not in self._plots:
            raise ValueError("No plot with name '%s'" % name)

        plot = self._plots.pop(name)
        self._aggs.pop(name, None)

        plot.disconnect()

        if not self._plots:
            self.disconnect()

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
            # Record aggregations for efficient batch-updates
            self._aggs[name] = plot._get_aggregations()

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

        self._last_update = None
        self._last_updates = {}
        self._connected = False
        self._disconnected = True

    def _disconnect_plot(self, name):
        plot = self._plots[name]
        plot.disconnect()

    def sync(self):
        """Syncs all connected plots with the session's current view."""
        if not self.is_connected:
            return

        self._update_ids_from_session()
        self._update_all_plots()

    def freeze(self):
        """Freezes all connected plots, replacing them with static images.

        Only applicable in notebook contexts.
        """
        if not self.is_connected:
            return

        for plot in self._plots.values():
            if plot.is_connected:
                plot.freeze()

        self.disconnect()

    def _on_session_update(self, _):
        if not self.is_connected:
            return

        if not self._ready_for_update("session"):
            return

        if self._session.view == self._last_session_view:
            return

        self._update_ids_from_session()
        self._update_plots_from_session()

    def _on_plot_selection(self, name, ids):
        plot = self._plots[name]

        if not plot.is_connected:
            return

        if not self._ready_for_update(name):
            return

        plot_view = plot.init_view
        if plot_view is not None:
            plot_view = plot_view.view()
        else:
            plot_view = self._session.dataset.view()

        if ids is None:
            # Plot is in default state, so reset things here
            self._current_sample_ids = None
            self._current_labels = None
        elif plot.link_type == "labels":
            if plot.selection_mode == "select":
                # Create a view that contains only the selected labels in the
                # plot
                plot_view = plot_view.select_labels(
                    ids=ids, fields=plot.label_fields
                )
            elif plot.selection_mode == "match":
                # Create a view that only contains unfiltered samples with at
                # least one selected label
                plot_view = plot_view.match_labels(
                    ids=ids, fields=plot.label_fields
                )
            elif plot.selection_mode == "patches":
                # Create a patches view that contains only the selected patches
                if isinstance(plot_view, fop.PatchesView):
                    plot_view = plot_view.select(ids)
                else:
                    plot_view = plot_view.match_labels(
                        ids=ids, fields=plot.label_fields
                    )
            else:
                raise ValueError(
                    "Unsupported `selection_mode=%s`" % plot.selection_mode
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
        self._update_plots_from_session(exclude=[name])

    def _update_ids_from_session(self):
        session = self._session
        current_view = session._collection.view()
        has_view = session.view is not None
        has_selections = session.selected or session.selected_labels

        # If no view is loaded and nothing is selected, reset all plots
        if not has_view and not has_selections:
            self._current_sample_ids = None
            self._current_labels = None
            return

        # If labels are selected in the App, only record those
        # If samples are selected in the App, only record their labels
        # Otherwise, record all labels in the current view
        if self.has_label_links:
            if session.selected_labels:
                self._current_labels = session.selected_labels
            elif session.selected:
                selected_view = current_view.select(session.selected)
                self._current_labels = selected_view._get_selected_labels()
            else:
                self._current_labels = current_view._get_selected_labels()

        # If samples are selected in the App, only record those
        # Otherwise, record all samples in the view
        if self.has_sample_links:
            if session.selected:
                self._current_sample_ids = session.selected
            else:
                self._current_sample_ids = current_view.values("id")

    def _update_session(self, view):
        if not self._needs_update("session"):
            return

        self._last_session_view = view
        with self._session.no_show():
            self._session.view = view

    def _update_plots_from_session(self, exclude=None):
        exclude = set(exclude or [])
        names = [
            name
            for name, plot in self._plots.items()
            if plot.supports_session_updates and name not in exclude
        ]
        self._update_plots(names)

    def _update_all_plots(self):
        names = list(self._plots.keys())
        self._update_plots(names)

    def _update_plots(self, names):
        view_plot_names = []
        interactive_plot_names = []
        for name in names:
            plot = self._plots[name]

            if not plot.is_connected:
                continue

            if not self._needs_update(name):
                continue

            if plot.link_type == "view":
                view_plot_names.append(name)
            elif plot.link_type in ("samples", "labels"):
                interactive_plot_names.append(name)
            else:
                raise ValueError(
                    "Plot '%s' has unsupported link type '%s'"
                    % (name, plot.link_type)
                )

        view = self._session._collection.view()

        if view_plot_names:
            self._update_view_plots(view_plot_names, view)

        for name in interactive_plot_names:
            self._update_interactive_plot(name, view)

    def _update_view_plots(self, names, view):
        # For efficiency, aggregations for all supported `ViewPlot`s are
        # computed in a single batch

        # Build flat list of all aggregations
        aggregations = []
        agg_lengths = []
        for name in names:
            aggs = self._aggs.get(name, None)
            if aggs is not None:
                aggregations.extend(aggs)
                agg_lengths.append(len(aggs))
            else:
                agg_lengths.append(None)

        if aggregations:
            # Compute aggregations
            agg_results = view.aggregate(aggregations)

            # Partition into per-plot batches
            agg_iter = iter(agg_results)
            agg_results = []
            for agg_len in agg_lengths:
                if agg_len is None:
                    _agg_results = None
                else:
                    _agg_results = [next(agg_iter) for _ in range(agg_len)]

                agg_results.append(_agg_results)
        else:
            agg_results = itertools.repeat(None)

        # Finally, update the plots
        for name, _agg_results in zip(names, agg_results):
            plot = self._plots[name]
            plot.update_view(view, agg_results=_agg_results)

    def _update_interactive_plot(self, name, view):
        plot = self._plots[name]

        if plot.link_type == "samples":
            plot.select_ids(self._current_sample_ids, view=view)
        elif plot.link_type == "labels":
            label_ids = self._get_current_label_ids_for_plot(plot)
            plot.select_ids(label_ids, view=view)
        else:
            raise ValueError(
                "InteractivePlot '%s' has unsupported link type '%s'"
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
