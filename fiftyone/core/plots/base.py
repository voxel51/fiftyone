"""
Base plotting definitions.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import fiftyone.core.context as foc


logger = logging.getLogger(__name__)


def plot_confusion_matrix(
    confusion_matrix,
    labels,
    ids=None,
    samples=None,
    eval_key=None,
    gt_field=None,
    pred_field=None,
    backend="plotly",
    **kwargs,
):
    """Plots a confusion matrix.

    If ``ids`` are provided and you are working in a notebook environment with
    the default plotly backend, this method returns an interactive
    :class:`fiftyone.core.plots.plotly.InteractiveHeatmap` that you can attach
    to an App session via its :attr:`fiftyone.core.session.Session.plots`
    attribute, which will automatically sync the session's view with the
    currently selected cells in the confusion matrix.

    Args:
        confusion_matrix: a ``num_true x num_preds`` confusion matrix
        labels: a ``max(num_true, num_preds)`` array of class labels
        ids (None): an optional array of same shape as ``confusion_matrix``
            containing lists of IDs corresponding to each cell. Only used by
            the "plotly" backend
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the confusion matrix was generated. Only used by the
            "plotly" backend when ``ids`` are provided
        eval_key (None): the evaluation key of the evaluation
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_confusion_matrix`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_confusion_matrix`

    Returns:
        one of the following:

        -   a :class:`fiftyone.core.plots.plotly.InteractiveHeatmap`, if
            ``ids`` are provided and the plotly backend is used
        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if no
            ``ids`` are provided but you are working in a Jupyter notebook with
            the plotly backend
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import plot_confusion_matrix as _plot_confusion_matrix
    else:
        from .plotly import plot_confusion_matrix as _plot_confusion_matrix

        kwargs.update(
            dict(
                ids=ids,
                samples=samples,
                eval_key=eval_key,
                gt_field=gt_field,
                pred_field=pred_field,
            )
        )

    return _plot_confusion_matrix(confusion_matrix, labels, **kwargs)


def plot_pr_curve(precision, recall, label=None, backend="plotly", **kwargs):
    """Plots a precision-recall (PR) curve.

    Args:
        precision: an array of precision values
        recall: an array of recall values
        label (None): a label for the curve
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_pr_curve`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_pr_curve`

    Returns:
        one of the following:

        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if you
            are working in a Jupyter notebook and the plotly backend is used
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import plot_pr_curve as _plot_pr_curve
    else:
        from .plotly import plot_pr_curve as _plot_pr_curve

    return _plot_pr_curve(precision, recall, label=label, **kwargs)


def plot_pr_curves(precisions, recall, classes, backend="plotly", **kwargs):
    """Plots a set of per-class precision-recall (PR) curves.

    Args:
        precisions: a ``num_classes x num_recalls`` array of per-class
            precision values
        recall: an array of recall values
        classes: the list of classes
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_pr_curves`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_pr_curves`

    Returns:
        one of the following:

        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if you
            are working in a Jupyter notebook and the plotly backend is used
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import plot_pr_curves as _plot_pr_curves
    else:
        from .plotly import plot_pr_curves as _plot_pr_curves

    return _plot_pr_curves(precisions, recall, classes, **kwargs)


