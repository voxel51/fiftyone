"""
Plotly plots.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import itertools
import logging
import os
import warnings

import numpy as np
from PIL import ImageColor
import plotly.colors as pc
import plotly.express as px
import plotly.graph_objects as go

import eta.core.utils as etau

import fiftyone.core.context as foc
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou

from .base import Plot, InteractivePlot, ResponsivePlot
from .utils import (
    best_fit_line,
    parse_lines_inputs,
    parse_locations,
    parse_scatter_inputs,
)


logger = logging.getLogger(__name__)


_DEFAULT_LAYOUT = dict(
    template="ggplot2", margin={"r": 0, "t": 30, "l": 0, "b": 0}
)

_DEFAULT_LINE_COLOR = "#FF6D04"
_DEFAULT_CONTINUOUS_COLORSCALE = "viridis"
_MAX_LABEL_TRACES = 25


def plot_confusion_matrix(
    confusion_matrix,
    labels,
    ids=None,
    samples=None,
    eval_key=None,
    gt_field=None,
    pred_field=None,
    colorscale="oranges",
    log_colorscale=False,
    title=None,
    **kwargs,
):
    """Plots a confusion matrix.

    If ``ids`` are provided, this method returns a :class:`InteractiveHeatmap`
    that you can attach to an App session via its
    :attr:`fiftyone.core.session.Session.plots` attribute, which will
    automatically sync the session's view with the currently selected cells in
    the confusion matrix.

    Args:
        confusion_matrix: a ``num_true x num_preds`` confusion matrix
        labels: a ``max(num_true, num_preds)`` array-like of class labels
        ids (None): an array-like of same shape as ``confusion_matrix`` whose
            elements are array-likes of label IDs corresponding to each cell
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the confusion matrix was generated. Only used when
            ``ids`` are also provided to update an attached session
        eval_key (None): the evaluation key of the evaluation
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        colorscale ("oranges"): a plotly colorscale to use. See
            https://plotly.com/python/colorscales for options
        log_colorscale (False): whether to apply the colorscale on a log scale.
            This is useful to better visualize variations in smaller values
            when large values are also present
        title (None): a title for the plot
        **kwargs: optional keyword arguments for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`

    Returns:
        one of the following

        -   a :class:`InteractiveHeatmap`, if ``ids`` are provided
        -   a :class:`PlotlyNotebookPlot`, if no ``ids`` are provided and you
            are working in a Jupyter notebook
        -   a plotly figure, otherwise
    """
    if log_colorscale:
        maxval = confusion_matrix.max()
        colorscale = _to_log_colorscale(colorscale, maxval)

    if ids is None:
        return _plot_confusion_matrix_static(
            confusion_matrix,
            labels,
            colorscale=colorscale,
            title=title,
            gt_field=gt_field,
            pred_field=pred_field,
            **kwargs,
        )

    return _plot_confusion_matrix_interactive(
        confusion_matrix,
        labels,
        ids,
        samples=samples,
        eval_key=eval_key,
        gt_field=gt_field,
        pred_field=pred_field,
        colorscale=colorscale,
        title=title,
        **kwargs,
    )


def _plot_confusion_matrix_static(
    confusion_matrix,
    labels,
    colorscale=None,
    title=None,
    gt_field=None,
    pred_field=None,
    **kwargs,
):
    confusion_matrix = np.asarray(confusion_matrix)
    num_rows, num_cols = confusion_matrix.shape
    zlim = [0, confusion_matrix.max()]
    truth = gt_field or "truth"
    predicted = pred_field or "predicted"

    hover_lines = [
        "<b>count: %{z:d}</b>",
        f"{truth}: %{{y}}",
        f"{predicted}: %{{x}}",
    ]
    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    xlabels = labels[:num_cols]
    ylabels = labels[:num_rows]

    # Flip data so plot will have the standard descending diagonal
    # Flipping the yaxis via `autorange="reversed"` isn't an option because
    # screenshots don't seem to respect that setting...
    confusion_matrix = np.flip(confusion_matrix, axis=0)
    ylabels = np.flip(ylabels)

    heatmap = go.Heatmap(
        x=xlabels,
        y=ylabels,
        z=confusion_matrix,
        zmin=zlim[0],
        zmax=zlim[1],
        colorbar=dict(lenmode="fraction", len=1),
        colorscale=colorscale,
        hovertemplate=hovertemplate,
    )

    figure = go.Figure(heatmap)

    figure.update_layout(
        xaxis=dict(range=[-0.5, num_cols - 0.5], constrain="domain"),
        yaxis=dict(
            range=[-0.5, num_rows - 0.5],
            constrain="domain",
            scaleanchor="x",
            scaleratio=1,
        ),
        title=title,
    )

    figure.update_layout(**_DEFAULT_LAYOUT)
    figure.update_layout(**kwargs)

    if foc.is_jupyter_context():
        figure = PlotlyNotebookPlot(figure)

    return figure


def _plot_confusion_matrix_interactive(
    confusion_matrix,
    labels,
    ids,
    samples=None,
    eval_key=None,
    gt_field=None,
    pred_field=None,
    colorscale=None,
    title=None,
    **kwargs,
):
    confusion_matrix = np.asarray(confusion_matrix)
    ids = np.asarray(ids)
    num_rows, num_cols = confusion_matrix.shape
    zlim = [0, confusion_matrix.max()]

    if samples is not None and eval_key is not None:
        if gt_field is None or pred_field is None:
            eval_info = samples.get_evaluation_info(eval_key)
            gt_field = eval_info.config.gt_field
            pred_field = eval_info.config.pred_field

        label_type = samples._get_label_field_type(gt_field)
        use_patches = issubclass(label_type, (fol.Detections, fol.Polylines))
    else:
        use_patches = False

    if gt_field is not None and pred_field is not None:
        label_fields = [gt_field, pred_field]
    else:
        label_fields = None

    xlabels = labels[:num_cols]
    ylabels = labels[:num_rows]

    # Flip data so plot will have the standard descending diagonal
    # Flipping the yaxis via `autorange="reversed"` isn't an option because
    # screenshots don't seem to respect that setting...
    confusion_matrix = np.flip(confusion_matrix, axis=0)
    ids = np.flip(ids, axis=0)
    ylabels = np.flip(ylabels)

    if use_patches:
        selection_mode = "patches"
        init_fcn = lambda view: view.to_evaluation_patches(eval_key)
    else:
        selection_mode = "select"
        init_fcn = None

    plot = InteractiveHeatmap(
        confusion_matrix,
        ids,
        xlabels=xlabels,
        ylabels=ylabels,
        zlim=zlim,
        gt_field=gt_field,
        pred_field=pred_field,
        colorscale=colorscale,
        link_type="labels",
        init_view=samples,
        label_fields=label_fields,
        selection_mode=selection_mode,
        init_fcn=init_fcn,
    )

    plot.update_layout(**_DEFAULT_LAYOUT)
    plot.update_layout(title=title, **kwargs)

    return plot


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
    figure=None,
    best_fit_label=None,
    marker_size=None,
    title=None,
    labels_title=None,
    sizes_title=None,
    show_colorbar_title=None,
    **kwargs,
):
    """Plots the given regression results.

    If IDs are provided and you are working in a notebook environment with the
    default plotly backend, this method returns an :class:`InteractiveScatter`
    plot that you can attach to an App session via its
    :attr:`fiftyone.core.session.Session.plots` attribute, which will
    automatically sync the session's view with the currently selected points in
    the plot.

    Args:
        ytrue: an array-like of ground truth values
        ypred: an array-like of predicted values
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the results were generated. Only used by the "plotly"
            backend when IDs are provided
        ids (None): an array-like of IDs corresponding to the regressions
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
            when ``labels`` contains strings. If provided, the element order of
            this list also controls the z-order and legend order of multitrace
            plots (first class is rendered first, and thus on the bottom, and
            appears first in the legend)
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        figure (None): a :class:`plotly:plotly.graph_objects.Figure` to which
            to add the plot
        best_fit_label (None): a custom legend label for the best fit line
        marker_size (None): the marker size to use. If ``sizes`` are provided,
            this value is used as a reference to scale the sizes of all points
        title (None): a title for the plot
        labels_title (None): a title string to use for ``labels`` in the
            tooltip and the colorbar title. By default, if ``labels`` is a
            field name, this name will be used, otherwise the colorbar will not
            have a title and the tooltip will use "label"
        sizes_title (None): a title string to use for ``sizes`` in the tooltip.
            By default, if ``sizes`` is a field name, this name will be used,
            otherwise the tooltip will use "size"
        show_colorbar_title (None): whether to show the colorbar title. By
            default, a title will be shown only if a value was passed to
            ``labels_title`` or an appropriate default can be inferred from
            the ``labels`` parameter
        **kwargs: optional keyword arguments for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`

    Returns:
        one of the following

        -   a :class:`InteractiveScatter`, if IDs are provided
        -   a :class:`PlotlyNotebookPlot`, if no IDs are provided but you are
            working in a Jupyter notebook
        -   a plotly figure, otherwise
    """
    if (
        samples is not None
        and gt_field is not None
        and samples._is_frame_field(gt_field)
    ):
        link_field = "frames"
    else:
        link_field = None

    points = np.stack([ytrue, ypred], axis=-1)

    labels_title, sizes_title, _ = _parse_titles(
        labels, labels_title, sizes, sizes_title, None
    )

    (
        points,
        ids,
        labels,
        sizes,
        _,
        classes,
        categorical,
    ) = parse_scatter_inputs(
        points,
        samples=samples,
        ids=ids,
        link_field=link_field,
        labels=labels,
        sizes=sizes,
        classes=classes,
    )

    xline, yline, best_fit_label = best_fit_line(points, label=best_fit_label)

    xlabel = gt_field if gt_field is not None else "Ground truth"
    ylabel = pred_field if pred_field is not None else "Predictions"

    if figure is None:
        figure = go.Figure()

    best_fit = go.Scatter(
        x=xline, y=yline, mode="lines", line_color="black", name=best_fit_label
    )

    figure.add_trace(best_fit)
    figure.update_layout(xaxis_title=xlabel, yaxis_title=ylabel)

    if labels is not None and (
        not categorical or len(classes) > _MAX_LABEL_TRACES
    ):
        # Move legend so it doesn't interfere with colorbar
        figure.update_layout(
            legend=dict(y=0.99, x=0.01, yanchor="top", xanchor="left")
        )

    return scatterplot(
        points,
        samples=samples,
        ids=ids,
        link_field=link_field,
        labels=labels,
        sizes=sizes,
        figure=figure,
        marker_size=marker_size,
        title=title,
        trace_title="regressions",
        labels_title=labels_title,
        sizes_title=sizes_title,
        show_colorbar_title=show_colorbar_title,
        axis_equal=True,
        **kwargs,
    )


def plot_pr_curve(
    precision,
    recall,
    thresholds=None,
    label=None,
    style="area",
    figure=None,
    title=None,
    **kwargs,
):
    """Plots a precision-recall (PR) curve.

    Args:
        precision: an array-like of precision values
        recall: an array-like of recall values
        thresholds (None): an array-like of decision thresholds
        label (None): a label for the curve
        style ("area"): a plot style to use. Supported values are
            ``("area", "line")``
        figure (None): a :class:`plotly:plotly.graph_objects.Figure` to which
            to add the plot
        title (None): a title for the plot
        **kwargs: optional keyword arguments for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`

    Returns:
        one of the following

        -   a :class:`PlotlyNotebookPlot`, if you are working in a Jupyter
            notebook
        -   a plotly figure, otherwise
    """
    if style not in ("line", "area"):
        msg = "Unsupported style '%s'; using 'area' instead" % style
        warnings.warn(msg)
        style = "area"

    if figure is None:
        figure = go.Figure()

    params = {"mode": "lines", "line_color": _DEFAULT_LINE_COLOR}
    if style == "area":
        params["fill"] = "tozeroy"

    hover_lines = [
        "recall: %{x:.3f}",
        "precision: %{y:.3f}",
    ]

    if thresholds is not None:
        hover_lines.append("threshold: %{customdata:.3f}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    figure.add_trace(
        go.Scatter(
            x=recall,
            y=precision,
            hovertemplate=hovertemplate,
            customdata=thresholds,
            **params,
        )
    )

    # Add 50/50 line
    figure.add_shape(
        type="line", x0=0, x1=1, y0=1, y1=0, line=dict(dash="dash")
    )

    if title is None and label is not None:
        title = label

    figure.update_layout(
        xaxis=dict(range=[0, 1], constrain="domain"),
        yaxis=dict(
            range=[0, 1], constrain="domain", scaleanchor="x", scaleratio=1
        ),
        xaxis_title="Recall",
        yaxis_title="Precision",
        title=title,
    )

    figure.update_layout(**_DEFAULT_LAYOUT)
    figure.update_layout(**kwargs)

    if foc.is_jupyter_context():
        figure = PlotlyNotebookPlot(figure)

    return figure


def plot_pr_curves(
    precisions,
    recall,
    classes,
    thresholds=None,
    figure=None,
    title=None,
    **kwargs,
):
    """Plots a set of per-class precision-recall (PR) curves.

    Args:
        precisions: a ``num_classes x num_recalls`` array-like of per-class
            precision values
        recall: an array-like of recall values
        classes: the list of classes
        thresholds (None): a ``num_classes x num_recalls`` array-like of
            decision thresholds
        figure (None): a :class:`plotly:plotly.graph_objects.Figure` to which
            to add the plots
        title (None): a title for the plot
        **kwargs: optional keyword arguments for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`

    Returns:
        one of the following

        -   a :class:`PlotlyNotebookPlot`, if you are working in a Jupyter
            notebook
        -   a plotly figure, otherwise
    """
    if figure is None:
        figure = go.Figure()

    # Add 50/50 line
    figure.add_shape(
        type="line", line=dict(dash="dash"), x0=0, x1=1, y0=1, y1=0
    )

    hover_lines = [
        "<b>class: %{text}</b>",
        "recall: %{x:.3f}",
        "precision: %{y:.3f}",
    ]

    if thresholds is not None:
        hover_lines.append("threshold: %{customdata:.3f}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    # Plot in descending order of AP
    avg_precisions = np.mean(precisions, axis=1)
    inds = np.argsort(-avg_precisions)  # negative for descending order

    colors = _get_qualitative_colors(len(inds))

    for idx, color in zip(inds, colors):
        precision = precisions[idx]
        _class = classes[idx]
        avg_precision = avg_precisions[idx]
        label = "%s (AP = %.3f)" % (_class, avg_precision)

        if thresholds is not None:
            customdata = thresholds[idx]
        else:
            customdata = None

        line = go.Scatter(
            x=recall,
            y=precision,
            name=label,
            mode="lines",
            line_color=color,
            text=np.full(recall.shape, _class),
            hovertemplate=hovertemplate,
            customdata=customdata,
        )

        figure.add_trace(line)

    figure.update_layout(
        xaxis=dict(range=[0, 1], constrain="domain"),
        yaxis=dict(
            range=[0, 1], constrain="domain", scaleanchor="x", scaleratio=1
        ),
        xaxis_title="Recall",
        yaxis_title="Precision",
        title=title,
    )

    figure.update_layout(**_DEFAULT_LAYOUT)
    figure.update_layout(**kwargs)

    if foc.is_jupyter_context():
        figure = PlotlyNotebookPlot(figure)

    return figure


def plot_roc_curve(
    fpr,
    tpr,
    thresholds=None,
    roc_auc=None,
    style="area",
    figure=None,
    title=None,
    **kwargs,
):
    """Plots a receiver operating characteristic (ROC) curve.

    Args:
        fpr: an array-like of false positive rates
        tpr: an array-like of true positive rates
        thresholds (None): an array-like of decision thresholds
        roc_auc (None): the area under the ROC curve
        style ("area"): a plot style to use. Supported values are
            ``("area", "line")``
        figure (None): a :class:`plotly:plotly.graph_objects.Figure` to which
            to add the plot
        title (None): a title for the plot
        **kwargs: optional keyword arguments for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`

    Returns:
        one of the following

        -   a :class:`PlotlyNotebookPlot`, if you are working in a Jupyter
            notebook
        -   a plotly figure, otherwise
    """
    if style not in ("line", "area"):
        msg = "Unsupported style '%s'; using 'area' instead" % style
        warnings.warn(msg)
        style = "area"

    if figure is None:
        figure = go.Figure()

    params = {"mode": "lines", "line_color": _DEFAULT_LINE_COLOR}
    if style == "area":
        params["fill"] = "tozeroy"

    hover_lines = ["fpr: %{x:.3f}", "tpr: %{y:.3f}"]

    if thresholds is not None:
        hover_lines.append("threshold: %{customdata:.3f}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    figure.add_trace(
        go.Scatter(
            x=fpr,
            y=tpr,
            hovertemplate=hovertemplate,
            customdata=thresholds,
            **params,
        )
    )

    # Add 50/50 line
    figure.add_shape(
        type="line", line=dict(dash="dash"), x0=0, x1=1, y0=0, y1=1
    )

    if title is None and roc_auc is not None:
        title = dict(text="AUC: %.5f" % roc_auc, x=0.5, xanchor="center")

    figure.update_layout(
        xaxis=dict(range=[0, 1], constrain="domain"),
        yaxis=dict(
            range=[0, 1], constrain="domain", scaleanchor="x", scaleratio=1
        ),
        xaxis_title="False positive rate",
        yaxis_title="True positive rate",
        title=title,
    )

    figure.update_layout(**_DEFAULT_LAYOUT)
    figure.update_layout(**kwargs)

    if foc.is_jupyter_context():
        figure = PlotlyNotebookPlot(figure)

    return figure


def lines(
    x=None,
    y=None,
    samples=None,
    ids=None,
    link_field=None,
    sizes=None,
    labels=None,
    colors=None,
    marker_size=None,
    figure=None,
    title=None,
    xaxis_title=None,
    yaxis_title=None,
    sizes_title=None,
    axis_equal=False,
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
        labels (None): a name or list of names for the line traces
        colors (None): a list of colors to use for the line traces. See
            https://plotly.com/python/colorscales for options
        marker_size (None): the marker size to use. If ``sizes`` are provided,
            this value is used as a reference to scale the sizes of all points
        figure (None): a :class:`plotly:plotly.graph_objects.Figure` to which
            to add the plot
        title (None): a title for the plot
        xaxis_title (None): an x-axis title
        yaxis_title (None): a y-axis title
        sizes_title (None): a title string to use for ``sizes`` in the tooltip.
            By default, if ``sizes`` is a field name, this name will be used,
            otherwise the tooltip will use "size"
        axis_equal (False): whether to set the axes to equal scale
        **kwargs: optional keyword arguments for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`

    Returns:
        one of the following

        -   an :class:`InteractiveScatter`, when IDs are available
        -   a :class:`PlotlyNotebookPlot`, if you're working in a Jupyter
            notebook but the above conditions aren't met
        -   a plotly figure, otherwise
    """
    if sizes is not None and sizes_title is None:
        if etau.is_str(sizes):
            sizes_title = sizes.rsplit(".", 1)[-1]
        else:
            sizes_title = "size"

    x, y, ids, link_field, labels, sizes, is_frames = parse_lines_inputs(
        x=x,
        y=y,
        samples=samples,
        ids=ids,
        link_field=link_field,
        labels=labels,
        sizes=sizes,
    )

    if is_frames:
        showlegend = True
    else:
        showlegend = labels[0] is not None

    if xaxis_title is not None:
        xtitle = xaxis_title.rsplit(".", 1)[-1]
    else:
        xtitle = "x"

    if yaxis_title is not None:
        ytitle = yaxis_title.rsplit(".", 1)[-1]
    else:
        ytitle = "y"

    hover_lines = ["%s: %%{x}" % xtitle, "%s: %%{y}" % ytitle]

    if sizes[0] is not None:
        hover_lines.append("%s: %%{marker.size}" % sizes_title)

        if marker_size is None:
            marker_size = 15  # max marker size

        try:
            sizeref = 0.5 * max(itertools.chain(*sizes)) / marker_size
        except ValueError:
            sizeref = 1

    if ids[0] is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    colors = _get_qualitative_colors(len(y), colors=colors)

    traces = []
    for _x, _y, _i, _s, _l, _c in zip(x, y, ids, sizes, labels, colors):
        marker = {}
        if _s is not None:
            marker.update(
                dict(size=_s, sizemode="diameter", sizeref=sizeref, sizemin=4)
            )
        elif marker_size is not None:
            marker.update(dict(size=marker_size))

        traces.append(
            go.Scatter(
                x=_x,
                y=_y,
                customdata=_i,
                mode="lines+markers",
                line_color=_c,
                marker=marker,
                hovertemplate=hovertemplate,
                name=_l,
                showlegend=showlegend,
            )
        )

    if figure is None:
        figure = go.Figure()

    figure.add_traces(traces)

    figure.update_layout(**_DEFAULT_LAYOUT)
    figure.update_layout(
        title=title,
        xaxis_title=xaxis_title,
        yaxis_title=yaxis_title,
        **kwargs,
    )

    if axis_equal:
        figure.update_layout(yaxis_scaleanchor="x")

    if ids is None:
        if foc.is_jupyter_context():
            return PlotlyNotebookPlot(figure)

        return figure

    (
        link_type,
        label_fields,
        selection_mode,
        init_fcn,
    ) = InteractiveScatter.recommend_link_type(
        label_field=link_field,
        samples=samples,
    )

    return InteractiveScatter(
        figure,
        link_type=link_type,
        init_view=samples,
        label_fields=label_fields,
        selection_mode=selection_mode,
        init_fcn=init_fcn,
    )


def scatterplot(
    points,
    samples=None,
    ids=None,
    link_field=None,
    labels=None,
    sizes=None,
    edges=None,
    classes=None,
    figure=None,
    multi_trace=None,
    marker_size=None,
    colorscale=None,
    log_colorscale=False,
    title=None,
    trace_title=None,
    labels_title=None,
    sizes_title=None,
    edges_title=None,
    show_colorbar_title=None,
    axis_equal=False,
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
                points correspond to the labels in this field
        labels (None): data to use to color the points. Can be any of the
            following:

            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract numeric or string values
            -   a :class:`fiftyone.core.expressions.ViewExpression` defining
                numeric or string values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
            -   an array-like of numeric or string values
            -   a list of array-likes of numeric or string values, if
                ``link_field`` refers to frames and/or a label list field like
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
                ``link_field`` refers to frames and/or a label list field like
                :class:`fiftyone.core.labels.Detections`
        edges (None): a ``num_edges x 2`` array of row indices into ``points``
            defining undirected edges between points to render as a separate
            trace on the scatterplot
        classes (None): a list of classes whose points to plot. Only applicable
            when ``labels`` contains strings. If provided, the element order of
            this list also controls the z-order and legend order of multitrace
            plots (first class is rendered first, and thus on the bottom, and
            appears first in the legend)
        figure (None): a :class:`plotly:plotly.graph_objects.Figure` to which
            to add the plot
        multi_trace (None): whether to render each class as a separate trace.
            Only applicable when ``labels`` contains strings. By default, this
            will be true if there are up to 25 classes
        marker_size (None): the marker size to use. If ``sizes`` are provided,
            this value is used as a reference to scale the sizes of all points
        colorscale (None): a plotly colorscale to use. Only applicable when
            ``labels`` contains numeric data. See
            https://plotly.com/python/colorscales for options
        log_colorscale (False): whether to apply the colorscale on a log scale.
            This is useful to better visualize variations in smaller values
            when large values are also present
        title (None): a title for the plot
        trace_title (None): a name for the scatter trace. Only applicable when
            plotting a single trace
        labels_title (None): a title string to use for ``labels`` in the
            tooltip and the colorbar title. By default, if ``labels`` is a
            field name, this name will be used, otherwise the colorbar will not
            have a title and the tooltip will use "label"
        sizes_title (None): a title string to use for ``sizes`` in the tooltip.
            By default, if ``sizes`` is a field name, this name will be used,
            otherwise the tooltip will use "size"
        edges_title (None): a title string to use for ``edges`` in the legend.
            If none is provided, edges are not included in the legend
        show_colorbar_title (None): whether to show the colorbar title. By
            default, a title will be shown only if a value was passed to
            ``labels_title`` or an appropriate default can be inferred from
            the ``labels`` parameter
        axis_equal (False): whether to set the axes to equal scale
        **kwargs: optional keyword arguments for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`

    Returns:
        one of the following

        -   an :class:`InteractiveScatter`, for 2D points and when IDs are
            available
        -   a :class:`PlotlyNotebookPlot`, if you're working in a Jupyter
            notebook but the above conditions aren't met
        -   a plotly figure, otherwise
    """
    points = np.asarray(points)
    num_dims = points.shape[1]

    if num_dims not in {2, 3}:
        raise ValueError("This method only supports 2D or 3D points")

    labels_title, sizes_title, colorbar_title = _parse_titles(
        labels, labels_title, sizes, sizes_title, show_colorbar_title
    )

    (
        points,
        ids,
        labels,
        sizes,
        edges,
        classes,
        categorical,
    ) = parse_scatter_inputs(
        points,
        samples=samples,
        ids=ids,
        link_field=link_field,
        labels=labels,
        sizes=sizes,
        edges=edges,
        classes=classes,
    )

    if categorical:
        if multi_trace is None:
            multi_trace = len(classes) <= _MAX_LABEL_TRACES

        if multi_trace:
            figure = _plot_scatter_categorical(
                points,
                labels,
                classes,
                sizes,
                edges,
                ids,
                figure,
                marker_size,
                labels_title,
                sizes_title,
                edges_title,
                colorbar_title,
                axis_equal,
            )
        else:
            figure = _plot_scatter_categorical_single_trace(
                points,
                labels,
                classes,
                sizes,
                edges,
                ids,
                figure,
                marker_size,
                trace_title,
                labels_title,
                sizes_title,
                edges_title,
                colorbar_title,
                axis_equal,
            )
    else:
        figure = _plot_scatter_numeric(
            points,
            labels,  # numeric values
            sizes,
            edges,
            ids,
            figure,
            marker_size,
            colorscale,
            log_colorscale,
            trace_title,
            labels_title,
            sizes_title,
            edges_title,
            colorbar_title,
            axis_equal,
        )

    figure.update_layout(**_DEFAULT_LAYOUT)
    figure.update_layout(title=title, **kwargs)

    if num_dims == 3:
        if samples is not None:
            msg = "Interactive selection is only supported in 2D"
            warnings.warn(msg)

        if foc.is_jupyter_context():
            figure = PlotlyNotebookPlot(figure)

        return figure

    if ids is None:
        if foc.is_jupyter_context():
            return PlotlyNotebookPlot(figure)

        return figure

    (
        link_type,
        label_fields,
        selection_mode,
        init_fcn,
    ) = InteractiveScatter.recommend_link_type(
        label_field=link_field,
        samples=samples,
    )

    return InteractiveScatter(
        figure,
        link_type=link_type,
        init_view=samples,
        label_fields=label_fields,
        selection_mode=selection_mode,
        init_fcn=init_fcn,
    )


