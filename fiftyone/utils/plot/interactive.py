"""
Interactive plotting utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools

import numpy as np

from fiftyone import ViewField as F
from fiftyone.core.expressions import ObjectId
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou


class InteractivePlot(object):
    """Base class for interactive plots."""

    def __init__(self):
        self._connected = False

    @property
    def is_connected(self):
        """Whether this plot is currently connected."""
        return self._connected

    @property
    def any_selected(self):
        """Whether any points are currently selected."""
        raise NotImplementedError("Subclass must implement any_selected")

    @property
    def selected_inds(self):
        """A list of indices of the currently selected points."""
        raise NotImplementedError("Subclass must implement selected_inds")

    def connect(self):
        """Connects the plot."""
        if self.is_connected:
            return

        self._connect()
        self._connected = True

    def _connect(self):
        pass

    def disconnect(self):
        """Disconnects the plot."""
        if not self.is_connected:
            return

        self._disconnect()
        self._connected = False

    def _disconnect(self):
        pass

    def register_selection_callback(self, callback):
        """Registers the selection callback, which is a function that

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
        """Registers a callback that can sync this plot with an
        :class:`InteractiveSession` connected to it.

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
        """Registers a callback that can disconnect an
        :class:`InteractiveSession` connected to this plot.

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

    def select_inds(self, inds):
        """Selects the points with the given indices in this plot.

        Args:
            inds: a list of indices
        """
        if not self.is_connected:
            raise ValueError("Plot is not connected")

        self._select_inds(inds)

    def _select_inds(self, inds):
        raise ValueError("Subclass must implement _select_inds()")

    def draw(self):
        """Draws this plot."""
        pass

    def show(self):
        """Shows this plot."""
        pass


class InteractiveSession(object):
    """Class that manages communication between a
    :class:`fiftyone.core.session.Session` and an :class:`InteractivePlot`
    whose points correspond to the session.

    Interactive sessions can be linked to either samples or labels:

    -   Sample selection: If ``sample_ids`` is provided, then when points are
        selected, a view containing the corresponding samples will be loaded in
        the App

    -   Label selection: If ``label_ids`` and ``label_field`` are provided,
        then when points are selected, a view containing the corresponding
        labels in ``label_field`` will be loaded in the App

    Args:
        session: a :class:`fiftyone.core.session.Session`
        plot: an :class:`InteractivePlot`
        bidirectional (False): whether to update ``plot`` in response to
            changes in ``session``
        sample_ids (None): a list of sample IDs corresponding to the points in
            ``plot``
        label_ids (None): a list of label IDs corresponding to the points in
            ``plot``
        label_field (None): the sample field containing the labels in ``plot``
        connect (True): whether to immediately connect the session
    """

    def __init__(
        self,
        session,
        plot,
        bidirectional=False,
        sample_ids=None,
        label_ids=None,
        label_field=None,
        connect=True,
    ):
        if sample_ids is not None:
            sample_ids = np.asarray(sample_ids)

        if label_ids is not None:
            label_ids = np.asarray(label_ids)

        self.session = session
        self.plot = plot
        self.bidirectional = bidirectional
        self.sample_ids = sample_ids
        self.label_ids = label_ids
        self.label_field = label_field

        self._inds = np.array([], dtype=int)
        self._selected_sample_ids = None
        self._selected_label_ids = None
        self._connected = False
        self._init_view = None
        self._lock_session = False

        if connect:
            self.connect()

    @property
    def is_connected(self):
        """Whether this object is currently connected."""
        return self._connected

    @property
    def any_selected(self):
        """Whether any points are currently selected."""
        return self._inds.size > 0

    @property
    def selected_inds(self):
        """A list of indices of the currently selected points."""
        return list(self._inds)

    @property
    def is_selecting_samples(self):
        """Whether this session is linked to samples."""
        return self.sample_ids is not None

    @property
    def is_selecting_labels(self):
        """Whether this session is linked to labels."""
        return self.label_ids is not None and self.label_field is not None

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
            raise ValueError("Session cannot select samples")

        _sample_ids = set(sample_ids)
        inds = np.nonzero([_id in _sample_ids for _id in self.sample_ids])[0]
        self._select_inds_from_session(inds)

    def select_labels(self, label_ids):
        """Selects the points corresponding to the labels with the given IDs.

        Args:
            label_ids: a list of label IDs
        """
        if not self.is_selecting_labels:
            raise ValueError("Session cannot select labels")

        _label_ids = set(label_ids)
        inds = np.nonzero([_id in _label_ids for _id in self.label_ids])[0]
        self._select_inds_from_session(inds)

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

        current_view = self.session._collection

        if self.is_selecting_samples:
            if self.session.selected:
                sample_ids = self.session.selected
            else:
                sample_ids = self._get_selected_samples(current_view)

            # Lock the session so that it is not updated, since we are
            # responding to the state of the current session
            with fou.SetAttributes(self, _lock_session=True):
                self.select_samples(sample_ids)

        if self.is_selecting_labels:
            if self.session.selected_labels:
                label_ids = [
                    o["label_id"] for o in self.session.selected_labels
                ]
            else:
                selected = self.session.selected or None
                label_ids = self._get_selected_labels(
                    current_view, self.label_field, selected=selected
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
        if not self.is_connected:
            raise ValueError("Session is not connected")

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
        """Connects to the plot and session."""
        if self.is_connected:
            return

        self.plot.register_selection_callback(self._select_inds_from_plot)
        self.plot.register_sync_callback(self.sync)
        self.plot.register_disconnect_callback(self.disconnect)
        self.plot.connect()

        self._init_view = self.session._collection.view()

        if self.bidirectional:
            self.session.add_listener(
                "interactive_session", self._onsessionupdate
            )

        self._connected = True

    def refresh(self):
        """Refreshes the plot and session."""
        self.plot.draw()
        if not self._lock_session:
            self._update_session()

    def disconnect(self,):
        """Disconnects from the plot and sesssion."""
        if not self.is_connected:
            return

        self.plot.disconnect()

        if self.bidirectional:
            self.session.delete_listener("interactive_session")

        self._connected = False

    def _onsessionupdate(self, _):
        self.sync()

    def _select_inds_from_plot(self, inds):
        if not self.is_connected:
            return

        self._select_inds(inds)

    def _select_inds_from_session(self, inds):
        if not self.is_connected:
            return

        self.plot.select_inds(inds)
        self._select_inds(inds)

    def _select_inds(self, inds):
        if inds is None:
            inds = []

        self._inds = np.asarray(inds)

        if self.is_selecting_samples:
            self._selected_sample_ids = list(self.sample_ids[inds])

        if self.is_selecting_labels:
            self._selected_label_ids = list(self.label_ids[inds])

        self.refresh()

    def _update_session(self):
        if self.any_selected:
            view = self.selected_view()
        else:
            view = self._init_view

        with fou.SetAttributes(self, _lock_session=True):
            # Don't spawn a new App instance in notebook contexts here
            with self.session.no_show():
                self.session.view = view

    @staticmethod
    def _get_selected_samples(view, selected=None):
        if selected is not None:
            view = view.select(selected)

        return view.values("id")

    @staticmethod
    def _get_selected_labels(view, label_field, selected=None):
        if selected is not None:
            view = view.select(selected)

        label_type, id_path = view._get_label_field_path(label_field, "_id")
        label_ids = view.values(id_path)

        if issubclass(label_type, fol._LABEL_LIST_FIELDS):
            label_ids = itertools.chain.from_iterable(label_ids)

        return [str(_id) for _id in label_ids]
