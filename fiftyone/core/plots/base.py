"""
Base plotting definitions.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import fiftyone.core.context as foc
import fiftyone.core.labels as fol
import fiftyone.core.patches as fop
import fiftyone.core.video as fov


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
        labels: a ``max(num_true, num_preds)`` array-like of class labels
        ids (None): an array-like of same shape as ``confusion_matrix``
            containing lists of IDs corresponding to each cell
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the confusion matrix was generated
        eval_key (None): the evaluation key of the evaluation
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_confusion_matrix`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_confusion_matrix`

    Returns:
        one of the following

        -   a :class:`fiftyone.core.plots.plotly.InteractiveHeatmap`, if IDs
            are available and the plotly backend is used
        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if no IDs
            are available but you are working in a Jupyter notebook with the
            plotly backend
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


def plot_regressions(
    ytrue,
    ypred,
    samples=None,
    ids=None,
    labels=None,
    sizes=None,
    classes=None,
    gt_field=None,
    pred_field=None,
    backend="plotly",
    **kwargs,
):
    """Plots the given regression results.

    If IDs are provided and you are working in a notebook environment with the
    default plotly backend, this method returns an interactive
    :class:`fiftyone.core.plots.plotly.InteractiveScatter` that you can attach
    to an App session via its :attr:`fiftyone.core.session.Session.plots`
    attribute, which will automatically sync the session's view with the
    currently selected points in the plot.

    Args:
        ytrue: an array-like of ground truth values
        ypred: an array-like of predicted values
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the results were generated. Only used by the "plotly"
            backend when IDs are provided
        ids (None): an array-like of sample or frame IDs corresponding to the
            regressions. If not provided but ``samples`` are provided, the
            appropriate IDs will be extracted from the samples
        labels (None): data to use to color the points. Can be any of the
            following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric or string values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric or string values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   an array-like of numeric or string values
            -   a list of array-likes of numeric or string values, if
                ``link_field`` refers to frames
        sizes (None): data to use to scale the sizes of the points. Can be any
            of the following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   an array-like of numeric values
            -   a list of array-likes of numeric or string values, if
                ``link_field`` refers to frames
        classes (None): a list of classes whose points to plot. Only applicable
            when ``labels`` contains strings
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_confusion_matrix`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_confusion_matrix`

    Returns:
        one of the following

        -   a :class:`fiftyone.core.plots.plotly.InteractiveScatter`, if IDs
            are available and the plotly backend is used
        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if no IDs
            are available but you are working in a Jupyter notebook with the
            plotly backend
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import plot_regressions as _plot_regressions
    else:
        from .plotly import plot_regressions as _plot_regressions

    return _plot_regressions(
        ytrue,
        ypred,
        samples=samples,
        ids=ids,
        labels=labels,
        sizes=sizes,
        classes=classes,
        gt_field=gt_field,
        pred_field=pred_field,
        **kwargs,
    )


def plot_pr_curve(
    precision, recall, thresholds=None, label=None, backend="plotly", **kwargs
):
    """Plots a precision-recall (PR) curve.

    Args:
        precision: an array-like of precision values
        recall: an array-like of recall values
        thresholds (None): an array-like of decision thresholds
        label (None): a label for the curve
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_pr_curve`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_pr_curve`

    Returns:
        one of the following

        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if you
            are working in a Jupyter notebook and the plotly backend is used
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import plot_pr_curve as _plot_pr_curve

        if thresholds is not None:
            logger.warning(
                "Ignoring unsupported argument `thresholds` for the "
                "'matplotlib' backend"
            )
    else:
        from .plotly import plot_pr_curve as _plot_pr_curve

        kwargs.update(dict(thresholds=thresholds))

    return _plot_pr_curve(precision, recall, label=label, **kwargs)


def plot_pr_curves(
    precisions, recall, classes, thresholds=None, backend="plotly", **kwargs
):
    """Plots a set of per-class precision-recall (PR) curves.

    Args:
        precisions: a ``num_classes x num_recalls`` array-like of per-class
            precision values
        recall: an array-like of recall values
        classes: the list of classes
        thresholds (None): an ``num_classes x num_recalls`` array-like of
            decision thresholds
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_pr_curves`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_pr_curves`

    Returns:
        one of the following

        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if you
            are working in a Jupyter notebook and the plotly backend is used
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import plot_pr_curves as _plot_pr_curves

        if thresholds is not None:
            logger.warning(
                "Ignoring unsupported argument `thresholds` for the "
                "'matplotlib' backend"
            )
    else:
        from .plotly import plot_pr_curves as _plot_pr_curves

        kwargs.update(dict(thresholds=thresholds))

    return _plot_pr_curves(precisions, recall, classes, **kwargs)


