"""
GeoJSON utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov
from fiftyone.utils.data.exporters import GenericSampleDatasetExporter
from fiftyone.utils.data.importers import GenericSampleDatasetImporter


logger = logging.getLogger(__name__)


def load_location_data(
    samples, geojson_or_path, location_field=None, skip_missing=True
):
    """Loads geolocation data for the given samples from the given GeoJSON
    data.

    The GeoJSON data must be a ``FeatureCollection`` whose features have either
    their ``filename`` (name only) or ``filepath`` (absolute path) properties
    populated, which are used to match the provided samples.

    Example GeoJSON data::

        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [
                            -73.99496451958454,
                            40.66338032487842
                        ]
                    },
                    "properties": {
                        "filename": "b1c66a42-6f7d68ca.jpg"
                    }
                },
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [
                                -73.80992143421788,
                                40.65611832778962
                            ],
                            [
                                -74.02930609818584,
                                40.60505054722865
                            ]
                        ]
                    },
                    "properties": {
                        "filepath": "/path/to/b1c81faa-3df17267.jpg"
                    }
                },
            ]
        }

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        geojson_or_path: a GeoJSON ``FeatureCollection`` dict or the path to
            one on disk
        location_field (None): the name of the location field in which to store
            the location data, which can be either a
            :class:`fiftyone.core.labels.GeoLocation` or
            :class:`fiftyone.core.labels.GeoLocations` field. If not specified,
            then, if there is an existing
            :class:`fiftyone.core.labels.GeoLocation` field, that field is
            used, else a new "location" field is created
        skip_missing (True): whether to skip GeoJSON features with no
            ``filename`` or ``filepath`` properties (True) or raise an error
            (False)
    """
    if location_field is None:
        try:
            location_field = samples._get_geo_location_field()
        except:
            location_field = "location"
            samples._dataset.add_sample_field(
                "location",
                fof.EmbeddedDocumentField,
                embedded_doc_type=fol.GeoLocation,
            )

    fov.validate_collection_label_fields(
        samples, location_field, (fol.GeoLocation, fol.GeoLocations)
    )

    location_cls = samples._get_label_field_type(location_field)

    if etau.is_str(geojson_or_path):
        d = etas.read_json(geojson_or_path)
    else:
        d = geojson_or_path

    _ensure_type(d, "FeatureCollection")

    geometries = {}
    for feature in d.get("features", []):
        properties = feature["properties"]
        if "filepath" in properties:
            key = properties["filepath"]
        elif "filename" in properties:
            key = properties["filename"]
        elif not skip_missing:
            raise ValueError(
                "Found feature with no `filename` or `filepath` property"
            )
        else:
            continue

        geometries[key] = feature["geometry"]

    lookup = {}
    for _id, filepath in zip(samples.values("id"), samples.values("filepath")):
        filename = os.path.basename(filepath)
        lookup[filepath] = _id
        lookup[filename] = _id

    found_keys = set(lookup.keys()) & set(geometries.keys())

    if not found_keys:
        logger.info("No matching location data found")
        return

    logger.info("Loading location data for %d samples...", len(found_keys))
    _samples = samples.select_fields(location_field)
    with fou.ProgressBar() as pb:
        for key in pb(found_keys):
            sample_id = lookup[key]
            geometry = geometries[key]
            sample = _samples[sample_id]
            sample[location_field] = location_cls.from_geo_json(geometry)
            sample.save()


def to_geo_json_geometry(label):
    """Returns a GeoJSON ``geometry`` dict representation for the given
    location.

    Args:
        label: a :class:`fiftyone.core.labels.GeoLocation` o
            :class:`fiftyone.core.labels.GeoLocations` instance

    Returns:
        a GeoJSON dict
    """
    if isinstance(label, fol.GeoLocations):
        return _to_multi_geo_collection(label)

    if not isinstance(label, fol.GeoLocation):
        return None

    num_shapes = (
        int(label.point is not None)
        + int(label.line is not None)
        + int(label.polygon is not None)
    )

    if num_shapes == 0:
        return None

    if num_shapes == 1:
        return _to_geo_primitive(label)

    return _to_geo_collection(label)


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
        a MongoDB query dict
    """
    op = "$geoWithin" if strict else "$geoIntersects"
    boundary = parse_polygon(boundary)
    return {location_field: {op: {"$geometry": boundary}}}


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


