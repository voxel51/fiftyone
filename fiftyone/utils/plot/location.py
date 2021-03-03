"""
Location utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np
import matplotlib
import matplotlib.pyplot as plt

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.utils as fou

from .scatter import scatterplot


def location_scatterplot(
    locations,
    ax=None,
    map_type="satellite",
    show_scale_bar=False,
    api_key=None,
    **kwargs,
):
    """Generates an interactive scatterplot of the given location coordinates.

    This method is a thin layer on top of
    :meth:`fiftyone.utils.plot.scatter.scatterplot` that renders a background
    image using Google Maps and performs the necessary coordinate
    transformations so that the locations can be visualized.

    See :meth:`fiftyone.utils.plot.scatter.scatterplot` for more usage details.

    Args:
        locations: a ``num_samples x 2`` array of ``(longitude, latitude)``
            coordinates
        ax (None): an optional matplotlib axis to plot in
        map_type ("satellite"): the map type to render. Supported values are
            ``("roadmap", "satellite", "hybrid", "terrain")``
        show_scale_bar (False): whether to render a scale bar on the plot
        api_key (None): a Google Maps API key to use
        **kwargs: keyword arguments for
            :meth:`fiftyone.utils.plot.scatter.scatterplot`

    Returns:
        a :class:`fiftyone.utils.plot.selector.PointSelector`
    """
    if ax is None:
        fig = plt.figure()
        ax = fig.add_subplot(111)
    else:
        fig = ax.figure

    locations = np.asarray(locations)

    locations = _plot_map_background(
        ax, locations, api_key, map_type, show_scale_bar
    )

    def _onclick(event):
        for child in ax.get_children():
            if isinstance(child, matplotlib.image.AxesImage):
                child.set_visible(not child.get_visible())

        ax.figure.canvas.draw_idle()

    buttons = {"map": _onclick}

    return scatterplot(locations, ax=ax, buttons=buttons, **kwargs)


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
