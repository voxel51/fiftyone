"""
Utilities for working with datasets in
`COCO format <https://cocodataset.org/#format-data>`_.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import csv
from datetime import datetime
from itertools import groupby
import logging
import multiprocessing
import multiprocessing.dummy
import os
import random
import shutil
import warnings

import numpy as np
from skimage import measure

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud
import fiftyone.utils.eta as foue

mask_utils = fou.lazy_import(
    "pycocotools.mask", callback=lambda: fou.ensure_import("pycocotools")
)


logger = logging.getLogger(__name__)


def add_coco_labels(
    sample_collection,
    label_field,
    labels_or_path,
    classes,
    label_type="detections",
    coco_id_field=None,
    include_annotation_id=False,
    extra_attrs=True,
    use_polylines=False,
    tolerance=None,
):
    """Adds the given COCO labels to the collection.

    The ``labels_or_path`` argument can be any of the following:

    -   a list of COCO annotations in the format below
    -   the path to a JSON file containing a list of COCO annotations
    -   the path to a JSON file whose ``"annotations"`` key contains a list of
        COCO annotations

    When ``label_type="detections"``, the labels should have format::

        [
            {
                "id": 1,
                "image_id": 1,
                "category_id": 2,
                "bbox": [260, 177, 231, 199],

                # optional
                "score": 0.95,
                "area": 45969,
                "iscrowd": 0,

                # extra attrs
                ...
            },
            ...
        ]

    When ``label_type="segmentations"``, the labels should have format::

        [
            {
                "id": 1,
                "image_id": 1,
                "category_id": 2,
                "bbox": [260, 177, 231, 199],
                "segmentation": [...],

                # optional
                "score": 0.95,
                "area": 45969,
                "iscrowd": 0,

                # extra attrs
                ...
            },
            ...
        ]

    When ``label_type="keypoints"``, the labels should have format::

        [
            {
                "id": 1,
                "image_id": 1,
                "category_id": 2,
                "keypoints": [224, 226, 2, ...],
                "num_keypoints": 10,

                # extra attrs
                ...
            },
            ...
        ]

    See `this page <https://cocodataset.org/#format-data>`_ for more
    information about the COCO data format.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        label_field: the label field in which to store the labels. The field
            will be created if necessary
        labels_or_path: a list of COCO annotations or the path to a JSON file
            containing such data on disk
        classes: the list of class label strings
        label_type ("detections"): the type of labels to load. Supported values
            are ``("detections", "segmentations", "keypoints")``
        coco_id_field (None): this parameter determines how to map the
            predictions onto samples in ``sample_collection``. The supported
            values are:

            -   ``None`` (default): in this case, the ``image_id`` of the
                predictions are assumed to be the 1-based positional indexes of
                samples in ``sample_collection``
            -   the name of a field of ``sample_collection`` containing the
                COCO IDs for the samples that correspond to the ``image_id`` of
                the predictions
        include_annotation_id (False): whether to include the COCO ID of each
            annotation in the loaded labels
        extra_attrs (True): whether to load extra annotation attributes onto
            the imported labels. Supported values are:

            -   ``True``: load all extra attributes found
            -   ``False``: do not load extra attributes
            -   a name or list of names of specific attributes to load
        use_polylines (False): whether to represent segmentations as
            :class:`fiftyone.core.labels.Polylines` instances rather than
            :class:`fiftyone.core.labels.Detections` with dense masks
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
    """
    if etau.is_str(labels_or_path):
        labels = etas.load_json(labels_or_path)
        if isinstance(labels, dict):
            labels = labels["annotations"]
    else:
        labels = labels_or_path

    coco_objects_map = defaultdict(list)
    for d in labels:
        coco_obj = COCOObject.from_anno_dict(d, extra_attrs=extra_attrs)
        coco_objects_map[coco_obj.image_id].append(coco_obj)

    if coco_id_field is not None:
        # Use `coco_id_field` as key to match predictions with samples
        _coco_ids, _ids = sample_collection.values([coco_id_field, "id"])
        id_map = {k: v for k, v in zip(_coco_ids, _ids)}

        coco_ids = sorted(coco_objects_map.keys())
        bad_ids = set(coco_ids) - set(id_map.keys())
        if bad_ids:
            coco_ids = [_id for _id in coco_ids if _id not in bad_ids]
            logger.warning(
                "Ignoring %d labels with nonexistent COCO IDs (eg %s)",
                len(bad_ids),
                next(iter(bad_ids)),
            )

        sample_ids = [id_map[coco_id] for coco_id in coco_ids]
        view = sample_collection.select(sample_ids, ordered=True)
        coco_objects = [coco_objects_map[coco_id] for coco_id in coco_ids]
    else:
        # Assume `image_id` is 1-based sample position
        view = sample_collection
        coco_objects = [coco_objects_map[i] for i in range(1, len(view) + 1)]

    view.compute_metadata()
    widths, heights = view.values(["metadata.width", "metadata.height"])

    labels = []
    for _coco_objects, width, height in zip(coco_objects, widths, heights):
        frame_size = (width, height)

        if label_type == "detections":
            _labels = _coco_objects_to_detections(
                _coco_objects,
                frame_size,
                classes,
                None,
                False,
                include_annotation_id,
            )
        elif label_type == "segmentations":
            if use_polylines:
                _labels = _coco_objects_to_polylines(
                    _coco_objects,
                    frame_size,
                    classes,
                    None,
                    tolerance,
                    include_annotation_id,
                )
            else:
                _labels = _coco_objects_to_detections(
                    _coco_objects,
                    frame_size,
                    classes,
                    None,
                    True,
                    include_annotation_id,
                )
        elif label_type == "keypoints":
            _labels = _coco_objects_to_keypoints(
                _coco_objects,
                frame_size,
                classes,
                None,
                include_annotation_id,
            )
        else:
            raise ValueError(
                "Unsupported label_type='%s'. Supported values are %s"
                % (label_type, ("detections", "segmentations", "keypoints"))
            )

        labels.append(_labels)

    view.set_values(label_field, labels)


class COCODetectionDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for COCO detection datasets stored on disk.

    See :ref:`this page <COCODetectionDataset-import>` for format details.

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
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "segmentations", "keypoints")``. By default, all
            label types are loaded
        classes (None): a string or list of strings specifying required classes
            to load. Only samples containing at least one instance of a
            specified class will be loaded
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` ints or strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats
        include_id (False): whether to include the COCO ID of each sample in
            the loaded labels
        include_annotation_id (False): whether to include the COCO ID of each
            annotation in the loaded labels
        include_license (False): whether to include the license ID of each
            sample in the loaded labels, if available. Supported values are:

            -   ``"False"``: don't load the license
            -   ``True``/``"name"``: store the string license name
            -   ``"id"``: store the integer license ID
            -   ``"url"``: store the license URL

            Note that the license descriptions (if available) are always loaded
            into ``dataset.info["licenses"]`` and can be used to convert
            between ID, name, and URL later
        extra_attrs (True): whether to load extra annotation attributes onto
            the imported labels. Supported values are:

            -   ``True``: load all extra attributes found
            -   ``False``: do not load extra attributes
            -   a name or list of names of specific attributes to load

        only_matching (False): whether to only load labels that match the
            ``classes`` requirement that you provide (True), or to load all
            labels for samples that match the requirements (False)
        use_polylines (False): whether to represent segmentations as
            :class:`fiftyone.core.labels.Polylines` instances rather than
            :class:`fiftyone.core.labels.Detections` with dense masks
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load. If
            ``label_types`` and/or ``classes`` are also specified, first
            priority will be given to samples that contain all of the specified
            label types and/or classes, followed by samples that contain at
            least one of the specified labels types or classes. The actual
            number of samples loaded may be less than this maximum value if the
            dataset does not contain sufficient samples matching your
            requirements. By default, all matching samples are loaded
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        label_types=None,
        classes=None,
        image_ids=None,
        include_id=False,
        include_annotation_id=False,
        include_license=False,
        extra_attrs=True,
        only_matching=False,
        use_polylines=False,
        tolerance=None,
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

        _label_types = _parse_label_types(label_types)

        include_license = _parse_include_license(include_license)

        if include_id:
            _label_types.append("coco_id")

        if include_license:
            _label_types.append("license")

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.label_types = label_types
        self.classes = classes
        self.image_ids = image_ids
        self.include_id = include_id
        self.include_annotation_id = include_annotation_id
        self.include_license = include_license
        self.extra_attrs = extra_attrs
        self.only_matching = only_matching
        self.use_polylines = use_polylines
        self.tolerance = tolerance

        self._label_types = _label_types
        self._info = None
        self._classes = None
        self._license_map = None
        self._supercategory_map = None
        self._image_paths_map = None
        self._image_dicts_map = None
        self._annotations = None
        self._filenames = None
        self._iter_filenames = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return len(self._filenames)

    def __next__(self):
        filename = next(self._iter_filenames)

        if os.path.isabs(filename):
            image_path = filename
        else:
            image_path = self._image_paths_map[filename]

        image_dict = self._image_dicts_map.get(filename, None)

        if image_dict is None:
            image_metadata = fom.ImageMetadata.build_for(image_path)
            return image_path, image_metadata, None

        image_id = image_dict["id"]
        width = image_dict["width"]
        height = image_dict["height"]

        image_metadata = fom.ImageMetadata(width=width, height=height)

        label = {}

        if self._annotations is not None:
            coco_objects = self._annotations.get(image_id, [])
            frame_size = (width, height)

            if self.classes is not None and self.only_matching:
                coco_objects = _get_matching_objects(
                    coco_objects, self.classes, self._classes
                )

            if "detections" in self._label_types:
                detections = _coco_objects_to_detections(
                    coco_objects,
                    frame_size,
                    self._classes,
                    self._supercategory_map,
                    False,  # no segmentations
                    self.include_annotation_id,
                )
                if detections is not None:
                    label["detections"] = detections

            if "segmentations" in self._label_types:
                if self.use_polylines:
                    segmentations = _coco_objects_to_polylines(
                        coco_objects,
                        frame_size,
                        self._classes,
                        self._supercategory_map,
                        self.tolerance,
                        self.include_annotation_id,
                    )
                else:
                    segmentations = _coco_objects_to_detections(
                        coco_objects,
                        frame_size,
                        self._classes,
                        self._supercategory_map,
                        True,  # load segmentations
                        self.include_annotation_id,
                    )

                if segmentations is not None:
                    label["segmentations"] = segmentations

            if "keypoints" in self._label_types:
                keypoints = _coco_objects_to_keypoints(
                    coco_objects,
                    frame_size,
                    self._classes,
                    self._supercategory_map,
                    self.include_annotation_id,
                )

                if keypoints is not None:
                    label["keypoints"] = keypoints

        if "coco_id" in self._label_types:
            label["coco_id"] = image_id

        if "license" in self._label_types:
            license_id = image_dict.get("license", None)
            label["license"] = self._license_map.get(license_id, None)

        if self._has_scalar_labels:
            label = next(iter(label.values())) if label else None

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def _has_scalar_labels(self):
        return len(self._label_types) == 1

    @property
    def label_cls(self):
        seg_type = fol.Polylines if self.use_polylines else fol.Detections
        types = {
            "detections": fol.Detections,
            "segmentations": seg_type,
            "keypoints": fol.Keypoints,
            "coco_id": fof.IntField,
            "license": fof.IntField,
        }

        if self._has_scalar_labels:
            return types[self._label_types[0]]

        return {k: v for k, v in types.items() if k in self._label_types}

    def setup(self):
        image_paths_map = self._load_data_map(self.data_path, recursive=True)

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            (
                info,
                classes,
                supercategory_map,
                images,
                annotations,
            ) = load_coco_detection_annotations(
                self.labels_path, extra_attrs=self.extra_attrs
            )

            if classes is not None:
                info["classes"] = classes

            image_ids = _get_matching_image_ids(
                classes,
                images,
                annotations,
                image_ids=self.image_ids,
                classes=self.classes,
                shuffle=self.shuffle,
                seed=self.seed,
                max_samples=self.max_samples,
            )

            filenames = [
                fou.normpath(images[_id]["file_name"]) for _id in image_ids
            ]

            _image_ids = set(image_ids)
            image_dicts_map = {
                fou.normpath(i["file_name"]): i
                for _id, i in images.items()
                if _id in _image_ids
            }
        else:
            info = {}
            classes = None
            supercategory_map = None
            image_dicts_map = {}
            annotations = None
            filenames = []

        if self.include_license:
            license_map = {
                l.get("id", None): l.get(self.include_license, None)
                for l in info.get("licenses", [])
            }
        else:
            license_map = None

        self._info = info
        self._classes = classes
        self._license_map = license_map
        self._supercategory_map = supercategory_map
        self._image_paths_map = image_paths_map
        self._image_dicts_map = image_dicts_map
        self._annotations = annotations
        self._filenames = filenames

    def get_dataset_info(self):
        return self._info


class COCODetectionDatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes COCO detection datasets to disk.

    This class currently only supports exporting detections and instance
    segmentations.

    See :ref:`this page <COCODetectionDataset-export>` for format details.

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
            necessary) via :func:`fiftyone.core.utils.normalize_path`
        abs_paths (False): whether to store absolute paths to the images in the
            exported labels
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        classes (None): the list of possible class labels
        info (None): a dict of info as returned by
            :meth:`load_coco_detection_annotations` to include in the exported
            JSON. If not provided, this info will be extracted when
            :meth:`log_collection` is called, if possible
        extra_attrs (True): whether to include extra object attributes in the
            exported labels. Supported values are:

            -   ``True``: export all extra attributes found
            -   ``False``: do not export extra attributes
            -   a name or list of names of specific attributes to export
        annotation_id (None): the name of a label field containing the COCO
            annotation ID of each label
        iscrowd ("iscrowd"): the name of a detection attribute that indicates
            whether an object is a crowd (the value is automatically set to 0
            if the attribute is not present)
        num_decimals (None): an optional number of decimal places at which to
            round bounding box pixel coordinates. By default, no rounding is
            done
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
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
        classes=None,
        info=None,
        extra_attrs=True,
        annotation_id=None,
        iscrowd="iscrowd",
        num_decimals=None,
        tolerance=None,
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
        self.classes = classes
        self.info = info
        self.extra_attrs = extra_attrs
        self.annotation_id = annotation_id
        self.iscrowd = iscrowd
        self.num_decimals = num_decimals
        self.tolerance = tolerance

        self._image_id = None
        self._anno_id = None
        self._images = None
        self._annotations = None
        self._classes = None
        self._dynamic_classes = classes is None
        self._labels_map_rev = None
        self._has_labels = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return (fol.Detections, fol.Polylines, fol.Keypoints)

    def setup(self):
        self._image_id = 0
        self._anno_id = 0
        self._images = []
        self._annotations = []
        self._has_labels = False

        self._parse_classes()

        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            rel_dir=self.rel_dir,
            default_ext=self.image_format,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        if self.info is None:
            self.info = sample_collection.info

    def export_sample(self, image_or_path, label, metadata=None):
        out_image_path, uuid = self._media_exporter.export(image_or_path)

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(image_or_path)

        if self.abs_paths:
            file_name = out_image_path
        else:
            file_name = uuid

        # @todo would be nice to support using existing COCO ID here
        self._image_id += 1

        self._images.append(
            {
                "id": self._image_id,
                "file_name": file_name,
                "height": metadata.height,
                "width": metadata.width,
                "license": None,
                "coco_url": None,
            }
        )

        if label is None:
            return

        self._has_labels = True

        if isinstance(label, fol.Detections):
            labels = label.detections
        elif isinstance(label, fol.Polylines):
            labels = label.polylines
        elif isinstance(label, fol.Keypoints):
            labels = label.keypoints
        else:
            raise ValueError(
                "Unsupported label type %s. The supported types are %s"
                % (type(label), self.label_cls)
            )

        for label in labels:
            _label = label.label

            if self._dynamic_classes:
                category_id = _label  # will be converted to int later
                self._classes.add(_label)
            else:
                if _label not in self._labels_map_rev:
                    msg = (
                        "Ignoring object with label '%s' not in provided "
                        "classes" % _label
                    )
                    warnings.warn(msg)
                    continue

                category_id = self._labels_map_rev[_label]

            self._anno_id += 1

            obj = COCOObject.from_label(
                label,
                metadata,
                image_id=self._image_id,
                category_id=category_id,
                extra_attrs=self.extra_attrs,
                id_attr=self.annotation_id,
                iscrowd=self.iscrowd,
                num_decimals=self.num_decimals,
                tolerance=self.tolerance,
            )

            if obj.id is None:
                obj.id = self._anno_id

            self._annotations.append(obj.to_anno_dict())

    def close(self, *args):
        if self._dynamic_classes:
            classes = sorted(self._classes)
            labels_map_rev = _to_labels_map_rev(classes)
            for anno in self._annotations:
                anno["category_id"] = labels_map_rev[anno["category_id"]]
        else:
            classes = self.classes

        date_created = datetime.now().replace(microsecond=0).isoformat()
        info = {
            "year": self.info.get("year", ""),
            "version": self.info.get("version", ""),
            "description": self.info.get("year", "Exported from FiftyOne"),
            "contributor": self.info.get("contributor", ""),
            "url": self.info.get("url", "https://voxel51.com/fiftyone"),
            "date_created": self.info.get("date_created", date_created),
        }

        licenses = self.info.get("licenses", [])

        supercategory_map = {
            c["name"]: c.get("supercategory", None)
            for c in self.info.get("categories", [])
        }

        categories = [
            {
                "id": i,
                "name": l,
                "supercategory": supercategory_map.get(l, None),
            }
            for i, l in enumerate(classes)
        ]

        labels = {
            "info": info,
            "licenses": licenses,
            "categories": categories,
            "images": self._images,
        }

        if self._has_labels:
            labels["annotations"] = self._annotations

        etas.write_json(labels, self.labels_path)

        self._media_exporter.close()

    def _parse_classes(self):
        if self._dynamic_classes:
            self._classes = set()
        else:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class COCOObject(object):
    """An object in COCO format.

    Args:
        id (None): the ID of the annotation
        image_id (None): the ID of the image in which the annotation appears
        category_id (None): the category ID of the object
        bbox (None): a bounding box for the object in
            ``[xmin, ymin, width, height]`` format
        segmentation (None): the segmentation data for the object
        keypoints (None): the keypoints data for the object
        score (None): a confidence score for the object
        area (None): the area of the bounding box, in pixels
        iscrowd (None): whether the object is a crowd
        **attributes: additional custom attributes
    """

    def __init__(
        self,
        id=None,
        image_id=None,
        category_id=None,
        bbox=None,
        segmentation=None,
        keypoints=None,
        score=None,
        area=None,
        iscrowd=None,
        **attributes,
    ):
        self.id = id
        self.image_id = image_id
        self.category_id = category_id
        self.bbox = bbox
        self.segmentation = segmentation
        self.keypoints = keypoints
        self.score = score
        self.area = area
        self.iscrowd = iscrowd
        self.attributes = attributes

    def to_polyline(
        self,
        frame_size,
        classes=None,
        supercategory_map=None,
        tolerance=None,
        include_id=False,
    ):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image
            classes (None): the list of classes
            supercategory_map (None): a dict mapping class names to category
                dicts
            tolerance (None): a tolerance, in pixels, when generating
                approximate polylines for instance masks. Typical values are
                1-3 pixels
            include_id (False): whether to include the COCO ID of the object as
                a label attribute

        Returns:
            a :class:`fiftyone.core.labels.Polyline`, or None if no
            segmentation data is available
        """
        if not self.segmentation:
            return None

        label, attributes = self._get_object_label_and_attributes(
            classes, supercategory_map, include_id
        )
        attributes.update(self.attributes)

        points = _get_polygons_for_segmentation(
            self.segmentation, frame_size, tolerance
        )

        return fol.Polyline(
            label=label,
            points=points,
            confidence=self.score,
            closed=False,
            filled=True,
            **attributes,
        )

    def to_keypoints(
        self,
        frame_size,
        classes=None,
        supercategory_map=None,
        include_id=False,
    ):
        """Returns a :class:`fiftyone.core.labels.Keypoint` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image
            classes (None): the list of classes
            supercategory_map (None): a dict mapping class names to category
                dicts
            include_id (False): whether to include the COCO ID of the object as
                a label attribute

        Returns:
            a :class:`fiftyone.core.labels.Keypoint`, or None if no keypoints
            data is available
        """
        if self.keypoints is None:
            return None

        label, attributes = self._get_object_label_and_attributes(
            classes, supercategory_map, include_id
        )
        attributes.update(self.attributes)

        width, height = frame_size

        points = []
        for x, y, v in fou.iter_batches(self.keypoints, 3):
            if v == 0:
                points.append((float("nan"), float("nan")))
            else:
                points.append((x / width, y / height))

        return fol.Keypoint(label=label, points=points, **attributes)

    def to_detection(
        self,
        frame_size,
        classes=None,
        supercategory_map=None,
        load_segmentation=False,
        include_id=False,
    ):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image
            classes (None): the list of classes
            supercategory_map (None): a dict mapping class names to category
                dicts
            load_segmentation (False): whether to load the segmentation mask
                for the object, if available
            include_id (False): whether to include the COCO ID of the object as
                a label attribute

        Returns:
            a :class:`fiftyone.core.labels.Detection`, or None if no bbox data
            is available
        """
        if self.bbox is None:
            return None

        label, attributes = self._get_object_label_and_attributes(
            classes, supercategory_map, include_id
        )
        attributes.update(self.attributes)

        width, height = frame_size
        x, y, w, h = self.bbox
        bounding_box = [x / width, y / height, w / width, h / height]

        if load_segmentation and self.segmentation:
            mask = _coco_segmentation_to_mask(
                self.segmentation, self.bbox, frame_size
            )
        else:
            mask = None

        return fol.Detection(
            label=label,
            bounding_box=bounding_box,
            mask=mask,
            confidence=self.score,
            **attributes,
        )

    def to_anno_dict(self):
        """Returns a COCO annotation dictionary representation of the object.

        Returns:
            a COCO annotation dict
        """
        d = {
            "id": self.id,
            "image_id": self.image_id,
            "category_id": self.category_id,
        }

        if self.bbox is not None:
            d["bbox"] = self.bbox

        if self.keypoints is not None:
            d["keypoints"] = self.keypoints
            d["num_keypoints"] = len(self.keypoints) // 3

        if self.segmentation is not None:
            d["segmentation"] = self.segmentation

        if self.score is not None:
            d["score"] = self.score

        if self.area is not None:
            d["area"] = self.area

        if self.iscrowd is not None:
            d["iscrowd"] = self.iscrowd

        if self.attributes:
            d.update(self.attributes)

        return d

    @classmethod
    def from_anno_dict(cls, d, extra_attrs=True):
        """Creates a :class:`COCOObject` from a COCO annotation dict.

        Args:
            d: a COCO annotation dict
            extra_attrs (True): whether to load extra annotation attributes.
                Supported values are:

                -   ``True``: load all extra attributes
                -   ``False``: do not load extra attributes
                -   a name or list of names of specific attributes to load

        Returns:
            a :class:`COCOObject`
        """
        # Handles CVAT exported attributes
        if "attributes" in d:
            d.update(d.pop("attributes", {}))

        if extra_attrs is True:
            return cls(**d)

        if etau.is_str(extra_attrs):
            extra_attrs = [extra_attrs]

        if extra_attrs:
            attributes = {f: d.get(f, None) for f in extra_attrs}
        else:
            attributes = {}

        return cls(
            id=d.get("id", None),
            image_id=d.get("image_id", None),
            category_id=d.get("category_id", None),
            bbox=d.get("bbox", None),
            segmentation=d.get("segmentation", None),
            keypoints=d.get("keypoints", None),
            score=d.get("score", None),
            area=d.get("area", None),
            iscrowd=d.get("iscrowd", None),
            **attributes,
        )

    @classmethod
    def from_label(
        cls,
        label,
        metadata,
        image_id=None,
        category_id=None,
        keypoint=None,
        extra_attrs=True,
        id_attr=None,
        iscrowd="iscrowd",
        num_decimals=None,
        tolerance=None,
    ):
        """Creates a :class:`COCOObject` from a compatible
        :class:`fiftyone.core.labels.Label`.

        Args:
            label: a :class:`fiftyone.core.labels.Detection`,
                :class:`fiftyone.core.labels.Polyline`, or
                :class:`fiftyone.core.labels.Keypoint`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image
            image_id (None): an image ID
            category_id (None): the category ID for the object
            keypoint (None): an optional :class:`fiftyone.core.labels.Keypoint`
                containing keypoints to include for the object
            extra_attrs (True): whether to include extra attributes from the
                object. Supported values are:

                -   ``True``: include all extra attributes found
                -   ``False``: do not include extra attributes
                -   a name or list of names of specific attributes to include
            id_attr (None): the name of the attribute containing the annotation
                ID of the label, if any
            iscrowd ("iscrowd"): the name of the crowd attribute (the value is
                automatically set to 0 if the attribute is not present)
            num_decimals (None): an optional number of decimal places at which
                to round bounding box pixel coordinates. By default, no
                rounding is done
            tolerance (None): a tolerance, in pixels, when generating
                approximate polylines for instance masks. Typical values are
                1-3 pixels

        Returns:
            a :class:`COCOObject`
        """
        width = metadata.width
        height = metadata.height
        frame_size = (width, height)

        bbox = None
        segmentation = None
        keypoints = None
        area = None

        if isinstance(label, fol.Detection):
            x, y, w, h = label.bounding_box
            bbox = [x * width, y * height, w * width, h * height]

            if label.mask is not None:
                segmentation = _instance_to_coco_segmentation(
                    label, frame_size, iscrowd=iscrowd, tolerance=tolerance
                )
        elif isinstance(label, fol.Polyline):
            points = np.concatenate(label.points, axis=0)
            x, y = points.min(axis=0)
            xmax, ymax = points.max(axis=0)
            w, h = xmax - x, ymax - y
            bbox = [x * width, y * height, w * width, h * height]

            segmentation = _polyline_to_coco_segmentation(
                label, frame_size, iscrowd=iscrowd
            )
        elif isinstance(label, fol.Keypoint):
            keypoints = _make_coco_keypoints(label, frame_size)
        else:
            raise ValueError("Unsupported label type %s" % type(label))

        if keypoint is not None:
            keypoints = _make_coco_keypoints(keypoint, frame_size)

        confidence = label.confidence

        if bbox is not None:
            if num_decimals is not None:
                bbox = [round(p, num_decimals) for p in bbox]

            area = bbox[2] * bbox[3]

        if id_attr is not None:
            _id = label.get_attribute_value(id_attr, None)
        else:
            _id = None

        _iscrowd = int(label.get_attribute_value(iscrowd, None) or 0)

        attributes = _get_attributes(label, extra_attrs)
        attributes.pop(id_attr, None)  # okay if `id_attr` is None
        attributes.pop(iscrowd, None)
        attributes.pop("area", None)

        return cls(
            id=_id,
            image_id=image_id,
            category_id=category_id,
            bbox=bbox,
            segmentation=segmentation,
            keypoints=keypoints,
            score=confidence,
            area=area,
            iscrowd=_iscrowd,
            **attributes,
        )

    def _get_label(self, classes):
        if classes:
            return classes[self.category_id]

        return str(self.category_id)

    def _get_object_label_and_attributes(
        self, classes, supercategory_map, include_id
    ):
        if classes:
            label = classes[self.category_id]
        else:
            label = str(self.category_id)

        attributes = {}

        if include_id:
            attributes["coco_id"] = self.id

        if supercategory_map is not None and label in supercategory_map:
            supercategory = supercategory_map[label].get("supercategory", None)
        else:
            supercategory = None

        if supercategory is not None:
            attributes["supercategory"] = supercategory

        if self.iscrowd is not None:
            attributes["iscrowd"] = self.iscrowd

        return label, attributes


def load_coco_detection_annotations(json_path, extra_attrs=True):
    """Loads the COCO annotations from the given JSON file.

    See :ref:`this page <COCODetectionDataset-import>` for format details.

    Args:
        json_path: the path to the annotations JSON file
        extra_attrs (True): whether to load extra annotation attributes.
            Supported values are:

            -   ``True``: load all extra attributes found
            -   ``False``: do not load extra attributes
            -   a name or list of names of specific attributes to load

    Returns:
        a tuple of

        -   info: a dict of dataset info
        -   classes: a list of classes
        -   supercategory_map: a dict mapping class labels to category dicts
        -   images: a dict mapping image IDs to image dicts
        -   annotations: a dict mapping image IDs to list of
            :class:`COCOObject` instances, or ``None`` for unlabeled datasets
    """
    d = etas.load_json(json_path)
    return _parse_coco_detection_annotations(d, extra_attrs=extra_attrs)


def _parse_coco_detection_annotations(d, extra_attrs=True):
    # Load info
    info = d.get("info", None)
    licenses = d.get("licenses", None)
    categories = d.get("categories", None)

    if info is None:
        info = {}

    if licenses is not None:
        info["licenses"] = licenses

    if categories is not None:
        info["categories"] = categories

    # Load classes
    if categories is not None:
        classes, supercategory_map = parse_coco_categories(categories)
    else:
        classes = None
        supercategory_map = None

    # Load image metadata
    images = {i["id"]: i for i in d.get("images", [])}

    # Load annotations
    _annotations = d.get("annotations", None)
    if _annotations is not None:
        annotations = defaultdict(list)
        for a in _annotations:
            annotations[a["image_id"]].append(
                COCOObject.from_anno_dict(a, extra_attrs=extra_attrs)
            )

        annotations = dict(annotations)
    else:
        annotations = None

    return info, classes, supercategory_map, images, annotations


def parse_coco_categories(categories):
    """Parses the COCO categories list.

    The returned ``classes`` contains all class IDs from ``[0, max_id]``,
    inclusive.

    Args:
        categories: a dict of the form::

            [
                ...
                {
                    "id": 2,
                    "name": "cat",
                    "supercategory": "animal",
                    "keypoints": ["nose", "head", ...],
                    "skeleton": [[12, 14], [14, 16], ...]
                },
                ...
            ]

    Returns:
        a tuple of

        -   classes: a list of classes
        -   supercategory_map: a dict mapping class labels to category dicts
    """
    cat_map = {c["id"]: c for c in categories}

    classes = []
    supercategory_map = {}
    for cat_id in range(max(cat_map, default=-1) + 1):
        category = cat_map.get(cat_id, None)
        try:
            name = category["name"]
        except:
            name = str(cat_id)

        classes.append(name)
        if category is not None:
            supercategory_map[name] = category

    return classes, supercategory_map


def download_coco_dataset_split(
    dataset_dir,
    split,
    year="2017",
    label_types=None,
    classes=None,
    image_ids=None,
    num_workers=None,
    shuffle=None,
    seed=None,
    max_samples=None,
    raw_dir=None,
    scratch_dir=None,
):
    """Utility that downloads full or partial splits of the
    `COCO dataset <https://cocodataset.org>`_.

    See :ref:`this page <COCODetectionDataset-export>` for the format in which
    ``dataset_dir`` will be arranged.

    Any existing files are not re-downloaded.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        year ("2017"): the dataset year to download. Supported values are
            ``("2014", "2017")``
        label_types (None): a label type or list of label types to load. The
            supported values are ``("detections", "segmentations")``. By
            default, all label types are loaded
        classes (None): a string or list of strings specifying required classes
            to load. Only samples containing at least one instance of a
            specified class will be loaded
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` ints or strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats
        num_workers (None): the number of processes to use when downloading
            individual images. By default, ``multiprocessing.cpu_count()`` is
            used
        shuffle (False): whether to randomly shuffle the order in which samples
            are chosen for partial downloads
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load. If
            ``label_types`` and/or ``classes`` are also specified, first
            priority will be given to samples that contain all of the specified
            label types and/or classes, followed by samples that contain at
            least one of the specified labels types or classes. The actual
            number of samples loaded may be less than this maximum value if the
            dataset does not contain sufficient samples matching your
            requirements. By default, all matching samples are loaded
        raw_dir (None): a directory in which full annotations files may be
            stored to avoid re-downloads in the future
        scratch_dir (None): a scratch directory to use to download any
            necessary temporary files

    Returns:
        a tuple of:

        -   num_samples: the total number of downloaded images
        -   classes: the list of all classes
        -   did_download: whether any content was downloaded (True) or if all
            necessary files were already downloaded (False)
    """
    if year not in _IMAGE_DOWNLOAD_LINKS:
        raise ValueError(
            "Unsupported year '%s'; supported values are %s"
            % (year, tuple(_IMAGE_DOWNLOAD_LINKS.keys()))
        )

    if split not in _IMAGE_DOWNLOAD_LINKS[year]:
        raise ValueError(
            "Unsupported split '%s'; supported values are %s"
            % (split, tuple(_IMAGE_DOWNLOAD_LINKS[year].keys()))
        )

    if classes is not None and split == "test":
        logger.warning("Test split is unlabeled; ignoring classes requirement")
        classes = None

    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")

    anno_path = os.path.join(dataset_dir, "labels.json")
    images_dir = os.path.join(dataset_dir, "data")
    split_size = _SPLIT_SIZES[year][split]

    etau.ensure_dir(images_dir)

    did_download = False

    #
    # Download annotations to `raw_dir`, if necessary
    #

    if raw_dir is None:
        raw_dir = os.path.join(dataset_dir, "raw")

    etau.ensure_dir(raw_dir)

    if split != "test":
        src_path = _ANNOTATION_DOWNLOAD_LINKS[year]
        rel_path = _ANNOTATION_PATHS[year][split]
        subdir = "trainval"
        anno_type = "annotations"
    else:
        src_path = _TEST_INFO_DOWNLOAD_LINKS[year]
        rel_path = _TEST_INFO_PATHS[year]
        subdir = "test"
        anno_type = "test info"

    zip_path = os.path.join(scratch_dir, os.path.basename(src_path))
    unzip_dir = os.path.join(scratch_dir, subdir)
    content_dir = os.path.join(unzip_dir, os.path.dirname(rel_path))
    full_anno_path = os.path.join(raw_dir, os.path.basename(rel_path))

    if not os.path.isfile(full_anno_path):
        logger.info("Downloading %s to '%s'", anno_type, zip_path)
        etaw.download_file(src_path, path=zip_path)

        logger.info("Extracting %s to '%s'", anno_type, full_anno_path)
        etau.extract_zip(zip_path, outdir=unzip_dir, delete_zip=False)
        _merge_dir(content_dir, raw_dir)
        did_download = True
    else:
        logger.info("Found %s at '%s'", anno_type, full_anno_path)

    # This will store the loaded annotations, if they were necessary
    d = None
    all_classes = None

    #
    # Download images to `images_dir`, if necessary
    #

    images_src_path = _IMAGE_DOWNLOAD_LINKS[year][split]
    images_zip_path = os.path.join(
        scratch_dir, os.path.basename(images_src_path)
    )
    unzip_images_dir = os.path.splitext(images_zip_path)[0]

    if classes is None and image_ids is None and max_samples is None:
        # Full image download
        num_existing = len(etau.list_files(images_dir))
        num_download = split_size - num_existing
        if num_download > 0:
            if num_existing > 0:
                logger.info(
                    "Found %d (< %d) downloaded images; must download full "
                    "image zip",
                    num_existing,
                    split_size,
                )

            logger.info("Downloading images to '%s'", images_zip_path)
            etaw.download_file(images_src_path, path=images_zip_path)
            logger.info("Extracting images to '%s'", images_dir)
            etau.extract_zip(images_zip_path, delete_zip=False)
            etau.move_dir(unzip_images_dir, images_dir)
            did_download = True
        else:
            logger.info("Images already downloaded")
    else:
        # Partial image download

        # Load annotations to use to determine what images to use
        d = etas.load_json(full_anno_path)
        (
            _,
            all_classes,
            _,
            images,
            annotations,
        ) = _parse_coco_detection_annotations(d, extra_attrs=True)

        if image_ids is not None:
            # Start with specific images
            image_ids = _parse_image_ids(image_ids, images, split=split)
        else:
            # Start with all images
            image_ids = list(images.keys())

        if classes is not None:
            # Filter by specified classes
            all_ids, any_ids = _get_images_with_classes(
                image_ids, annotations, classes, all_classes
            )
        else:
            all_ids = image_ids
            any_ids = []

        all_ids = sorted(all_ids)
        any_ids = sorted(any_ids)

        if shuffle:
            if seed is not None:
                random.seed(seed)

            random.shuffle(all_ids)
            random.shuffle(any_ids)

        image_ids = all_ids + any_ids

        # Determine IDs to download
        existing_ids, downloadable_ids = _get_existing_ids(
            images_dir, images, image_ids
        )

        if max_samples is not None:
            num_existing = len(existing_ids)
            num_downloadable = len(downloadable_ids)
            num_available = num_existing + num_downloadable
            if num_available < max_samples:
                logger.warning(
                    "Only found %d (<%d) samples matching your "
                    "requirements",
                    num_available,
                    max_samples,
                )

            if max_samples > num_existing:
                num_download = max_samples - num_existing
                download_ids = downloadable_ids[:num_download]
            else:
                download_ids = []
        else:
            download_ids = downloadable_ids

        # Download necessary images
        num_existing = len(existing_ids)
        num_download = len(download_ids)
        if num_existing > 0:
            if num_download > 0:
                logger.info(
                    "%d images found; downloading the remaining %d",
                    num_existing,
                    num_download,
                )
            else:
                logger.info("Sufficient images already downloaded")
        elif num_download > 0:
            logger.info("Downloading %d images", num_download)

        if num_download > 0:
            _download_images(images_dir, download_ids, images, num_workers)
            did_download = True

    downloaded_filenames = etau.list_files(images_dir)
    num_samples = len(downloaded_filenames)  # total downloaded

    #
    # Write usable annotations file to `anno_path`, if necesary
    #

    if not os.path.isfile(anno_path):
        did_download = True

    if did_download:
        if d is None:
            d = etas.load_json(full_anno_path)

            categories = d.get("categories", None)
            if categories is not None:
                all_classes, _ = parse_coco_categories(categories)
            else:
                all_classes = None

        if num_samples >= split_size:
            logger.info("Writing annotations to '%s'", anno_path)
            etau.copy_file(full_anno_path, anno_path)
        else:
            logger.info(
                "Writing annotations for %d downloaded samples to '%s'",
                num_samples,
                anno_path,
            )
            _write_partial_annotations(
                d, anno_path, split, downloaded_filenames
            )

    return num_samples, all_classes, did_download


def _merge_dir(indir, outdir):
    etau.ensure_dir(outdir)
    for filename in os.listdir(indir):
        inpath = os.path.join(indir, filename)
        outpath = os.path.join(outdir, filename)
        shutil.move(inpath, outpath)


def _write_partial_annotations(d, outpath, split, filenames):
    id_map = {i["file_name"]: i["id"] for i in d["images"]}
    filenames = set(filenames)
    image_ids = {id_map[f] for f in filenames}

    d["images"] = [i for i in d["images"] if i["file_name"] in filenames]

    if split != "test":
        d["annotations"] = [
            a for a in d["annotations"] if a["image_id"] in image_ids
        ]
    else:
        d.pop("annotations", None)

    etas.write_json(d, outpath)


def _parse_label_types(label_types):
    if label_types is None:
        return _SUPPORTED_LABEL_TYPES

    if etau.is_str(label_types):
        label_types = [label_types]
    else:
        label_types = list(label_types)

    bad_types = [l for l in label_types if l not in _SUPPORTED_LABEL_TYPES]

    if len(bad_types) == 1:
        raise ValueError(
            "Unsupported label type '%s'. Supported types are %s"
            % (bad_types[0], _SUPPORTED_LABEL_TYPES)
        )

    if len(bad_types) > 1:
        raise ValueError(
            "Unsupported label types %s. Supported types are %s"
            % (bad_types, _SUPPORTED_LABEL_TYPES)
        )

    return label_types


def _parse_include_license(include_license):
    supported_values = {True, False, "id", "name", "url"}
    if include_license not in supported_values:
        raise ValueError(
            "Unsupported include_license=%s. Supported values are %s"
            % (include_license, supported_values)
        )

    if include_license == True:
        include_license = "name"

    return include_license


def _get_matching_image_ids(
    all_classes,
    images,
    annotations,
    image_ids=None,
    classes=None,
    shuffle=False,
    seed=None,
    max_samples=None,
):
    if image_ids is not None:
        image_ids = _parse_image_ids(image_ids, images)
    else:
        image_ids = list(images.keys())

    if classes is not None:
        all_ids, any_ids = _get_images_with_classes(
            image_ids, annotations, classes, all_classes
        )
    else:
        all_ids = image_ids
        any_ids = []

    all_ids = sorted(all_ids)
    any_ids = sorted(any_ids)

    if shuffle:
        if seed is not None:
            random.seed(seed)

        random.shuffle(all_ids)
        random.shuffle(any_ids)

    image_ids = all_ids + any_ids

    if max_samples is not None:
        return image_ids[:max_samples]

    return image_ids


def _get_existing_ids(images_dir, images, image_ids):
    filenames = set(etau.list_files(images_dir))

    existing_ids = []
    downloadable_ids = []
    for _id in image_ids:
        if images[_id]["file_name"] in filenames:
            existing_ids.append(_id)
        else:
            downloadable_ids.append(_id)

    return existing_ids, downloadable_ids


def _download_images(images_dir, image_ids, images, num_workers):
    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    tasks = []
    for image_id in image_ids:
        image_dict = images[image_id]
        url = image_dict["coco_url"]
        path = os.path.join(images_dir, image_dict["file_name"])
        tasks.append((url, path))

    if not tasks:
        return

    if num_workers <= 1:
        with fou.ProgressBar(iters_str="images") as pb:
            for task in pb(tasks):
                _do_download(task)
    else:
        with fou.ProgressBar(total=len(tasks), iters_str="images") as pb:
            with multiprocessing.dummy.Pool(num_workers) as pool:
                for _ in pool.imap_unordered(_do_download, tasks):
                    pb.update()


def _do_download(args):
    url, path = args
    etaw.download_file(url, path=path, quiet=True)


def _get_images_with_classes(
    image_ids, annotations, target_classes, all_classes
):
    if annotations is None:
        logger.warning("Dataset is unlabeled; ignoring classes requirement")
        return image_ids, []

    if etau.is_str(target_classes):
        target_classes = [target_classes]

    bad_classes = [c for c in target_classes if c not in all_classes]
    if bad_classes:
        raise ValueError("Unsupported classes: %s" % bad_classes)

    labels_map_rev = _to_labels_map_rev(all_classes)
    class_ids = {labels_map_rev[c] for c in target_classes}

    all_ids = []
    any_ids = []
    for image_id in image_ids:
        coco_objects = annotations.get(image_id, None)
        if not coco_objects:
            continue

        oids = set(o.category_id for o in coco_objects)
        if class_ids.issubset(oids):
            all_ids.append(image_id)
        elif class_ids & oids:
            any_ids.append(image_id)

    return all_ids, any_ids


def _parse_image_ids(raw_image_ids, images, split=None):
    # Load IDs from file
    if etau.is_str(raw_image_ids):
        image_ids_path = raw_image_ids
        ext = os.path.splitext(image_ids_path)[-1]
        if ext == ".txt":
            raw_image_ids = _load_image_ids_txt(image_ids_path)
        elif ext == ".json":
            raw_image_ids = _load_image_ids_json(image_ids_path)
        elif ext == ".csv":
            raw_image_ids = _load_image_ids_csv(image_ids_path)
        else:
            raise ValueError(
                "Invalid image ID file '%s'. Supported formats are .txt, "
                ".csv, and .json" % ext
            )

    image_ids = []
    for raw_id in raw_image_ids:
        if etau.is_str(raw_id):
            if "/" in raw_id:
                _split, raw_id = raw_id.split("/")
                if split and _split != split:
                    continue

            raw_id = int(raw_id.strip())

        image_ids.append(raw_id)

    # Validate that IDs exist
    invalid_ids = [_id for _id in image_ids if _id not in images]
    if invalid_ids:
        raise ValueError(
            "Found %d invalid IDs, ex: %s" % (len(invalid_ids), invalid_ids[0])
        )

    return image_ids


def _load_image_ids_txt(txt_path):
    with open(txt_path, "r") as f:
        return [l.strip() for l in f.readlines()]


def _load_image_ids_csv(csv_path):
    with open(csv_path, "r", newline="") as f:
        dialect = csv.Sniffer().sniff(f.read(10240))
        f.seek(0)
        if dialect.delimiter in _CSV_DELIMITERS:
            reader = csv.reader(f, dialect)
        else:
            reader = csv.reader(f)

        image_ids = [row for row in reader]

    if isinstance(image_ids[0], list):
        # Flatten list
        image_ids = [_id for ids in image_ids for _id in ids]

    return image_ids


def _load_image_ids_json(json_path):
    return [_id for _id in etas.load_json(json_path)]


def _make_images_list(images_dir):
    logger.info("Computing image metadata for '%s'", images_dir)

    image_paths = foud.parse_images_dir(images_dir)

    images = []
    with fou.ProgressBar() as pb:
        for idx, image_path in pb(enumerate(image_paths)):
            metadata = fom.ImageMetadata.build_for(image_path)
            images.append(
                {
                    "id": idx,
                    "file_name": os.path.basename(image_path),
                    "height": metadata.height,
                    "width": metadata.width,
                    "license": None,
                    "coco_url": None,
                }
            )

    return images


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}


def _get_matching_objects(coco_objects, target_classes, all_classes):
    if etau.is_str(target_classes):
        target_classes = [target_classes]

    labels_map_rev = _to_labels_map_rev(all_classes)
    class_ids = {labels_map_rev[c] for c in target_classes}

    return [obj for obj in coco_objects if obj.category_id in class_ids]


def _coco_objects_to_polylines(
    coco_objects,
    frame_size,
    classes,
    supercategory_map,
    tolerance,
    include_id,
):
    polylines = []
    for coco_obj in coco_objects:
        polyline = coco_obj.to_polyline(
            frame_size,
            classes=classes,
            supercategory_map=supercategory_map,
            tolerance=tolerance,
            include_id=include_id,
        )

        if polyline is not None:
            polylines.append(polyline)

    if not polylines:
        return None

    return fol.Polylines(polylines=polylines)


def _coco_objects_to_detections(
    coco_objects,
    frame_size,
    classes,
    supercategory_map,
    load_segmentations,
    include_id,
):
    detections = []
    for coco_obj in coco_objects:
        detection = coco_obj.to_detection(
            frame_size,
            classes=classes,
            supercategory_map=supercategory_map,
            load_segmentation=load_segmentations,
            include_id=include_id,
        )

        if detection is not None and (
            not load_segmentations or detection.mask is not None
        ):
            detections.append(detection)

    if not detections:
        return None

    return fol.Detections(detections=detections)


def _coco_objects_to_keypoints(
    coco_objects,
    frame_size,
    classes,
    supercategory_map,
    include_id,
):
    keypoints = []
    for coco_obj in coco_objects:
        keypoint = coco_obj.to_keypoints(
            frame_size,
            classes=classes,
            supercategory_map=supercategory_map,
            include_id=include_id,
        )

        if keypoint is not None:
            keypoints.append(keypoint)

    if not keypoints:
        return None

    return fol.Keypoints(keypoints=keypoints)


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


#
# The methods below are taken, in part, from:
# https://github.com/waspinator/pycococreator/blob/207b4fa8bbaae22ebcdeb3bbf00b724498e026a7/pycococreatortools/pycococreatortools.py
#


def _get_polygons_for_segmentation(segmentation, frame_size, tolerance):
    width, height = frame_size

    # Convert to [[x1, y1, x2, y2, ...]] polygons
    if isinstance(segmentation, list):
        abs_points = segmentation
    else:
        if isinstance(segmentation["counts"], list):
            # Uncompressed RLE
            rle = mask_utils.frPyObjects(segmentation, height, width)
        else:
            # RLE
            rle = segmentation

        mask = mask_utils.decode(rle)
        abs_points = _mask_to_polygons(mask, tolerance)

    # Convert to [[(x1, y1), (x2, y2), ...]] in relative coordinates

    rel_points = []
    for apoints in abs_points:
        rel_points.append(
            [(x / width, y / height) for x, y, in _pairwise(apoints)]
        )

    return rel_points


def _pairwise(x):
    y = iter(x)
    return zip(y, y)


def _coco_segmentation_to_mask(segmentation, bbox, frame_size):
    x, y, w, h = bbox
    width, height = frame_size

    if isinstance(segmentation, list):
        # Polygon -- a single object might consist of multiple parts, so merge
        # all parts into one mask RLE code
        rle = mask_utils.merge(
            mask_utils.frPyObjects(segmentation, height, width)
        )
    elif isinstance(segmentation["counts"], list):
        # Uncompressed RLE
        rle = mask_utils.frPyObjects(segmentation, height, width)
    else:
        # RLE
        rle = segmentation

    mask = mask_utils.decode(rle).astype(bool)

    return mask[
        int(round(y)) : int(round(y + h)),
        int(round(x)) : int(round(x + w)),
    ]


def _polyline_to_coco_segmentation(polyline, frame_size, iscrowd="iscrowd"):
    if polyline.get_attribute_value(iscrowd, None):
        seg = polyline.to_segmentation(frame_size=frame_size, target=1)
        return _mask_to_rle(seg.mask)

    width, height = frame_size
    polygons = []
    for points in polyline.points:
        polygon = []
        for x, y in points:
            polygon.append(int(x * width))
            polygon.append(int(y * height))

        polygons.append(polygon)

    return polygons


def _instance_to_coco_segmentation(
    detection, frame_size, iscrowd="iscrowd", tolerance=None
):
    dobj = foue.to_detected_object(detection, extra_attrs=False)

    try:
        mask = etai.render_instance_image(
            dobj.mask, dobj.bounding_box, frame_size
        )
    except:
        # Either mask or bounding box is too small to render
        width, height = frame_size
        mask = np.zeros((height, width), dtype=bool)

    if detection.get_attribute_value(iscrowd, None):
        return _mask_to_rle(mask)

    return _mask_to_polygons(mask, tolerance)


def _make_coco_keypoints(keypoint, frame_size):
    width, height = frame_size

    # @todo true COCO format would set v = 1/2 based on whether the keypoints
    # lie within the object's segmentation, but we'll be lazy for now

    keypoints = []
    for x, y in keypoint.points:
        keypoints.extend((int(x * width), int(y * height), 2))

    return keypoints


def _mask_to_rle(mask):
    counts = []
    for i, (value, elements) in enumerate(groupby(mask.ravel(order="F"))):
        if i == 0 and value == 1:
            counts.append(0)

        counts.append(len(list(elements)))

    return {"counts": counts, "size": list(mask.shape)}


def _mask_to_polygons(mask, tolerance):
    if tolerance is None:
        tolerance = 2

    # Pad mask to close contours of shapes which start and end at an edge
    padded_mask = np.pad(mask, pad_width=1, mode="constant", constant_values=0)

    contours = measure.find_contours(padded_mask, 0.5)
    contours = [c - 1 for c in contours]  # undo padding

    polygons = []
    for contour in contours:
        contour = _close_contour(contour)
        contour = measure.approximate_polygon(contour, tolerance)
        if len(contour) < 3:
            continue

        contour = np.flip(contour, axis=1)
        segmentation = contour.ravel().tolist()

        # After padding and subtracting 1 there may be -0.5 points
        segmentation = [0 if i < 0 else i for i in segmentation]

        polygons.append(segmentation)

    return polygons


def _close_contour(contour):
    if not np.array_equal(contour[0], contour[-1]):
        contour = np.vstack((contour, contour[0]))

    return contour


_IMAGE_DOWNLOAD_LINKS = {
    "2014": {
        "train": "http://images.cocodataset.org/zips/train2014.zip",
        "validation": "http://images.cocodataset.org/zips/val2014.zip",
        "test": "http://images.cocodataset.org/zips/test2014.zip",
    },
    "2017": {
        "train": "http://images.cocodataset.org/zips/train2017.zip",
        "validation": "http://images.cocodataset.org/zips/val2017.zip",
        "test": "http://images.cocodataset.org/zips/test2017.zip",
    },
}

_SPLIT_SIZES = {
    "2014": {"train": 82783, "test": 40775, "validation": 40504},
    "2017": {"train": 118287, "test": 40670, "validation": 5000},
}

_ANNOTATION_DOWNLOAD_LINKS = {
    "2014": "http://images.cocodataset.org/annotations/annotations_trainval2014.zip",
    "2017": "http://images.cocodataset.org/annotations/annotations_trainval2017.zip",
}

_ANNOTATION_PATHS = {
    "2014": {
        "train": "annotations/instances_train2014.json",
        "validation": "annotations/instances_val2014.json",
    },
    "2017": {
        "train": "annotations/instances_train2017.json",
        "validation": "annotations/instances_val2017.json",
    },
}

_KEYPOINTS_PATHS = {
    "2014": {
        "train": "annotations/person_keypoints_train2014.json",
        "validation": "annotations/person_keypoints_val2014.json",
    },
    "2017": {
        "train": "annotations/person_keypoints_train2017.json",
        "validation": "annotations/person_keypoints_val2017.json",
    },
}

_TEST_INFO_DOWNLOAD_LINKS = {
    "2014": "http://images.cocodataset.org/annotations/image_info_test2014.zip",
    "2017": "http://images.cocodataset.org/annotations/image_info_test2017.zip",
}

_TEST_INFO_PATHS = {
    "2014": "annotations/image_info_test2014.json",
    "2017": "annotations/image_info_test2017.json",
}

_SUPPORTED_LABEL_TYPES = ["detections", "segmentations", "keypoints"]

_SUPPORTED_SPLITS = ["train", "validation", "test"]

_CSV_DELIMITERS = [",", ";", ":", " ", "\t", "\n"]
