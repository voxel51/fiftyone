"""
Utilities for working with datasets in
`Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import logging
import os
import warnings

import eta.core.image as etai
import eta.core.utils as etau
import eta.core.serial as etas

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class BDDSampleParser(foud.LabeledImageTupleSampleParser):
    """Parser for samples in
    `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

    This implementation supports samples that are
    ``(image_or_path, anno_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``anno_or_path`` is a dictionary in the following format::

            {
                "name": "<filename>.<ext>",
                "attributes": {
                    "scene": "city street",
                    "timeofday": "daytime",
                    "weather": "overcast"
                },
                "labels": [
                    {
                        "id": 0,
                        "category": "traffic sign",
                        "manualAttributes": true,
                        "manualShape": true,
                        "attributes": {
                            "occluded": false,
                            "trafficLightColor": "none",
                            "truncated": false
                        },
                        "box2d": {
                            "x1": 1000.698742,
                            "x2": 1040.626872,
                            "y1": 281.992415,
                            "y2": 326.91156
                        }
                    },
                    ...
                    {
                        "id": 34,
                        "category": "drivable area",
                        "manualAttributes": true,
                        "manualShape": true,
                        "attributes": {
                            "areaType": "direct"
                        },
                        "poly2d": [
                            {
                                "types": "LLLLCCC",
                                "closed": true,
                                "vertices": [
                                    [241.143645, 697.923453],
                                    [541.525255, 380.564983],
                                    ...
                                ]
                            }
                        ]
                    },
                    ...
                    {
                        "id": 109356,
                        "category": "lane",
                        "attributes": {
                            "laneDirection": "parallel",
                            "laneStyle": "dashed",
                            "laneType": "single white"
                        },
                        "manualShape": true,
                        "manualAttributes": true,
                        "poly2d": [
                            {
                                "types": "LL",
                                "closed": false,
                                "vertices": [
                                    [492.879546, 331.939543],
                                    [0, 471.076658],
                                    ...
                                ]
                            }
                        ],
                    },
                    ...
                }
            }

          or the path to such a JSON file on disk. For unlabeled images,
          ``anno_or_path`` can be ``None``.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for more format
    details.
    """

    @property
    def label_cls(self):
        return {
            "attributes": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
        }

    def get_label(self):
        """Returns the label for the current sample.

        Args:
            sample: the sample

        Returns:
            a labels dictionary
        """
        labels = self.current_sample[1]

        # We must have the image to convert to relative coordinates
        img = self._current_image

        return self._parse_label(labels, img)

    def _parse_label(self, labels, img):
        if labels is None:
            return None

        if etau.is_str(labels):
            labels = etas.load_json(labels)

        frame_size = etai.to_frame_size(img=img)
        return _parse_bdd_annotation(labels, frame_size)


class BDDDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for BDD datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for format details.

    Args:
        dataset_dir (None): the dataset directory
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like "data" or "data/" specifying a subfolder of
                ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like "data.json" specifying the filename of the JSON
                data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like "labels.json" specifying the location of the
                labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.json``
        skip_unlabeled (False): whether to skip unlabeled images when importing
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
        skip_unlabeled=False,
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
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path

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

        image_path = self._image_paths_map[filename]

        image_metadata = fom.ImageMetadata.build_for(image_path)

        anno_dict = self._anno_dict_map.get(filename, None)
        if anno_dict is not None:
            # Labeled image
            frame_size = (image_metadata.width, image_metadata.height)
            label = _parse_bdd_annotation(anno_dict, frame_size)
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
        self._image_paths_map = self._load_data_map(self.data_path)

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            self._anno_dict_map = load_bdd_annotations(self.labels_path)
        else:
            self._anno_dict_map = {}

        filenames = list(self._image_paths_map.keys())

        if self.skip_unlabeled:
            filenames = [f for f in filenames if f in self._anno_dict_map]

        self._filenames = self._preprocess_list(filenames)
        self._num_samples = len(self._filenames)

    @staticmethod
    def get_num_samples(dataset_dir=None, data_path=None):
        data_path = foud.ImportPathsMixin._parse_data_path(
            dataset_dir=dataset_dir, data_path=data_path, default="data/",
        )
        return len(etau.list_files(data_path))


class BDDDatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes BDD datasets to disk.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like "data" or "data/" specifying a subfolder of
                ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like "data.json" specifying the filename of the
                manifest file in ``export_dir`` generated when ``export_media``
                is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a filename like "labels.json" specifying the location in
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
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        image_format=None,
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
            default_ext=self.image_format,
        )
        self._media_exporter.setup()

    def export_sample(self, image_or_path, labels, metadata=None):
        out_image_path, _ = self._media_exporter.export(image_or_path)

        if labels is None:
            return  # unlabeled

        if not isinstance(labels, dict):
            labels = {"labels": labels}

        if all(v is None for v in labels.values()):
            return  # unlabeled

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(out_image_path)

        filename = os.path.basename(out_image_path)
        annotation = _make_bdd_annotation(labels, metadata, filename)
        self._annotations.append(annotation)

    def close(self, *args):
        etas.write_json(self._annotations, self.labels_path)
        self._media_exporter.close()


def load_bdd_annotations(json_path):
    """Loads the BDD annotations from the given JSON file.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for more format
    details.

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
    per-split directories in :class:`BDDDataset` format.

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
        source_dir: the source directory containing the manually dowloaded
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


def _parse_bdd_annotation(d, frame_size):
    labels = {}

    # Frame attributes
    # NOTE: problems may occur if frame attributes have names "detections" or
    # "polylines", but we cross our fingers and proceeed
    labels.update(_parse_frame_attributes(d.get("attributes", {})))

    # Objects and polylines
    for label in d.get("labels", []):
        if "box2d" in label:
            if "detections" not in labels:
                labels["detections"] = fol.Detections()

            detection = _parse_bdd_detection(label, frame_size)
            labels["detections"].detections.append(detection)

        if "poly2d" in label:
            if "polylines" not in labels:
                labels["polylines"] = fol.Polylines()

            polylines = _parse_bdd_polylines(label, frame_size)
            labels["polylines"].polylines.extend(polylines)

    return labels


def _parse_frame_attributes(attrs_dict):
    labels = {}
    for name, value in attrs_dict.items():
        if isinstance(value, list):
            labels[name] = fol.Classifications(
                classifications=[fo.Classification(label=v) for v in value]
            )
        else:
            labels[name] = fo.Classification(label=value)

    return labels


def _parse_attributes(attrs_dict):
    return {
        name: _parse_attribute(value) for name, value in attrs_dict.items()
    }


def _parse_attribute(value):
    if etau.is_str(value):
        return fol.CategoricalAttribute(value=value)

    if isinstance(value, bool):
        return fol.BooleanAttribute(value=value)

    if etau.is_numeric(value):
        return fol.NumericAttribute(value=value)

    return fol.Attribute(value=value)


def _parse_bdd_detection(d, frame_size):
    label = d["category"]

    width, height = frame_size
    box2d = d["box2d"]
    bounding_box = (
        box2d["x1"] / width,
        box2d["y1"] / height,
        (box2d["x2"] - box2d["x1"]) / width,
        (box2d["y2"] - box2d["y1"]) / height,
    )

    attrs_dict = d.get("attributes", {})
    attributes = _parse_attributes(attrs_dict)

    return fol.Detection(
        label=label, bounding_box=bounding_box, attributes=attributes,
    )


def _parse_bdd_polylines(d, frame_size):
    label = d["category"]

    attributes = _parse_attributes(d.get("attributes", {}))

    polylines = []
    width, height = frame_size
    for poly2d in d.get("poly2d", []):
        vertices = poly2d.get("vertices", [])
        points = [(x / width, y / height) for (x, y) in vertices]
        closed = poly2d.get("closed", False)
        filled = closed  # assume that closed figures should be filled

        _attributes = deepcopy(attributes)

        types = poly2d.get("types", None)
        if types is not None:
            _attributes["types"] = _parse_attribute(types)

        polylines.append(
            fol.Polyline(
                label=label,
                points=[points],
                closed=closed,
                filled=filled,
                attributes=_attributes,
            )
        )

    return polylines


def _make_bdd_annotation(labels, metadata, filename):
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
            objects.append(_detection_to_bdd(_labels, frame_size))
        elif isinstance(_labels, fol.Detections):
            for detection in _labels.detections:
                objects.append(_detection_to_bdd(detection, frame_size))
        elif isinstance(_labels, fol.Polyline):
            polylines.append(_polyline_to_bdd(_labels, frame_size))
        elif isinstance(_labels, fol.Polylines):
            for polyline in _labels.polylines:
                polylines.append(_polyline_to_bdd(polyline, frame_size))
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


def _detection_to_bdd(detection, frame_size):
    width, height = frame_size
    x, y, w, h = detection.bounding_box

    box2d = {
        "x1": round(x * width, 1),
        "x2": round((x + w) * width, 1),
        "y1": round(y * height, 1),
        "y2": round((y + h) * height, 1),
    }

    attributes = {
        name: attr.value for name, attr in detection.attributes.items()
    }

    return {
        "id": None,
        "category": detection.label,
        "manualAttributes": True,
        "manualShape": True,
        "attributes": attributes,
        "box2d": box2d,
    }


def _polyline_to_bdd(polyline, frame_size):
    width, height = frame_size

    types = polyline.get_attribute_value("types", None)

    attributes = {
        name: attr.value
        for name, attr in polyline.attributes.items()
        if name != "types"
    }

    poly2d = []
    for points in polyline.points:
        vertices = [
            (round(width * x, 1), round(height * y, 1)) for (x, y) in points
        ]
        poly2d.append(
            {"types": types, "closed": polyline.closed, "vertices": vertices,}
        )

    return {
        "id": None,
        "category": polyline.label,
        "manualAttributes": True,
        "manualShape": True,
        "attributes": attributes,
        "poly2d": poly2d,
    }
