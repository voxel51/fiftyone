"""
Scatterplot utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging

import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
from mpl_toolkits.axes_grid1 import make_axes_locatable
from mpl_toolkits.mplot3d import Axes3D  # pylint: disable=unused-import

import eta.core.utils as etau

import fiftyone.core.labels as fol
from fiftyone.core.view import DatasetView

from .selector import PointSelector


logger = logging.getLogger(__name__)


def scatterplot(
    points,
    samples=None,
    label_field=None,
    field=None,
    labels=None,
    classes=None,
    session=None,
    buttons=None,
    marker_size=None,
    cmap=None,
    ax=None,
    ax_equal=False,
    figsize=None,
    style="seaborn-ticks",
    block=False,
    **kwargs,
):
    """Generates an interactive scatterplot of the given points.

    This method supports 2D or 3D visualizations, but interactive point
    selection is only aviailable in 2D.

    The currently selected points are given a visually distinctive style, and
    you can modify your selection by either clicking on individual points or
    drawing a lasso around new points.

    When the shift key is pressed, new selections are added to the selected
    set, or subtracted if the new selection is a subset of the current
    selection.

    If you provide a ``samples`` object, then you can access the IDs of the
    samples/labels corresponding to the points via the returned
    :class:`fiftyone.utils.plot.selector.PointSelector` object. If you specify
    a ``label_field``, then ``points`` are assumed to correspond to the labels
    in this field. Otherwise, ``points`` are assumed to correspond to the
    samples themselves.

    In addition, you can provide a ``session`` object to link the currently
    selected points to a FiftyOne App instance:

    -   Sample selection: If no ``label_field`` is provided, then when points
        are selected, a view containing the corresponding samples will be
        loaded in the App

    -   Label selection: If ``label_field`` is provided, then when points are
        selected, a view containing the corresponding labels in
        ``label_field`` will be loaded in the App

    The ``field``, ``labels``, and ``classes`` parameters allow you to define
    a coloring for the points.

    Args:
        points: a ``num_points x num_dims`` array of points
        samples: the :class:`fiftyone.core.collections.SampleCollection` whose
            data is being visualized
        label_field (None): a :class:`fiftyone.core.labels.Label` field
            containing the labels corresponding to ``points``
        field (None): a sample field or ``embedded.field.name`` to use to
            color the points. Can be numeric or strings
        labels (None): a list of numeric or string values to use to color
            the points
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        session (None): a :class:`fiftyone.core.session.Session` object to
            link with the interactive plot
        buttons (None): a dict mapping button names to callbacks defining
            buttons to add to the plot
        marker_size (None): the marker size to use
        cmap (None): a colormap recognized by ``matplotlib``
        ax (None): an optional matplotlib axis to plot in
        ax_equal (False): whether to set ``axis("equal")``
        figsize (None): an optional ``(width, height)`` for the figure, in
            inches
        style ("seaborn-ticks"): a style to use for the plot
        block (False): whether to block execution when the plot is
            displayed via ``matplotlib.pyplot.show(block=block)``
        **kwargs: optional keyword arguments for matplotlib's ``scatter()``

    Returns:
        a :class:`fiftyone.utils.plot.selector.PointSelector`
    """
    points = np.asarray(points)
    num_dims = points.shape[1]

    if num_dims not in {2, 3}:
        raise ValueError("This method only supports 2D or 3D points")

    if session is not None:
        if samples is None:
            raise ValueError(
                "You must provide `samples` in order to link to a session"
            )

        if num_dims != 2:
            logger.warning("Interactive selection is only supported in 2D")

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

    with plt.style.context(style):
        collection, inds = _plot_scatter(
            points,
            labels=labels,
            classes=classes,
            marker_size=marker_size,
            cmap=cmap,
            ax=ax,
            figsize=figsize,
            **kwargs,
        )

    if num_dims != 2:
        if ax_equal:
            collection.axes.axis("equal")

        plt.tight_layout()
        plt.show(block=block)
        return None

    sample_ids = None
    label_ids = None
    if samples is not None:
        if label_field is not None:
            label_ids = _get_label_ids(samples, label_field)
            if len(label_ids) != len(points):
                raise ValueError(
                    "Number of label IDs (%d) does not match number of "
                    "points (%d). You may have missing data/labels that you "
                    "need to omit from your view before visualizing"
                    % (len(label_ids), len(points))
                )

            if inds is not None:
                label_ids = label_ids[inds]
        else:
            sample_ids = _get_sample_ids(samples)
            if len(sample_ids) != len(points):
                raise ValueError(
                    "Number of sample IDs (%d) does not match number of "
                    "points (%d). You may have missing data/labels that you "
                    "need to omit from your view before visualizing"
                    % (len(sample_ids), len(points))
                )

            if inds is not None:
                sample_ids = sample_ids[inds]

    if session is not None:
        if isinstance(samples, DatasetView):
            session.view = samples
        else:
            session.dataset = samples

    with plt.style.context(style):
        selector = PointSelector(
            collection,
            session=session,
            sample_ids=sample_ids,
            label_ids=label_ids,
            label_field=label_field,
            buttons=buttons,
        )

    if ax_equal:
        selector.ax.axis("equal")

    plt.show(block=block)

    return selector


def _plot_scatter(
    points,
    labels=None,
    classes=None,
    marker_size=None,
    cmap=None,
    ax=None,
    figsize=None,
    **kwargs,
):
    if labels is not None:
        points, values, classes, inds, categorical = _parse_data(
            points, labels, classes
        )
    else:
        values, classes, inds, categorical = None, None, None, None

    scatter_3d = points.shape[1] == 3

    if ax is None:
        projection = "3d" if scatter_3d else None
        fig = plt.figure()
        ax = fig.add_subplot(111, projection=projection)
    else:
        fig = ax.figure

    if cmap is None:
        cmap = "Spectral" if categorical else "viridis"

    cmap = plt.get_cmap(cmap)

    if categorical:
        boundaries = np.arange(0, len(classes) + 1)
        norm = mpl.colors.BoundaryNorm(boundaries, cmap.N)
    else:
        norm = None

    if marker_size is None:
        marker_size = 10 ** (4 - np.log10(points.shape[0]))
        marker_size = max(0.1, min(marker_size, 25))
        marker_size = round(marker_size, 0 if marker_size >= 1 else 1)

    args = [points[:, 0], points[:, 1]]
    if scatter_3d:
        args.append(points[:, 2])

    collection = ax.scatter(
        *args, c=values, s=marker_size, cmap=cmap, norm=norm, **kwargs,
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

    return collection, inds


def _parse_data(points, labels, classes):
    if not labels:
        return points, None, None, None, False

    if not etau.is_str(labels[0]):
        return points, labels, None, None, False

    if classes is None:
        classes = sorted(set(labels))

    values_map = {c: i for i, c in enumerate(classes)}
    values = np.array([values_map.get(l, -1) for l in labels])

    found = values >= 0
    if not np.all(found):
        points = points[found, :]
        values = values[found]
    else:
        found = None

    return points, values, classes, found, True


def _get_sample_ids(samples):
    return np.array([str(_id) for _id in samples._get_sample_ids()])


def _get_label_ids(samples, label_field):
    label_type, id_path = samples._get_label_field_path(label_field, "_id")

    label_ids = samples.values(id_path)
    if issubclass(label_type, fol._LABEL_LIST_FIELDS):
        label_ids = itertools.chain.from_iterable(label_ids)

    return np.array([str(_id) for _id in label_ids])
