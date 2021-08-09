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
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


def load_location_data(
    samples, geojson_or_path, location_field=None, skip_missing=True
):
    """Loads geolocation data for the given samples from the given GeoJSON
    data.

    The GeoJSON data must be a ``FeatureCollection`` whose features have their
    ``filename`` properties populated, which are used to match the provided
    samples.

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
                        "filename": "/path/to/b1c81faa-3df17267.jpg"
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
            ``filename`` properties (True) or raise an error (False)
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
        if "filename" in properties:
            key = properties["filename"]
        elif not skip_missing:
            raise ValueError("Found feature with no `filename` property")
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


class GeoJSONDatasetImporter(
    foud.GenericSampleDatasetImporter, foud.ImportPathsMixin
):
    """Importer for image or video datasets whose location data and labels are
    stored in GeoJSON format.

    See :ref:`this page <GeoJSONDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.json``
        location_field ("location"): the name of the field in which to store
            the location data
        multi_location (False): whether this GeoJSON may contain multiple
            shapes for each sample and thus its location data should be stored
            in a :class:`fiftyone.core.labels.GeoLocations` field rather than
            the default :class:`fiftyone.core.labels.GeoLocation` field
        property_parsers (None): an optional dict mapping property names to
            functions that parse the property values (e.g., into the
            appropriate) :class:`fiftyone.core.labels.Label` types). By
            default, all properties are stored as primitive field values
        skip_missing_media (False): whether to skip (True) or raise an error
            (False) when features with no ``filename`` property are encountered
        include_all_data (False): whether to generate samples for all media in
            the data directory (True) rather than only creating samples for
            media with label entries (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        location_field="location",
        multi_location=False,
        property_parsers=None,
        skip_missing_media=False,
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        data_path = self._parse_data_path(
            dataset_dir=dataset_dir, data_path=data_path, default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.location_field = location_field
        self.multi_location = multi_location
        self.property_parsers = property_parsers
        self.skip_missing_media = skip_missing_media
        self.include_all_data = include_all_data

        self._media_paths_map = None
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
                if key in self.property_parsers:
                    fields[key] = self.property_parsers[key](value)
        else:
            fields.update(properties)

        if not feature.get("geometry", None):
            location = None
        elif self.multi_location:
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
        self._media_paths_map = self._load_data_map(
            self.data_path, recursive=True
        )

        features_map = {}

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            geojson = etas.load_json(self.labels_path)
            _ensure_type(geojson, "FeatureCollection")

            for feature in geojson.get("features", []):
                properties = feature["properties"]
                if "filename" in properties:
                    filename = properties.pop("filename")
                    if os.path.isabs(filename):
                        filepath = filename
                    else:
                        filepath = self._media_paths_map.get(filename, None)

                    if filepath is None:
                        if self.skip_missing_media:
                            continue

                        raise ValueError(
                            "Could not locate media for feature with "
                            "filename=%s" % filename
                        )

                elif self.skip_missing_media:
                    continue
                else:
                    raise ValueError(
                        "Found feature with no `filename` property"
                    )

                features_map[filepath] = feature

        filepaths = set(features_map.keys())

        if self.include_all_data:
            filepaths.update(self._media_paths_map.values())

        self._features_map = features_map
        self._filepaths = self._preprocess_list(sorted(filepaths))
        self._num_samples = len(self._filepaths)


class GeoJSONDatasetExporter(
    foud.GenericSampleDatasetExporter, foud.ExportPathsMixin
):
    """Exporter for image or video datasets whose location data and labels are
    stored in GeoJSON format.

    See :ref:`this page <GeoJSONDataset-export>` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a filename like ``"labels.json"`` specifying the location in
                ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
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
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        image_format=None,
        location_field=None,
        property_makers=None,
        omit_none_fields=True,
        pretty_print=False,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.image_format = image_format
        self.location_field = location_field
        self.property_makers = property_makers
        self.omit_none_fields = omit_none_fields
        self.pretty_print = pretty_print

        self._features = []
        self._location_field = None
        self._media_exporter = None

    def setup(self):
        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            default_ext=self.image_format,
        )
        self._media_exporter.setup()

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

        _, uuid = self._media_exporter.export(sample.filepath)

        properties["filename"] = uuid

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
            features, self.labels_path, pretty_print=self.pretty_print
        )
        self._media_exporter.close()


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