class GeoJSONImageDatasetImporter(GenericSampleDatasetImporter):
    """Importer for image datasets whose labels and location data are stored in
    GeoJSON format.

    See :class:`fiftyone.types.dataset_types.GeoJSONImageDataset` for format
    details.

    Args:
        dataset_dir: the dataset directory
        location_field ("location"): the name of the field in which to store
            the location data
        multi_location (False): whether this GeoJSON may contain multiple
            shapes for each sample and thus its location data should be stored
            in a :class:`fiftyone.core.labels.GeoLocations` field rather than
            the default :class:`fiftyone.core.labels.GeoLocation` field
        property_parsers (None): an optional dict mapping property names to
            functions that parse the property values (e.g., into the
            appropriate) :class:`fiftyone.core.labels.Label` types). By
            default, all properies are stored as primitive field values
        skip_unlabeled (False): whether to skip unlabeled images when importing
        skip_missing_media (False): whether to skip features with no
            ``filename`` or ``filepath`` property
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        location_field="location",
        multi_location=False,
        property_parsers=None,
        skip_unlabeled=False,
        skip_missing_media=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir, shuffle=shuffle, seed=seed, max_samples=max_samples
        )
        self.location_field = location_field
        self.multi_location = multi_location
        self.property_parsers = property_parsers
        self.skip_unlabeled = skip_unlabeled
        self.skip_missing_media = skip_missing_media
        self._data_dir = None
        self._features_map = None
        self._filepaths = None
        self._iter_filepaths = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filepaths = iter(self._filepaths)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        filepath = next(self._iter_filepaths)

        feature = self._features_map.get(filepath, None)
        if feature is None:
            return fos.Sample(filepath=filepath)

        properties = feature.get("properties", {})

        fields = {}
        if self.property_parsers:
            for key, value in properties.items():
                fields[key] = self.property_parsers[key](value)
        else:
            fields.update(properties)

        if self.multi_location:
            location = fol.GeoLocations.from_geo_json(feature)
        else:
            location = fol.GeoLocation.from_geo_json(feature)

        fields[self.location_field] = location

        return fos.Sample(filepath=filepath, **fields)

    @property
    def has_sample_field_schema(self):
        return False

    @property
    def has_dataset_info(self):
        return False

    def setup(self):
        self._data_dir = os.path.join(self.dataset_dir, "data")
        json_path = os.path.join(self.dataset_dir, "labels.json")

        geojson = etas.load_json(json_path)
        _ensure_type(geojson, "FeatureCollection")

        features_map = {}
        for feature in geojson.get("features", []):
            properties = feature["properties"]
            if "filepath" in properties:
                filepath = properties.pop("filepath")
            elif "filename" in properties:
                filepath = os.path.join(
                    self._data_dir, properties.pop("filename")
                )
            elif self.skip_missing_media:
                continue
            else:
                raise ValueError(
                    "Found feature with no ``filepath`` or ``filename`` "
                    "property"
                )

            features_map[filepath] = feature

        filepaths = set(features_map.keys())
        if not self.skip_unlabeled and os.path.isdir(self._data_dir):
            filepaths.update(etau.list_files(self._data_dir, abs_paths=True))

        self._features_map = features_map
        self._filepaths = self._preprocess_list(list(filepaths))
        self._num_samples = len(self._filepaths)


class GeoJSONImageDatasetExporter(GenericSampleDatasetExporter):
    """Exporter for image datasets whose labels and location data are stored in
    GeoJSON format.

    See :class:`fiftyone.types.dataset_types.GeoJSONImageDataset` for format
    details.

    Args:
        export_dir: the directory to write the export
        location_field (None): the name of the field containing the location
            data for each sample. Can be any of the following:

            -   The name of a :class:`fiftyone.core.fields.GeoLocation` field
            -   The name of a :class:`fiftyone.core.fields.GeoLocations` field
            -   ``None``, in which case there must be a single
                :class:`fiftyone.core.fields.GeoLocation` field on the samples,
                which is used by default

        property_makers (None): an optional dict mapping sample field names to
            functions that convert the field values to property values to be
            stored in the ``properties`` field of the GeoJSON ``Feature`` for
            the sample. By default, no properties are written
        omit_none_fields (True): whether to omit ``None``-valued Sample fields
            from the output properties
        copy_media (True): whether to copy the source media into the export
            directory (True) or simply embed the input filepaths in the output
            JSON (False)
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir,
        location_field=None,
        property_makers=None,
        omit_none_fields=True,
        copy_media=True,
        pretty_print=False,
    ):
        super().__init__(export_dir)
        self.location_field = location_field
        self.property_makers = property_makers
        self.omit_none_fields = omit_none_fields
        self.copy_media = copy_media
        self.pretty_print = pretty_print
        self._data_dir = None
        self._labels_path = None
        self._features = []
        self._location_field = None
        self._filename_maker = None

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_path = os.path.join(self.export_dir, "labels.json")
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir
        )

    def log_collection(self, sample_collection):
        if self.location_field is None:
            self.location_field = sample_collection._get_geo_location_field()

    def export_sample(self, sample):
        properties = {}

        if self.property_makers:
            for key, fn in self.property_makers.items():
                value = sample[key]
                if value is not None or not self.omit_none_fields:
                    properties[key] = fn(value)

        if self.copy_media:
            out_filepath = self._filename_maker.get_output_path(
                sample.filepath
            )
            etau.copy_file(sample.filepath, out_filepath)
            properties["filename"] = os.path.basename(out_filepath)
        else:
            properties["filepath"] = sample.filepath

        location = sample[self.location_field]
        if location is not None:
            geometry = location.to_geo_json()
        else:
            geometry = None

        self._features.append(
            {"type": "Feature", "geometry": geometry, "properties": properties}
        )

    def close(self, *args):
        features = {"type": "FeatureCollection", "features": self._features}
        etas.write_json(
            features, self._labels_path, pretty_print=self.pretty_print
        )


