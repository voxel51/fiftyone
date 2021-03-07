"""
Utilities for working with datasets in
`COCO format <https://cocodataset.org/#format-data>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from datetime import datetime
from itertools import groupby
import logging
import os
import warnings

import numpy as np
from skimage import measure

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

mask_utils = fou.lazy_import(
    "pycocotools.mask", callback=fou.ensure_pycocotools
)


logger = logging.getLogger(__name__)


class COCODetectionSampleParser(foud.LabeledImageTupleSampleParser):
    """Parser for samples in
    `COCO Object Detection Format <https://cocodataset.org/#format-data>`_.

    This implementation supports samples that are
    ``(image_or_path, anno_dict_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``anno_dict_or_path`` is a list of detections in the following
          format::

            [
                {
                    "id": 354728
                    "image_id": 183709,
                    "category_id": 3,
                    "bbox": [45.03, 236.82, 54.79, 30.91],
                    "segmentation": [...],
                    "area": 1193.6559000000002,
                    "iscrowd": 0,
                },
                ...
            ]

          or the path to such a JSON file on disk. It is assumed that all
          detections correspond to the image in the sample. For unlabeled
          images, ``anno_dict_or_path`` can be ``None``.

    See :class:`fiftyone.types.dataset_types.COCODetectionDataset` for format
    details.

    Args:
        classes (None): a list of class label strings. If not provided, the
            ``category_id`` of the annotations will be used as labels
        supercategory_map (None): a dict mapping class labels to
            supercategories. If provided, ``supercategory`` attributes will be
            added to all parsed detections
        load_segmentations (True): whether to load segmentation masks, if
            available
        return_polylines (False): whether to return
            :class:`fiftyone.core.labels.Polylines` instances rather than
            :class:`fiftyone.core.labels.Detections`
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
    """

    def __init__(
        self,
        classes=None,
        supercategory_map=None,
        load_segmentations=True,
        return_polylines=False,
        tolerance=None,
    ):
        super().__init__()
        self.classes = classes
        self.supercategory_map = supercategory_map
        self.load_segmentations = load_segmentations
        self.return_polylines = return_polylines
        self.tolerance = tolerance

    @property
    def label_cls(self):
        if self.return_polylines:
            return fol.Polylines

        return fol.Detections

    def get_label(self):
        anno_dict = self.current_sample[1]
        img = self._current_image

        return self._parse_anno_dict(anno_dict, img)

    def _parse_anno_dict(self, anno_dict, img):
        if anno_dict is None:
            return None

        if etau.is_str(anno_dict):
            anno_dict = etas.load_json(anno_dict)

        frame_size = etai.to_frame_size(img=img)
        coco_objects = [COCOObject.from_anno_dict(d) for d in anno_dict]

        if self.return_polylines:
            return _coco_objects_to_polylines(
                coco_objects,
                frame_size,
                self.classes,
                self.supercategory_map,
                self.tolerance,
            )

        return _coco_objects_to_detections(
            coco_objects,
            frame_size,
            self.classes,
            self.supercategory_map,
            self.load_segmentations,
        )


class COCODetectionDatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for COCO detection datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.COCODetectionDataset` for format
    details.

    Args:
        dataset_dir: the dataset directory
        load_segmentations (True): whether to load segmentation masks, if
            available
        return_polylines (False): whether to return
            :class:`fiftyone.core.labels.Polylines` instances rather than
            :class:`fiftyone.core.labels.Detections`
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        load_segmentations=True,
        return_polylines=False,
        tolerance=None,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir,
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self.load_segmentations = load_segmentations
        self.return_polylines = return_polylines
        self.tolerance = tolerance
        self._data_dir = None
        self._info = None
        self._classes = None
        self._supercategory_map = None
        self._images_map = None
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

        image_path = os.path.join(self._data_dir, filename)

        image_dict = self._images_map.get(filename, None)
        if image_dict is None:
            image_metadata = fom.ImageMetadata.build_for(image_path)
            return image_path, image_metadata, None

        image_id = image_dict["id"]
        width = image_dict["width"]
        height = image_dict["height"]

        image_metadata = fom.ImageMetadata(width=width, height=height)

        if self._annotations is None:
            return image_path, image_metadata, None

        coco_objects = self._annotations.get(image_id, [])
        frame_size = (width, height)

        if self.return_polylines:
            label = _coco_objects_to_polylines(
                coco_objects,
                frame_size,
                self._classes,
                self._supercategory_map,
                self.tolerance,
            )
        else:
            label = _coco_objects_to_detections(
                coco_objects,
                frame_size,
                self._classes,
                self._supercategory_map,
                self.load_segmentations,
            )

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        if self.return_polylines:
            return fol.Polylines

        return fol.Detections

    def setup(self):
        self._data_dir = os.path.join(self.dataset_dir, "data")

        labels_path = os.path.join(self.dataset_dir, "labels.json")
        if os.path.isfile(labels_path):
            (
                info,
                classes,
                supercategory_map,
                images,
                annotations,
            ) = load_coco_detection_annotations(labels_path)
        else:
            info = {}
            classes = None
            supercategory_map = None
            images = {}
            annotations = None

        if classes is not None:
            info["classes"] = classes

        self._info = info
        self._classes = classes
        self._supercategory_map = supercategory_map
        self._images_map = {i["file_name"]: i for i in images.values()}
        self._annotations = annotations

        if self.skip_unlabeled:
            filenames = self._images_map.keys()
        else:
            filenames = etau.list_files(self._data_dir, abs_paths=False)

        self._filenames = self._preprocess_list(filenames)

    def get_dataset_info(self):
        return self._info


class COCODetectionDatasetExporter(foud.LabeledImageDatasetExporter):
    """Exporter that writes COCO detection datasets to disk.

    See :class:`fiftyone.types.dataset_types.COCODetectionDataset` for format
    details.

    Args:
        export_dir: the directory to write the export
        classes (None): the list of possible class labels. If not provided,
            this list will be extracted when :meth:`log_collection` is called,
            if possible
        info (None): a dict of info as returned by
            :meth:`load_coco_detection_annotations`. If not provided, this info
            will be extracted when :meth:`log_collection` is called, if
            possible
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        tolerance (None): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
    """

    def __init__(
        self,
        export_dir,
        classes=None,
        info=None,
        image_format=None,
        tolerance=None,
    ):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.classes = classes
        self.info = info
        self.image_format = image_format
        self.tolerance = tolerance
        self._labels_map_rev = None
        self._data_dir = None
        self._labels_path = None
        self._image_id = None
        self._anno_id = None
        self._images = None
        self._annotations = None
        self._classes = None
        self._filename_maker = None
        self._has_labels = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_path = os.path.join(self.export_dir, "labels.json")
        self._image_id = -1
        self._anno_id = -1
        self._images = []
        self._annotations = []
        self._classes = set()
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir, default_ext=self.image_format
        )
        self._has_labels = False
        self._parse_classes()

    def log_collection(self, sample_collection):
        if self.classes is None:
            if sample_collection.default_classes:
                self.classes = sample_collection.default_classes
                self._parse_classes()
            elif sample_collection.classes:
                self.classes = next(iter(sample_collection.classes.values()))
                self._parse_classes()
            elif "classes" in sample_collection.info:
                self.classes = sample_collection.info["classes"]
                self._parse_classes()

        if self.info is None:
            self.info = sample_collection.info

    def export_sample(self, image_or_path, detections, metadata=None):
        out_image_path = self._export_image_or_path(
            image_or_path, self._filename_maker
        )

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(out_image_path)

        self._image_id += 1
        self._images.append(
            {
                "id": self._image_id,
                "file_name": os.path.basename(out_image_path),
                "height": metadata.height,
                "width": metadata.width,
                "license": None,
                "coco_url": None,
            }
        )

        if detections is None:
            return

        self._has_labels = True
        for detection in detections.detections:
            self._anno_id += 1
            self._classes.add(detection.label)
            obj = COCOObject.from_detection(
                detection,
                metadata,
                labels_map_rev=self._labels_map_rev,
                tolerance=self.tolerance,
            )
            obj.id = self._anno_id
            obj.image_id = self._image_id
            self._annotations.append(obj.to_anno_dict())

    def close(self, *args):
        # Populate observed category IDs, if necessary
        if self.classes is None:
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
        categories = self.info.get("categories", None)

        if categories is None:
            categories = [
                {"id": i, "name": l, "supercategory": None}
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

        etas.write_json(labels, self._labels_path)

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class COCOObject(object):
    """An object in COCO detection format.

    Args:
        id: the ID of the annotation
        image_id: the ID of the image in which the annotation appears
        category_id: the category ID of the object
        bbox: a bounding box for the object in ``[xmin, ymin, width, height]``
            format
        segmentation (None): the segmentation data for the object
        area (None): the area of the bounding box, in pixels
        iscrowd (None): whether the detection is a crowd
    """

    def __init__(
        self,
        id,
        image_id,
        category_id,
        bbox,
        segmentation=None,
        area=None,
        iscrowd=None,
    ):
        self.id = id
        self.image_id = image_id
        self.category_id = category_id
        self.bbox = bbox
        self.segmentation = segmentation
        self.area = area
        self.iscrowd = iscrowd

    def to_polyline(
        self, frame_size, classes=None, supercategory_map=None, tolerance=None
    ):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image
            classes (None): the list of classes
            supercategory_map (None): a dict mapping class names to
                supercategories
            tolerance (None): a tolerance, in pixels, when generating
                approximate polylines for instance masks. Typical values are
                1-3 pixels

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        if self.segmentation is None:
            return []

        label, attributes = self._get_label_and_attributes(
            classes, supercategory_map
        )

        points = _get_polygons_for_segmentation(
            self.segmentation, frame_size, tolerance
        )

        return fol.Polyline(
            label=label,
            points=points,
            closed=False,
            filled=True,
            attributes=attributes,
        )

    def to_detection(
        self,
        frame_size,
        classes=None,
        supercategory_map=None,
        load_segmentation=False,
    ):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image
            classes (None): the list of classes
            supercategory_map (None): a dict mapping class names to
                supercategories
            load_segmentation (False): whether to load the segmentation mask
                for the object, if available

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label, attributes = self._get_label_and_attributes(
            classes, supercategory_map
        )

        width, height = frame_size
        x, y, w, h = self.bbox
        bounding_box = [x / width, y / height, w / width, h / height]

        mask = None
        if load_segmentation:
            try:
                mask = _coco_segmentation_to_mask(
                    self.segmentation, self.bbox, frame_size
                )
            except:
                warnings.warn(
                    "Failed to convert segmentation to mask; skipping mask"
                )

        return fol.Detection(
            label=label,
            bounding_box=bounding_box,
            mask=mask,
            attributes=attributes,
        )

    def to_anno_dict(self):
        """Returns a COCO annotation dictionary representation of the object.

        Returns:
            a COCO annotation dict
        """
        return {
            "id": self.id,
            "image_id": self.image_id,
            "category_id": self.category_id,
            "bbox": self.bbox,
            "segmentation": self.segmentation,
            "area": self.area,
            "iscrowd": self.iscrowd,
        }

    @classmethod
    def from_detection(
        cls, detection, metadata, labels_map_rev=None, tolerance=None
    ):
        """Creates a :class:`COCOObject` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            detection: a :class:`fiftyone.core.labels.Detection`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image
            labels_map_rev (None): an optional dict mapping labels to category
                IDs
            tolerance (None): a tolerance, in pixels, when generating
                approximate polylines for instance masks. Typical values are
                1-3 pixels

        Returns:
            a :class:`COCOObject`
        """
        if labels_map_rev:
            category_id = labels_map_rev[detection.label]
        else:
            category_id = detection.label

        width = metadata.width
        height = metadata.height
        x, y, w, h = detection.bounding_box
        bbox = [
            round(x * width, 1),
            round(y * height, 1),
            round(w * width, 1),
            round(h * height, 1),
        ]

        if detection.has_attribute("area"):
            area = detection.get_attribute_value("area")
        else:
            # Round to one decimal place, as recommended by COCO authors
            area = round(bbox[2] * bbox[3], 1)

        if detection.has_attribute("iscrowd"):
            iscrowd = int(detection.get_attribute_value("iscrowd"))
        else:
            iscrowd = None

        frame_size = (width, height)
        segmentation = _make_coco_segmentation(
            detection, frame_size, iscrowd, tolerance
        )

        return cls(
            None,
            None,
            category_id,
            bbox,
            segmentation=segmentation,
            area=area,
            iscrowd=iscrowd,
        )

    @classmethod
    def from_anno_dict(cls, d):
        """Creates a :class:`COCOObject` from a COCO annotation dict.

        Args:
            d: a COCO annotation dict

        Returns:
            a :class:`COCOObject`
        """
        return cls(
            d["id"],
            d["image_id"],
            d["category_id"],
            d["bbox"],
            segmentation=d.get("segmentation", None),
            area=d.get("area", None),
            iscrowd=d.get("iscrowd", None),
        )

    def _get_label_and_attributes(self, classes, supercategory_map):
        if classes:
            label = classes[self.category_id]
        else:
            label = str(self.category_id)

        attributes = {}

        if supercategory_map is not None:
            supercategory = supercategory_map.get(label, None)
        else:
            supercategory = None

        if supercategory is not None:
            attributes["supercategory"] = fol.CategoricalAttribute(
                value=supercategory
            )

        if self.area is not None:
            attributes["area"] = fol.NumericAttribute(value=self.area)

        if self.iscrowd is not None:
            attributes["iscrowd"] = fol.NumericAttribute(value=self.iscrowd)

        return label, attributes


def load_coco_detection_annotations(json_path):
    """Loads the COCO annotations from the given JSON file.

    See :class:`fiftyone.types.dataset_types.COCODetectionDataset` for format
    details.

    Args:
        json_path: the path to the annotations JSON file

    Returns:
        a tuple of

        -   info: a dict of dataset info
        -   classes: a list of classes
        -   supercategory_map: a dict mapping class labels to supercategories
        -   images: a dict mapping image filenames to image dicts
        -   annotations: a dict mapping image IDs to list of
            :class:`COCOObject` instances, or ``None`` for unlabeled datasets
    """
    d = etas.load_json(json_path)

    # Load info
    info = d.get("info", {})
    licenses = d.get("licenses", None)
    categories = d.get("categories", None)
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
            annotations[a["image_id"]].append(COCOObject.from_anno_dict(a))

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
                    "supercategory": "animal"
                },
                ...
            ]

    Returns:
        a tuple of

        -   classes: a list of classes
        -   supercategory_map: a dict mapping class labels to supercategories
    """
    id_map = {
        c["id"]: (c.get("name", None), c.get("supercategory", None))
        for c in categories
    }

    classes = []
    supercategory_map = {}
    for idx in range(max(id_map) + 1):
        name, supercategory = id_map.get(idx, (None, None))
        if name is None:
            name = str(idx)

        classes.append(name)
        supercategory_map[name] = supercategory

    return classes, supercategory_map


def download_coco_dataset_split(dataset_dir, split, year="2017", cleanup=True):
    """Downloads and extracts the given split of the COCO dataset to the
    specified directory.

    Any existing files are not re-downloaded.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        year ("2017"): the dataset year to download. Supported values are
            ``("2014", "2017")``
        cleanup (True): whether to cleanup the zip files after extraction

    Returns:
        a tuple of

        -   images_dir: the path to the directory containing the extracted
            images
        -   anno_path: the path to the annotations JSON file
    """
    if year not in _IMAGE_DOWNLOAD_LINKS:
        raise ValueError(
            "Unsupported year '%s'; supported values are %s"
            % (year, tuple(_IMAGE_DOWNLOAD_LINKS.keys()))
        )

    if split not in _IMAGE_DOWNLOAD_LINKS[year]:
        raise ValueError(
            "Unsupported split '%s'; supported values are %s"
            % (year, tuple(_IMAGE_DOWNLOAD_LINKS[year].keys()))
        )

    #
    # Download images
    #

    images_src_path = _IMAGE_DOWNLOAD_LINKS[year][split]
    images_zip_path = os.path.join(
        dataset_dir, os.path.basename(images_src_path)
    )
    images_dir = os.path.join(
        dataset_dir, os.path.splitext(os.path.basename(images_src_path))[0]
    )

    if not os.path.isdir(images_dir):
        logger.info("Downloading images zip to '%s'", images_zip_path)
        etaw.download_file(images_src_path, path=images_zip_path)
        logger.info("Extracting images to '%s'", images_dir)
        etau.extract_zip(images_zip_path, delete_zip=cleanup)
    else:
        logger.info("Image folder '%s' already exists", images_dir)

    #
    # Download annotations
    #

    anno_path = os.path.join(dataset_dir, _ANNOTATION_PATHS[year][split])

    if split == "test":
        # Test split has no annotations, so we must populate the labels file
        # manually
        images = _make_images_list(images_dir)

        labels = {
            "info": {},
            "licenses": [],
            "categories": [],
            "images": images,
            "annotations": [],
        }
        etas.write_json(labels, anno_path)
    else:
        anno_src_path = _ANNOTATION_DOWNLOAD_LINKS[year]
        anno_zip_path = os.path.join(
            dataset_dir, os.path.basename(anno_src_path)
        )

        if not os.path.isfile(anno_path):
            logger.info("Downloading annotations zip to '%s'", anno_zip_path)
            etaw.download_file(anno_src_path, path=anno_zip_path)
            logger.info("Extracting annotations to '%s'", anno_path)
            etau.extract_zip(anno_zip_path, delete_zip=cleanup)
        else:
            logger.info("Annotations file '%s' already exists", anno_path)

    return images_dir, anno_path


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

_ANNOTATION_DOWNLOAD_LINKS = {
    "2014": "http://images.cocodataset.org/annotations/annotations_trainval2014.zip",
    "2017": "http://images.cocodataset.org/annotations/annotations_trainval2017.zip",
}

_ANNOTATION_PATHS = {
    "2014": {
        "train": "annotations/instances_train2014.json",
        "validation": "annotations/instances_val2014.json",
        "test": "annotations/instances_test2014.json",
    },
    "2017": {
        "train": "annotations/instances_train2017.json",
        "validation": "annotations/instances_val2017.json",
        "test": "annotations/instances_test2017.json",
    },
}


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}


