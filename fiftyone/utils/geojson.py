"""
GeoJSON utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.expressions as foe
import fiftyone.core.labels as fol


def parse_point(arg):
    """Parses the point into GeoJSON dict representation.

    Args:
        point: a point specified in any of the following formats:

            -   A ``[longitude, latitude]`` list
            -   A GeoJSON dict with ``Point`` type
            -   A :class:`fiftyone.core.labels.GeoLocation` instance whose
                ``point`` attribute contains the point

    Returns:
        a GeoJSON dict of type ``Point``
    """
    orig_arg = arg
    if isinstance(arg, dict):
        arg = arg["coordinates"]

    if isinstance(arg, list):
        arg = fol.GeoLocation(point=arg)

    if isinstance(arg, fol.GeoLocation):
        return {"type": "Point", "coordinates": arg.point}

    raise ValueError("Unsupported point data: %s" % orig_arg)


def parse_polygon(arg):
    """Parses the polygon or multi-polygon into GeoJSON dict representation.

    Args:
        arg: a :class:`fiftyone.core.labels.GeoLocation`,
            :class:`fiftyone.core.labels.GeoLocations`, GeoJSON dict, or list
            of coordinates that define a ``Polygon`` or ``MultiPolygon`` to
            search within

    Returns:
        a GeoJSON dict of type ``Polygon`` or ``MultiPolygon``
    """
    orig_arg = arg
    if isinstance(arg, dict):
        arg = arg["coordinates"]

    if isinstance(arg, list):
        try:
            arg = fol.GeoLocations(polygons=arg)
        except:
            arg = fol.GeoLocation(polygon=arg)

    if isinstance(arg, fol.GeoLocation):
        return {"type": "Polygon", "coordinates": arg.polygon}

    if isinstance(arg, fol.GeoLocations):
        return {"type": "MultiPolygon", "coordinates": arg.polygons}

    raise ValueError("Unsupported polygon data: %s" % orig_arg)


def geo_within(location_field, boundary, strict=True):
    """Creates a MongoDB query expression that tests whether the given location
    field is contained within the specified boundary shape.

    Args:
        location_field: the embedded field containing GeoJSON data
        boundary: a :class:`fiftyone.core.labels.GeoLocation`,
            :class:`fiftyone.core.labels.GeoLocations`, GeoJSON dict, or
            list of coordinates that define a ``Polygon`` or
            ``MultiPolygon`` to search within
        strict (True): whether documents must exist entirely within (True)
            or intersect (False) the boundary

    Returns:
        a :class:`ViewExpression`
    """
    op = "$geoWithin" if strict else "$geoIntersects"
    boundary = parse_polygon(boundary)
    return foe.ViewExpression({location_field: {op: {"$geometry": boundary}}})


def extract_coordinates(d):
    """Extracts the coordinates from all geometries in the GeoJSON dictionary.

    The dict can have any ``type`` supported by the GeoJSON spec, including
    ``Feature``, ``FeatureCollection``, ``GeometryCollection``, and primitive
    geometries ``Point``, ``LineString``, ``Polygon``, ``MultiPoint``,
    ``MultiLineString``, or ``MultiPolygon``.

    Args:
        d: a GeoJSON dict

    Returns:
        a tuple of

        -   points: a list of ``Point`` coordinates
        -   lines: a list of ``LineString`` coordinates
        -   points: a list of ``Polygon`` coordinates
    """
    _type = d["type"]

    if _type == "FeatureCollection":
        geometries = [f["geometry"] for f in d.get("features", [])]
    elif _type == "GeometryCollection":
        geometries = d.get("geometries", [])
    elif _type == "Feature":
        geometries = [d["geometry"]]
    else:
        geometries = [d]

    return _parse_geometries(geometries)


def _parse_geometries(geometries):
    points = []
    lines = []
    polygons = []

    for d in geometries:
        _type = d["type"]
        _coords = d["coordinates"]

        if _type == "Point":
            points.append(_coords)
        elif _type == "LineString":
            lines.append(_coords)
        elif _type == "Polygon":
            polygons.append(_coords)
        elif _type == "MultiPoint":
            points.extend(_coords)
        elif _type == "MultiLineString":
            lines.extend(_coords)
        elif _type == "MultiPolygon":
            polygons.extend(_coords)

    return points, lines, polygons
