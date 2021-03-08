"""
Location utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np
import matplotlib
import matplotlib.pyplot as plt

import eta.core.utils as etau

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou

from .scatter import scatterplot
from .utils import load_button_icon


def location_scatterplot(
    locations=None,
    samples=None,
    location_field=None,
    map_type="satellite",
    show_scale_bar=False,
    api_key=None,
    label_field=None,
    field=None,
    labels=None,
    classes=None,
    session=None,
    marker_size=None,
    cmap=None,
    ax=None,
    ax_equal=False,
    figsize=None,
    style="seaborn-ticks",
    buttons=None,
    block=False,
    **kwargs,
):
    """Generates an interactive scatterplot of the given location coordinates.

    The location data to use can be specified either via the ``locations`` or
    ``location_field`` parameters.

    This method is a thin layer on top of
    :meth:`fiftyone.utils.plot.scatter.scatterplot` that renders a background
    image using Google Maps and performs the necessary coordinate
    transformations to correctly render a geo-location scatterplot.

    See :meth:`fiftyone.utils.plot.scatter.scatterplot` for more usage details.

    Args:
        locations (None): a ``num_samples x 2`` array of
            ``(longitude, latitude)`` coordinates
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            whose data is being visualized
        location_field (None): the name of a
            :class:`fiftyone.core.labels.GeoLocation` field with
            ``(longitude, latitude)`` coordinates in its ``point`` attribute
        map_type ("satellite"): the map type to render. Supported values are
            ``("roadmap", "satellite", "hybrid", "terrain")``
        show_scale_bar (False): whether to render a scale bar on the plot
        api_key (None): a Google Maps API key to use
        label_field (None): a :class:`fiftyone.core.labels.Label` field
            containing labels for each location
        field (None): a sample field or ``embedded.field.name`` to use to
            color the points. Can be numeric or strings
        labels (None): a list of numeric or string values to use to color
            the points
        classes (None): an optional list of classes whose points to plot.
            Only applicable when ``labels`` contains strings
        session (None): a :class:`fiftyone.core.session.Session` object to
            link with the interactive plot
        marker_size (None): the marker size to use
        cmap (None): a colormap recognized by ``matplotlib``
        ax (None): an optional matplotlib axis to plot in
        ax_equal (False): whether to set ``axis("equal")``
        figsize (None): an optional ``(width, height)`` for the figure, in
            inches
        style ("seaborn-ticks"): a style to use for the plot
        buttons (None): a list of ``(label, icon_image, callback)`` tuples
            defining buttons to add to the plot
        block (False): whether to block execution when the plot is
            displayed via ``matplotlib.pyplot.show(block=block)``
        **kwargs: optional keyword arguments for matplotlib's ``scatter()``

    Returns:
        a :class:`fiftyone.utils.plot.selector.PointSelector`
    """
    if ax is None:
        fig = plt.figure()
        ax = fig.add_subplot(111)
    else:
        fig = ax.figure

    if location_field is not None:
        if samples is None:
            raise ValueError(
                "You must provide `samples` in order to extract location "
                "coordinates from a field"
            )

        samples.validate_field_type(
            location_field,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.GeoLocation,
        )

        locations = samples.values(location_field + ".point.coordinates")
    elif locations is None:
        raise ValueError(
            "You must provide either ``locations`` or ``location_field``"
        )

    locations = np.asarray(locations)

    locations = _plot_map_background(
        ax, locations, api_key, map_type, show_scale_bar
    )

    def _onclick(event):
        for child in ax.get_children():
            if isinstance(child, matplotlib.image.AxesImage):
                child.set_visible(not child.get_visible())

        ax.figure.canvas.draw_idle()

    if buttons is None:
        buttons = []

    map_icon = load_button_icon("map")
    buttons.append(("map", map_icon, _onclick))

    return scatterplot(
        locations,
        samples=samples,
        label_field=label_field,
        field=field,
        labels=labels,
        classes=classes,
        session=session,
        marker_size=marker_size,
        cmap=cmap,
        ax=ax,
        ax_equal=ax_equal,
        figsize=figsize,
        style=style,
        buttons=buttons,
        block=block,
        **kwargs,
    )


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
    required_packages = [
        "salem",
        "pyproj",
        "netCDF4",
        "xarray",
        "shapely",
        "descartes",
        "pandas",
        "motionless",
    ]

    missing_packages = []
    for pkg in required_packages:
        try:
            etau.ensure_package(pkg)
        except:
            missing_packages.append(pkg)

    if missing_packages:
        raise ImportError(
            "The requested operation requires that the following packages are "
            "installed on your machine: %s" % (tuple(missing_packages),)
        )


salem = fou.lazy_import("salem", callback=_ensure_salem)