def _parse_titles(
    labels, labels_title, sizes, sizes_title, show_colorbar_title
):
    if labels_title is None and etau.is_str(labels):
        labels_title = labels.rsplit(".", 1)[-1]

    if sizes_title is None:
        if etau.is_str(sizes):
            sizes_title = sizes.rsplit(".", 1)[-1]
        else:
            sizes_title = "size"

    if show_colorbar_title is None:
        show_colorbar_title = labels_title is not None

    if labels_title is None:
        labels_title = "label"

    colorbar_title = labels_title if show_colorbar_title else None

    return labels_title, sizes_title, colorbar_title


def location_scatterplot(
    locations=None,
    samples=None,
    ids=None,
    labels=None,
    sizes=None,
    edges=None,
    classes=None,
    style=None,
    radius=None,
    figure=None,
    multi_trace=None,
    marker_size=None,
    colorscale=None,
    log_colorscale=False,
    title=None,
    trace_title=None,
    labels_title=None,
    sizes_title=None,
    edges_title=None,
    show_colorbar_title=None,
    map_type="roadmap",
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
            -   a ``num_locations x 2`` array-like of ``(longitude, latitude)``
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
        edges (None): a ``num_edges x 2`` array-like of row indices into
            ``locations`` defining undirected edges between points to render as
            a separate trace on the scatterplot
        classes (None): a list of classes whose points to plot. Only applicable
            when ``labels`` contains strings. If provided, the element order of
            this list also controls the z-order and legend order of multitrace
            plots (first class is rendered first, and thus on the bottom, and
            appears first in the legend)
        style (None): the plot style to use. Only applicable when the color
            data is numeric. Supported values are ``("scatter", "density")``
        radius (None): the radius of influence of each lat/lon point. Only
            applicable when ``style`` is "density". Larger values will make
            density plots smoother and less detailed
        figure (None): a :class:`plotly:plotly.graph_objects.Figure` to which
            to add the plot
        multi_trace (None): whether to render each class as a separate trace.
            Only applicable when ``labels`` contains strings. By default, this
            will be true if there are up to 25 classes
        marker_size (None): the marker size to use. If ``sizes`` are provided,
            this value is used as a reference to scale the sizes of all points
        colorscale (None): a plotly colorscale to use. Only applicable when
            ``labels`` contains numeric data. See
            https://plotly.com/python/colorscales for options
        log_colorscale (False): whether to apply the colorscale on a log scale.
            This is useful to better visualize variations in smaller values
            when large values are also present
        title (None): a title for the plot
        trace_title (None): a name for the scatter trace. Only applicable when
            plotting a single trace
        labels_title (None): a title string to use for ``labels`` in the
            tooltip and the colorbar title. By default, if ``labels`` is a
            field name, this name will be used, otherwise the colorbar will not
            have a title and the tooltip will use "label"
        sizes_title (None): a title string to use for ``sizes`` in the tooltip.
            By default, if ``sizes`` is a field name, this name will be used,
            otherwise the tooltip will use "size"
        edges_title (None): a title string to use for ``edges`` in the legend.
            If none is provided, edges are not included in the legend
        show_colorbar_title (None): whether to show the colorbar title. By
            default, a title will be shown only if a value was passed to
            ``labels_title`` or an appropriate default can be inferred from
            the ``labels`` parameter
        map_type ("satellite"): the map type to render. Supported values are
            ``("roadmap", "satellite")``
        **kwargs: optional keyword arguments for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`

    Returns:
        one of the following

        -   an :class:`InteractiveScatter`, if IDs are available
        -   a :class:`PlotlyNotebookPlot`, if IDs are not available but you're
            working in a Jupyter notebook
        -   a plotly figure, otherwise
    """
    labels_title, sizes_title, colorbar_title = _parse_titles(
        labels, labels_title, sizes, sizes_title, show_colorbar_title
    )

    locations = parse_locations(locations, samples, ids=ids)

    (
        locations,
        ids,
        labels,
        sizes,
        edges,
        classes,
        categorical,
    ) = parse_scatter_inputs(
        locations,
        samples=samples,
        ids=ids,
        labels=labels,
        sizes=sizes,
        edges=edges,
        classes=classes,
    )

    if style not in (None, "scatter", "density"):
        msg = "Ignoring unsupported style '%s'" % style
        warnings.warn(msg)

    if categorical:
        if multi_trace is None:
            multi_trace = len(classes) <= _MAX_LABEL_TRACES

        if multi_trace:
            figure = _plot_scatter_mapbox_categorical(
                locations,
                labels,
                classes,
                sizes,
                edges,
                ids,
                figure,
                marker_size,
                labels_title,
                sizes_title,
                edges_title,
                colorbar_title,
            )
        else:
            figure = _plot_scatter_mapbox_categorical_single_trace(
                locations,
                labels,
                classes,
                sizes,
                edges,
                ids,
                figure,
                marker_size,
                trace_title,
                labels_title,
                sizes_title,
                edges_title,
                colorbar_title,
            )
    elif style == "density":
        if edges is not None:
            logger.warning("Density plots do not support edges")

        figure = _plot_scatter_mapbox_density(
            locations,
            labels,
            sizes,
            ids,
            figure,
            radius,
            colorscale,
            log_colorscale,
            trace_title,
            labels_title,
            sizes_title,
            colorbar_title,
        )
    else:
        figure = _plot_scatter_mapbox_numeric(
            locations,
            labels,
            sizes,
            edges,
            ids,
            figure,
            marker_size,
            colorscale,
            log_colorscale,
            trace_title,
            labels_title,
            sizes_title,
            edges_title,
            colorbar_title,
        )

    _set_map_type_to_figure(figure, map_type)

    figure.update_layout(**_DEFAULT_LAYOUT)
    figure.update_layout(title=title, **kwargs)

    if style == "density" and not categorical:
        msg = "Density plots do not yet support interactivity"
        warnings.warn(msg)

        if foc.is_jupyter_context():
            figure = PlotlyNotebookPlot(figure)

        return figure

    if ids is None:
        if foc.is_jupyter_context():
            return PlotlyNotebookPlot(figure)

        return figure

    return InteractiveScatter(figure, init_view=samples)


def get_colormap(colorscale, n=256, hex_strs=False):
    """Generates a continuous colormap with the specified number of colors from
    the given plotly colorscale.

    The provided ``colorscale`` can be any of the following:

    -   The string name of any colorscale recognized by plotly. See
        https://plotly.com/python/colorscales for possible options

    -   A manually-defined colorscale like the following::

            [
                [0.000, "rgb(165,0,38)"],
                [0.111, "rgb(215,48,39)"],
                [0.222, "rgb(244,109,67)"],
                [0.333, "rgb(253,174,97)"],
                [0.444, "rgb(254,224,144)"],
                [0.555, "rgb(224,243,248)"],
                [0.666, "rgb(171,217,233)"],
                [0.777, "rgb(116,173,209)"],
                [0.888, "rgb(69,117,180)"],
                [1.000, "rgb(49,54,149)"],
            ]

    The colorscale will be sampled evenly at the required resolution in order
    to generate the colormap.

    Args:
        colorscale: a valid colorscale. See above for possible options
        n (256): the desired number of colors
        hex_strs (False): whether to return ``#RRGGBB`` hex strings rather than
            ``(R, G, B)`` tuples

    Returns:
        a list of ``(R, G, B)`` tuples in `[0, 255]`, or, if ``hex_strs`` is
        True, a list of `#RRGGBB` strings
    """
    if etau.is_str(colorscale):
        colorscale = _get_colorscale(colorscale)

    if not colorscale:
        raise ValueError("colorscale must have at least one color")

    values = np.linspace(0, 1, n)
    rgb_strs = [_get_continuous_color(colorscale, v) for v in values]

    # @todo don't cast to int here?
    rgb_tuples = [
        tuple(int(round(float(v.strip()))) for v in rgb_str[4:-1].split(","))
        for rgb_str in rgb_strs
    ]

    if hex_strs:
        return ["#%02x%02x%02x" % rgb for rgb in rgb_tuples]

    return rgb_tuples


def _to_log_colorscale(colorscale, maxval):
    if etau.is_str(colorscale):
        colorscale = _get_colorscale(colorscale)

    # Here we're doing something like the plotly example below
    # https://plotly.com/python/colorscales/#logarithmic-color-scale-with-graph-objects
    m = np.log10(maxval)
    f = lambda x: (np.exp(m * x) - 1) / (np.exp(m) - 1)
    return [[f(x), c] for x, c in colorscale]


def _get_colorscale(name):
    from _plotly_utils.basevalidators import ColorscaleValidator

    cv = ColorscaleValidator("colorscale", "")
    return cv.validate_coerce(name)


def _get_continuous_color(colorscale, value):
    # Returns a string like `rgb(float, float, float)`

    hex_to_rgb = lambda c: "rgb" + str(ImageColor.getcolor(c, "RGB"))
    colorscale = sorted(colorscale, key=lambda x: x[0])

    if value <= 0 or len(colorscale) == 1:
        c = colorscale[0][1]
        return c if c[0] != "#" else hex_to_rgb(c)

    if value >= 1:
        c = colorscale[-1][1]
        return c if c[0] != "#" else hex_to_rgb(c)

    for cutoff, color in colorscale:
        if value > cutoff:
            low_cutoff, low_color = cutoff, color
        else:
            high_cutoff, high_color = cutoff, color
            break

    if (low_color[0] == "#") or (high_color[0] == "#"):
        low_color = hex_to_rgb(low_color)
        high_color = hex_to_rgb(high_color)

    return pc.find_intermediate_color(
        lowcolor=low_color,
        highcolor=high_color,
        intermed=((value - low_cutoff) / (high_cutoff - low_cutoff)),
        colortype="rgb",
    )


class PlotlyWidgetMixin(object):
    """Mixin for Plotly plots that use widgets to display in Jupyter
    notebooks.

    This class can still be used in non-Jupyter notebook environments, but the
    resulting figures will not be interactive.

    Args:
        widget: a :class:`plotly:plotly.graph_objects.FigureWidget`
    """

    def __init__(self, widget):
        self._widget = widget
        self._handle = None

        if foc.is_jupyter_context():
            _check_plotly_jupyter_environment()
        else:
            msg = (
                "Interactive plots are currently only supported in Jupyter "
                "notebooks. Support outside of notebooks and in Google Colab "
                "and Databricks will be included in an upcoming release. In "
                "the meantime, you can still use this plot, but note that (i) "
                "selecting data will not trigger callbacks, and (ii) you must "
                "manually call `plot.show()` to launch a new plot that "
                "reflects the current state of an attached session.\n\n"
                "See https://docs.voxel51.com/user_guide/plots.html#working-in-notebooks"
                " for more information."
            )
            warnings.warn(msg)

            # If the user is using a widget-based plot outside of a notebook
            # context, go ahead and connect it so they can start manually
            # updating it and `show()`ing it, if desired
            if isinstance(self, ResponsivePlot):
                self.connect()

    def save(self, path, width=None, height=None, scale=None, **kwargs):
        """Saves the plot as an image or HTML.

        Args:
            path: the path to write the image or HTML
            width (None): a desired width in pixels when saving as an image.
                By default, the layout width is used
            height (None): a desired height in pixels when saving as an image.
                By default, the layout height is used
            scale (None): a scale factor to apply to the layout dimensions. By
                default, this is 1.0
            **kwargs: keyword arguments for
                :meth:`plotly:plotly.graph_objects.Figure.to_image` or
                :meth:`plotly:plotly.graph_objects.Figure.write_html`
        """
        etau.ensure_basedir(path)

        if os.path.splitext(path)[1] == ".html":
            self._widget.write_html(path, **kwargs)
            return

        if width is None:
            width = self._widget.layout.width

        if height is None:
            height = self._widget.layout.height

        if scale is None:
            scale = 1.0

        self._widget.write_image(
            path, width=width, height=height, scale=scale, **kwargs
        )

    def _update_layout(self, **kwargs):
        if kwargs:
            self._widget.update_layout(**kwargs)

    def _show(self, **kwargs):
        self._update_layout(**kwargs)

        # Only Jupyter notebooks support interactivity. If we're in another
        # environment, just show the figure
        if not foc.is_jupyter_context():
            self._widget.show()
            return

        #
        # @todo if this plot has already been shown in a different cell,
        # freeze that cell first (like `Session`)
        #
        # The freezing part is easy; the trouble is knowing whether we're in
        # a new cell (technically we could always just freeze, but it can take
        # some time and I don't want to make the user wait on this...)
        #

        from IPython.display import display

        # Create an empty display that we'll use for `freeze()` later
        # Replacing the widget with an image in the same handle didn't work...
        self._handle = display(display_id=True)
        self._handle.display({"text/plain": ""}, raw=True)

        display(self._widget)

    def _freeze(self):
        if not foc.is_jupyter_context():
            return

        self._screenshot()
        self._widget.close()

    def _screenshot(self):
        from IPython.display import Image

        width = self._widget.layout.width
        height = self._widget.layout.height
        image_bytes = self._widget.to_image(
            format="png", height=height, width=width
        )

        self._handle.update(Image(image_bytes))


def _check_plotly_jupyter_environment():
    #
    # Requirements source: https://plotly.com/python/getting-started
    #
    # There is also a `notebook>=6` requirement in Jupyter notebooks, but
    # we do not explicitly check that here because the requirement for
    # JupyterLab is different and I don't know how to distinguish Jupyter
    # notebooks from JupyterLab right now...
    #
    fou.ensure_package("ipywidgets>=8,<9")


class PlotlyNotebookPlot(PlotlyWidgetMixin, Plot):
    """A wrapper around a Plotly plot for Jupyter notebook contexts that allows
    it to be replaced with a screenshot by calling :meth:`freeze`.

    Args:
        figure: a :class:`plotly:plotly.graph_objects.Figure`
    """

    def __init__(self, figure):
        self._figure = figure
        self._frozen = False

        widget = self._make_widget()

        super().__init__(widget)

    @property
    def is_frozen(self):
        """Whether this plot is currently frozen."""
        return self._frozen

    def update_layout(self, **kwargs):
        """Updates the layout of the plot.

        Args:
            **kwargs: valid arguments for
                :meth:`plotly:plotly.graph_objects.Figure.update_layout`
        """
        self._update_layout(**kwargs)

    def show(self, **kwargs):
        """Shows the plot.

        Args:
            **kwargs: optional parameters for
                :meth:`plotly:plotly.graph_objects.Figure.update_layout`
        """
        if self._frozen:
            self._reopen()

        self._show(**kwargs)

    def freeze(self):
        """Freezes the plot, replacing it with a static image."""
        if not foc.is_jupyter_context():
            raise foc.ContextError(
                "Plots can only be frozen in Jupyter notebooks"
            )

        self._freeze()
        self._frozen = True

    def _make_widget(self):
        return go.FigureWidget(self._figure)

    def _reopen(self):
        self._widget = self._make_widget()
        self._frozen = False


class PlotlyInteractivePlot(PlotlyWidgetMixin, InteractivePlot):
    """Base class for :class:`fiftyone.core.plots.base.InteractivePlot`
    instances with Plotly backends.

    Args:
        widget: a :class:`plotly:plotly.graph_objects.FigureWidget`
        **kwargs: keyword arguments for the
            :class:`fiftyone.core.plots.base.InteractivePlot` constructor
    """

    def __init__(self, widget, **kwargs):
        InteractivePlot.__init__(self, **kwargs)
        PlotlyWidgetMixin.__init__(self, widget)  # must be last

    def update_layout(self, **kwargs):
        """Updates the layout of the plot.

        Args:
            **kwargs: valid arguments for
                :meth:`plotly:plotly.graph_objects.Figure.update_layout`
        """
        self._update_layout(**kwargs)

    def show(self, **kwargs):
        """Shows the plot.

        Args:
            **kwargs: optional parameters for
                :meth:`plotly:plotly.graph_objects.Figure.update_layout`
        """
        super().show(**kwargs)


class InteractiveScatter(PlotlyInteractivePlot):
    """Wrapper class that turns a Plotly figure containing one or more
    scatter-type traces into an
    :class:`fiftyone.core.plots.base.InteractivePlot`.

    This wrapper responds to selection and deselection events (if available)
    triggered on the figure's traces via Plotly's lasso and box selector tools.

    Traces whose ``customdata`` attribute contain lists/arrays are assumed to
    contain the IDs of the points in the trace. Traces with no ``customdata``
    are allowed, but will not have any selection events.

    Args:
        figure: a :class:`plotly:plotly.graph_objects.Figure`
        **kwargs: keyword arguments for the
            :class:`fiftyone.core.plots.base.InteractivePlot` constructor
    """

    def __init__(self, figure, **kwargs):
        self._figure = figure
        self._traces = None
        self._trace_ids = {}
        self._ids_to_traces = {}
        self._ids_to_inds = {}
        self._callback_flags = {}

        widget = self._make_widget()

        super().__init__(widget, **kwargs)

    def _init_traces(self):
        for idx, trace in enumerate(self._traces):
            trace_ids = np.asarray(trace.customdata)
            if trace_ids.ndim > 1:
                trace_ids = trace_ids[:, 0]

            self._trace_ids[idx] = trace_ids

            self._ids_to_traces.update({_id: idx for _id in trace_ids})
            self._ids_to_inds[idx] = {
                _id: idx for idx, _id in enumerate(trace_ids)
            }

    def _init_callback_flags(self):
        self._callback_flags = {t.name: False for t in self._traces}

    @property
    def supports_session_updates(self):
        return True

    @property
    def _selected_ids(self):
        found = False

        ids = []
        for idx, trace in enumerate(self._traces):
            if trace.visible != True:
                continue

            found |= trace.selectedpoints is not None
            if trace.selectedpoints:
                ids.append(self._trace_ids[idx][list(trace.selectedpoints)])

        if not found:
            return None

        return list(itertools.chain.from_iterable(ids))

    def _make_widget(self):
        widget = go.FigureWidget(self._figure)
        self._traces = [
            trace
            for trace in widget.data
            if etau.is_container(trace.customdata)
        ]
        self._init_traces()
        return widget

    def _connect(self):
        self._init_callback_flags()

        def _on_selection(trace, points, selector):
            self._on_select(trace, selector=selector)

        def _on_deselect(trace, points):
            self._on_select(trace)

        with self._widget.batch_update():
            for trace in self._traces:
                trace.on_selection(_on_selection)
                trace.on_deselect(_on_deselect)

    def _disconnect(self):
        with self._widget.batch_update():
            for trace in self._traces:
                trace.on_selection(None)
                trace.on_deselect(None)

    def _reopen(self):
        self._widget = self._make_widget()

    def _select_ids(self, ids, view=None):
        deselect = ids is None
        if deselect:
            ids = []

        # Split IDs into their traces
        per_trace_ids = defaultdict(list)
        for _id in ids:
            trace_id = self._ids_to_traces.get(_id, None)
            if trace_id is not None:
                per_trace_ids[trace_id].append(_id)

        with self._widget.batch_update():
            for idx, trace in enumerate(self._traces):
                # Convert IDs to point indices
                inds_map = self._ids_to_inds[idx]
                trace_ids = per_trace_ids[idx]
                trace_inds = [inds_map[_id] for _id in trace_ids]
                if not trace_inds and deselect:
                    trace_inds = None

                # Select points in trace
                trace.update(selectedpoints=trace_inds)

    def _on_select(self, trace, selector=None):
        if self._selection_callback is None:
            return

        if not self._ready_for_callback(trace):
            return

        self._selection_callback(self.selected_ids)

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


class InteractiveHeatmap(PlotlyInteractivePlot):
    """An interactive Plotly heatmap.

    Unfortunately, the Plotly team has not gotten around to adding native
    selection utilities to plot types such as heatmaps:
    https://github.com/plotly/plotly.js/issues/170.

    In lieu of this feature, we provide a homebrewed heatmap that supports two
    types of interactivity:

    -   Individual cells can be selected by clicking on them
    -   Groups of cells can be lasso- or box-selected by including their cell
        centers in a selection

    The following events will cause the selection to be cleared:

    -   Clicking any cell, if there are currently multiple cells selected
    -   Clicking the selected cell, if there is only one cell selected

    When heatmap contents are selected via
    :meth:`InteractiveHeatmap.select_ids`, the heatmap is updated to reflect
    the proportions of each cell included in the selection.

    Args:
        Z: a ``num_cols x num_rows`` array-like of heatmap values
        ids: an array-like of same shape as ``Z`` whose elements contain lists
            of IDs for the heatmap cells
        xlabels (None): a ``num_rows`` array of x labels
        ylabels (None): a ``num_cols`` array of y labels
        zlim (None): a ``[zmin, zmax]`` limit to use for the colorbar
        values_title ("count"): the semantic meaning of the heatmap values.
            Used for tooltips
        gt_field (None): the name of the ground truth field, if known. Used for
            tooltips
        pred_field (None): the name of the predictions field, if known. Used
            for tooltips
        colorscale (None): a plotly colorscale to use
        grid_opacity (0.1): an opacity value for the grid points
        bg_opacity (0.25): an opacity value for background (unselected) cells
        **kwargs: keyword arguments for the
            :class:`fiftyone.core.plots.base.InteractivePlot` constructor
    """

    def __init__(
        self,
        Z,
        ids,
        xlabels=None,
        ylabels=None,
        zlim=None,
        values_title="count",
        gt_field=None,
        pred_field=None,
        colorscale=None,
        grid_opacity=0.1,
        bg_opacity=0.25,
        **kwargs,
    ):
        Z = np.asarray(Z)
        ids = np.asarray(ids)

        if zlim is None:
            zlim = [Z.min(), Z.max()]

        self.Z = Z
        self.ids = ids
        self.xlabels = xlabels
        self.ylabels = ylabels
        self.zlim = zlim
        self.values_title = values_title
        self.gt_field = gt_field
        self.pred_field = pred_field
        self.colorscale = colorscale
        self.grid_opacity = grid_opacity
        self.bg_opacity = bg_opacity

        self._figure = self._make_heatmap()
        self._gridw = None
        self._selectedw = None
        self._bgw = None
        self._selected_cells = []

        self._curr_view = None
        self._curr_ids = None
        self._curr_Z = None
        self._curr_zlim = None

        self._cells_map = {}

        widget = self._make_widget()
        self._init_cells_map()

        super().__init__(widget, **kwargs)

    @property
    def supports_session_updates(self):
        return True

    @property
    def init_view(self):
        if self._curr_view is not None:
            return self._curr_view

        return super().init_view

    @property
    def _selected_ids(self):
        if not self._selected_cells:
            return None

        if self._curr_ids is not None:
            ids = self._curr_ids
        else:
            ids = self.ids

        return list(
            itertools.chain.from_iterable(
                ids[y, x] for x, y in self._selected_cells
            )
        )

    def _make_widget(self):
        widget = go.FigureWidget(self._figure)
        gridw, selectedw, bgw = widget.data

        self._gridw = gridw
        self._selectedw = selectedw
        self._bgw = bgw
        return widget

    def _connect(self):
        def _on_click(trace, points, state):
            self._on_click(points.point_inds)

        def _on_selection(trace, points, state):
            self._on_selection(points.point_inds)

        with self._widget.batch_update():
            self._bgw.on_click(_on_click)
            self._gridw.on_selection(_on_selection)

    def _disconnect(self):
        with self._widget.batch_update():
            self._bgw.on_click(None)
            self._gridw.on_selection(None)

    def _reopen(self):
        self._widget = self._make_widget()

    def _select_ids(self, ids, view=None):
        if ids is None:
            self._deselect()
            return

        num_rows, num_cols = self.Z.shape
        curr_ids = np.empty((num_rows, num_cols), dtype=object)
        for i in range(num_rows):
            for j in range(num_cols):
                curr_ids[i, j] = []

        for _id in ids:
            cell = self._cells_map.get(_id, None)
            if cell is not None:
                x, y = cell
                curr_ids[y, x].append(_id)

        Z = np.vectorize(lambda a: len(a))(curr_ids)
        zlim = [0, Z.max()]

        self._curr_view = view
        self._curr_ids = curr_ids
        self._curr_Z = Z
        self._curr_zlim = zlim

        self._update_heatmap([], Z, Z, zlim)

    def _on_click(self, point_inds):
        # `point_inds` is a list of `(y, x)` coordinates of selected cells
        if not point_inds:
            self._deselect()
            return

        # @todo can we get shift-clicking working in plotly to select multiple
        # cells? I've never seen `len(point_inds) > 1` here...
        y, x = point_inds[0]
        cell = (x, y)

        num_selected = len(self._selected_cells)

        if (num_selected > 1) or (
            num_selected == 1 and cell == self._selected_cells[0]
        ):
            self._deselect()
        else:
            self._select_cells([cell])

    def _on_selection(self, point_inds):
        # `point_inds` are linear indices into the flattened meshgrid of points
        # from `_make_heatmap()`
        if point_inds:
            y, x = np.unravel_index(point_inds, self.Z.shape)
            cells = list(zip(x, y))
            self._select_cells(cells)
        else:
            self._deselect()

    def _deselect(self):
        self._curr_view = None
        self._curr_ids = None
        self._curr_Z = None
        self._curr_zlim = None

        self._update_heatmap([], self.Z, self.Z, self.zlim)

    def _select_cells(self, cells):
        if cells is None:
            self._deselect()
            return

        Z_active = np.full(self.Z.shape, None)

        if self._curr_ids is not None:
            Z_bg = self._curr_Z
            zlim = self._curr_zlim
        else:
            Z_bg = self.Z
            zlim = self.zlim

        if cells:
            x, y = zip(*cells)
            Z_active[y, x] = Z_bg[y, x]

        self._update_heatmap(cells, Z_active, Z_bg, zlim)

    def _update_heatmap(self, cells, Z_active, Z_bg, zlim):
        self._selected_cells = cells

        with self._widget.batch_update():
            self._gridw.selectedpoints = []

            self._selectedw.z = Z_active
            self._selectedw.zmin = zlim[0]
            self._selectedw.zmax = zlim[1]

            self._bgw.z = Z_bg
            self._bgw.zmin = zlim[0]
            self._bgw.zmax = zlim[1]

        if self._selection_callback is not None:
            self._selection_callback(self.selected_ids)

    def _init_cells_map(self):
        num_rows, num_cols = self.Z.shape
        self._cells_map = {}
        for y in range(num_rows):
            for x in range(num_cols):
                for _id in self.ids[y, x]:
                    self._cells_map[_id] = (x, y)

    def _make_heatmap(self):
        Z = self.Z

        num_rows, num_cols = Z.shape
        xticks = np.arange(num_cols)
        yticks = np.arange(num_rows)
        X, Y = np.meshgrid(xticks, yticks)
        truth = self.gt_field or "truth"
        predicted = self.pred_field or "predicted"

        hover_lines = [
            "<b>%s: %%{z}</b>" % self.values_title,
            f"{truth}: %{{y}}",
            f"{predicted}: %{{x}}",
        ]
        hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

        # Has selection callbacks, no hover
        grid = go.Scatter(
            x=X.flatten(),
            y=Y.flatten(),
            opacity=self.grid_opacity,
            mode="markers",
            hovertemplate=None,
        )

        # No hover, no callbacks
        selected = go.Heatmap(
            z=Z,
            zmin=self.zlim[0],
            zmax=self.zlim[1],
            colorscale=self.colorscale,
            showscale=False,
            hoverinfo="skip",
        )

        # Has callbacks and hover tooltip
        bg = go.Heatmap(
            z=Z,
            zmin=self.zlim[0],
            zmax=self.zlim[1],
            colorbar=dict(lenmode="fraction", len=1),
            colorscale=self.colorscale,
            opacity=self.bg_opacity,
            hovertemplate=hovertemplate,
        )

        figure = go.Figure([grid, selected, bg])

        figure.update_layout(
            xaxis=dict(
                tickmode="array",
                tickvals=xticks,
                ticktext=self.xlabels,
                range=[-0.5, num_cols - 0.5],
                constrain="domain",
            ),
            yaxis=dict(
                tickmode="array",
                tickvals=yticks,
                ticktext=self.ylabels,
                range=[-0.5, num_rows - 0.5],
                constrain="domain",
                scaleanchor="x",
                scaleratio=1,
            ),
            clickmode="event",
        )

        return figure


def _plot_scatter_categorical(
    points,
    labels,
    classes,
    sizes,
    edges,
    ids,
    figure,
    marker_size,
    labels_title,
    sizes_title,
    edges_title,
    colorbar_title,
    axis_equal,
    colors=None,
):
    num_dims = points.shape[1]
    num_classes = len(classes)

    colors = _get_qualitative_colors(num_classes, colors=colors)

    hover_lines = ["<b>%s: %%{text}</b>" % labels_title]

    if sizes is not None:
        if marker_size is None:
            marker_size = 15  # max marker size

        sizeref = 0.5 * max(sizes) / marker_size
        hover_lines.append("%s: %%{marker.size}" % sizes_title)

    if num_dims == 3:
        hover_lines.append("x, y, z = %{x:.3f}, %{y:.3f}, %{z:.3f}")
    else:
        hover_lines.append("x, y = %{x:.3f}, %{y:.3f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    traces = []
    for label, color in zip(classes, colors):
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
        elif marker_size is not None:
            marker = dict(size=marker_size)
        else:
            marker = None

        kwargs = dict(
            customdata=customdata,
            mode="markers",
            showlegend=True,
            name=label,
            line_color=color,
            marker=marker,
            text=np.full(np.count_nonzero(label_inds), label),
            hovertemplate=hovertemplate,
        )

        if num_dims == 3:
            scatter = go.Scatter3d(
                x=points[label_inds][:, 0],
                y=points[label_inds][:, 1],
                z=points[label_inds][:, 2],
                **kwargs,
            )
        else:
            scatter = go.Scattergl(
                x=points[label_inds][:, 0],
                y=points[label_inds][:, 1],
                **kwargs,
            )

        traces.append(scatter)

    if edges is not None:
        scatter = _make_edges_scatter(points, edges, edges_title)
        traces.insert(0, scatter)

    if figure is None:
        figure = go.Figure()

    figure.add_traces(traces)

    figure.update_layout(
        legend_title_text=colorbar_title, legend_itemsizing="constant"
    )

    if axis_equal:
        figure.update_layout(yaxis_scaleanchor="x")

    return figure


def _plot_scatter_categorical_single_trace(
    points,
    labels,
    classes,
    sizes,
    edges,
    ids,
    figure,
    marker_size,
    trace_title,
    labels_title,
    sizes_title,
    edges_title,
    colorbar_title,
    axis_equal,
    colors=None,
):
    num_dims = points.shape[1]
    num_classes = len(classes)
    targets = [classes.index(l) for l in labels]
    clim = [-0.5, num_classes - 0.5]

    colorscale = _get_qualitative_colorscale(num_classes, colors=colors)

    marker = dict(
        color=targets,
        cmin=clim[0],
        cmax=clim[1],
        autocolorscale=False,
        colorscale=colorscale,
        colorbar=dict(
            title=colorbar_title,
            tickvals=list(range(num_classes)),
            ticktext=classes,
            lenmode="fraction",
            len=1,
        ),
        showscale=True,
    )

    if sizes is not None:
        if marker_size is None:
            marker_size = 15  # max marker size

        try:
            sizeref = 0.5 * max(sizes) / marker_size
        except ValueError:
            sizeref = 1

        marker.update(
            dict(size=sizes, sizemode="diameter", sizeref=sizeref, sizemin=4)
        )
    elif marker_size is not None:
        marker.update(dict(size=marker_size))

    hover_lines = ["<b>%s: %%{text}</b>" % labels_title]

    if sizes is not None:
        hover_lines.append("%s: %%{marker.size}" % sizes_title)

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
        name=trace_title,
        hovertemplate=hovertemplate,
    )

    if num_dims == 3:
        scatter = go.Scatter3d(
            x=points[:, 0], y=points[:, 1], z=points[:, 2], **kwargs
        )
    else:
        scatter = go.Scattergl(x=points[:, 0], y=points[:, 1], **kwargs)

    traces = [scatter]

    if edges is not None:
        scatter = _make_edges_scatter(points, edges, edges_title)
        traces.insert(0, scatter)

    if figure is None:
        figure = go.Figure()

    figure.add_traces(traces)

    if axis_equal:
        figure.update_layout(yaxis_scaleanchor="x")
        if num_dims == 3:
            figure.update_layout(zaxis_scaleanchor="x")

    return figure


def _plot_scatter_numeric(
    points,
    values,
    sizes,
    edges,
    ids,
    figure,
    marker_size,
    colorscale,
    log_colorscale,
    trace_title,
    labels_title,
    sizes_title,
    edges_title,
    colorbar_title,
    axis_equal,
):
    num_dims = points.shape[1]

    marker = dict()

    if values is not None:
        if colorscale is None:
            colorscale = _DEFAULT_CONTINUOUS_COLORSCALE

        if log_colorscale:
            maxval = values.max()
            colorscale = _to_log_colorscale(colorscale, maxval)

        marker.update(
            dict(
                color=values,
                colorbar=dict(title=colorbar_title, lenmode="fraction", len=1),
                colorscale=colorscale,
                showscale=True,
            )
        )

    if sizes is not None:
        if marker_size is None:
            marker_size = 15  # max marker size

        try:
            sizeref = 0.5 * max(sizes) / marker_size
        except ValueError:
            sizeref = 1

        marker.update(
            dict(size=sizes, sizemode="diameter", sizeref=sizeref, sizemin=4)
        )
    elif marker_size is not None:
        marker.update(dict(size=marker_size))

    hover_lines = []

    if values is not None:
        hover_lines = ["<b>%s: %%{marker.color}</b>" % labels_title]

    if sizes is not None:
        hover_lines.append("%s: %%{marker.size}" % sizes_title)

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
        name=trace_title,
        hovertemplate=hovertemplate,
    )

    if num_dims == 3:
        scatter = go.Scatter3d(
            x=points[:, 0], y=points[:, 1], z=points[:, 2], **kwargs
        )
    else:
        scatter = go.Scattergl(x=points[:, 0], y=points[:, 1], **kwargs)

    traces = [scatter]

    if edges is not None:
        scatter = _make_edges_scatter(points, edges, edges_title)
        traces.insert(0, scatter)

    if figure is None:
        figure = go.Figure()

    figure.add_traces(traces)

    if axis_equal:
        figure.update_layout(yaxis_scaleanchor="x")
        if num_dims == 3:
            figure.update_layout(zaxis_scaleanchor="x")

    return figure


def _set_map_type_to_figure(
    figure,
    map_type,
):
    if map_type == "satellite":
        figure.update_layout(
            mapbox_style="white-bg",
            mapbox_layers=[
                {
                    "below": "traces",
                    "sourcetype": "raster",
                    "sourceattribution": "United States Geological Survey",
                    "source": [
                        "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"
                    ],
                }
            ],
            margin={"r": 0, "t": 0, "l": 0, "b": 0},
        )
    elif map_type == "roadmap":
        figure.update_layout(mapbox_style="carto-positron")
    else:
        figure.update_layout(mapbox_style="carto-positron")
        msg = "Unsupported map type '%s'; defaulted to 'roadmap'" % map_type
        warnings.warn(msg)


def _set_map_type_to_figure(
    figure,
    map_type,
):
    if map_type == "satellite":
        figure.update_layout(
            mapbox_style="white-bg",
            mapbox_layers=[
                {
                    "below": "traces",
                    "sourcetype": "raster",
                    "sourceattribution": "United States Geological Survey",
                    "source": [
                        "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"
                    ],
                }
            ],
            margin={"r": 0, "t": 0, "l": 0, "b": 0},
        )
    elif map_type == "roadmap":
        figure.update_layout(mapbox_style="carto-positron")
    else:
        figure.update_layout(mapbox_style="carto-positron")
        msg = "Unsupported map type '%s'; defaulted to 'roadmap'" % map_type
        warnings.warn(msg)


def _plot_scatter_mapbox_categorical(
    coords,
    labels,
    classes,
    sizes,
    edges,
    ids,
    figure,
    marker_size,
    labels_title,
    sizes_title,
    edges_title,
    colorbar_title,
    colors=None,
):
    num_classes = len(classes)
    colors = _get_qualitative_colors(num_classes, colors=colors)

    hover_lines = ["<b>%s: %%{text}</b>" % labels_title]

    if sizes is not None:
        if marker_size is None:
            marker_size = 15  # max marker size

        try:
            sizeref = 0.5 * max(sizes) / marker_size
        except ValueError:
            sizeref = 1

        hover_lines.append("%s: %%{marker.size}" % sizes_title)

    hover_lines.append("lat: %{lat:.5f}<br>lon: %{lon:.5f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    traces = []
    for label, color in zip(classes, colors):
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
        elif marker_size is not None:
            marker = dict(size=marker_size)
        else:
            marker = None

        scatter = go.Scattermapbox(
            lat=coords[label_inds][:, 1],
            lon=coords[label_inds][:, 0],
            customdata=customdata,
            mode="markers",
            showlegend=True,
            name=label,
            line_color=color,
            marker=marker,
            text=np.full(np.count_nonzero(label_inds), label),
            hovertemplate=hovertemplate,
        )
        traces.append(scatter)

    if edges is not None:
        scatter = _make_edges_scatter_mapbox(coords, edges, edges_title)
        traces.insert(0, scatter)

    if figure is None:
        figure = go.Figure()

    figure.add_traces(traces)

    zoom, (center_lon, center_lat) = _compute_zoom_center(coords)
    figure.update_layout(
        mapbox=dict(center=dict(lat=center_lat, lon=center_lon), zoom=zoom),
        legend_title_text=colorbar_title,
        legend_itemsizing="constant",
    )

    return figure


def _plot_scatter_mapbox_categorical_single_trace(
    coords,
    labels,
    classes,
    sizes,
    edges,
    ids,
    figure,
    marker_size,
    trace_title,
    labels_title,
    sizes_title,
    edges_title,
    colorbar_title,
    colors=None,
):
    num_classes = len(classes)
    targets = [classes.index(l) for l in labels]
    clim = [-0.5, num_classes - 0.5]

    colorscale = _get_qualitative_colorscale(num_classes, colors=colors)

    marker = dict(
        color=targets,
        cmin=clim[0],
        cmax=clim[1],
        autocolorscale=False,
        colorscale=colorscale,
        colorbar=dict(
            title=colorbar_title,
            tickvals=list(range(num_classes)),
            ticktext=classes,
            lenmode="fraction",
            len=1,
        ),
        showscale=True,
    )

    if sizes is not None:
        if marker_size is None:
            marker_size = 15  # max marker size

        try:
            sizeref = 0.5 * max(sizes) / marker_size
        except ValueError:
            sizeref = 1

        marker.update(
            dict(size=sizes, sizemode="diameter", sizeref=sizeref, sizemin=4)
        )
    elif marker_size is not None:
        marker.update(dict(size=marker_size))

    hover_lines = ["<b>%s: %%{text}</b>" % labels_title]

    if sizes is not None:
        hover_lines.append("%s: %%{marker.size}" % sizes_title)

    hover_lines.append("lat: %{lat:.5f}<br>lon: %{lon:.5f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    scatter = go.Scattermapbox(
        lat=coords[:, 1],
        lon=coords[:, 0],
        customdata=ids,
        mode="markers",
        marker=marker,
        text=labels,
        name=trace_title,
        hovertemplate=hovertemplate,
    )

    traces = [scatter]

    if edges is not None:
        scatter = _make_edges_scatter_mapbox(coords, edges, edges_title)
        traces.insert(0, scatter)

    if figure is None:
        figure = go.Figure()

    figure.add_traces(traces)

    zoom, (center_lon, center_lat) = _compute_zoom_center(coords)
    figure.update_layout(
        mapbox=dict(center=dict(lat=center_lat, lon=center_lon), zoom=zoom),
    )

    return figure


def _plot_scatter_mapbox_numeric(
    coords,
    values,
    sizes,
    edges,
    ids,
    figure,
    marker_size,
    colorscale,
    log_colorscale,
    trace_title,
    labels_title,
    sizes_title,
    edges_title,
    colorbar_title,
):
    marker = dict()

    if values is not None:
        if colorscale is None:
            colorscale = _DEFAULT_CONTINUOUS_COLORSCALE

        if log_colorscale:
            maxval = values.max()
            colorscale = _to_log_colorscale(colorscale, maxval)

        marker.update(
            dict(
                color=values,
                colorbar=dict(title=colorbar_title, lenmode="fraction", len=1),
                colorscale=colorscale,
                showscale=True,
            )
        )

    if sizes is not None:
        if marker_size is None:
            marker_size = 15  # max marker size

        try:
            sizeref = 0.5 * max(sizes) / marker_size
        except ValueError:
            sizeref = 1

        marker.update(
            dict(size=sizes, sizemode="diameter", sizeref=sizeref, sizemin=4)
        )
    elif marker_size is not None:
        marker.update(dict(size=marker_size))

    hover_lines = []

    if values is not None:
        hover_lines = ["<b>%s: %%{marker.color}</b>" % labels_title]

    if sizes is not None:
        hover_lines.append("%s: %%{marker.size}" % sizes_title)

    hover_lines.append("lat: %{lat:.5f}<br>lon: %{lon:.5f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    scatter = go.Scattermapbox(
        lat=coords[:, 1],
        lon=coords[:, 0],
        customdata=ids,
        mode="markers",
        marker=marker,
        name=trace_title,
        hovertemplate=hovertemplate,
    )

    traces = [scatter]

    if edges is not None:
        scatter = _make_edges_scatter_mapbox(coords, edges, edges_title)
        traces.insert(0, scatter)

    if figure is None:
        figure = go.Figure()

    figure.add_traces(traces)

    zoom, (center_lon, center_lat) = _compute_zoom_center(coords)
    figure.update_layout(
        mapbox=dict(center=dict(lat=center_lat, lon=center_lon), zoom=zoom),
    )

    return figure


def _plot_scatter_mapbox_density(
    coords,
    values,
    sizes,
    ids,
    figure,
    radius,
    colorscale,
    log_colorscale,
    trace_title,
    labels_title,
    sizes_title,
    colorbar_title,
):
    if values is not None and sizes is not None:
        hover_title = labels_title + " x " + sizes_title
    elif values is not None:
        hover_title = labels_title
    elif sizes is not None:
        hover_title = sizes_title
    else:
        hover_title = "value"

    hover_lines = []

    if values is not None:
        hover_lines = ["<b>%s: %%{z}</b>" % hover_title]

    if sizes is not None:
        if values is None:
            values = sizes
        else:
            values *= sizes

    if values is not None:
        values = np.maximum(values, 0.0)
        valuesref = values.max() / 2.0
        values /= valuesref

    hover_lines.append("lat: %{lat:.5f}<br>lon: %{lon:.5f}")

    if ids is not None:
        hover_lines.append("ID: %{customdata}")

    hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

    if colorscale is None:
        colorscale = _DEFAULT_CONTINUOUS_COLORSCALE

    if log_colorscale:
        logger.warning("Log colorscales are not supported for density plots")

    density = go.Densitymapbox(
        lat=coords[:, 1],
        lon=coords[:, 0],
        z=values,
        radius=radius,
        customdata=ids,
        colorscale=colorscale,
        name=trace_title,
        hovertemplate=hovertemplate,
    )

    if figure is None:
        figure = go.Figure()

    figure.add_trace(density)

    zoom, (center_lon, center_lat) = _compute_zoom_center(coords)
    figure.update_layout(
        mapbox=dict(center=dict(lat=center_lat, lon=center_lon), zoom=zoom),
    )

    # @todo why does this not show?
    figure.update_layout(legend_title_text=colorbar_title)

    return figure


def _make_edges_scatter(points, edges, edges_title):
    num_dims = points.shape[1]

    xedges = []
    yedges = []
    zedges = []
    for fromi, toi in edges:
        xedges.extend([points[fromi, 0], points[toi, 0], None])
        yedges.extend([points[fromi, 1], points[toi, 1], None])
        if num_dims == 3:
            zedges.extend([points[fromi, 2], points[toi, 2], None])

    kwargs = dict(
        line=dict(width=0.5, color="#888"),
        hoverinfo="skip",
        mode="lines",
        customdata=None,
        showlegend=edges_title is not None,
        name=edges_title,
    )

    if num_dims == 3:
        return go.Scatter3d(x=xedges, y=yedges, z=zedges, **kwargs)

    return go.Scattergl(x=xedges, y=yedges, **kwargs)


def _make_edges_scatter_mapbox(coords, edges, edges_title):
    lon_edges = []
    lat_edges = []
    for fromi, toi in edges:
        lon_edges.extend([coords[fromi, 0], coords[toi, 0], None])
        lat_edges.extend([coords[fromi, 1], coords[toi, 1], None])

    kwargs = dict(
        line=dict(width=0.5, color="#888"),
        hoverinfo="skip",
        mode="lines",
        customdata=None,
        showlegend=edges_title is not None,
        name=edges_title,
    )

    return go.Scattermapbox(lat=lat_edges, lon=lon_edges, **kwargs)


def _get_qualitative_colors(num_classes, colors=None):
    # Some color choices:
    # https://plotly.com/python/discrete-color/#color-sequences-in-plotly-express
    if colors is None:
        if num_classes == 1:
            colors = [_DEFAULT_LINE_COLOR]
        elif num_classes <= 10:
            colors = px.colors.qualitative.G10
        else:
            colors = px.colors.qualitative.Alphabet

    # @todo can we blend when there are more classes than colors?
    colors = list(colors)
    return [colors[i % len(colors)] for i in range(num_classes)]


def _get_qualitative_colorscale(num_classes, colors=None):
    colors = _get_qualitative_colors(num_classes, colors=colors)

    colorscale = []
    for i, color in enumerate(colors):
        colorscale.append([i / num_classes, color])
        colorscale.append([(i + 1) / num_classes, color])

    return colorscale


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
    filepath = os.path.normpath(
        os.path.join(
            os.path.dirname(np.__file__), "..", "plotly", "basedatatypes.py"
        )
    )

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

    try:
        with open(filepath, "r") as f:
            code = f.read()

        if find in code:
            logger.debug("Patching '%s'", filepath)
            fixed = code.replace(find, replace)
            with open(filepath, "w") as f:
                f.write(fixed)
        elif replace in code:
            logger.debug("Already patched '%s'", filepath)
        else:
            logger.debug("Unable to patch '%s'", filepath)
    except Exception as e:
        logger.debug(e)
        logger.debug("Unable to patch '%s'", filepath)


_patch_perform_plotly_relayout()