def plot_roc_curve(
    fpr, tpr, thresholds=None, roc_auc=None, backend="plotly", **kwargs
):
    """Plots a receiver operating characteristic (ROC) curve.

    Args:
        fpr: an array-like of false positive rates
        tpr: an array-like of true positive rates
        thresholds (None): an array-like of decision thresholds
        roc_auc (None): the area under the ROC curve
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_roc_curve`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_roc_curve`

    Returns:
        one of the following

        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if you
            are working in a Jupyter notebook and the plotly backend is used
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import plot_roc_curve as _plot_roc_curve

        if thresholds is not None:
            logger.warning(
                "Ignoring unsupported argument `thresholds` for the "
                "'matplotlib' backend"
            )
    else:
        from .plotly import plot_roc_curve as _plot_roc_curve

        kwargs.update(dict(thresholds=thresholds))

    return _plot_roc_curve(fpr, tpr, roc_auc=roc_auc, **kwargs)


def lines(
    x=None,
    y=None,
    samples=None,
    ids=None,
    link_field=None,
    sizes=None,
    backend="plotly",
    **kwargs,
):
    """Plots the given lines(s) data.

    You can attach plots generated by this method to an App session via its
    :attr:`fiftyone.core.session.Session.plots` attribute, which will
    automatically sync the session's view with the currently selected points in
    the plot. To enable this functionality, you must pass ``samples`` to this
    method.

    You can use the ``sizes`` parameter to scale the sizes of the points.

    Args:
        x (None): the x data to plot. Can be any of the following:

            -   an array-like of values
            -   a ``num_lines x n`` array-like or list of length ``num_lines``
                of array-likes of values for multiple line traces
            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract values for a single line
            -   the name of a frame field or ``frames.embedded.field.name`` of
                ``samples`` from which to extract values for per-sample line
                traces
            -   a :class:`fiftyone.core.expressions.ViewExpression` that
                resolves to a list (one line plot) or list of lists (multiple
                line plots) of numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
        y (None): the y data to plot. Can be any of the following:

            -   an array-like of values
            -   a ``num_lines x n`` array-like or list of length ``num_lines``
                of array-likes of values for multiple line traces
            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract values for a single line
            -   the name of a frame field or ``frames.embedded.field.name`` of
                ``samples`` from which to extract values for per-sample line
                traces
            -   a :class:`fiftyone.core.expressions.ViewExpression` that
                resolves to a list (one line plot) or list of lists (multiple
                line plots) of numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        ids (None): an array-like of IDs of same shape as ``y``. If not
            provided but ``samples`` are provided, the appropriate IDs will be
            extracted from the samples
        link_field (None): a field of ``samples`` whose data corresponds to
            ``y``. Can be any of the following:

            -   ``None``, if the line data correspond to samples (single trace)
                or frames (multiple traces)
            -   ``"frames"``, if the line data correspond to frames (multiple
                traces). This option exists only for consistency with other
                plotting methods; in practice, it will be automatically
                inferred whenever multiple traces are being plotted
            -   the name of a :class:`fiftyone.core.labels.Label` field, if the
                line data correspond to the labels in this field
        sizes (None): data to use to scale the sizes of the points. Can be any
            of the following:

            -   an array-like of numeric values of same shape as ``y``
            -   the name of a sample field (single trace) or frame field
                (multiple traces) from which to extract numeric values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                sample-level (single trace) or frame-level (multiple traces)
                numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.lines`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.lines`

    Returns:
        one of the following

        -   an :class:`InteractivePlot`, if IDs are available
        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if IDs
            are not available but you are working with the plotly backend in a
            Jupyter notebook
        -   a plotly or matplotlib figure, otherwise
    """
    backend = _parse_backend(backend)

    if backend == "matplotlib":
        from .matplotlib import lines as _lines
    else:
        from .plotly import lines as _lines

    return _lines(
        x=x,
        y=y,
        samples=samples,
        ids=ids,
        link_field=link_field,
        sizes=sizes,
        **kwargs,
    )


def scatterplot(
    points,
    samples=None,
    ids=None,
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
        points: a ``num_points x num_dims`` array-like of points
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        ids (None): an array-like of IDs corresponding to the points. If not
            provided but ``samples`` are provided, the appropriate IDs will be
            extracted from the samples
        link_field (None): a field of ``samples`` whose data corresponds to
            ``points``. Can be any of the following:

            -   None, if the points correspond to samples
            -   ``"frames"``, if the points correspond to frames
            -   the name of a :class:`fiftyone.core.labels.Label` field, if the
                points linked to the labels in this field
        labels (None): data to use to color the points. Can be any of the
            following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric or string values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric or string values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   an array-like of numeric or string values
            -   a list of array-likes of numeric or string values, if
                ``link_field`` refers to a label list field like
                :class:`fiftyone.core.labels.Detections`
        sizes (None): data to use to scale the sizes of the points. Can be any
            of the following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   an array-like of numeric values
            -   a list of array-likes of numeric or string values, if
                ``link_field`` refers to a label list field like
                :class:`fiftyone.core.labels.Detections`
        classes (None): an list of classes whose points to plot. Only
            applicable when ``labels`` contains strings
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.scatterplot`

    Returns:
        one of the following

        -   an :class:`InteractivePlot`, if IDs are available
        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if IDs
            are not available but you are working with the plotly backend in a
            Jupyter notebook
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
        ids=ids,
        link_field=link_field,
        labels=labels,
        sizes=sizes,
        classes=classes,
        **kwargs,
    )


def location_scatterplot(
    locations=None,
    samples=None,
    ids=None,
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
        ids (None): an array-like of IDs corresponding to the locations. If not
            provided but ``samples`` are provided, the appropriate IDs will be
            extracted from the samples
        labels (None): data to use to color the points. Can be any of the
            following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric or string values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric or string values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   an array-like of numeric or string values
        sizes (None): data to use to scale the sizes of the points. Can be any
            of the following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   an array-like of numeric values
        classes (None): a list of classes whose points to plot. Only applicable
            when ``labels`` contains strings
        backend ("plotly"): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.location_scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.location_scatterplot`

    Returns:
        one of the following

        -   an :class:`InteractivePlot`, if IDs are available
        -   a :class:`fiftyone.core.plots.plotly.PlotlyNotebookPlot`, if IDs
            are not available but you are working with the plotly backend in a
            Jupyter notebook
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
        ids=ids,
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
            % (backend, available_backends)
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

    def save(self, path, **kwargs):
        """Saves the plot.

        Args:
            path: the path to write the plot
            **kwargs: subclass-specific keyword arguments
        """
        raise NotImplementedError("Subclass must implement save()")

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
        init_view (None): an initial
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
            agg_results (None): a list of pre-computed aggregation results
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
        link_type ("samples"): whether this plot is linked to ``"samples"``,
            ``"frames"``, or ``"labels"``
        init_view (None): a :class:`fiftyone.core.collections.SampleCollection`
            defining an initial view from which to derive selection views when
            points are selected in the plot. This view will also be shown when
            the plot is in its default state (no selection)
        label_fields (None): a label field or list of label fields to which
            points in this plot correspond. Only applicable when
            ``link_type == "labels"``
        selection_mode (None): the initial selection mode to use when updating
            connected sessions in response to selections in this plot. See
            :meth:`selection_mode` for details
        init_fcn (None): a function that can be called with ``init_view`` as
            its argument that returns a
            :class:`fiftyone.core.collections.SampleCollection` defining an
            initial view from which to derive certain types of selection views.
            See :meth:`selection_mode` for details
    """

    def __init__(
        self,
        link_type="samples",
        init_view=None,
        label_fields=None,
        selection_mode=None,
        init_fcn=None,
    ):
        supported_link_types = ("samples", "frames", "labels")
        if link_type not in supported_link_types:
            raise ValueError(
                "Unsupported link_type '%s'; supported values are %s"
                % (link_type, supported_link_types)
            )

        if selection_mode is None and link_type in ("frames", "labels"):
            selection_mode = "select"

        super().__init__(link_type)

        self.label_fields = label_fields

        self._init_view = init_view
        self._init_fcn = init_fcn
        self._init_fcn_view = None

        self._selection_callback = None
        self._sync_callback = None
        self._disconnect_callback = None
        self._selection_mode = None

        self.selection_mode = selection_mode

    @property
    def selection_mode(self):
        """The current selection mode of the plot.

        This property controls how the current view is updated in response to
        updates from :class:`InteractivePlot` instances that are linked to
        labels or frames.

        When ``link_type`` is ``"frames"``, the supported values are:

        -   ``"select"``: show video samples with labels only for the selected
            frames
        -   ``"match"``: show unfiltered video samples containing at least one
            selected frame
        -   ``"frames"``: show only the selected frames in a frames view

        When ``link_type`` is ``"labels"``, the supported values are:

        -   ``"select"``: show only the selected labels
        -   ``"match"``: show unfiltered samples containing at least one
            selected label
        -   ``"patches"``: show the selected labels in a patches view

        .. note::

            In order to use ``"patches"`` selection mode, you must have
            provided an ``init_fcn`` when constructing this plot that defines
            how to create the base patches view. This usually involves
            :meth:`to_patches() <fiftyone.core.collections.SampleCollection.to_patches>`
            or
            :meth:`to_evaluation_patches() <fiftyone.core.collections.SampleCollection.to_evaluation_patches>`

        .. note::

            In order to use ``"frames"`` selection mode, you must have
            provided an ``init_fcn`` when constructing this plot that defines
            how to create the base frames view. This usually involves
            :meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>`
        """
        return self._selection_mode

    @selection_mode.setter
    def selection_mode(self, mode):
        if self.link_type not in ("frames", "labels"):
            if mode is not None:
                logger.warning(
                    "Ignoring `selection_mode` parameter, which is only "
                    "applicable for plots linked to frames or labels"
                )

            return

        supported_modes = ["select", "match"]

        if self._init_fcn is not None:
            if self.link_type == "frames":
                supported_modes.append("frames")
            elif self.link_type == "labels":
                supported_modes.append("patches")

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
        if self.selection_mode not in ("frames", "patches"):
            return self._init_view

        if self._init_fcn_view is None:
            self._init_fcn_view = self._init_fcn(self._init_view)

        return self._init_fcn_view

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

    @staticmethod
    def recommend_link_type(label_field=None, samples=None):
        """Recommends a link type for the given info.

        Args:
            label_field (None): the label field, if any
            samples (None): the
                :class:`fiftyone.core.collections.SampleCollection`, if known

        Returns:
            a ``(link_type, label_fields, selection_mode, init_fcn)`` tuple
        """
        link_type = None
        label_fields = label_field
        selection_mode = None
        init_fcn = None

        if label_field is None:
            if isinstance(samples, fov.FramesView):
                link_type = "frames"
            elif isinstance(samples, fop.PatchesView):
                link_type = "labels"
                label_fields = samples._label_fields
            else:
                link_type = "samples"
        elif label_field == "frames":
            if isinstance(samples, fov.FramesView):
                link_type = "frames"
            else:
                link_type = "frames"
                init_fcn = lambda view: view.to_frames()
        else:
            link_type = "labels"

            if samples is not None:
                label_type = samples._get_label_field_type(label_field)
                if issubclass(label_type, (fol.Detections, fol.Polylines)):
                    selection_mode = "patches"
                    init_fcn = lambda view: view.to_patches(label_field)

        return link_type, label_fields, selection_mode, init_fcn

    def register_selection_callback(self, callback):
        """Registers a selection callback for this plot.

        Selection callbacks are functions that take a single argument
        containing the list of currently selected IDs.

        If a selection callback is registered, this plot should invoke it each
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