def plot_roc_curve(fpr, tpr, roc_auc=None, backend="plotly", **kwargs):
    """Plots a receiver operating characteristic (ROC) curve.

    Args:
        fpr: an array of false postive rates
        tpr: an array of true postive rates
        roc_auc (None): the area under the ROC curve
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_roc_curve`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_roc_curve`

    Returns:
        one of the following:

        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if you
            are working in a Jupyter notebook and the plotly backend is used
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import plot_roc_curve as _plot_roc_curve
    else:
        from .plotly import plot_roc_curve as _plot_roc_curve

    return _plot_roc_curve(fpr, tpr, roc_auc=roc_auc, **kwargs)


def scatterplot(
    points,
    samples=None,
    link_field=None,
    labels=None,
    sizes=None,
    classes=None,
    backend="plotly",
    **kwargs,
):
    """Generates an interactive scatterplot of the given points.

    You can attach plots generated by this method to an App session via its
    :attr:`fiftyone.core.session.Session.plots` attribute, which will
    automatically sync the session's view with the currently selected points in
    the plot. To enable this functionality, you must pass ``samples`` to this
    method.

    This method supports 2D or 3D visualizations, but interactive point
    selection is only available in 2D.

    You can use the ``labels`` parameters to define a coloring for the points,
    and you can use the ``sizes`` parameter to scale the sizes of the points.

    Args:
        points: a ``num_points x num_dims`` array of points
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        link_field (None): a field of ``samples`` whose data corresponds to
            ``points``. Can be any of the following:

            -   None, if the points correspond to samples
            -   the name of a :class:`fiftyone.core.labels.Label` field, if the
                points linked to the labels in this field

        labels (None): data to use to color the points. Can be any of the
            following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric or string values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric or string values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   a list or array-like of numeric or string values
            -   a list of lists of numeric or string values, if ``link_field``
                refers to a label list field like
                :class:`fiftyone.core.labels.Detections`

        sizes (None): data to use to scale the sizes of the points. Can be any
            of the following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   a list or array-like of numeric values
            -   a list of lists of numeric or string values, if ``link_field``
                refers to a label list field like
                :class:`fiftyone.core.labels.Detections`

        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.scatterplot`

    Returns:
        one of the following:

        -   an :class:`fiftyone.core.plots.base.InteractivePlot`, if
            ``samples`` are provided
        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if
            ``samples`` are not provided but you are working with the plotly
            backend in a Jupyter notebook
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import scatterplot as _scatterplot
    else:
        from .plotly import scatterplot as _scatterplot

    return _scatterplot(
        points,
        samples=samples,
        link_field=link_field,
        labels=labels,
        sizes=sizes,
        classes=classes,
        **kwargs,
    )


def location_scatterplot(
    locations=None,
    samples=None,
    labels=None,
    sizes=None,
    classes=None,
    backend="plotly",
    **kwargs,
):
    """Generates an interactive scatterplot of the given location coordinates
    with a map rendered in the background of the plot.

    Location data is specified via the ``locations`` parameter.

    You can attach plots generated by this method to an App session via its
    :attr:`fiftyone.core.session.Session.plots` attribute, which will
    automatically sync the session's view with the currently selected points in
    the plot. To enable this functionality, you must pass ``samples`` to this
    method.

    You can use the ``labels`` parameters to define a coloring for the points,
    and you can use the ``sizes`` parameter to scale the sizes of the points.

    Args:
        locations (None): the location data to plot. Can be any of the
            following:

            -   None, in which case ``samples`` must have a single
                :class:`fiftyone.core.labels.GeoLocation` field whose ``point``
                attribute contains location data
            -   a ``num_locations x 2`` array of ``(longitude, latitude)``
                coordinates
            -   the name of a :class:`fiftyone.core.labels.GeoLocation` field
                of ``samples`` with ``(longitude, latitude)`` coordinates in
                its ``point`` attribute

        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        labels (None): data to use to color the points. Can be any of the
            following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric or string values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric or string values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   a list or array-like of numeric or string values

        sizes (None): data to use to scale the sizes of the points. Can be any
            of the following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   a list or array-like of numeric values

        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.location_scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.location_scatterplot`

    Returns:
        one of the following:

        -   an :class:`fiftyone.core.plots.base.InteractivePlot`, if
            ``samples`` are provided
        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if
            ``samples`` are not provided but you are working with the plotly
            backend in a Jupyter notebook
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

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
        **kwargs,
    )


def _parse_backend(backend):
    if backend is None:
        return "plotly"

    available_backends = ("matplotlib", "plotly")
    if backend not in available_backends:
        raise ValueError(
            "Unsupported plotting backend '%s'; supported values are %s"
            % backend,
            available_backends,
        )

    return backend


class Plot(object):
    """Base class for all plots."""

    def _repr_pretty_(self, *args, **kwargs):
        # Shows the figure when Jupyter's `display()` is invoked on it
        self.show()

    @property
    def is_frozen(self):
        """Whether this plot is currently frozen."""
        raise NotImplementedError("Subclass must implement is_frozen")

    def show(self, **kwargs):
        """Shows the plot.

        Args:
            **kwargs: subclass-specific keyword arguments
        """
        raise NotImplementedError("Subclass must implement show()")

    def freeze(self):
        """Freezes the plot, replacing it with a static image.

        Only applicable in notebook contexts.
        """
        raise NotImplementedError("Subclass must implement freeze()")


class ResponsivePlot(Plot):
    """Base class for all responsive plots that can push/pull updates to a
    linked object.

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
        """Shows the plot.

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

        Only applicable in notebook contexts.
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


class ViewPlot(ResponsivePlot):
    """Base class for plots that can be automatically populated given a
    :class:`fiftyone.core.collections.SampleCollection` instance.

    The state of :class:`ViewPlot` instances can also be updated by external
    parties by calling its :meth:`update_view` method.

    Args:
        init_view (None): an optional initial
            :class:`fiftyone.core.collections.SampleCollection` to load
    """

    def __init__(self, init_view=None):
        self.init_view = init_view
        super().__init__("view")

        if init_view is not None:
            self.connect()
            self.update_view(init_view)

    @property
    def supports_session_updates(self):
        return True

    def _get_aggregations(self):
        """Gets the :class:`fiftyone.core.aggregations.Aggregation` instances
        that can compute the necessary data to serve this plot.

        Subclasses are not required to implement this method if they do not
        leverage aggregations.

        Returns:
            a list :class:`fiftyone.core.aggregations.Aggregation` instances,
            or None
        """
        return None

    def update_view(self, view, agg_results=None):
        """Updates the plot based on the provided view.

        Args:
            view: a :class:`fiftyone.core.collections.SampleCollection`
            agg_results (None): an optional list of pre-computed aggregation
                results
        """
        if not self.is_connected:
            return

        self._update_view(view, agg_results=agg_results)

    def _update_view(self, view, agg_results=None):
        raise ValueError("Subclass must implement _update_view()")

    def reset(self):
        """Resets the plot to its default state."""
        self.update_view(self.init_view)


