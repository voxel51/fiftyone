"""
Point selection utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import math

import numpy as np
import matplotlib as mpl
from matplotlib.widgets import Button, LassoSelector
from matplotlib.path import Path
import matplotlib.pyplot as plt
from mpl_toolkits.axes_grid1 import make_axes_locatable
from mpl_toolkits.axes_grid1.inset_locator import InsetPosition
import sklearn.metrics.pairwise as skp

from fiftyone import ViewField as F
from fiftyone.core.expressions import ObjectId
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou


class PointSelector(object):
    """Class that manages an interactive UI for selecting points in a
    matplotlib plot.

    The currently selected points are given a visually distinctive style, and
    you can modify your selection by either clicking on individual points or
    drawing a lasso around new points.

    When the shift key is pressed, new selections are added to the selected
    set, or subtracted if the new selection is a subset of the current
    selection.

    You can provide a ``session`` object together with one of the following to
    link the currently selected points to a FiftyOne App instance:

    -   Sample selection: If ``sample_ids`` is provided, then when points are
        selected, a view containing the corresponding samples will be loaded in
        the App

    -   Label selection: If ``label_ids`` and ``label_field`` are provided,
        then when points are selected, a view containing the corresponding
        labels in ``label_field`` will be loaded in the App

    Args:
        collection: a ``matplotlib.collections.Collection`` to select points
            from
        session (None): a :class:`fiftyone.core.session.Session` to link with
            this selector
        sample_ids (None): a list of sample IDs corresponding to ``collection``
        label_ids (None): a list of label IDs corresponding to ``collection``
        label_field (None): the sample field containing the labels in
            ``collection``
        buttons (None): a dict mapping button names to callbacks defining
            buttons to add to the plot
        alpha_other (0.25): a transparency value for unselected points
        expand_selected (3.0): expand the size of selected points by this
            amount
        click_tolerance (0.02): a click distance tolerance in ``[0, 1]`` when
            clicking individual points
    """

    def __init__(
        self,
        collection,
        session=None,
        sample_ids=None,
        label_ids=None,
        label_field=None,
        buttons=None,
        alpha_other=0.25,
        expand_selected=3.0,
        click_tolerance=0.02,
    ):
        if sample_ids is not None:
            sample_ids = np.asarray(sample_ids)

        if label_ids is not None:
            label_ids = np.asarray(label_ids)

        if buttons is not None:
            button_defs = list(buttons.items())
        else:
            button_defs = []

        if session is not None:
            button_defs.append(("sync", self._onsync))

        button_defs.append(("disconnect", self._ondisconnect))

        self.collection = collection
        self.ax = collection.axes
        self.session = session
        self.bidirectional = False
        self.sample_ids = sample_ids
        self.label_ids = label_ids
        self.label_field = label_field
        self.alpha_other = alpha_other
        self.expand_selected = expand_selected
        self.click_tolerance = click_tolerance

        self._canvas = self.ax.figure.canvas
        self._xy = collection.get_offsets()
        self._num_pts = len(self._xy)
        self._fc = collection.get_facecolors()
        self._ms = collection.get_sizes()
        self._init_ms = self._ms[0]
        self._click_thresh = click_tolerance * min(
            np.max(self._xy, axis=0) - np.min(self._xy, axis=0)
        )

        self._inds = np.array([], dtype=int)
        self._selected_sample_ids = None
        self._selected_label_ids = None
        self._canvas.mpl_connect("close_event", lambda e: self._disconnect())

        self._connected = False
        self._session = None
        self._lock_session = False
        self._init_view = None
        self._lasso = None
        self._shift = False
        self._title = None
        self._button_defs = button_defs
        self._buttons = []
        self._figure_events = []
        self._keypress_events = []

        self._init_hud()

        self.connect()

    @property
    def is_connected(self):
        """Whether this selector is currently linked to its plot and session
        (if any).
        """
        return self._connected

    @property
    def has_linked_session(self):
        """Whether this object has a linked
        :class:`fiftone.core.session.Session` that can be updated when points
        are selected.
        """
        return self._session is not None

    @property
    def is_selecting_samples(self):
        """Whether this selector is selecting samples from a collection."""
        return self.sample_ids is not None

    @property
    def is_selecting_labels(self):
        """Whether this selector is selecting labels from a field of a sample
        collection.
        """
        return self.label_ids is not None and self.label_field is not None

    @property
    def any_selected(self):
        """Whether any points are currently selected."""
        return self._inds.size > 0

    @property
    def selected_inds(self):
        """A list of indices of the currently selected points."""
        return list(self._inds)

    @property
    def selected_samples(self):
        """A list of the currently selected samples, or None if
        :meth:`is_selecting_samples` is False.
        """
        return self._selected_sample_ids

    @property
    def selected_labels(self):
        """A list of the currently selected labels, or None if
        :meth:`is_selecting_labels` is False.
        """
        return self._selected_label_ids

    def select_samples(self, sample_ids):
        """Selects the points corresponding to the given sample IDs.

        Args:
            sample_ids: a list of sample IDs
        """
        if not self.is_selecting_samples:
            raise ValueError("This selector cannot select samples")

        _sample_ids = set(sample_ids)
        inds = np.nonzero([_id in _sample_ids for _id in self.sample_ids])[0]
        self._select_inds(inds)

    def select_labels(self, label_ids):
        """Selects the points corresponding to the labels with the given IDs.

        Args:
            label_ids: a list of label IDs
        """
        if not self.is_selecting_labels:
            raise ValueError("This selector cannot select labels")

        _label_ids = set(label_ids)
        inds = np.nonzero([_id in _label_ids for _id in self.label_ids])[0]
        self._select_inds(inds)

    def select_session(self):
        """Selects the contents of the currently linked session.

        The rules listed below are used to determine what to select.

        If this selector is selecting samples:

        -   If samples are selected in the session (``session.selected``), only
            select those
        -   Otherwise, select all samples in the current view

        If this selector is selecting labels:

        -   If labels are selected in the session
            (``session.selected_labels``), only select those
        -   Else if samples are selected (``session.selected``), only select
            their labels
        -   Otherwise, select all labels in the current view
        """
        if not self.has_linked_session:
            raise ValueError("This selector is not linked to a session")

        if self._lock_session:
            return

        if self._session.view is not None:
            view = self._session.view
        else:
            view = self._session.dataset

        if self.is_selecting_samples:
            if self._session.selected:
                sample_ids = self._session.selected
            else:
                sample_ids = self._get_selected_samples(view)

            # Lock the session so that it is not updated, since we are
            # responding to the state of the current session
            with fou.SetAttributes(self, _lock_session=True):
                self.select_samples(sample_ids)

        if self.is_selecting_labels:
            if self._session.selected_labels:
                label_ids = [
                    o["label_id"] for o in self._session.selected_labels
                ]
            else:
                selected = self._session.selected or None
                label_ids = self._get_selected_labels(
                    view, self.label_field, selected=selected
                )

            # Lock the session so that it is not updated, since we are
            # responding to the state of the current session
            with fou.SetAttributes(self, _lock_session=True):
                self.select_labels(label_ids)

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
            view.tag_labels(tag, label_fields=[self.label_field])

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
            view.untag_labels(tag, label_fields=[self.label_field])

        self.refresh()

    def selected_view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        currently selected samples/labels.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`, or None if no points are
            selected
        """
        if not self.has_linked_session:
            raise ValueError("This selector is not linked to a session")

        if not self.any_selected:
            return None

        if self.is_selecting_samples:
            return self._init_view.select(self._selected_sample_ids)

        if self.is_selecting_labels:
            _label_ids = [ObjectId(_id) for _id in self._selected_label_ids]
            return self._init_view.select_fields(
                self.label_field
            ).filter_labels(self.label_field, F("_id").is_in(_label_ids))

        return None

    def connect(self):
        """Connects this selector to its plot and session (if any)."""
        if self.is_connected:
            return

        session = self.session
        if session is not None:
            if session.view is not None:
                self._init_view = session.view
            else:
                self._init_view = session.dataset.view()

            if self.bidirectional:
                session.add_listener("point_selector", self._onsessionupdate)

        self._lasso = LassoSelector(self.ax, onselect=self._onselect)
        self._session = session

        def _make_callback(button, callback):
            def _callback(event):
                # Change to non-hover color to convey that something happened
                # https://stackoverflow.com/a/28079210
                button.ax.set_facecolor(button.color)
                self._canvas.draw_idle()
                callback(event)

            return _callback

        for button, (_, callback) in zip(self._buttons, self._button_defs):
            _callback = _make_callback(button, callback)
            button.on_clicked(_callback)

        self._title.set_text("  Click or drag to select points")

        self._figure_events = [
            self._canvas.mpl_connect("figure_enter_event", self._onenter),
            self._canvas.mpl_connect("figure_leave_event", self._onexit),
        ]

        self._keypress_events = [
            self._canvas.mpl_connect("key_press_event", self._onkeypress),
            self._canvas.mpl_connect("key_release_event", self._onkeyrelease),
        ]

        self._update_hud(False)

        self._connected = True

        self._canvas.draw_idle()

    def refresh(self):
        """Refreshes the selector's plot and linked session (if any)."""
        self._canvas.draw_idle()
        if not self._lock_session:
            self._update_session()

    def disconnect(self,):
        """Disconnects this selector from its plot and sesssion (if any)."""
        if not self.is_connected:
            return

        self._lasso.disconnect_events()
        self._lasso = None

        for cid in self._figure_events:
            self._canvas.mpl_disconnect(cid)

        for cid in self._keypress_events:
            self._canvas.mpl_disconnect(cid)

        self._shift = False
        self._figure_events = []
        self._keypress_events = []
        self._update_hud(False)

        self._canvas.draw_idle()

        self._disconnect()

    def _init_hud(self):
        # Button styling
        gap = 0.02
        width = 0.2
        height = 0.1
        color = "#DBEBFC"  # "#FFF0E5"
        hovercolor = "#499CEF"  # "#FF6D04"

        self._title = self.ax.set_title("", loc="left")

        num_buttons = len(self._button_defs)
        self._buttons = []
        for i, (label, _) in enumerate(self._button_defs):
            bax = self.ax.figure.add_axes([0, 0, 1, 1], label=label)
            bpos = [
                1 - (num_buttons - i) * width - (num_buttons - i - 1) * gap,
                1 + gap,
                width,
                height,
            ]
            bax.set_axes_locator(InsetPosition(self.ax, bpos))
            button = Button(bax, label, color=color, hovercolor=hovercolor)
            self._buttons.append(button)

    def _update_hud(self, visible):
        self._title.set_visible(visible)
        for button in self._buttons:
            button.ax.set_visible(visible)

    def _disconnect(self):
        if self.session is not None and self.bidirectional:
            self.session.delete_listener("point_selector")

        self._session = None
        self._connected = False

    def _onenter(self, event):
        self._update_hud(True)
        self._canvas.draw_idle()

    def _onexit(self, event):
        self._update_hud(False)
        self._canvas.draw_idle()

    def _onkeypress(self, event):
        if event.key == "shift":
            self._shift = True
            self._title.set_text("  Click or drag to add/remove points")
            self._canvas.draw_idle()

    def _onkeyrelease(self, event):
        if event.key == "shift":
            self._shift = False
            self._title.set_text("  Click or drag to select points")
            self._canvas.draw_idle()

    def _onselect(self, vertices):
        if self._is_click(vertices):
            dists = skp.euclidean_distances(self._xy, np.array([vertices[0]]))
            click_ind = np.argmin(dists)
            if dists[click_ind] < self._click_thresh:
                inds = [click_ind]
            else:
                inds = []

            inds = np.array(inds, dtype=int)
        else:
            path = Path(vertices)
            inds = np.nonzero(path.contains_points(self._xy))[0]

        self._select_inds(inds)

    def _onsessionupdate(self):
        self.select_session()

    def _onsync(self, event):
        self.select_session()

    def _ondisconnect(self, event):
        self.disconnect()

    def _is_click(self, vertices):
        return np.abs(np.diff(vertices, axis=0)).sum() < self._click_thresh

    def _select_inds(self, inds):
        if self._shift:
            new_inds = set(inds)
            inds = set(self._inds)
            if new_inds.issubset(inds):
                # The new selection is a subset of the current selection, so
                # remove the selection
                inds.difference_update(new_inds)
            else:
                # The new selection contains new points, so add them
                inds.update(new_inds)

            inds = np.array(sorted(inds), dtype=int)
        else:
            inds = np.unique(inds)

        if inds.size == self._inds.size and np.all(inds == self._inds):
            self._canvas.draw_idle()
            return

        self._inds = inds

        if self.is_selecting_samples:
            self._selected_sample_ids = list(self.sample_ids[inds])

        if self.is_selecting_labels:
            self._selected_label_ids = list(self.label_ids[inds])

        self._update_plot()
        self.refresh()

    def _update_plot(self):
        self._prep_collection()

        inds = self._inds
        if inds.size == 0:
            self._fc[:, -1] = 1
        else:
            self._fc[:, -1] = self.alpha_other
            self._fc[inds, -1] = 1

        self.collection.set_facecolors(self._fc)

        if self.expand_selected is not None:
            self._ms[:] = self._init_ms
            self._ms[inds] = self.expand_selected * self._init_ms

        self.collection.set_sizes(self._ms)

    def _update_session(self):
        if not self.has_linked_session:
            return

        if self.any_selected:
            view = self.selected_view()
        else:
            view = self._init_view

        with fou.SetAttributes(self, _lock_session=True):
            self._session.view = view

    def _prep_collection(self):
        # @todo why is this necessary? We do this JIT here because it seems
        # that when __init__() runs, `get_facecolors()` doesn't have all the
        # data yet...
        if len(self._fc) < self._num_pts:
            self._fc = self.collection.get_facecolors()

        if len(self._fc) < self._num_pts:
            self._fc = np.tile(self._fc[0], (self._num_pts, 1))

        if self.expand_selected is not None:
            if len(self._ms) < self._num_pts:
                self._ms = np.tile(self._ms[0], self._num_pts)

    @staticmethod
    def _get_selected_samples(view, selected=None):
        if selected is not None:
            view = view.select(selected)

        sample_ids = view._get_sample_ids()

        return [str(_id) for _id in sample_ids]

    @staticmethod
    def _get_selected_labels(view, label_field, selected=None):
        if selected is not None:
            view = view.select(selected)

        label_type, id_path = view._get_label_field_path(label_field, "_id")
        label_ids = view.values(id_path)

        if issubclass(label_type, fol._LABEL_LIST_FIELDS):
            label_ids = itertools.chain.from_iterable(label_ids)

        return [str(_id) for _id in label_ids]