def _to_geo_primitive(label):
    if label.point is not None:
        return _make_geometry("Point", label.point)

    if label.line is not None:
        return _make_geometry("LineString", label.line)

    if label.polygon is not None:
        return _make_geometry("Polygon", label.polygon)

    return None


def _to_geo_collection(label):
    geometries = []

    if label.point is not None:
        geometries.append(_make_geometry("Point", label.point))

    if label.line is not None:
        geometries.append(_make_geometry("LineString", label.line))

    if label.polygon is not None:
        geometries.append(_make_geometry("Polygon", label.polygon))

    return {"type": "GeometryCollection", "geometries": geometries}


def _to_multi_geo_collection(label):
    geometries = []

    if label.points is not None:
        geometries.append(_make_geometry("MultiPoint", label.points))

    if label.lines is not None:
        geometries.append(_make_geometry("MultiLineString", label.lines))

    if label.polygons is not None:
        geometries.append(_make_geometry("MultiPolygon", label.polygons))

    return {"type": "GeometryCollection", "geometries": geometries}


def _make_geometry(type_, coordinates):
    return {"type": type_, "coordinates": coordinates}


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


def _ensure_type(d, type_):
    _type = d.get("type", "")
    if _type != type_:
        raise ValueError(
            "Unsupported GeoJSON type '%s'; must be '%s'" % (_type, type_)
        )