class InteractivePlot(ResponsivePlot):
    """Base class for plots that support selection of their points.

    Whenever a selection is made in an :class:`InteractivePlot`, the plot will
    invoke any selection callback(s) registered on it, reporting to its
    listeners the IDs of its selected points.

    Conversely, the state of an :class:`InteractivePlot` can be updated by
    external parties by calling its :meth:`select_ids` method.

    Args:
        link_type ("samples"): whether this plot is linked to "samples" or
            "labels"
        init_view (None): a :class:`fiftyone.core.collections.SampleCollection`
            defining an initial view from which to derive selection views when
            points are selected in the plot. This view will also be shown when
            the plot is in its default state (no selection)
        label_fields (None): an optional label field or list of label fields to
            which points in this plot correspond. Only applicable when
            ``link_type == "labels"``
        selection_mode (None): the mode to use when updating connected sessions
            in response to selections in this plot. Only applicable when
            ``link_type == "labels"``. See :meth:`selection_mode` for details
        init_patches_fcn (None): an optional function that can be called with
            ``init_view`` as its argument and returns a
            :class:`fiftyone.core.collections.SampleCollection` defining an
            initial view from which to dervie selection views when cells are
            selected in the plot when :meth:`selection_mode` is ``"patches"``.
            Only applicable when ``link_type == "labels"``
    """

    def __init__(
        self,
        link_type="samples",
        init_view=None,
        label_fields=None,
        selection_mode=None,
        init_patches_fcn=None,
    ):
        supported_link_types = ("samples", "labels")
        if link_type not in supported_link_types:
            raise ValueError(
                "Unsupported link_type '%s'; supported values are %s"
                % (link_type, supported_link_types)
            )

        if selection_mode is None and link_type == "labels":
            selection_mode = "select"

        super().__init__(link_type)

        self.label_fields = label_fields

        self._init_view = init_view
        self._init_patches_fcn = init_patches_fcn
        self._init_patches_view = None

        self._selection_callback = None
        self._sync_callback = None
        self._disconnect_callback = None
        self._selection_mode = None

        self.selection_mode = selection_mode

    @property
    def selection_mode(self):
        """The current selection mode of the plot.

        Only applicable when ``link_type == "labels"``.

        This property controls how the current view is updated in response to
        updates from :class:`InteractivePlot` instances that are linked to
        labels:

        -   ``"select"``: show only the selected labels
        -   ``"match"``: show unfiltered samples containing the selected labels
        -   ``"patches"``: show the selected labels in a patches view

        .. note::

            ``"patches"`` mode is only supported if an ``init_patches_fcn`` was
            provided when constructing this plot.
        """
        return self._selection_mode

    @selection_mode.setter
    def selection_mode(self, mode):
        if self.link_type == "samples":
            if mode is not None:
                logger.warning(
                    "Ignoring `selection_mode` parameter, which is only "
                    "applicable for plots linked to labels"
                )

            return

        if self._init_patches_fcn is not None:
            supported_modes = ("select", "match", "patches")
        else:
            supported_modes = ("select", "match")

        if mode not in supported_modes:
            raise ValueError(
                "Unsupported selection_mode '%s'; supported values are %s"
                % (mode, supported_modes)
            )

        self._selection_mode = mode

        if self.is_connected and self._selection_callback is not None:
            self._selection_callback(self.selected_ids)

    @property
    def init_view(self):
        """A :class:`fiftyone.core.collections.SampleCollection` defining the
        initial view from which to derive selection views when points are
        selected in the plot.

        This view will also be shown when the plot is in its default state (no
        selection).
        """
        if self.selection_mode != "patches":
            return self._init_view

        if self._init_patches_view is None:
            self._init_patches_view = self._init_patches_fcn(self._init_view)

        return self._init_patches_view

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
        self._selection_callback = callback
        self._register_selection_callback(callback)

    def _register_selection_callback(self, callback):
        pass

    def register_sync_callback(self, callback):
        """Registers a callback that can sync this plot with a
        :class:`SessionPlot` connected to it.

        The typical use case for this function is to serve as the callback for
        a ``sync`` button on the plot.

        Args:
            callback: a function with no arguments
        """
        self._sync_callback = callback
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
        self._disconnect_callback = callback
        self._register_disconnect_callback(callback)

    def _register_disconnect_callback(self, callback):
        pass

    def select_ids(self, ids, view=None):
        """Selects the points with the given IDs in this plot.

        Args:
            ids: a list of IDs, or None to reset the plot to its default state
            view (None): the :class:`fiftyone.core.view.DatasetView`
                corresponding to the given IDs, if available
        """
        if not self.is_connected:
            return

        self._select_ids(ids, view=view)

    def _select_ids(self, ids, view=None):
        raise ValueError("Subclass must implement _select_ids()")

    def reset(self):
        """Resets the plot to its default state."""
        self.select_ids(None)
