"""
Base plotting utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.context as foc


def location_scatterplot(
    locations=None,
    location_field=None,
    samples=None,
    session=None,
    label_field=None,
    field=None,
    labels=None,
    classes=None,
    backend=None,
    **kwargs,
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
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        session (None): a :class:`fiftyone.core.session.Session` object to
            link with the interactive plot
        location_field (None): the name of a
            :class:`fiftyone.core.labels.GeoLocation` field with
            ``(longitude, latitude)`` coordinates in its ``point`` attribute
        label_field (None): a :class:`fiftyone.core.labels.Label` field
            containing labels for each location
        field (None): a sample field or ``embedded.field.name`` to use to
            color the points. Can be numeric or strings
        labels (None): a list of numeric or string values to use to color
            the points
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.utils.plot.plotly.location_scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.utils.plot.matplotlib.location_scatterplot`

    Returns:
        one of the following:

        -   a :class:`fiftyone.utils.plot.interactive.SessionPlot`, if a
            ``session`` is provided
        -   an :class:`fiftyone.utils.plot.interactive.InteractivePlot`, if a
            ``session`` is not provided
    """
    backend = _parse_backend(session, backend)

    if backend == "matplotlib":
        from .matplotlib import location_scatterplot as _location_scatterplot
    else:
        from .plotly import location_scatterplot as _location_scatterplot

    return _location_scatterplot(
        locations=locations,
        location_field=location_field,
        samples=samples,
        session=session,
        label_field=label_field,
        field=field,
        labels=labels,
        classes=classes,
        **kwargs,
    )


def scatterplot(
    points,
    samples=None,
    session=None,
    label_field=None,
    field=None,
    labels=None,
    classes=None,
    backend=None,
    **kwargs,
):
    """Generates an interactive scatterplot of the given points.

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
        backend (None): the plotting backend to use. Supported values are
            ``("plotly", "matplotlib")``. If no backend is specified, the best
            applicable backend is chosen
        **kwargs: keyword arguments for the backend plotting method:

            -   "plotly" backend: :meth:`fiftyone.utils.plot.plotly.scatterplot`
            -   "matplotlib" backend: :meth:`fiftyone.utils.plot.matplotlib.scatterplot`

    Returns:
        one of the following:

        -   a :class:`fiftyone.utils.plot.interactive.SessionPlot`, if a
            ``session`` is provided
        -   an :class:`fiftyone.utils.plot.interactive.InteractivePlot`, if a
            ``session`` is not provided
        -   ``None`` for 3D points
    """
    backend = _parse_backend(session, backend)

    if backend == "matplotlib":
        from .matplotlib import scatterplot as _scatterplot
    else:
        from .plotly import scatterplot as _scatterplot

    return _scatterplot(
        points,
        samples=samples,
        session=session,
        label_field=label_field,
        field=field,
        labels=labels,
        classes=classes,
        **kwargs,
    )


def _parse_backend(session, backend):
    if backend is None:
        backend = _default_backend(session)

    available_backends = ("matplotlib", "plotly")
    if backend not in available_backends:
        raise ValueError(
            "Unsupported plotting backend '%s'; supported values are %s"
            % backend,
            available_backends,
        )

    return backend


def _default_backend(session):
    if session is not None and not foc.is_notebook_context():
        # plotly backend does not yet support interactive plots in non-notebook
        # contexts
        return "matplotlib"

    return "plotly"
