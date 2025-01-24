"""
Utilities for working with datasets in
`Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import logging
import os
import warnings

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.storage as fos
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class BDDDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for BDD datasets stored on disk.

    See :ref:`this page <BDDDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
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
            -   a dict mapping filenames to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.json``
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with label entries (False)
        extra_attrs (True): whether to load extra annotation attributes onto
            the imported labels. Supported values are:

            -   ``True``: load all extra attributes found
            -   ``False``: do not load extra attributes
            -   a name or list of names of specific attributes to load
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
        include_all_data=False,
        extra_attrs=True,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
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
        self.include_all_data = include_all_data
        self.extra_attrs = extra_attrs

        self._image_paths_map = None
        self._anno_dict_map = None
        self._filenames = None
        self._iter_filenames = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        filename = next(self._iter_filenames)

        if os.path.isabs(filename):
            image_path = filename
        else:
            image_path = self._image_paths_map[filename]

        image_metadata = fom.ImageMetadata.build_for(image_path)

        anno_dict = self._anno_dict_map.get(filename, None)
        if anno_dict is not None:
            # Labeled image
            frame_size = (image_metadata.width, image_metadata.height)
            label = _parse_bdd_annotation(
                anno_dict, frame_size, self.extra_attrs
            )
        else:
            # Unlabeled image
            label = None

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return {
            "attributes": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
        }

    def setup(self):
        image_paths_map = self._load_data_map(self.data_path, recursive=True)

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            anno_dict_map = load_bdd_annotations(self.labels_path)
            anno_dict_map = {
                fos.normpath(k): v for k, v in anno_dict_map.items()
            }
        else:
            anno_dict_map = {}

        filenames = set(anno_dict_map.keys())

        if self.include_all_data:
            filenames.update(image_paths_map.keys())

        filenames = self._preprocess_list(sorted(filenames))

        self._image_paths_map = image_paths_map
        self._anno_dict_map = anno_dict_map
        self._filenames = filenames
        self._num_samples = len(filenames)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        return len(etau.list_files(os.path.join(dataset_dir, "data")))


class BDDDatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes BDD datasets to disk.

    See :ref:`this page <BDDDataset-export>` for format details.

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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported image. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        abs_paths (False): whether to store absolute paths to the images in the
            exported labels
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        extra_attrs (True): whether to include extra object attributes in the
            exported labels. Supported values are:

            -   ``True``: export all extra attributes found
            -   ``False``: do not export extra attributes
            -   a name or list of names of specific attributes to export
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        rel_dir=None,
        abs_paths=False,
        image_format=None,
        extra_attrs=True,
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
        self.rel_dir = rel_dir
        self.abs_paths = abs_paths
        self.image_format = image_format
        self.extra_attrs = extra_attrs

        self._annotations = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return {
            "attributes": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
        }

    def setup(self):
        self._annotations = []
        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            rel_dir=self.rel_dir,
            default_ext=self.image_format,
        )
        self._media_exporter.setup()

    def export_sample(self, image_or_path, labels, metadata=None):
        out_image_path, uuid = self._media_exporter.export(image_or_path)

        if labels is None:
            return  # unlabeled

        if not isinstance(labels, dict):
            labels = {"labels": labels}

        if all(v is None for v in labels.values()):
            return  # unlabeled

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(image_or_path)

        if self.abs_paths:
            name = out_image_path
        else:
            name = uuid

        annotation = _make_bdd_annotation(
            labels, metadata, name, self.extra_attrs
        )
        self._annotations.append(annotation)

    def close(self, *args):
        etas.write_json(self._annotations, self.labels_path)
        self._media_exporter.close()


def load_bdd_annotations(json_path):
    """Loads the BDD annotations from the given JSON file.

    See :ref:`this page <BDDDataset-import>` for format details.

    Args:
        json_path: the path to the annotations JSON file

    Returns:
        a dict mapping filenames to BDD annotation dicts
    """
    annotations = etas.load_json(json_path)
    return {d["name"]: d for d in annotations}


def parse_bdd100k_dataset(
    source_dir, dataset_dir, copy_files=True, overwrite=False
):
    """Parses the raw BDD100K download files in the specified directory into
    per-split directories in BDD format.

    This function assumes that the input ``source_dir`` contains the following
    contents::

        source_dir/
            labels/
                bdd100k_labels_images_train.json
                bdd100k_labels_images_val.json
            images/
                100k/
                    train/
                    test/
                    val/
            ...

    and will populate ``dataset_dir`` as follows::

        dataset_dir/
            train/
                data/
                labels.json
            validation/
                data/
                labels.json
            test/
                data/

    Args:
        source_dir: the source directory containing the manually downloaded
            BDD100K files
        dataset_dir: the directory to construct the output split directories
        copy_files (True): whether to move (False) or create copies (True) of
            the source files when populating ``dataset_dir``
        overwrite (False): whether to overwrite existing files/directories in
            the output location, if they exist

    Raises:
        OSError: if any required source files are not present
    """
    put_dir = etau.copy_dir if copy_files else etau.move_dir
    put_file = etau.copy_file if copy_files else etau.move_file

    _ensure_bdd100k_dir(source_dir)

    # Train images
    logger.info("Preparing training images...")
    in_train_data_dir = os.path.join(source_dir, "images", "100k", "train")
    out_train_data_dir = os.path.join(dataset_dir, "train", "data")
    if overwrite or not os.path.isdir(out_train_data_dir):
        _ensure_bdd100k_subdir(source_dir, in_train_data_dir)
        put_dir(in_train_data_dir, out_train_data_dir)

    # Train labels
    logger.info("Preparing training labels...")
    in_train_labels_path = os.path.join(
        source_dir, "labels", "bdd100k_labels_images_train.json"
    )
    out_train_labels_path = os.path.join(dataset_dir, "train", "labels.json")
    if overwrite or not os.path.isfile(out_train_labels_path):
        _ensure_bdd100k_file(source_dir, in_train_labels_path)
        put_file(in_train_labels_path, out_train_labels_path)

    # Validation images
    logger.info("Preparing validation images...")
    in_val_data_dir = os.path.join(source_dir, "images", "100k", "val")
    out_val_data_dir = os.path.join(dataset_dir, "validation", "data")
    if overwrite or not os.path.isdir(out_val_data_dir):
        _ensure_bdd100k_subdir(source_dir, in_val_data_dir)
        put_dir(in_val_data_dir, out_val_data_dir)

    # Validation labels
    logger.info("Preparing validation labels...")
    in_val_labels_path = os.path.join(
        source_dir, "labels", "bdd100k_labels_images_val.json"
    )
    out_val_labels_path = os.path.join(
        dataset_dir, "validation", "labels.json"
    )
    if overwrite or not os.path.isfile(out_val_labels_path):
        _ensure_bdd100k_file(source_dir, in_val_labels_path)
        put_file(in_val_labels_path, out_val_labels_path)

    # Test images
    logger.info("Preparing test images...")
    in_test_data_dir = os.path.join(source_dir, "images", "100k", "test")
    out_test_data_dir = os.path.join(dataset_dir, "test", "data")
    if overwrite or not os.path.isdir(out_test_data_dir):
        _ensure_bdd100k_subdir(source_dir, in_test_data_dir)
        put_dir(in_test_data_dir, out_test_data_dir)


def _ensure_bdd100k_dir(source_dir):
    if source_dir is None:
        _raise_bdd100k_error(
            "You must provide a `source_dir` in order to load the BDD100K "
            "dataset."
        )

    if not os.path.isdir(source_dir):
        _raise_bdd100k_error(
            "Source directory '%s' does not exist." % source_dir
        )


def _ensure_bdd100k_subdir(source_dir, dirpath):
    if not os.path.isdir(dirpath):
        relpath = os.path.relpath(dirpath, source_dir)
        _raise_bdd100k_error(
            "Directory '%s' not found within '%s'." % (relpath, source_dir)
        )


def _ensure_bdd100k_file(source_dir, filepath):
    if not os.path.isfile(filepath):
        relpath = os.path.relpath(filepath, source_dir)
        _raise_bdd100k_error(
            "File '%s' not found within '%s'." % (relpath, source_dir)
        )


def _raise_bdd100k_error(msg):
    raise OSError(
        "\n\n"
        + msg
        + "\n\n"
        + "You must download the source files for BDD100K dataset manually."
        + "\n\n"
        + "Run `fiftyone zoo datasets info bdd100k` for more information"
    )


def _parse_bdd_annotation(d, frame_size, extra_attrs):
    labels = {}

    #
    # Frame attributes
    #
    # @todo problems may occur if frame attributes have names "detections" or
    # "polylines", but we cross our fingers and proceed
    #
    frame_labels = _parse_frame_labels(d.get("attributes", {}))
    labels.update(frame_labels)

    # Objects and polylines
    for label in d.get("labels", []):
        if "box2d" in label:
            if "detections" not in labels:
                labels["detections"] = fol.Detections()

            detection = _parse_bdd_detection(label, frame_size, extra_attrs)
            labels["detections"].detections.append(detection)

        if "poly2d" in label:
            if "polylines" not in labels:
                labels["polylines"] = fol.Polylines()

            polylines = _parse_bdd_polylines(label, frame_size, extra_attrs)
            labels["polylines"].polylines.extend(polylines)

    return labels


def _parse_frame_labels(attrs_dict):
    labels = {}
    for name, value in attrs_dict.items():
        if isinstance(value, list):
            labels[name] = fol.Classifications(
                classifications=[fo.Classification(label=v) for v in value]
            )
        else:
            labels[name] = fo.Classification(label=value)

    return labels


def _parse_bdd_detection(d, frame_size, extra_attrs):
    label = d["category"]
    confidence = d.get("score", None)

    width, height = frame_size
    box2d = d["box2d"]
    bounding_box = (
        box2d["x1"] / width,
        box2d["y1"] / height,
        (box2d["x2"] - box2d["x1"]) / width,
        (box2d["y2"] - box2d["y1"]) / height,
    )

    attributes = d.get("attributes", {})
    attributes = _filter_attributes(attributes, extra_attrs)

    return fol.Detection(
        label=label,
        bounding_box=bounding_box,
        confidence=confidence,
        **attributes,
    )


def _parse_bdd_polylines(d, frame_size, extra_attrs):
    label = d["category"]
    confidence = d.get("score", None)

    attributes = d.get("attributes", {})

    polylines = []
    width, height = frame_size
    for poly2d in d.get("poly2d", []):
        vertices = poly2d.get("vertices", [])
        points = [(x / width, y / height) for (x, y) in vertices]
        closed = poly2d.get("closed", False)
        filled = closed  # assume that closed figures should be filled

        _attributes = deepcopy(attributes)

        if "types" in poly2d:
            _attributes["types"] = poly2d["types"]

        _attributes = _filter_attributes(attributes, extra_attrs)

        polylines.append(
            fol.Polyline(
                label=label,
                points=[points],
                confidence=confidence,
                closed=closed,
                filled=filled,
                **_attributes,
            )
        )

    return polylines


def _filter_attributes(attributes, extra_attrs):
    if not extra_attrs:
        return {}

    if extra_attrs == True:
        return attributes

    if etau.is_str(extra_attrs):
        extra_attrs = {extra_attrs}
    else:
        extra_attrs = set(extra_attrs)

    return {k: v for k, v in attributes.items() if k in extra_attrs}


def _make_bdd_annotation(labels, metadata, filename, extra_attrs):
    frame_size = (metadata.width, metadata.height)

    # Convert labels to BDD format
    frame_attrs = {}
    objects = []
    polylines = []
    for name, _labels in labels.items():
        if isinstance(_labels, fol.Classification):
            frame_attrs[name] = _labels.label
        elif isinstance(_labels, fol.Classifications):
            frame_attrs[name] = [l.label for l in _labels.classifications]
        elif isinstance(_labels, fol.Detection):
            obj = _detection_to_bdd(_labels, frame_size, extra_attrs)
            objects.append(obj)
        elif isinstance(_labels, fol.Detections):
            for detection in _labels.detections:
                obj = _detection_to_bdd(detection, frame_size, extra_attrs)
                objects.append(obj)
        elif isinstance(_labels, fol.Polyline):
            obj = _polyline_to_bdd(_labels, frame_size, extra_attrs)
            polylines.append(obj)
        elif isinstance(_labels, fol.Polylines):
            for polyline in _labels.polylines:
                obj = _polyline_to_bdd(polyline, frame_size, extra_attrs)
                polylines.append(obj)
        elif _labels is not None:
            msg = "Ignoring unsupported label type '%s'" % _labels.__class__
            warnings.warn(msg)

    # Build labels list
    labels = []
    uuid = -1

    for obj in objects:
        uuid += 1
        obj["id"] = uuid
        labels.append(obj)

    for polyline in polylines:
        uuid += 1
        polyline["id"] = uuid
        labels.append(polyline)

    return {
        "name": filename,
        "attributes": frame_attrs,
        "labels": labels,
    }


def _detection_to_bdd(detection, frame_size, extra_attrs):
    width, height = frame_size
    x, y, w, h = detection.bounding_box

    box2d = {
        "x1": round(x * width, 1),
        "x2": round((x + w) * width, 1),
        "y1": round(y * height, 1),
        "y2": round((y + h) * height, 1),
    }

    attributes = _get_attributes(detection, extra_attrs)

    d = {
        "id": None,
        "category": detection.label,
        "manualAttributes": True,
        "manualShape": True,
        "attributes": attributes,
        "box2d": box2d,
    }

    if detection.confidence is not None:
        d["score"] = detection.confidence

    return d


def _polyline_to_bdd(polyline, frame_size, extra_attrs):
    width, height = frame_size

    types = polyline.get_attribute_value("types", None)

    attributes = _get_attributes(polyline, extra_attrs)

    poly2d = []
    for points in polyline.points:
        vertices = [
            (round(width * x, 1), round(height * y, 1)) for (x, y) in points
        ]
        poly2d.append(
            {
                "types": types,
                "closed": polyline.closed,
                "vertices": vertices,
            }
        )

    d = {
        "id": None,
        "category": polyline.label,
        "manualAttributes": True,
        "manualShape": True,
        "attributes": attributes,
        "poly2d": poly2d,
    }

    if polyline.confidence is not None:
        d["score"] = polyline.confidence

    return d


def _get_attributes(label, extra_attrs):
    if extra_attrs == True:
        return dict(label.iter_attributes())

    if extra_attrs == False:
        return {}

    if etau.is_str(extra_attrs):
        extra_attrs = [extra_attrs]

    return {
        name: label.get_attribute_value(name, None) for name in extra_attrs
    }
