"""
Plotly utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import itertools
import logging
import os

import numpy as np
import plotly.callbacks as pcb
import plotly.express as px
import plotly.graph_objects as pgo

import eta.core.utils as etau

import fiftyone.core.context as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
from fiftyone.core.view import DatasetView

from .interactive import InteractivePlot, SessionPlot

mpl = fou.lazy_import("matplotlib")


logger = logging.getLogger(__name__)


_MAX_TRACES = 25


def plot_confusion_matrix(
    confusion_matrix,
    labels,
    ids=None,
    colorscale=None,
    template="simple_white",
    height=None,
    show=True,
):
    """Plots a confusion matrix.

    If ``ids`` are provided, a :class:`PlotlyHeatmap` is returned that can be
    used to interactively select cells and retrive their corresponding IDs.

    Args:
        confusion_matrix: a ``num_true x num_preds`` confusion matrix
        labels: a ``max(num_true, num_preds)`` array of class labels
        ids (None): an optional array of same shape as ``confusion_matrix``
            containing lists of IDs corresponding to each cell
        colorscale (None): a plotly colorscale to use
        template ("simple_white"): a plotly template to use. See
            `https://plotly.com/python/templates` for more information
        height (None): a height for the plot, in pixels
        show (True): whether to show the plot

    Returns:
        one of the following:

        -   a :class:`PlotlyHeatmap`, if ``ids`` are provided
        -   a ``plotly.graph_objects.Figure``, if no ``ids`` are provided
    """
    if ids is not None and not foc.is_notebook_context():
        logger.warning(
            "Interactive Plotly plots are currently only supported in "
            "notebooks"
        )
        ids = None

    if ids is None:
        return _plot_confusion_matrix_static(
            confusion_matrix,
            labels,
            colorscale=colorscale,
            template=template,
            height=height,
            show=show,
        )

    return _plot_confusion_matrix_interactive(
        confusion_matrix,
        labels,
        ids,
        colorscale=colorscale,
        template=template,
        height=height,
        show=show,
    )


def _plot_confusion_matrix_static(
    confusion_matrix,
    labels,
    colorscale=None,
    template=None,
    height=None,
    show=True,
):
    confusion_matrix = np.asarray(confusion_matrix)
    num_rows, num_cols = confusion_matrix.shape
    zlim = [0, confusion_matrix.max()]

    hover_lines = [
        "<b>count: %{z:d}</b>",
        "truth: %{y}",
        "predicted: %{x}",
    ]
    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    heatmap = pgo.Heatmap(
        x=labels[:num_cols],
        y=labels[:num_rows],
        z=confusion_matrix,
        zmin=zlim[0],
        zmax=zlim[1],
        colorbar=dict(lenmode="fraction", len=1),
        colorscale=colorscale,
        hovertemplate=hovertemplate,
    )

    figure = pgo.Figure(heatmap)

    if height is not None:
        figure.update_layout(height=height)

    figure.update_layout(
        xaxis=dict(range=[-0.5, num_cols - 0.5], constrain="domain"),
        yaxis=dict(
            range=[-0.5, num_rows - 0.5],
            constrain="domain",
            autorange="reversed",
            scaleanchor="x",
            scaleratio=1,
        ),
        xaxis_title="Predicted label",
        yaxis_title="True label",
        template=template,
    )

    if show:
        figure.show()

    return figure


def _plot_confusion_matrix_interactive(
    confusion_matrix,
    labels,
    ids,
    colorscale=None,
    template=None,
    height=None,
    show=True,
):
    confusion_matrix = np.asarray(confusion_matrix)
    ids = np.asarray(ids)

    num_rows, num_cols = confusion_matrix.shape
    zlim = [0, confusion_matrix.max()]

    plot = PlotlyHeatmap(
        confusion_matrix,
        ids,
        xlabels=labels[:num_cols],
        ylabels=labels[:num_rows],
        zlim=zlim,
        colorscale=colorscale,
        template=template,
    )

    if height is not None:
        plot._figure.update_layout(height=height)

    if show:
        plot.show()

    return plot


def plot_pr_curve(
    precision,
    recall,
    label=None,
    style="area",
    template=None,
    height=None,
    show=True,
):
    """Plots a precision-recall (PR) curve.

    Args:
        precision: an array of precision values
        recall: an array of recall values
        label (None): a label for the curve
        style ("area"): a plot style to use. Supported values are
            ``("area", "line")``
        template (None): a plotly template to use. See
            `https://plotly.com/python/templates` for more information
        height (None): a height for the plot, in pixels
        show (True): whether to show the plot

    Returns:
        a ``plotly.graph_objects.Figure``
    """
    if style == "line":
        plot = px.line
    else:
        if style != "area":
            logger.warning(
                "Unsupported style '%s'; using 'area' instead", style
            )

        plot = px.area

    figure = plot(x=recall, y=precision)

    # Add 50/50 line
    figure.add_shape(
        type="line", line=dict(dash="dash"), x0=0, x1=1, y0=1, y1=0
    )

    if height is not None:
        figure.update_layout(height=height)

    if label is not None:
        figure.update_layout(title=dict(text=label, x=0.5, xanchor="center"))

    figure.update_layout(
        xaxis=dict(range=[0, 1], constrain="domain"),
        yaxis=dict(
            range=[0, 1], constrain="domain", scaleanchor="x", scaleratio=1
        ),
        xaxis_title="Recall",
        yaxis_title="Precision",
        template=template,
    )

    if show:
        figure.show()

    return figure


def plot_pr_curves(
    precisions, recall, classes, template=None, height=None, show=True
):
    """Plots a set of per-class precision-recall (PR) curves.

    Args:
        precisions: a ``num_classes x num_recalls`` array of per-class
            precision values
        recall: an array of recall values
        classes: the list of classes
        template (None): a plotly template to use. See
            `https://plotly.com/python/templates` for more information
        height (None): a height for the plot, in pixels
        show (True): whether to show the plot

    Returns:
        a ``plotly.graph_objects.Figure``
    """
    figure = pgo.Figure()

    # Add 50/50 line
    figure.add_shape(
        type="line", line=dict(dash="dash"), x0=0, x1=1, y0=1, y1=0
    )

    hover_lines = [
        "<b>class: %{text}</b>",
        "recall: %{x}",
        "precision: %{y}",
    ]

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    for precision, _class in zip(precisions, classes):
        avg_precision = np.mean(precision)
        label = "%s (AP = %.3f)" % (_class, avg_precision)

        line = pgo.Scatter(
            x=recall,
            y=precision,
            name=label,
            mode="lines",
            text=np.full(recall.shape, _class),
            hovertemplate=hovertemplate,
        )

        figure.add_trace(line)

    if height is not None:
        figure.update_layout(height=height)

    figure.update_layout(
        xaxis=dict(range=[0, 1], constrain="domain"),
        yaxis=dict(
            range=[0, 1], constrain="domain", scaleanchor="x", scaleratio=1
        ),
        xaxis_title="Recall",
        yaxis_title="Precision",
        template=template,
    )

    if show:
        figure.show()

    return figure


def plot_roc_curve(
    fpr,
    tpr,
    roc_auc=None,
    style="area",
    template=None,
    height=None,
    show=True,
):
    """Plots a receiver operating characteristic (ROC) curve.

    Args:
        fpr: an array of false postive rates
        tpr: an array of true postive rates
        roc_auc (None): the area under the ROC curve
        style ("area"): a plot style to use. Supported values are
            ``("area", "line")``
        template (None): a plotly template to use. See
            `https://plotly.com/python/templates` for more information
        height (None): a height for the plot, in pixels
        show (True): whether to show the plot

    Returns:
        a ``plotly.graph_objects.Figure``
    """
    if style == "line":
        plot = px.line
    else:
        if style != "area":
            logger.warning(
                "Unsupported style '%s'; using 'area' instead", style
            )

        plot = px.area

    figure = plot(x=fpr, y=tpr)

    # Add 50/50 line
    figure.add_shape(
        type="line", line=dict(dash="dash"), x0=0, x1=1, y0=0, y1=1
    )

    if height is not None:
        figure.update_layout(height=height)

    if roc_auc is not None:
        figure.update_layout(
            title=dict(text="AUC: %.5f" % roc_auc, x=0.5, xanchor="center")
        )

    figure.update_layout(
        xaxis=dict(range=[0, 1], constrain="domain"),
        yaxis=dict(
            range=[0, 1], constrain="domain", scaleanchor="x", scaleratio=1
        ),
        xaxis_title="False positive rate",
        yaxis_title="True positive rate",
        template=template,
    )

    if show:
        figure.show()

    return figure


def scatterplot(
    points,
    samples=None,
    session=None,
    label_field=None,
    field=None,
    labels=None,
    classes=None,
    template="ggplot2",
    height=None,
    show=True,
):
    """Generates an interactive scatterplot of the given points.

    This method supports 2D or 3D visualizations, but interactive point
    selection is only aviailable in 2D.

    If you provide a ``session`` object, then the state of the FiftyOne App
    will be synced with the currently selected points in the plot.

    -   Sample selection: If no ``label_field`` is provided, then when points
        are selected, a view containing the corresponding samples will be
        loaded in the App

    -   Label selection: If ``label_field`` is provided, then when points are
        selected, a view containing the corresponding labels in
        ``label_field`` will be loaded in the App

    You can use the ``field`` or ``labels`` parameters to define a coloring for
    the points.

    Args:
        points: a ``num_points x num_dims`` array of points
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        session (None): a :class:`fiftyone.core.session.Session` object to
            link with the interactive plot
        label_field (None): a :class:`fiftyone.core.labels.Label` field
            containing the labels corresponding to ``points``. If not provided,
            the points are assumed to correspond to samples
        field (None): a sample field or ``embedded.field.name`` to use to
            color the points. Can be numeric or strings
        labels (None): a list of numeric or string values to use to color
            the points
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        template ("ggplot2"): a plotly template to use. See
            `https://plotly.com/python/templates` for more information
        height (None): a height for the plot, in pixels
        show (True): whether to show the plot

    Returns:
        one of the following:

        -   a :class:`fiftyone.utils.plot.interactive.SessionPlot`, if a
            ``session`` is provided
        -   a :class:`InteractiveScatter`, if no ``session`` is provided
        -   a ``plotly.graph_objects.Figure``, for 3D points or in non-notebook
            contexts
    """
    points = np.asarray(points)
    num_dims = points.shape[1]

    if num_dims not in {2, 3}:
        raise ValueError("This method only supports 2D or 3D points")

    points, ids, values, classes, categorical = _parse_scatter_inputs(
        points, samples, session, label_field, field, labels, classes
    )

    if field is not None:
        value_label = field
    else:
        value_label = "label"

    if categorical:
        if len(classes) > _MAX_TRACES:
            figure = _plot_scatter_categorical_single_trace(
                points, values, classes, ids=ids, value_label=value_label
            )
        else:
            figure = _plot_scatter_categorical(
                points, values, classes, ids=ids, value_label=value_label
            )
    else:
        figure = _plot_scatter_numeric(
            points, values=values, ids=ids, value_label=value_label
        )

    if height is not None:
        figure.update_layout(height=height)

    figure.update_layout(
        margin={"r": 0, "t": 30, "l": 0, "b": 0},
        template=template,  # https://plotly.com/python/templates
    )

    if num_dims == 3:
        if session is not None:
            logger.warning("Interactive selection is only supported in 2D")

        figure.show()
        return figure

    if not foc.is_notebook_context():
        if session is not None:
            logger.warning(
                "Interactive Plotly plots are currently only supported in "
                "notebooks"
            )

        if show:
            figure.show()

        return figure

    plot = InteractiveScatter(figure)
    if show:
        plot.show()

    if session is None:
        return plot

    link_type = "samples" if label_field is None else "labels"
    return SessionPlot(session, plot, link_type=link_type)


def location_scatterplot(
    locations=None,
    location_field=None,
    samples=None,
    session=None,
    label_field=None,
    field=None,
    labels=None,
    classes=None,
    template="ggplot2",
    height=None,
    show=True,
):
    """Generates an interactive scatterplot of the given location coordinates
    with a map rendered in the background of the plot.

    Location data can be specified either via the ``locations`` or
    ``location_field`` parameters. If you specify neither, the first
    :class:`fiftyone.core.labels.GeoLocation` field on the dataset is used.

    If you provide a ``session`` object, then the state of the FiftyOne App
    will be synced with the currently selected points in the plot.

    -   Sample selection: If no ``label_field`` is provided, then when points
        are selected, a view containing the corresponding samples will be
        loaded in the App

    -   Label selection: If ``label_field`` is provided, then when points are
        selected, a view containing the corresponding labels in
        ``label_field`` will be loaded in the App

    You can use the ``field`` or ``labels`` parameters to define a coloring for
    the points.

    Args:
        locations (None): a ``num_samples x 2`` array of
            ``(longitude, latitude)`` coordinates
        location_field (None): the name of a
            :class:`fiftyone.core.labels.GeoLocation` field with
            ``(longitude, latitude)`` coordinates in its ``point`` attribute
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        session (None): a :class:`fiftyone.core.session.Session` object to
            link with the interactive plot
        label_field (None): a :class:`fiftyone.core.labels.Label` field
            containing labels for each location
        field (None): a sample field or ``embedded.field.name`` to use to
            color the points. Can be numeric or strings
        labels (None): a list of numeric or string values to use to color
            the points
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        template ("ggplot2"): a plotly template to use. See
            `https://plotly.com/python/templates` for more information
        height (None): a height for the plot, in pixels
        show (True): whether to show the plot

    Returns:
        one of the following:

        -   a :class:`fiftyone.utils.plot.interactive.SessionPlot`, if a
            ``session`` is provided
        -   an :class:`fiftyone.utils.plot.interactive.InteractivePlot`, if a
            ``session`` is not provided
        -   a ``plotly.graph_objects.Figure``, in non-notebook contexts
    """
    if session is not None and samples is None:
        samples = session._collection

    if samples is None:
        raise ValueError(
            "You must provide `samples` when `locations` are not manually "
            "specified"
        )

    locations = _parse_locations(locations, location_field, samples)

    locations, ids, values, classes, categorical = _parse_scatter_inputs(
        locations, samples, session, label_field, field, labels, classes
    )

    if field is not None:
        value_label = field
    else:
        value_label = "label"

    if categorical:
        if len(classes) > _MAX_TRACES:
            figure = _plot_scatter_mapbox_categorical_single_trace(
                locations, values, classes, ids=ids, value_label=value_label
            )
        else:
            figure = _plot_scatter_mapbox_categorical(
                locations, values, classes, ids=ids, value_label=value_label
            )
    else:
        figure = _plot_scatter_mapbox_numeric(
            locations, values=values, ids=ids, value_label=value_label
        )

    if height is not None:
        figure.update_layout(height=height)

    figure.update_layout(
        margin={"r": 0, "t": 30, "l": 0, "b": 0},
        template=template,  # https://plotly.com/python/templates
    )

    if not foc.is_notebook_context():
        if session is not None:
            logger.warning(
                "Interactive Plotly plots are currently only supported in "
                "notebooks"
            )

        if show:
            figure.show()

        return figure

    plot = InteractiveScatter(figure)
    if show:
        plot.show()

    if session is None:
        return plot

    link_type = "samples" if label_field is None else "labels"
    return SessionPlot(session, plot, link_type=link_type)


class InteractivePlotlyPlot(InteractivePlot):
    """Base class for interactive plotly plots.

    Args:
        widget: a ``plotly.graph_objects.FigureWidget``
    """

    def __init__(self, widget):
        if not foc.is_notebook_context():
            raise foc.ContextError(
                "Interactive Plotly plots can only be used in notebooks"
            )

        self._widget = widget
        self._handle = None

        super().__init__()

    def _show(self):
        from IPython.display import display

        # Create an empty display that we'll use for `freeze()` later
        # Replacing the widget with an image in the same handle didn't work...
        self._handle = display(display_id=True)
        self._handle.display({"text/plain": ""}, raw=True)

        display(self._widget)

    def _freeze(self):
        from IPython.display import Image

        width = self._widget.layout.width
        height = self._widget.layout.height
        image_bytes = self._widget.to_image(
            format="png", height=height, width=width
        )

        self._widget.close()
        self._handle.update(Image(image_bytes))


class InteractiveScatter(InteractivePlotlyPlot):
    """Interactive plot wrapper for a Plotly figure containing one or more
    scatter-type traces.

    This plot responds to selection and deselection events triggered on the
    figure's traces via plotly's lasso and box selector tools.

    All traces must contain IDs in their ``customdata`` attribute that identify
    the points in the traces.

    Args:
        figure: a ``plotly.graph_objects.Figure``
    """

    def __init__(self, figure):
        widget = pgo.FigureWidget(figure)
        traces = widget.data

        self._traces = traces
        self._trace_ids = {}
        self._ids_to_traces = {}
        self._ids_to_inds = {}
        self._callback_flags = {}
        self._select_callback = None

        self._init_traces()
        self._init_callback_flags()

        super().__init__(widget)

    def _init_traces(self):
        for idx, trace in enumerate(self._traces):
            if trace.customdata is None or not isinstance(
                trace.customdata, np.ndarray
            ):
                _name = "'%s'" % trace.name if trace.name else str(idx)
                raise ValueError(
                    "Trace %s does not contain IDs in its `customdata` "
                    "attribute" % _name
                )

            trace_ids = trace.customdata
            if trace_ids.ndim > 1:
                trace_ids = trace_ids[:, 0]

            self._trace_ids[idx] = trace_ids

            self._ids_to_traces.update({_id: idx for _id in trace_ids})
            self._ids_to_inds[idx] = {
                _id: idx for idx, _id in enumerate(trace_ids)
            }

    def _init_callback_flags(self):
        self._callback_flags = {t.name: False for t in self._traces}

    def _register_selection_callback(self, callback):
        self._select_callback = callback

    @property
    def _any_selected(self):
        return any(bool(t.selectedpoints) for t in self._traces)

    @property
    def _selected_ids(self):
        ids = []
        for idx, trace in enumerate(self._traces):
            if trace.selectedpoints:
                ids.append(self._trace_ids[idx][list(trace.selectedpoints)])

        return list(itertools.chain.from_iterable(ids))

    def _register_selection_callback(self, callback):
        self._select_callback = callback

    def _show(self):
        def _on_selection(trace, points, selector):
            self._on_select(trace, selector=selector)

        def _on_deselect(trace, points):
            self._on_select(trace)

        for trace in self._traces:
            trace.on_selection(_on_selection)
            trace.on_deselect(_on_deselect)

        super()._show()

    def _disconnect(self):
        for trace in self._traces:
            trace.on_selection(None)
            trace.on_deselect(None)

    def _select_ids(self, ids):
        if ids is None:
            ids = []

        # Split IDs into traces
        per_trace_ids = defaultdict(list)
        for _id in ids:
            per_trace_ids[self._ids_to_traces[_id]].append(_id)

        for idx, trace in enumerate(self._traces):
            # Convert IDs to point inds
            inds_map = self._ids_to_inds[idx]
            trace_ids = per_trace_ids[idx]
            trace_inds = [inds_map[_id] for _id in trace_ids]
            if not trace_inds:
                trace_inds = None

            # Select points
            trace.update(selectedpoints=trace_inds)

    def _on_select(self, trace, selector=None):
        if self._select_callback is None:
            return

        if not self._ready_for_callback(trace):
            return

        self._select_callback(self.selected_ids)

    def _ready_for_callback(self, trace):
        if trace.visible == True:
            self._callback_flags[trace.name] = True

        # We're ready for callback if there is at least one visible trace and
        # all visible traces have fired their selection events
        visible_traces = [t for t in self._traces if t.visible == True]
        if not visible_traces:
            ready = False
        else:
            ready = all(self._callback_flags[t.name] for t in visible_traces)

        if ready:
            self._init_callback_flags()

        return ready


class ManualInteractiveScatter(InteractiveScatter):
    """Interactive plot wrapper for a Plotly figure containing one or more
    scatter-type traces.

    This plot responds to selection and deselection events triggered on the
    figure's traces via plotly's lasso and box selector tools.

    Unlike :class:`InteractiveScatter`, this class does not require the traces
    to store the IDs of their points in their ``customdata`` attribute.
    Instead, the selected points are manually computed from the raw lasso/box
    coordinates via the provided ``points`` array each time a selection event
    occurs.

    Args:
        figure: a ``plotly.graph_objects.Figure``
        points: a ``num_points x 2`` array of points
        ids: a ``num_points`` array containing the IDs for ``points``
    """

    def __init__(self, figure, points, ids):
        self._points = points
        self._point_ids = ids
        self._trace_inds = None
        self._ids = None

        super().__init__(figure)

    @property
    def _selected_ids(self):
        return list(self._ids) if self._ids is not None else []

    def _init_traces(self):
        self._trace_inds = np.zeros(len(self._points), dtype=int)
        for trace_idx, trace in enumerate(self._traces):
            trace_ids = set(self._trace_ids[trace_idx])
            for point_idx, _id in enumerate(self._point_ids):
                if _id in trace_ids:
                    self._trace_inds[point_idx] = trace_idx

    def _on_select(self, trace, selector=None):
        # Manually compute points within selector
        self._manual_select(selector)

        super()._on_select(trace, selector=selector)

    def _manual_select(self, selector):
        if not isinstance(selector, (pcb.LassoSelector, pcb.BoxSelector)):
            return

        visible_traces = set(
            idx
            for idx, trace in enumerate(self._traces)
            if trace.visible == True  # can be `{False, True, "legendonly"}`
        )

        if not visible_traces:
            self._ids = np.array([], dtype=self._point_ids.dtype)
            return

        if isinstance(selector, pcb.LassoSelector):
            vertices = np.stack((selector.xs, selector.ys), axis=1)
        else:
            x1, x2 = selector.xrange
            y1, y2 = selector.yrange
            vertices = np.array([[x1, y1], [x1, y2], [x2, y2], [x2, y1]])

        # @todo don't use matplotlib here?
        path = mpl.path.Path(vertices)
        found = path.contains_points(self._points)

        mask = np.array([ind in visible_traces for ind in self._trace_inds])

        self._ids = self._point_ids[found & mask]


class PlotlyHeatmap(InteractivePlotlyPlot):
    """An interactive Plotly heatmap.

    Args:
        Z: a ``num_cols x num_rows`` array of heatmap values
        ids: an array of same shape as ``Z`` whose elements contain lists
            of IDs for the heatmap cells
        xlabels (None): a ``num_rows`` array of x labels
        ylabels (None): a ``num_cols`` array of y labels
        colorscale (None): a plotly colorscale to use
        template (None): a plotly template to use. See
            `https://plotly.com/python/templates` for more information
        grid_opacity (0.1): an opacity value for the grid points
        bg_opacity (0.25): an opacity value for background (unselected) cells
    """

    def __init__(
        self,
        Z,
        ids,
        xlabels=None,
        ylabels=None,
        zlim=None,
        colorscale=None,
        template=None,
        grid_opacity=0.1,
        bg_opacity=0.25,
    ):
        Z = np.asarray(Z)

        if zlim is None:
            zlim = [Z.min(), Z.max()]

        self.Z = Z
        self.ids = ids
        self.xlabels = xlabels
        self.ylabels = ylabels
        self.zlim = zlim
        self.colorscale = colorscale
        self.template = template
        self.grid_opacity = grid_opacity
        self.bg_opacity = bg_opacity

        self._selected_cells = []
        self._cells_map = {}

        self._figure = None
        self._widget = None
        self._gridw = None
        self._selectedw = None
        self._bgw = None
        self._select_callback = None

        self._init_cells_map()
        self._init_heatmap()

        super().__init__(self._widget)

    @property
    def _any_selected(self):
        return bool(self._selected_cells)

    @property
    def _selected_ids(self):
        ids = []
        for x, y in self._selected_cells:
            ids.extend(self.ids[x, y])

        return ids

    def _register_selection_callback(self, callback):
        self._select_callback = callback

    def _show(self):
        def _on_click(trace, points, state):
            self._on_click(points.point_inds[0])

        def _on_selection(trace, points, state):
            self._on_selection(points.point_inds)

        self._bgw.on_click(_on_click)
        self._gridw.on_selection(_on_selection)

        super()._show()

    def _disconnect(self):
        self._bgw.on_click(None)
        self._gridw.on_selection(None)

    def _select_ids(self, ids):
        if ids is None:
            ids = []

        cells = list(set(self._cells_map(_id) for _id in ids))
        self._select(cells)

    def _on_click(self, cell):
        cell = tuple(cell)
        num_selected = len(self._selected_cells)

        self._gridw.selectedpoints = None

        if (num_selected > 1) or (
            num_selected == 1 and cell == self._selected_cells[0]
        ):
            self._deselect()
        else:
            self._select([cell])

    def _on_selection(self, point_inds):
        if point_inds:
            x, y = np.unravel_index(point_inds, self.Z.shape)
            cells = list(zip(x, y))
            self._select(cells)
        else:
            self._deselect()

    def _select(self, cells):
        x, y = zip(*cells)
        Zclick = np.full(self.Z.shape, None)
        Zclick[x, y] = self.Z[x, y]
        self._selected_cells = cells
        self._selectedw.z = Zclick

        if self._select_callback is not None:
            self._select_callback(self.selected_ids)

    def _deselect(self):
        self._selected_cells = []
        self._selectedw.z = self.Z

        if self._select_callback is not None:
            self._select_callback(self.selected_ids)

    def _init_cells_map(self):
        num_cols, num_rows = self.Z.shape
        self._cells_map = {}
        for y in range(num_cols):
            for x in range(num_rows):
                for _id in self.ids[y, x]:
                    self._cells_map[_id] = (x, y)

    def _init_heatmap(self):
        Z = self.Z.copy()

        num_cols, num_rows = Z.shape
        xticks = np.arange(num_rows)
        yticks = np.arange(num_cols)
        X, Y = np.meshgrid(xticks, yticks)

        hover_lines = [
            "<b>count: %{z:d}</b>",
            "truth: %{y}",
            "predicted: %{x}",
        ]
        hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

        grid = pgo.Scatter(
            x=X.flatten(),
            y=Y.flatten(),
            opacity=self.grid_opacity,
            mode="markers",
            hovertemplate=None,  # no hover
        )

        selected = pgo.Heatmap(
            z=Z,
            zmin=self.zlim[0],
            zmax=self.zlim[1],
            colorbar=dict(lenmode="fraction", len=1),
            colorscale=self.colorscale,
            hoverinfo="skip",  # no hover, no callbacks
        )

        bg = pgo.Heatmap(
            z=Z,
            colorscale=self.colorscale,
            opacity=self.bg_opacity,
            showscale=False,
            hovertemplate=hovertemplate,
        )

        figure = pgo.Figure([grid, selected, bg])

        figure.update_layout(
            xaxis=dict(
                tickmode="array",
                tickvals=xticks,
                ticktext=self.xlabels,
                range=[-0.5, num_rows - 0.5],
                constrain="domain",
            ),
            yaxis=dict(
                tickmode="array",
                tickvals=yticks,
                ticktext=self.ylabels,
                range=[-0.5, num_cols - 0.5],
                constrain="domain",
                autorange="reversed",
                scaleanchor="x",
                scaleratio=1,
            ),
            clickmode="event",
            template=self.template,
        )

        self._figure = figure
        self._widget = pgo.FigureWidget(figure)
        self._gridw, self._selectedw, self._bgw = self._widget.data


def _parse_scatter_inputs(
    points, samples, session, label_field, field, labels, classes
):
    if field is not None:
        if samples is None:
            raise ValueError(
                "You must provide `samples` in order to extract field values"
            )

        labels = samples.values(field)

    if labels and isinstance(labels[0], (list, tuple)):
        labels = list(itertools.chain.from_iterable(labels))

    if labels is not None:
        if len(labels) != len(points):
            raise ValueError(
                "Number of labels (%d) does not match number of points (%d). "
                "You may have missing data/labels that you need to omit from "
                "your view before visualizing" % (len(labels), len(points))
            )

    ids = None
    if session is not None:
        if label_field is not None:
            ids = samples._get_label_ids(fields=label_field)
            if len(ids) != len(points):
                raise ValueError(
                    "Number of label IDs (%d) does not match number of "
                    "points (%d). You may have missing data/labels that you "
                    "need to omit from your view before visualizing"
                    % (len(ids), len(points))
                )
        else:
            ids = np.array(samples.values("id"))
            if len(ids) != len(points):
                raise ValueError(
                    "Number of sample IDs (%d) does not match number of "
                    "points (%d). You may have missing data/labels that you "
                    "need to omit from your view before visualizing"
                    % (len(ids), len(points))
                )

    if samples is not None and session is not None:
        # Don't spawn a new App instance in notebook contexts
        with session.no_show():
            if isinstance(samples, DatasetView):
                session.view = samples
            else:
                session.dataset = samples

    if session is not None:
        if samples is None:
            samples = session._collection

    points, values, classes, inds, categorical = _parse_data(
        points, labels, classes
    )

    if ids is not None and inds is not None:
        ids = ids[inds]

    return points, ids, values, classes, categorical


def _parse_data(points, labels, classes):
    if not labels:
        return points, None, None, None, False

    if not etau.is_str(labels[0]):
        return points, labels, None, None, False

    if classes is None:
        classes = sorted(set(labels))
        return points, labels, classes, None, True

    found = np.array([l in classes for l in labels])
    if not np.all(found):
        points = points[found, :]
        values = values[found]
    else:
        found = None

    return points, values, classes, found, True


def _parse_locations(locations, location_field, samples):
    if locations is not None:
        return np.asarray(locations)

    if location_field is not None:
        samples.validate_field_type(
            location_field,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.GeoLocation,
        )
    else:
        location_field = samples._get_geo_location_field()

    coords = samples.values(location_field + ".point.coordinates")

    return np.asarray(coords)


def _plot_scatter_categorical(
    points,
    labels,
    classes,
    sizes=None,
    ids=None,
    value_label="label",
    size_label="size",
    max_marker_size=15,
):
    num_dims = points.shape[1]

    hover_lines = ["<b>%s: %%{text}</b>" % value_label]

    if sizes is not None:
        sizeref = 0.5 * max(sizes) / max_marker_size
        hover_lines.append("%s: %%{marker.size}" % size_label)

    if num_dims == 3:
        hover_lines.append("x, y, z = %{x:.3f}, %{y:.3f}, %{z:.3f}")
    else:
        hover_lines.append("x, y = %{x:.3f}, %{y:.3f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    traces = []
    for label in classes:
        label_inds = labels == label

        if ids is not None:
            customdata = ids[label_inds]
        else:
            customdata = None

        if sizes is not None:
            marker = dict(
                size=sizes[label_inds],
                sizemode="diameter",
                sizeref=sizeref,
                sizemin=4,
            )
        else:
            marker = None

        kwargs = dict(
            customdata=customdata,
            mode="markers",
            showlegend=True,
            name=label,
            marker=marker,
            text=np.full(np.count_nonzero(label_inds), label),
            hovertemplate=hovertemplate,
        )

        if num_dims == 3:
            scatter = pgo.Scatter3d(
                x=points[label_inds][:, 0],
                y=points[label_inds][:, 1],
                z=points[label_inds][:, 2],
                **kwargs,
            )
        else:
            scatter = pgo.Scattergl(
                x=points[label_inds][:, 0],
                y=points[label_inds][:, 1],
                **kwargs,
            )

        traces.append(scatter)

    return pgo.Figure(traces)


def _plot_scatter_categorical_single_trace(
    points,
    labels,
    classes,
    sizes=None,
    ids=None,
    colors=None,
    value_label="label",
    size_label="size",
    max_marker_size=15,
):
    num_dims = points.shape[1]

    if colors is None:
        colors = px.colors.qualitative.Plotly

    num_classes = len(classes)
    targets = [classes.index(l) for l in labels]
    clim = [-0.5, num_classes - 0.5]

    # @todo how to blend for >10 classes?
    colorscale = []
    for i in range(num_classes):
        color = colors[i % len(colors)]
        colorscale.append([i / num_classes, color])
        colorscale.append([(i + 1) / num_classes, color])

    marker = dict(
        color=targets,
        cmin=clim[0],
        cmax=clim[1],
        autocolorscale=False,
        colorscale=colorscale,
        colorbar=dict(
            title=value_label,
            tickvals=list(range(num_classes)),
            ticktext=classes,
            lenmode="fraction",
            len=1,
        ),
        showscale=True,
    )

    if sizes is not None:
        marker.update(
            dict(
                size=sizes,
                sizemode="diameter",
                sizeref=0.5 * max(sizes) / max_marker_size,
                sizemin=4,
            )
        )

    hover_lines = ["<b>%s: %%{text}</b>" % value_label]

    if sizes is not None:
        hover_lines.append("%s: %%{marker.size}" % size_label)

    if num_dims == 3:
        hover_lines.append("x, y, z = %{x:.3f}, %{y:.3f}, %{z:.3f}")
    else:
        hover_lines.append("x, y = %{x:.3f}, %{y:.3f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    kwargs = dict(
        customdata=ids,
        mode="markers",
        marker=marker,
        text=labels,
        hovertemplate=hovertemplate,
    )

    if num_dims == 3:
        scatter = pgo.Scatter3d(
            x=points[:, 0], y=points[:, 1], z=points[:, 2], **kwargs
        )
    else:
        scatter = pgo.Scattergl(x=points[:, 0], y=points[:, 1], **kwargs)

    return pgo.Figure(scatter)


def _plot_scatter_numeric(
    points,
    values=None,
    sizes=None,
    ids=None,
    colorscale="Viridis",
    value_label="label",
    size_label="size",
    max_marker_size=15,
):
    num_dims = points.shape[1]

    marker = dict()

    if values is not None:
        marker.update(
            dict(
                color=values,
                colorbar=dict(title=value_label, lenmode="fraction", len=1),
                colorscale=colorscale,
            )
        )

    if sizes is not None:
        marker.update(
            dict(
                size=sizes,
                sizemode="diameter",
                sizeref=0.5 * max(sizes) / max_marker_size,
                sizemin=4,
            )
        )

    hover_lines = []

    if values is not None:
        hover_lines = ["<b>%s: %%{marker.color}</b>" % value_label]

    if sizes is not None:
        hover_lines.append("%s: %%{marker.size}" % size_label)

    if num_dims == 3:
        hover_lines.append("x, y, z = %{x:.3f}, %{y:.3f}, %{z:.3f}")
    else:
        hover_lines.append("x, y = %{x:.3f}, %{y:.3f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    kwargs = dict(
        customdata=ids,
        mode="markers",
        marker=marker,
        hovertemplate=hovertemplate,
    )

    if num_dims == 3:
        scatter = pgo.Scatter3d(
            x=points[:, 0], y=points[:, 1], z=points[:, 2], **kwargs
        )
    else:
        scatter = pgo.Scattergl(x=points[:, 0], y=points[:, 1], **kwargs)

    return pgo.Figure(scatter)


def _plot_scatter_mapbox_categorical(
    coords,
    labels,
    classes,
    sizes=None,
    ids=None,
    value_label="label",
    size_label="size",
    max_marker_size=15,
):
    hover_lines = ["<b>%s: %%{text}</b>" % value_label]

    if sizes is not None:
        sizeref = 0.5 * max(sizes) / max_marker_size
        hover_lines.append("%s: %%{marker.size}" % size_label)

    hover_lines.append("lat: %{lat:.5f}<br>lon: %{lon:.5f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    traces = []
    for label in classes:
        label_inds = labels == label

        if ids is not None:
            customdata = ids[label_inds]
        else:
            customdata = None

        if sizes is not None:
            marker = dict(
                size=sizes[label_inds],
                sizemode="diameter",
                sizeref=sizeref,
                sizemin=4,
            )
        else:
            marker = None

        scatter = pgo.Scattermapbox(
            lat=coords[label_inds][:, 1],
            lon=coords[label_inds][:, 0],
            customdata=customdata,
            mode="markers",
            showlegend=True,
            name=label,
            marker=marker,
            text=np.full(np.count_nonzero(label_inds), label),
            hovertemplate=hovertemplate,
        )
        traces.append(scatter)

    figure = pgo.Figure(traces)

    zoom, (center_lon, center_lat) = _compute_zoom_center(coords)
    figure.update_layout(
        mapbox_style="carto-positron",
        mapbox=dict(center=dict(lat=center_lat, lon=center_lon), zoom=zoom),
    )

    return figure


def _plot_scatter_mapbox_categorical_single_trace(
    coords,
    labels,
    classes,
    sizes=None,
    ids=None,
    colors=None,
    value_label="label",
    size_label="size",
    max_marker_size=15,
):
    if colors is None:
        colors = px.colors.qualitative.Plotly

    num_classes = len(classes)
    targets = [classes.index(l) for l in labels]
    clim = [-0.5, num_classes - 0.5]

    # @todo how to blend for >10 classes?
    colorscale = []
    for i in range(num_classes):
        color = colors[i % len(colors)]
        colorscale.append([i / num_classes, color])
        colorscale.append([(i + 1) / num_classes, color])

    marker = dict(
        color=targets,
        cmin=clim[0],
        cmax=clim[1],
        autocolorscale=False,
        colorscale=colorscale,
        colorbar=dict(
            title=value_label,
            tickvals=list(range(num_classes)),
            ticktext=classes,
            lenmode="fraction",
            len=1,
        ),
        showscale=True,
    )

    if sizes is not None:
        marker.update(
            dict(
                size=sizes,
                sizemode="diameter",
                sizeref=0.5 * max(sizes) / max_marker_size,
                sizemin=4,
            )
        )

    hover_lines = ["<b>%s: %%{text}</b>" % value_label]

    if sizes is not None:
        hover_lines.append("%s: %%{marker.size}" % size_label)

    hover_lines.append("lat: %{lat:.5f}<br>lon: %{lon:.5f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    scatter = pgo.Scattermapbox(
        lat=coords[:, 1],
        lon=coords[:, 0],
        customdata=ids,
        mode="markers",
        marker=marker,
        text=labels,
        hovertemplate=hovertemplate,
    )

    figure = pgo.Figure(scatter)

    zoom, (center_lon, center_lat) = _compute_zoom_center(coords)
    figure.update_layout(
        mapbox_style="carto-positron",
        mapbox=dict(center=dict(lat=center_lat, lon=center_lon), zoom=zoom),
    )

    return figure


def _plot_scatter_mapbox_numeric(
    coords,
    values=None,
    sizes=None,
    ids=None,
    colorscale="Viridis",
    value_label="value",
    size_label="size",
    max_marker_size=15,
):
    marker = dict()

    if values is not None:
        marker.update(dict(color=values, colorscale=colorscale))

    if sizes is not None:
        marker.update(
            dict(
                size=sizes,
                sizemode="diameter",
                sizeref=0.5 * max(sizes) / max_marker_size,
                sizemin=4,
            )
        )

    hover_lines = []

    if values is not None:
        hover_lines = ["<b>%s: %%{marker.color}</b>" % value_label]

    if sizes is not None:
        hover_lines.append("%s: %%{marker.size}" % size_label)

    hover_lines.append("lat: %{lat:.5f}<br>lon: %{lon:.5f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    scatter = pgo.Scattermapbox(
        lat=coords[:, 1],
        lon=coords[:, 0],
        customdata=ids,
        mode="markers",
        marker=marker,
        hovertemplate=hovertemplate,
    )

    figure = pgo.Figure(scatter)

    zoom, (center_lon, center_lat) = _compute_zoom_center(coords)
    figure.update_layout(
        mapbox_style="carto-positron",
        mapbox=dict(center=dict(lat=center_lat, lon=center_lon), zoom=zoom),
    )

    return figure


# source: https://stackoverflow.com/a/64148305
def _compute_zoom_center(coords, pad=0.2, aspect_ratio=2.0):
    min_lon, min_lat = coords.min(axis=0)
    max_lon, max_lat = coords.max(axis=0)

    center_lon = round(0.5 * (min_lon + max_lon), 5)
    center_lat = round(0.5 * (min_lat + max_lat), 5)
    center = (center_lon, center_lat)

    # Longitudinal range by zoom level (20 to 1), in degrees, at equator
    lon_zoom_range = np.array(
        [
            0.0007,
            0.0014,
            0.003,
            0.006,
            0.012,
            0.024,
            0.048,
            0.096,
            0.192,
            0.3712,
            0.768,
            1.536,
            3.072,
            6.144,
            11.8784,
            23.7568,
            47.5136,
            98.304,
            190.0544,
            360.0,
        ]
    )

    alpha = 1.0 + pad
    height = (max_lat - min_lat) * alpha * aspect_ratio
    width = (max_lon - min_lon) * alpha
    lon_zoom = np.interp(width, lon_zoom_range, range(20, 0, -1))
    lat_zoom = np.interp(height, lon_zoom_range, range(20, 0, -1))
    zoom = int(round(min(lon_zoom, lat_zoom)))

    return zoom, center


def _patch_perform_plotly_relayout():
    """Attempts to patch an unresolved issue with zooming/panning FigureWidgets
    with Mapbox plots.

    https://github.com/plotly/plotly.py/issues/2570
    """
    filepath = os.path.join(
        os.path.dirname(os.__file__),
        "site-packages",
        "plotly",
        "basedatatypes.py",
    )

    with open(filepath, "r") as f:
        code = f.read()

    find = """
            if not BaseFigure._is_key_path_compatible(key_path_str, self.layout):

                raise ValueError("""

    replace = """
            if not BaseFigure._is_key_path_compatible(key_path_str, self.layout):
                # Patched by FiftyOne: https://github.com/voxel51/fiftyone
                # Issue: https://github.com/plotly/plotly.py/issues/2570
                if key_path_str == "mapbox._derived":
                    return

                raise ValueError("""

    if find in code:
        logger.debug("Patching '%s'", filepath)
        fixed = code.replace(find, replace)
        with open(filepath, "w") as f:
            f.write(fixed)
    elif replace in code:
        logger.debug("Already patched '%s'", filepath)
    else:
        logger.debug("Unable to patch '%s'", filepath)


_patch_perform_plotly_relayout()