def _coco_objects_to_polylines(
    coco_objects, frame_size, classes, supercategory_map, tolerance
):
    polylines = []
    for coco_obj in coco_objects:
        polylines.append(
            coco_obj.to_polyline(
                frame_size,
                classes=classes,
                supercategory_map=supercategory_map,
                tolerance=tolerance,
            )
        )

    return fol.Polylines(polylines=polylines)


def _coco_objects_to_detections(
    coco_objects, frame_size, classes, supercategory_map, load_segmentations
):
    detections = []
    for coco_obj in coco_objects:
        detections.append(
            coco_obj.to_detection(
                frame_size,
                classes=classes,
                supercategory_map=supercategory_map,
                load_segmentation=load_segmentations,
            )
        )

    return fol.Detections(detections=detections)


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
    if segmentation is None:
        return None

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
        int(round(y)) : int(round(y + h)), int(round(x)) : int(round(x + w)),
    ]


def _make_coco_segmentation(detection, frame_size, iscrowd, tolerance):
    if detection.mask is None:
        return None

    dobj = detection.to_detected_object()
    mask = etai.render_instance_image(dobj.mask, dobj.bounding_box, frame_size)

    if iscrowd:
        return _mask_to_rle(mask)

    return _mask_to_polygons(mask, tolerance)


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
    contours = np.subtract(contours, 1)  # undo padding

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
