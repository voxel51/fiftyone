"""
Matplotlib plots.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import warnings

import numpy as np
import matplotlib as mpl
from matplotlib.widgets import Button, LassoSelector
from matplotlib.path import Path
import matplotlib.pyplot as plt
from mpl_toolkits.axes_grid1 import make_axes_locatable
from mpl_toolkits.axes_grid1.inset_locator import InsetPosition
from mpl_toolkits.mplot3d import Axes3D  # pylint: disable=unused-import
import sklearn.linear_model as skl
import sklearn.metrics.pairwise as skp
import sklearn.metrics as skm

import eta.core.utils as etau

import fiftyone.core.context as foc
import fiftyone.core.expressions as foe
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.patches as fop
import fiftyone.core.utils as fou
import fiftyone.core.video as fov

from .base import InteractivePlot
from .utils import load_button_icon


logger = logging.getLogger(__name__)


_DEFAULT_STYLE = "seaborn-ticks"
_DEFAULT_LINE_COLOR = "#FF6D04"
_DEFAULT_CONTINUOUS_COLORSCALE = "viridis"


def plot_confusion_matrix(
    confusion_matrix,
    labels,
    show_values=True,
    show_colorbar=True,
    cmap=None,
    title=None,
    xticks_rotation=45.0,
    values_format=None,
    ax=None,
    figsize=None,
):
    """Plots a confusion matrix.

    Args:
        confusion_matrix: a ``num_true x num_preds`` confusion matrix
        labels: a ``max(num_true, num_preds)`` array-like of class labels
        show_values (True): whether to show counts in the confusion matrix
            cells
        show_colorbar (True): whether to show a colorbar
        cmap (None): a colormap recognized by ``matplotlib``
        title (None): a title for the plot
        xticks_rotation (45.0): a rotation for the x-tick labels. Can be
            numeric degrees, "vertical", "horizontal", or None
        values_format (None): a format string like ``".2g"`` or ``"d"`` to use
            to format the cell counts
        ax (None): a matplotlib axis to plot in
        figsize (None): a ``(width, height)`` for the figure, in inches

    Returns:
        a matplotlib figure
    """
    if ax is None:
        fig, ax = plt.subplots()
    else:
        fig = ax.figure

    confusion_matrix = np.asarray(confusion_matrix)
    nrows = confusion_matrix.shape[0]
    ncols = confusion_matrix.shape[1]

    if cmap is None:
        cmap = _DEFAULT_CONTINUOUS_COLORSCALE

    im = ax.imshow(confusion_matrix, interpolation="nearest", cmap=cmap)

    if show_values:
        # Print text with appropriate color depending on background
        cmap_min = im.cmap(0)
        cmap_max = im.cmap(256)
        thresh = (confusion_matrix.max() + confusion_matrix.min()) / 2.0

        for i, j in itertools.product(range(nrows), range(ncols)):
            color = cmap_max if confusion_matrix[i, j] < thresh else cmap_min

            if values_format is None:
                text_cm = format(confusion_matrix[i, j], ".2g")
                if confusion_matrix.dtype.kind != "f":
                    text_d = format(confusion_matrix[i, j], "d")
                    if len(text_d) < len(text_cm):
                        text_cm = text_d
            else:
                text_cm = format(confusion_matrix[i, j], values_format)

            ax.text(j, i, text_cm, ha="center", va="center", color=color)

    ax.set(
        xticks=np.arange(ncols),
        yticks=np.arange(nrows),
        xticklabels=labels[:ncols],
        yticklabels=labels[:nrows],
        xlabel="Predicted label",
        ylabel="True label",
    )
    ax.set_ylim((nrows - 0.5, -0.5))  # flip axis

    if xticks_rotation is not None:
        plt.setp(ax.get_xticklabels(), rotation=xticks_rotation)

    if show_colorbar:
        divider = make_axes_locatable(ax)
        cax = divider.append_axes("right", size="5%", pad=0.1)
        fig.colorbar(im, cax=cax)

    if figsize is not None:
        fig.set_size_inches(*figsize)

    if title is not None:
        fig.suptitle(title)

    plt.tight_layout()

    return fig


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
    best_fit_label=None,
    marker_size=None,
    cmap=None,
    title=None,
    ax=None,
    figsize=None,
    style=None,
    **kwargs,
):
    """Plots the given regression results.

    Args:
        ytrue: an array-like of ground truth values
        ypred: an array-like of predicted values
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
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
            -   a list of array-lies of numeric or string values, if
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
        best_fit_label (None): a custom legend label for the best fit line
        marker_size (None): the marker size to use. If ``sizes`` are provided,
            this value is used as a reference to scale the sizes of all points
        cmap (None): a colormap recognized by ``matplotlib``
        title (None): a title for the plot
        ax (None): a matplotlib axis to plot in
        figsize (None): a ``(width, height)`` for the figure, in inches
        style (None): a style to use for the plot
        **kwargs: optional keyword arguments for matplotlib's ``scatter()``

    Returns:
        a matplotlib figure
    """
    if ax is None:
        _, ax = plt.subplots()

    points = np.stack([ytrue, ypred], axis=-1)

    points, labels, sizes, _, inds, _ = _parse_scatter_inputs(
        points, labels, sizes, classes
    )

    if ids is not None and inds is not None:
        ids = np.asarray(ids)[inds]

    ytrue = points[:, 0]
    ypred = points[:, 1]

    if best_fit_label is None:
        r2_score = skm.r2_score(ytrue, ypred, sample_weight=None)
        best_fit_label = "r^2: %0.3f" % r2_score

    model = skl.LinearRegression()
    model.fit(ytrue[:, np.newaxis], ypred)

    xline = np.array([ytrue.min(), ytrue.max()])
    yline = model.predict(xline[:, np.newaxis])

    xlabel = gt_field if gt_field is not None else "Ground truth"
    ylabel = pred_field if pred_field is not None else "Predictions"

    if style is None:
        style = _DEFAULT_STYLE

    with plt.style.context(style):
        ax.plot(xline, yline, color="k", label=best_fit_label)
        ax.set(xlabel=xlabel, ylabel=ylabel)
        ax.legend()
        ax.axis("equal")

    if (
        samples is not None
        and gt_field is not None
        and samples._is_frame_field(gt_field)
    ):
        link_field = "frames"
    else:
        link_field = None

    return scatterplot(
        points,
        samples=samples,
        ids=ids,
        link_field=link_field,
        labels=labels,
        sizes=sizes,
        marker_size=marker_size,
        cmap=cmap,
        title=title,
        ax=ax,
        ax_equal=True,
        figsize=figsize,
        style=style,
        **kwargs,
    )


def plot_pr_curve(
    precision,
    recall,
    label=None,
    title=None,
    ax=None,
    figsize=None,
    style=None,
    **kwargs,
):
    """Plots a precision-recall (PR) curve.

    Args:
        precision: an array-like of precision values
        recall: an array-like of recall values
        label (None): a label for the curve
        title (None): a title for the plot
        ax (None): a matplotlib axis to plot in
        figsize (None): a ``(width, height)`` for the figure, in inches
        style (None): a style to use for the plot
        **kwargs: optional keyword arguments for matplotlib's ``plot()``

    Returns:
        a matplotlib figure
    """
    if style is None:
        style = _DEFAULT_STYLE

    if "color" not in kwargs:
        kwargs["color"] = _DEFAULT_LINE_COLOR

    with plt.style.context(style):
        display = skm.PrecisionRecallDisplay(
            precision=precision, recall=recall
        )
        display.plot(ax=ax, label=label, **kwargs)

    fig = display.figure_

    if figsize is not None:
        fig.set_size_inches(*figsize)

    if title is not None:
        fig.suptitle(title)

    return fig


def plot_pr_curves(
    precisions,
    recall,
    classes,
    title=None,
    ax=None,
    figsize=None,
    style=None,
    **kwargs,
):
    """Plots a set of per-class precision-recall (PR) curves.

    Args:
        precisions: a ``num_classes x num_recalls`` array-like of per-class
            precision values
        recall: an array-like of recall values
        classes: the list of classes
        title (None): a title for the plot
        ax (None): a matplotlib axis to plot in
        figsize (None): a ``(width, height)`` for the figure, in inches
        style (None): a style to use for the plot
        **kwargs: optional keyword arguments for matplotlib's ``plot()``

    Returns:
        a matplotlib figure
    """
    # Plot in descending order of AP
    avg_precisions = np.mean(precisions, axis=1)
    inds = np.argsort(-avg_precisions)  # negative for descending order

    if style is None:
        style = _DEFAULT_STYLE

    with plt.style.context(style):
        for idx in inds:
            precision = precisions[idx]
            _class = classes[idx]
            avg_precision = avg_precisions[idx]
            label = "AP = %.2f, class = %s" % (avg_precision, _class)
            display = skm.PrecisionRecallDisplay(
                precision=precision, recall=recall
            )
            display.plot(ax=ax, label=label, **kwargs)
            ax = display.ax_

    if ax is None:
        ax = plt.gca()

    fig = ax.figure

    if figsize is not None:
        fig.set_size_inches(*figsize)

    if title is not None:
        fig.suptitle(title)

    return fig


def plot_roc_curve(
    fpr,
    tpr,
    roc_auc=None,
    title=None,
    ax=None,
    figsize=None,
    style=None,
    **kwargs,
):
    """Plots a receiver operating characteristic (ROC) curve.

    Args:
        fpr: an array-like of false postive rates
        tpr: an array-like of true postive rates
        roc_auc (None): the area under the ROC curve
        title (None): a title for the plot
        ax (None): a matplotlib axis to plot in
        figsize (None): a ``(width, height)`` for the figure, in inches
        style (None): a style to use for the plot
        **kwargs: optional keyword arguments for matplotlib's ``plot()``

    Returns:
        a matplotlib figure
    """
    if style is None:
        style = _DEFAULT_STYLE

    if "color" not in kwargs:
        kwargs["color"] = _DEFAULT_LINE_COLOR

    with plt.style.context(style):
        display = skm.RocCurveDisplay(fpr=fpr, tpr=tpr, roc_auc=roc_auc)
        display.plot(ax=ax, **kwargs)

    fig = display.figure_

    if figsize is not None:
        fig.set_size_inches(*figsize)

    if title is not None:
        fig.suptitle(title)

    return fig


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
    title=None,
    xlabel=None,
    ylabel=None,
    ax=None,
    ax_equal=False,
    figsize=None,
    style=None,
    buttons=None,
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
            -   the name of a frame field or ``frames.embbeded.field.name`` of
                ``samples`` from which to extract values for per-sample line
                traces
            -   a :class:`fiftyone.core.expressions.ViewExpression` that
                resolves to a list (one line plot) or list of lists (muliple
                line plots) of numeric values to compute from ``samples`` via
                :meth:`fiftyone.core.collections.SampleCollection.values`
        y (None): the y data to plot. Can be any of the following:

            -   an array-like of values
            -   a ``num_lines x n`` array-like or list of length ``num_lines``
                of array-likes of values for multiple line traces
            -   the name of a sample field or ``embedded.field.name`` of
                ``samples`` from which to extract values for a single line
            -   the name of a frame field or ``frames.embbeded.field.name`` of
                ``samples`` from which to extract values for per-sample line
                traces
            -   a :class:`fiftyone.core.expressions.ViewExpression` that
                resolves to a list (one line plot) or list of lists (muliple
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
        labels (None): a label or list of labels for the line traces
        colors (None): a list of colors recognized by ``matplotlib`` to use for
            the line traces. See
            https://matplotlib.org/stable/tutorials/colors/colormaps.html for
            more information
        marker_size (None): the marker size to use. If ``sizes`` are provided,
            this value is used as a reference to scale the sizes of all points
        title (None): a title for the plot
        xlabel (None): an x-axis label
        ylabel (None): a y-axis label
        ax (None): a matplotlib axis to plot in
        ax_equal (False): whether to set ``axis("equal")``
        figsize (None): a ``(width, height)`` for the figure, in inches
        style (None): a style to use for the plot
        buttons (None): a list of ``(label, icon_image, callback)`` tuples
            defining buttons to add to the plot
        **kwargs: optional keyword arguments for matplotlib's ``plot()`` and
            ``scatter()``

    Returns:
        one of the following

        -   an :class:`InteractiveCollection`, when IDs are available
        -   a matplotlib figure, otherwise
    """
    if y is None:
        raise ValueError("You must provide 'y' values")

    if etau.is_str(y) or isinstance(y, foe.ViewExpression):
        if samples is not None and samples.media_type == fom.VIDEO:
            is_frames = foe.is_frames_expr(y)
        else:
            is_frames = False
    else:
        is_frames = y and etau.is_container(y[0])

    if is_frames and link_field is None:
        link_field = "frames"

    y = _parse_values(y, "y", samples=samples, is_frames=is_frames)

    if x is None:
        if is_frames:
            x = [np.arange(1, len(yi) + 1) for yi in y]
        else:
            x = np.arange(1, len(y) + 1)
    else:
        x = _parse_values(x, "x", samples=samples, ref=y, is_frames=is_frames)

    if is_frames and x and not etau.is_container(x[0]):
        x = [x] * len(y)

    sizes = _parse_values(
        sizes, "sizes", samples=samples, ref=y, is_frames=is_frames
    )

    if is_frames:
        if sizes is None:
            sizes = itertools.repeat(None)

        if labels is None:
            labels = [str(i) for i in range(1, len(y) + 1)]
        elif etau.is_str(labels):
            labels = _parse_values(labels, "labels", samples=samples)

        show_legend = True
    else:
        x = [x]
        y = [y]
        sizes = [sizes]
        labels = [labels]
        show_legend = labels[0] is not None

    if ids is None and samples is not None:
        ref = list(itertools.chain.from_iterable(y))
        ids = _get_ids(samples, link_field=link_field, ref=ref)

    if style is None:
        style = _DEFAULT_STYLE

    with plt.style.context(style):
        collection = _plot_lines(
            x,
            y,
            sizes=sizes,
            labels=labels,
            colors=colors,
            marker_size=marker_size,
            xlabel=xlabel,
            ylabel=ylabel,
            ax=ax,
            ax_equal=ax_equal,
            figsize=figsize,
            show_legend=show_legend,
            **kwargs,
        )

        if title is not None:
            collection.axes.figure.suptitle(title)

        if samples is None:
            fig = collection.axes.figure
            plt.tight_layout()
            return fig

        selection_mode = None
        init_fcn = None

        if link_field is None:
            if isinstance(samples, fov.FramesView):
                link_type = "frames"
            elif isinstance(samples, fop.PatchesView):
                link_type = "labels"
                link_field = samples._label_fields
            else:
                link_type = "samples"
        elif link_field == "frames":
            if isinstance(samples, fov.FramesView):
                link_type = "frames"
            else:
                link_type = "frames"
                init_fcn = lambda view: view.to_frames()
        else:
            link_type = "labels"
            selection_mode = "patches"
            init_fcn = lambda view: view.to_patches(link_field)

        return InteractiveCollection(
            collection,
            ids=ids,
            buttons=buttons,
            link_type=link_type,
            init_view=samples,
            label_fields=link_field,
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
    classes=None,
    marker_size=None,
    cmap=None,
    title=None,
    ax=None,
    ax_equal=False,
    figsize=None,
    style=None,
    buttons=None,
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
        classes (None): a list of classes whose points to plot. Only applicable
            when ``labels`` contains strings
        marker_size (None): the marker size to use. If ``sizes`` are provided,
            this value is used as a reference to scale the sizes of all points
        cmap (None): a colormap recognized by ``matplotlib``
        title (None): a title for the plot
        ax (None): a matplotlib axis to plot in
        ax_equal (False): whether to set ``axis("equal")``
        figsize (None): a ``(width, height)`` for the figure, in inches
        style (None): a style to use for the plot
        buttons (None): a list of ``(label, icon_image, callback)`` tuples
            defining buttons to add to the plot
        **kwargs: optional keyword arguments for matplotlib's ``scatter()``

    Returns:
        one of the following

        -   an :class:`InteractiveCollection`, for 2D points and when IDs are
            available
        -   a matplotlib figure, otherwise
    """
    points = np.asarray(points)
    num_dims = points.shape[1]

    if num_dims not in {2, 3}:
        raise ValueError("This method only supports 2D or 3D points")

    labels = _parse_values(labels, "labels", samples=samples, ref=points)
    sizes = _parse_values(sizes, "sizes", samples=samples, ref=points)

    if ids is not None:
        ids = np.asarray(ids)
    elif samples is not None:
        if num_dims != 2:
            msg = "Interactive selection is only supported in 2D"
            warnings.warn(msg)
        else:
            ids = _get_ids(samples, link_field=link_field, ref=points)

    if style is None:
        style = _DEFAULT_STYLE

    with plt.style.context(style):
        collection, inds = _plot_scatter(
            points,
            labels=labels,
            sizes=sizes,
            classes=classes,
            marker_size=marker_size,
            cmap=cmap,
            ax=ax,
            ax_equal=ax_equal,
            figsize=figsize,
            **kwargs,
        )

        if title is not None:
            collection.axes.figure.suptitle(title)

        if samples is None or num_dims != 2:
            fig = collection.axes.figure
            plt.tight_layout()
            return fig

        if ids is not None and inds is not None:
            ids = ids[inds]

        selection_mode = None
        init_fcn = None

        if link_field is None:
            if isinstance(samples, fov.FramesView):
                link_type = "frames"
            elif isinstance(samples, fop.PatchesView):
                link_type = "labels"
                link_field = samples._label_fields
            else:
                link_type = "samples"
        elif link_field == "frames":
            if isinstance(samples, fov.FramesView):
                link_type = "frames"
            else:
                link_type = "frames"
                init_fcn = lambda view: view.to_frames()
        else:
            link_type = "labels"
            selection_mode = "patches"
            init_fcn = lambda view: view.to_patches(link_field)

        return InteractiveCollection(
            collection,
            ids=ids,
            buttons=buttons,
            link_type=link_type,
            init_view=samples,
            label_fields=link_field,
            selection_mode=selection_mode,
            init_fcn=init_fcn,
        )


def _parse_values(values, parameter, samples=None, ref=None, is_frames=False):
    if values is None:
        return None

    if etau.is_str(values) or isinstance(values, foe.ViewExpression):
        if samples is None:
            raise ValueError(
                "You must provide `samples` in order to extract field values "
                "for the `%s` parameter" % parameter
            )

        values = samples.values(values)

    if is_frames:
        values = [_unwind_values(v) for v in values]
    else:
        values = _unwind_values(values)

    if ref is not None:
        _validate_values(values, ref, parameter, is_frames=is_frames)

    return values


def _get_ids(samples, link_field=None, ref=None, is_frames=False):
    if link_field is None:
        ids = samples.values("id")
        ptype = "sample"
    elif link_field == "frames":
        ids = samples.values("frames.id")
        ptype = "frame"
    else:
        _, id_path = samples._get_label_field_path(link_field, "id")
        ids = samples.values(id_path)
        ptype = "label"

    if is_frames:
        ids = [_unwind_values(_ids) for _ids in ids]
    else:
        ids = _unwind_values(ids)

    if ref is not None:
        values_type = "%s IDs" % ptype
        _validate_values(ids, ref, values_type, is_frames=is_frames)

    return ids


def _unwind_values(values):
    while any(isinstance(v, (list, tuple)) for v in values):
        values = list(itertools.chain.from_iterable(v for v in values if v))

    return values


def _validate_values(values, ref, values_type, is_frames=False):
    if not is_frames:
        if len(values) != len(ref):
            raise ValueError(
                "Inconsistent number of %s (%d != %d). You may have missing "
                "data/labels that you need to omit from your view"
                % (values_type, len(values), len(ref))
            )

        return

    if len(values) != len(ref):
        raise ValueError(
            "Inconsistent number of %s traces (%d != %d). You may have "
            "missing data/labels that you need to omit from your view"
            % (values_type, len(values), len(ref))
        )

    for idx, (_values, _ref) in enumerate(zip(values, ref), 1):
        if len(_values) != len(_ref):
            raise ValueError(
                "Inconsistent number of %s (%d != %d) in trace %d/%d. You may "
                "have missing data/labels that you need to omit from your view"
                % (values_type, len(_values), len(_ref), idx, len(values))
            )


def location_scatterplot(
    locations=None,
    samples=None,
    ids=None,
    labels=None,
    sizes=None,
    classes=None,
    map_type="satellite",
    show_scale_bar=False,
    api_key=None,
    marker_size=None,
    cmap=None,
    title=None,
    ax=None,
    ax_equal=False,
    figsize=None,
    style=None,
    buttons=None,
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
        classes (None): a list of classes whose points to plot. Only applicable
            when ``labels`` contains strings
        map_type ("satellite"): the map type to render. Supported values are
            ``("roadmap", "satellite", "hybrid", "terrain")``
        show_scale_bar (False): whether to render a scale bar on the plot
        api_key (None): a Google Maps API key to use
        marker_size (None): the marker size to use. If ``sizes`` are provided,
            this value is used as a reference to scale the sizes of all points
        cmap (None): a colormap recognized by ``matplotlib``
        title (None): a title for the plot
        ax (None): a matplotlib axis to plot in
        ax_equal (False): whether to set ``axis("equal")``
        figsize (None): a ``(width, height)`` for the figure, in inches
        style (None): a style to use for the plot
        buttons (None): a list of ``(label, icon_image, callback)`` tuples
            defining buttons to add to the plot
        **kwargs: optional keyword arguments for matplotlib's ``scatter()``

    Returns:
        one of the following

        -   an :class:`InteractiveCollection`, if IDs are available
        -   a matplotlib figure, otherwise
    """
    locations = _parse_locations(locations, samples)

    if ax is None:
        fig = plt.figure()
        ax = fig.add_subplot(111)
    else:
        fig = ax.figure

    locations = _plot_map_background(
        ax, locations, api_key, map_type, show_scale_bar
    )

    def _onclick(event):
        for child in ax.get_children():
            if isinstance(child, mpl.image.AxesImage):
                child.set_visible(not child.get_visible())

        ax.figure.canvas.draw_idle()

    if buttons is None:
        buttons = []

    map_icon = load_button_icon("map")
    buttons.append(("map", map_icon, _onclick))

    return scatterplot(
        locations,
        samples=samples,
        ids=ids,
        labels=labels,
        sizes=sizes,
        classes=classes,
        marker_size=marker_size,
        cmap=cmap,
        title=title,
        ax=ax,
        ax_equal=ax_equal,
        figsize=figsize,
        style=style,
        buttons=buttons,
        **kwargs,
    )


def _parse_locations(locations, samples):
    if locations is not None and not etau.is_str(locations):
        return np.asarray(locations)

    if samples is None:
        raise ValueError(
            "You must provide `samples` in order to extract `locations` from "
            "your dataset"
        )

    if locations is None:
        location_field = samples._get_geo_location_field()
    else:
        location_field = locations
        samples.validate_field_type(
            location_field,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.GeoLocation,
        )

    locations = samples.values(location_field + ".point.coordinates")
    return np.asarray(locations)


class InteractiveMatplotlibPlot(InteractivePlot):
    """Base class for interactive matplotlib plots.

    Args:
        figure: a ``matplotlib.figure.Figure``
        **kwargs: keyword arguments for the
            :class:`fiftyone.core.plots.base.InteractivePlot` constructor
    """

    def __init__(self, figure, **kwargs):
        self._figure = figure
        self._in_notebook_context = foc.is_notebook_context()
        super().__init__(**kwargs)

    @property
    def supports_session_updates(self):
        # matplotlib does not support redrawing outside of the main thread
        # https://stackoverflow.com/q/34764535
        return self._in_notebook_context

    def show(self):
        """Shows this plot."""
        super().show()

    def save(self, path, dpi=None, **kwargs):
        """Saves the plot as an image.

        Args:
            path: the path to write the image
            dpi (None): a resolution in dots per inch
            **kwargs: keyword arguments for ``matplotlib.pyplot.savefig``
        """
        if "bbox_inches" not in kwargs:
            kwargs["bbox_inches"] = "tight"

        if dpi is not None:
            kwargs["dpi"] = dpi

        etau.ensure_basedir(path)
        self._figure.savefig(path, **kwargs)

    def _show(self, **_):
        plt.show(block=False)

    def _freeze(self):
        try:
            # Turns an interactive plot into a static one when the
            # `%matplotlib notebook` environment is being used
            # https://github.com/matplotlib/matplotlib/issues/6071
            plt.close(self._figure)
        except:
            # @todo how turn a matplotlib widget into a static plot when the
            # `%matplotlib widget` environment is being used? As of this
            # writing, it seems this is not yet supported
            # https://github.com/matplotlib/ipympl/issues/16
            logger.warning(
                "Failed to freeze the plot. You may be using the "
                "`%%matplotlib widget` backend, which does not support "
                "programmatic freezing of figures"
            )

    def _reopen(self):
        # https://stackoverflow.com/a/31731945
        dummy = plt.figure()
        new_manager = dummy.canvas.manager
        new_manager.canvas.figure = self._figure
        self._figure.set_canvas(new_manager.canvas)


class InteractiveCollection(InteractiveMatplotlibPlot):
    """Interactive wrapper for a matplotlib collection.

    This class enables collection points to be lasso-ed and click selected.

    The currently selected points are given a visually distinctive style, and
    you can modify your selection by either clicking on individual points or
    drawing a lasso around new points.

    When the shift key is pressed, new selections are added to the selected
    set, or subtracted if the new selection is a subset of the current
    selection.

    Args:
        collection: a ``matplotlib.collections.Collection`` to select points
            from
        ids (None): an array-like of IDs corresponding to the points in
            ``collection``
        buttons (None): a list of ``(label, icon_image, callback)`` tuples
            defining buttons to add to the plot
        alpha_other (0.25): a transparency value for unselected points
        expand_selected (3.0): expand the size of selected points by this
            multiple
        click_tolerance (0.02): a click distance tolerance in ``[0, 1]`` when
            clicking individual points
        **kwargs: keyword arguments for the
            :class:`fiftyone.core.plots.base.InteractivePlot` constructor
    """

    def __init__(
        self,
        collection,
        ids=None,
        buttons=None,
        alpha_other=0.25,
        expand_selected=3.0,
        click_tolerance=0.02,
        **kwargs,
    ):
        self.collection = collection
        self.ax = collection.axes
        self.alpha_other = alpha_other
        self.expand_selected = expand_selected
        self.click_tolerance = click_tolerance

        self._xy = collection.get_offsets()
        self._num_pts = len(self._xy)
        self._fc = None
        self._ms = None

        if ids is None:
            ids = np.arange(self._num_pts)

        self._ids = np.asarray(ids)
        self._ids_to_inds = {_id: idx for idx, _id in enumerate(ids)}
        self._inds = None

        self._canvas = None
        self._lasso = None
        self._shift = False
        self._title = None
        self._user_button_defs = buttons or []
        self._sync_button_def = None
        self._disconnect_button_def = None
        self._buttons = []
        self._figure_events = []
        self._keypress_events = []

        figure = collection.axes.figure
        self._canvas = self._init_canvas(figure)

        super().__init__(figure, **kwargs)

    @property
    def _selected_ids(self):
        if self._inds is None:
            return None

        return list(self._ids[self._inds])

    def _register_sync_callback(self, callback):
        if self.supports_session_updates:
            return

        def _on_sync(event):
            callback()

        sync_icon = load_button_icon("sync")
        self._sync_button_def = ("sync", sync_icon, _on_sync)

        if self.is_connected:
            self._reinit_hud()

    def _register_disconnect_callback(self, callback):
        def _on_disconnect(event):
            callback()

        disconnect_icon = load_button_icon("disconnect")
        self._disconnect_button_def = (
            "disconnect",
            disconnect_icon,
            _on_disconnect,
        )

        if self.is_connected:
            self._reinit_hud()

    def _init_canvas(self, figure):
        canvas = figure.canvas
        canvas.mpl_connect("close_event", lambda e: self._disconnect())
        canvas.header_visible = False
        return canvas

    def _reopen(self):
        super()._reopen()
        self._canvas = self._init_canvas(self._figure)

    def _connect(self):
        self._init_hud()
        self._lasso = LassoSelector(self.ax, onselect=self._on_select)

        def _make_callback(button, callback):
            def _callback(event):
                # Change to non-hover color to convey that something happened
                # https://stackoverflow.com/a/28079210
                button.ax.set_facecolor(button.color)
                self._draw()
                callback(event)

            return _callback

        for button, callback in self._buttons:
            _callback = _make_callback(button, callback)
            button.on_clicked(_callback)

        self._title.set_text("Click or drag to select points")
        self._figure_events = [
            self._canvas.mpl_connect("figure_enter_event", self._on_enter),
            self._canvas.mpl_connect("figure_leave_event", self._on_exit),
        ]
        self._keypress_events = [
            self._canvas.mpl_connect("key_press_event", self._on_keypress),
            self._canvas.mpl_connect("key_release_event", self._on_keyrelease),
        ]

        self._update_hud(False)

    def _disconnect(self):
        if not self.is_connected:
            return

        self._lasso.disconnect_events()

        for cid in self._figure_events:
            self._canvas.mpl_disconnect(cid)

        for cid in self._keypress_events:
            self._canvas.mpl_disconnect(cid)

        self._shift = False
        self._figure_events = []
        self._keypress_events = []

        self._close_hud()
        self._draw()

    def _draw(self):
        self._canvas.draw_idle()

    def _freeze(self):
        # Disconnect first so that HUD is not visible
        self.disconnect()

        super()._freeze()

    def _init_hud(self):
        # Button styling
        gap = 0.02
        size = 0.06
        color = "#DBEBFC"
        hovercolor = "#499CEF"

        self._title = self.ax.set_title("")

        button_defs = list(self._user_button_defs)
        if self._sync_button_def is not None:
            button_defs.append(self._sync_button_def)

        if self._disconnect_button_def is not None:
            button_defs.append(self._disconnect_button_def)

        num_buttons = len(button_defs)

        def _button_pos(i):
            # top of right-side
            # return [1 + gap, 1 - (i + 1) * size - i * gap, size, size]

            # right-side of top
            i = num_buttons - 1 - i
            return [1 - (i + 1) * size - i * gap, 1 + gap, size, size]

        self._buttons = []
        for i, (label, icon_img, callback) in enumerate(button_defs):
            bax = self.ax.figure.add_axes([0, 0, 1, 1], label=label)
            bax.set_axes_locator(InsetPosition(self.ax, _button_pos(i)))
            button = Button(
                bax, "", color=color, hovercolor=hovercolor, image=icon_img
            )
            self._buttons.append((button, callback))

    def _reinit_hud(self):
        self._close_hud()
        self._init_hud()

    def _close_hud(self):
        self._title = self.ax.set_title("")

        for button, _ in self._buttons:
            button.ax.remove()

        self._buttons = []

    def _update_hud(self, visible):
        self._title.set_visible(visible)
        for button, _ in self._buttons:
            button.ax.set_visible(visible)

    def _on_enter(self, event):
        self._update_hud(True)
        self._draw()

    def _on_exit(self, event):
        self._update_hud(False)
        self._draw()

    def _on_keypress(self, event):
        if event.key == "shift":
            self._shift = True
            self._title.set_text("Click or drag to add/remove points")
            self._draw()

    def _on_keyrelease(self, event):
        if event.key == "shift":
            self._shift = False
            self._title.set_text("Click or drag to select points")
            self._draw()

    def _on_select(self, vertices):
        x1, x2 = self.ax.get_xlim()
        y1, y2 = self.ax.get_ylim()
        click_thresh = self.click_tolerance * min(abs(x2 - x1), abs(y2 - y1))

        is_click = np.abs(np.diff(vertices, axis=0)).sum() < click_thresh

        if is_click:
            dists = skp.euclidean_distances(self._xy, np.array([vertices[0]]))
            click_ind = np.argmin(dists)
            if dists[click_ind] < click_thresh:
                inds = [click_ind]
            else:
                inds = []

            inds = np.array(inds, dtype=int)
        else:
            path = Path(vertices)
            inds = np.nonzero(path.contains_points(self._xy))[0]

        curr_inds = self._inds
        if curr_inds is None:
            curr_inds = np.array([], dtype=int)

        if self._shift:
            new_inds = set(inds)
            inds = set(curr_inds)
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

        if inds.size == curr_inds.size and np.all(inds == curr_inds):
            # Selection hasn't changed
            self._draw()
            return

        if not inds.size:
            inds = None

        self._select_inds(inds)

    def _select_ids(self, ids, view=None):
        if ids is not None:
            inds = [self._ids_to_inds[_id] for _id in ids]
        else:
            inds = None

        self._select_inds(inds)

    def _select_inds(self, inds):
        if inds is not None:
            inds = np.asarray(inds, dtype=int)

        self._inds = inds
        self._update_plot()

        if self._selection_callback is not None:
            self._selection_callback(self.selected_ids)

    def _update_plot(self):
        self._prep_collection()

        inds = self._inds

        alpha = self._fc[:, -1]
        if inds is None:
            alpha[:] = 1
        else:
            alpha[:] = self.alpha_other
            alpha[inds] = 1

        self.collection.set_facecolors(self._fc)

        if self.expand_selected is not None:
            ms = self._ms.copy()
            if inds is not None and inds.size > 0:
                ms[inds] *= self.expand_selected

            self.collection.set_sizes(ms)

        self._draw()

    def _prep_collection(self):
        # @todo why is this necessary? We do this JIT here because it seems
        # that when __init__() runs, `get_facecolors()` doesn't have all the
        # data yet...

        if self._fc is None:
            self._fc = self.collection.get_facecolors()

        if self._ms is None:
            self._ms = self.collection.get_sizes().astype(float)

        if len(self._fc) < self._num_pts:
            self._fc = np.tile(self._fc[0], (self._num_pts, 1))

        if len(self._ms) < self._num_pts:
            self._ms = np.tile(self._ms[0], self._num_pts)


def _plot_lines(
    x,
    y,
    sizes=None,
    labels=None,
    colors=None,
    marker_size=None,
    xlabel=None,
    ylabel=None,
    ax=None,
    ax_equal=False,
    figsize=None,
    show_legend=False,
    **kwargs,
):
    if ax is None:
        fig = plt.figure()
        ax = fig.add_subplot(111)
    else:
        fig = ax.figure

    if marker_size is None:
        # Choose a reasonable marker size based on number of points
        num_points = sum(len(xi) for xi in x)
        marker_size = 2.0 * (10 ** (4 - np.log10(num_points)))
        marker_size = max(1, min(marker_size, 50))

    if sizes is None:
        sizes = itertools.repeat(None)

    if labels is None:
        labels = itertools.repeat(None)

    colors = _get_qualitative_colors(len(y), colors=colors)

    xs = []
    ys = []
    cs = []
    ss = []
    for _x, _y, _s, _l, _c in zip(x, y, sizes, labels, colors):
        ax.plot(_x, _y, linestyle="-", label=_l, color=_c, **kwargs)

        xs.extend(_x)
        ys.extend(_y)
        cs.extend([_c] * len(_y))
        if _s is not None:
            # Scale sizes so that 0.5 * max(sizes) corresponds to `marker_size`
            min_marker_size = min(0.1, marker_size)
            sizeref = 0.5 * max(_s) / marker_size
            ss.extend(max(s / sizeref, min_marker_size) for s in _s)

    if not ss:
        ss = marker_size

    collection = ax.scatter(xs, ys, c=cs, s=ss, **kwargs)

    if show_legend:
        ax.legend()

    if figsize is not None:
        fig.set_size_inches(*figsize)

    if ax_equal:
        ax.axis("equal")

    if xlabel is not None:
        ax.set(xlabel=xlabel)

    if ylabel is not None:
        ax.set(ylabel=ylabel)

    return collection


def _plot_scatter(
    points,
    labels=None,
    sizes=None,
    classes=None,
    marker_size=None,
    cmap=None,
    ax=None,
    ax_equal=False,
    figsize=None,
    **kwargs,
):
    points, values, sizes, classes, inds, categorical = _parse_scatter_inputs(
        points, labels, sizes, classes
    )

    scatter_3d = points.shape[1] == 3

    if ax is None:
        projection = "3d" if scatter_3d else None
        fig = plt.figure()
        ax = fig.add_subplot(111, projection=projection)
    else:
        fig = ax.figure

    if cmap is None:
        cmap = "Spectral" if categorical else _DEFAULT_CONTINUOUS_COLORSCALE

    cmap = plt.get_cmap(cmap)

    if categorical:
        boundaries = np.arange(0, len(classes) + 1)
        norm = mpl.colors.BoundaryNorm(boundaries, cmap.N)
    else:
        norm = None

    if marker_size is None:
        # Choose a reasonable marker size based on number of points
        marker_size = 2.0 * (10 ** (4 - np.log10(points.shape[0])))
        marker_size = max(1, min(marker_size, 50))

    if sizes is None:
        if values is not None:
            sizes = np.full(values.shape, marker_size)
        else:
            sizes = marker_size
    else:
        # Scale sizes so that 0.5 * max(sizes) corresponds to `marker_size`
        min_marker_size = min(0.1, marker_size)
        sizeref = 0.5 * max(sizes) / marker_size
        sizes = np.maximum(sizes / sizeref, min_marker_size)

    args = [points[:, 0], points[:, 1]]
    if scatter_3d:
        args.append(points[:, 2])

    collection = ax.scatter(
        *args,
        c=values,
        s=sizes,
        cmap=cmap,
        norm=norm,
        **kwargs,
    )

    if values is not None:
        divider = make_axes_locatable(ax)
        cax = divider.append_axes(
            "right", size="5%", pad=0.1, axes_class=mpl.axes.Axes
        )

        if categorical:
            ticks = 0.5 + np.arange(0, len(classes))
            cbar = mpl.colorbar.ColorbarBase(
                cax,
                cmap=cmap,
                norm=norm,
                spacing="proportional",
                boundaries=boundaries,
                ticks=ticks,
            )
            cbar.set_ticklabels(classes)
        else:
            mappable = mpl.cm.ScalarMappable(cmap=cmap, norm=norm)
            mappable.set_array(values)
            fig.colorbar(mappable, cax=cax)

    if figsize is not None:
        fig.set_size_inches(*figsize)

    if ax_equal:
        collection.axes.axis("equal")

    return collection, inds


def _get_qualitative_colors(num_classes, colors=None):
    if colors is None:
        if num_classes == 1:
            colors = [_DEFAULT_LINE_COLOR]
        elif num_classes <= 10:
            colors = list(plt.cm.Paired.colors)  # pylint: disable=no-member
        else:
            colors = list(plt.cm.tab20.colors)  # pylint: disable=no-member

    # @todo can we blend when there are more classes than colors?
    colors = list(colors)
    return [colors[i % len(colors)] for i in range(num_classes)]


def _parse_scatter_inputs(points, labels, sizes, classes):
    if sizes is not None:
        sizes = np.asarray(sizes)

    if labels is None:
        return points, None, sizes, None, None, False

    labels = np.asarray(labels)

    if not etau.is_str(labels[0]):
        return points, labels, sizes, None, None, False

    if classes is None:
        classes = sorted(set(labels))

    values_map = {c: i for i, c in enumerate(classes)}
    values = np.array([values_map.get(l, -1) for l in labels])

    found = values >= 0
    if not np.all(found):
        points = points[found, :]
        values = values[found]
        if sizes is not None:
            sizes = sizes[found]
    else:
        found = None

    return points, values, sizes, classes, found, True


def _plot_map_background(ax, locations, api_key, map_type, show_scale_bar):
    min_lon, min_lat = locations.min(axis=0)
    max_lon, max_lat = locations.max(axis=0)

    kwargs = {}
    if api_key is not None:
        kwargs["key"] = api_key

    google_map = salem.GoogleVisibleMap(
        x=[min_lon, max_lon],
        y=[min_lat, max_lat],
        scale=2,  # 1 or 2, resolution factor
        maptype=map_type,
        **kwargs,
    )
    img = google_map.get_vardata()

    salem_map = salem.Map(google_map.grid, factor=1, countries=False)
    salem_map.set_rgb(img)
    if show_scale_bar:
        salem_map.set_scale_bar(location=(0.88, 0.94))

    salem_map.visualize(ax=ax)

    # Transform into axis coordinates
    x, y = locations[:, 0], locations[:, 1]
    x, y = salem_map.grid.transform(x, y)
    locations = np.stack((x, y), axis=1)

    return locations


def _ensure_salem():
    # pip installing `salem` does not automatically install these...
    fou.ensure_package(
        [
            "salem",
            "pyproj",
            "netCDF4",
            "xarray",
            "shapely",
            "descartes",
            "pandas",
            "motionless",
        ]
    )


salem = fou.lazy_import("salem", callback=_ensure_salem)
