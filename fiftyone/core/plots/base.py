"""
Base plotting definitions.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import fiftyone.core.context as foc


logger = logging.getLogger(__name__)


def get_default_backend(interactive=False):
    """Gets the default plotting backend for the current environment.

    Args:
        interactive (False): whether interactive plots are required

    Returns:
        "plotly" or "matplotlib"
    """
    if interactive and not foc.is_notebook_context():
        # plotly backend does not yet support interactive plots in non-notebook
        # contexts
        return "matplotlib"

    return "plotly"


def _parse_backend(backend, interactive=False):
    if backend is None:
        return get_default_backend(interactive=interactive)

    available_backends = ("matplotlib", "plotly")
    if backend not in available_backends:
        raise ValueError(
            "Unsupported plotting backend '%s'; supported values are %s"
            % backend,
            available_backends,
        )

    return backend


def plot_confusion_matrix(
    confusion_matrix,
    labels,
    ids=None,
    gt_field=None,
    pred_field=None,
    backend=None,
    show=True,
    **kwargs,
):
    """Plots a confusion matrix.

    Args:
        confusion_matrix: a ``num_true x num_preds`` confusion matrix
        labels: a ``max(num_true, num_preds)`` array of class labels
        ids (None): an optional array of same shape as ``confusion_matrix``
            containing lists of IDs corresponding to each cell. Only used by
            the "plotly" backend
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        show (True): whether to show the plot
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_confusion_matrix`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_confusion_matrix`

    Returns:
        a plotly or matplotlib figure
    """
    backend = _parse_backend(backend, interactive=False)

    if backend == "matplotlib":
        from .matplotlib import plot_confusion_matrix as _plot_confusion_matrix
    else:
        from .plotly import plot_confusion_matrix as _plot_confusion_matrix

        kwargs = dict(ids=ids, gt_field=gt_field, pred_field=pred_field)

    return _plot_confusion_matrix(
        confusion_matrix, labels, show=show, **kwargs
    )


def plot_pr_curve(
    precision, recall, label=None, backend=None, show=True, **kwargs
):
    """Plots a precision-recall (PR) curve.

    Args:
        precision: an array of precision values
        recall: an array of recall values
        label (None): a label for the curve
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        show (True): whether to show the plot
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_pr_curve`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_pr_curve`

    Returns:
        a plotly or matplotlib figure
    """
    backend = _parse_backend(backend, interactive=False)

    if backend == "matplotlib":
        from .matplotlib import plot_pr_curve as _plot_pr_curve
    else:
        from .plotly import plot_pr_curve as _plot_pr_curve

    return _plot_pr_curve(precision, recall, label=label, show=show, **kwargs)


def plot_pr_curves(
    precisions, recall, classes, backend=None, show=True, **kwargs
):
    """Plots a set of per-class precision-recall (PR) curves.

    Args:
        precisions: a ``num_classes x num_recalls`` array of per-class
            precision values
        recall: an array of recall values
        classes: the list of classes
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        show (True): whether to show the plot
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_pr_curves`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_pr_curves`

    Returns:
        a plotly or matplotlib figure
    """
    backend = _parse_backend(backend, interactive=False)

    if backend == "matplotlib":
        from .matplotlib import plot_pr_curves as _plot_pr_curves
    else:
        from .plotly import plot_pr_curves as _plot_pr_curves

    return _plot_pr_curves(precisions, recall, classes, show=show, **kwargs)


def plot_roc_curve(fpr, tpr, roc_auc=None, backend=None, show=True, **kwargs):
    """Plots a receiver operating characteristic (ROC) curve.

    Args:
        fpr: an array of false postive rates
        tpr: an array of true postive rates
        roc_auc (None): the area under the ROC curve
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        show (True): whether to show the plot
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_roc_curve`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_roc_curve`

    Returns:
        a plotly or matplotlib figure
    """
    backend = _parse_backend(backend, interactive=False)

    if backend == "matplotlib":
        from .matplotlib import plot_roc_curve as _plot_roc_curve
    else:
        from .plotly import plot_roc_curve as _plot_roc_curve

    return _plot_roc_curve(fpr, tpr, roc_auc=roc_auc, show=show, **kwargs)


def scatterplot(
    points,
    samples=None,
    label_field=None,
    labels=None,
    sizes=None,
    classes=None,
    backend=None,
    show=True,
    **kwargs,
):
    """Generates an interactive scatterplot of the given points.

    This method supports 2D or 3D visualizations, but interactive point
    selection is only aviailable in 2D.

    You can use the ``labels`` parameters to define a coloring for the points,
    and you can use the ``sizes`` parameter to define per-point sizes for the
    points.

    You can connect this method to a :class:`fiftyone.core.session.Session`
    in order to automatically sync the session's view with the currently
    selected points in the plot. To enable this functionality, pass ``samples``
    to this method.

    Args:
        points: a ``num_points x num_dims`` array of points
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        label_field (None): a :class:`fiftyone.core.labels.Label` field
            containing the labels corresponding to ``points``. If not provided,
            the points are assumed to correspond to samples
        labels (None): data to use to color points. Can be a list (or nested
            list, if ``label_field`` refers to a label list field like
            :class:`fiftyone.core.labels.Detections`) or array-like of numeric
            or string values, or the name of a sample field or
            ``embedded.field.name`` of ``samples`` from which to extract values
        sizes (None): data to use to scale the sizes of the points. Can be a
            list (or nested list, if ``label_field`` refers to a label list
            field like :class:`fiftyone.core.labels.Detections`) or array-like
            of numeric values, or the name of a sample field or
            ``embedded.field.name`` of ``samples`` from which to extract values
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        show (True): whether to show the plot
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.scatterplot`

    Returns:
        one of the following:

        -   an :class:`fiftyone.core.plots.base.InteractivePlot`, if
            ``samples`` are provided and the backend supports interactivity
        -   a plotly or matplotlib figure, otherwise
    """
    interactive = samples is not None
    backend = _parse_backend(backend, interactive=interactive)

    if backend == "matplotlib":
        from .matplotlib import scatterplot as _scatterplot
    else:
        from .plotly import scatterplot as _scatterplot

    return _scatterplot(
        points,
        samples=samples,
        label_field=label_field,
        labels=labels,
        sizes=sizes,
        classes=classes,
        show=show,
        **kwargs,
    )


def location_scatterplot(
    locations=None,
    samples=None,
    labels=None,
    sizes=None,
    classes=None,
    backend=None,
    show=True,
    **kwargs,
):
    """Generates an interactive scatterplot of the given location coordinates
    with a map rendered in the background of the plot.

    Location data is specified via the ``locations`` parameter.

    You can use the ``labels`` parameters to define a coloring for the points,
    and you can use the ``sizes`` parameter to define per-point sizes for the
    points.

    You can connect this method to a :class:`fiftyone.core.session.Session`
    in order to automatically sync the session's view with the currently
    selected points in the plot. To enable this functionality, pass ``samples``
    to this method.

    Args:
        locations (None): the location data to plot. Can be a
            ``num_locations x 2`` array of ``(longitude, latitude)``
            coordinates, or the name of a
            :class:`fiftyone.core.labels.GeoLocation` field on ``samples`` with
            ``(longitude, latitude)`` coordinates in its ``point`` attribute,
            or None, in which case ``samples`` must have a single
            :class:`fiftyone.core.labels.GeoLocation` field
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        labels (None): data to use to color points. Can be an array-like of
            numeric or string values, or the name of a sample field or
            ``embedded.field.name`` of ``samples`` from which to extract values
        sizes (None): data to use to scale the sizes of the points. Can be a
            list (or nested list, if ``label_field`` refers to a label list
            field like :class:`fiftyone.core.labels.Detections`) or array-like
            of numeric values, or the name of a sample field or
            ``embedded.field.name`` of ``samples`` from which to extract values
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        show (True): whether to show the plot
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.location_scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.location_scatterplot`

    Returns:
        one of the following:

        -   an :class:`fiftyone.core.plots.base.InteractivePlot`, if
            ``samples`` are provided and the backend supports interactivity
        -   a plotly or matplotlib figure, otherwise
    """
    interactive = samples is not None
    backend = _parse_backend(backend, interactive=interactive)

    if backend == "matplotlib":
        from .matplotlib import location_scatterplot as _location_scatterplot
    else:
        from .plotly import location_scatterplot as _location_scatterplot

    return _location_scatterplot(
        locations=locations,
        samples=samples,
        labels=labels,
        sizes=sizes,
        classes=classes,
        show=show,
        **kwargs,
    )


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
