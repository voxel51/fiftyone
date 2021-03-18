"""
Base plotting utilities.

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

            -   "plotly" backend: :meth:`fiftyone.utils.plot.plotly.plot_confusion_matrix`
            -   "matplotlib" backend: :meth:`fiftyone.utils.plot.matplotlib.plot_confusion_matrix`

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

            -   "plotly" backend: :meth:`fiftyone.utils.plot.plotly.plot_pr_curve`
            -   "matplotlib" backend: :meth:`fiftyone.utils.plot.matplotlib.plot_pr_curve`

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

            -   "plotly" backend: :meth:`fiftyone.utils.plot.plotly.plot_pr_curves`
            -   "matplotlib" backend: :meth:`fiftyone.utils.plot.matplotlib.plot_pr_curves`

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

            -   "plotly" backend: :meth:`fiftyone.utils.plot.plotly.plot_roc_curve`
            -   "matplotlib" backend: :meth:`fiftyone.utils.plot.matplotlib.plot_roc_curve`

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
    field=None,
    labels=None,
    classes=None,
    backend=None,
    show=True,
    **kwargs,
):
    """Generates an interactive scatterplot of the given points.

    You can use the ``field`` or ``labels`` parameters to define a coloring for
    the points.

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
        field (None): a sample field or ``embedded.field.name`` to use to
            color the points. Can be numeric or strings
        labels (None): a list of numeric or string values to use to color
            the points
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        show (True): whether to show the plot
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.utils.plot.plotly.scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.utils.plot.matplotlib.scatterplot`

    Returns:
        one of the following:

        -   an :class:`fiftyone.utils.plot.interactive.InteractivePlot`, if
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
        field=field,
        labels=labels,
        classes=classes,
        show=show,
        **kwargs,
    )


def location_scatterplot(
    locations=None,
    location_field=None,
    samples=None,
    label_field=None,
    field=None,
    labels=None,
    classes=None,
    backend=None,
    show=True,
    **kwargs,
):
    """Generates an interactive scatterplot of the given location coordinates
    with a map rendered in the background of the plot.

    Location data can be specified either via the ``locations`` or
    ``location_field`` parameters. If you specify neither, the first
    :class:`fiftyone.core.labels.GeoLocation` field on the dataset is used.

    You can use the ``field`` or ``labels`` parameters to define a coloring for
    the points.

    You can connect this method to a :class:`fiftyone.core.session.Session`
    in order to automatically sync the session's view with the currently
    selected points in the plot. To enable this functionality, pass ``samples``
    to this method.

    Args:
        locations (None): a ``num_locations x 2`` array of
            ``(longitude, latitude)`` coordinates
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        location_field (None): the name of a
            :class:`fiftyone.core.labels.GeoLocation` field with
            ``(longitude, latitude)`` coordinates in its ``point`` attribute
        label_field (None): a :class:`fiftyone.core.labels.Label` field
            containing the labels corresponding to ``locations``. If not
            provided, the locations are assumed to correspond to samples
        field (None): a sample field or ``embedded.field.name`` to use to
            color the points. Can be numeric or strings
        labels (None): a list of numeric or string values to use to color
            the points
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        show (True): whether to show the plot
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.utils.plot.plotly.location_scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.utils.plot.matplotlib.location_scatterplot`

    Returns:
        one of the following:

        -   an :class:`fiftyone.utils.plot.interactive.InteractivePlot`, if
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
        location_field=location_field,
        samples=samples,
        label_field=label_field,
        field=field,
        labels=labels,
        classes=classes,
        show=show,
        **kwargs,
    )


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
