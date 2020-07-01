"""
Utilities for working with datasets in COCO format.

The COCO dataset: http://cocodataset.org/#home.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from collections import defaultdict
from datetime import datetime
import logging
import os

import eta.core.utils as etau
import eta.core.serial as etas
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class COCODetectionSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples in COCO detection format.

    This implementation supports samples that are
    ``(image_or_path, annotations)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``annotations`` is a list of detections in the following format::

            [
                {
                    "id": 354728
                    "image_id": 183709,
                    "category_id": 3,
                    "segmentation": [[...]],
                    "bbox": [45.03, 236.82, 54.79, 30.91],
                    "area": 1193.6559000000002,
                    "iscrowd": 0,
                },
                ...
            ]

          where it is assumed that all detections correspond to the image in
          the sample.

    See :class:`fiftyone.types.COCODetectionDataset` for format details.
    """

    def __init__(self):
        super().__init__(
            label_field="category_id",
            bounding_box_field="bbox",
            classes=None,
            normalized=False,
        )

    def _parse_detection(self, obj, img=None):
        detection = super()._parse_detection(obj, img=img)
        if "area" in obj:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["area"] = fol.NumericAttribute(
                value=obj["area"]
            )

        return detection


class COCODetectionDatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for COCO detection datasets stored on disk.

    See :class:`fiftyone.types.COCODetectionDataset` for format details.

    Args:
        dataset_dir: the dataset directory
    """

    def __init__(self, dataset_dir):
        super().__init__(dataset_dir)
        self._data_dir = None
        self._classes = None
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

        image_dict = self._images_map[filename]
        image_id = image_dict["id"]
        width = image_dict["width"]
        height = image_dict["height"]

        image_metadata = fom.ImageMetadata(width=width, height=height)

        frame_size = (width, height)
        detections = fol.Detections(
            detections=[
                obj.to_detection(frame_size, self._classes)
                for obj in self._annotations.get(image_id, [])
            ]
        )

        return image_path, image_metadata, detections

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._data_dir = os.path.join(self.dataset_dir, "data")

        labels_path = os.path.join(self.dataset_dir, "labels.json")
        classes, images, annotations = load_coco_detection_annotations(
            labels_path
        )

        self._classes = classes
        self._images_map = {i["file_name"]: i for i in images.values()}
        self._annotations = annotations
        self._filenames = etau.list_files(self._data_dir, abs_paths=False)


class COCODetectionDatasetExporter(foud.LabeledImageDatasetExporter):
    """Exporter that writes COCO detection datasets to disk.

    See :class:`fiftyone.types.COCODetectionDataset` for format details.

    Args:
        export_dir: the directory to write the export
        classes (None): an optional list of class labels. If omitted, this is
            dynamically computed from the observed labels
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, classes=None, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.classes = classes
        self.image_format = image_format
        self._labels_map_rev = None
        self._data_dir = None
        self._labels_path = None
        self._image_id = None
        self._anno_id = None
        self._images = None
        self._annotations = None
        self._classes = None
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)
        else:
            self._labels_map_rev = None

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

        for detection in detections.detections:
            self._anno_id += 1
            self._classes.add(detection.label)
            obj = COCOObject.from_detection(
                detection, metadata, labels_map_rev=self._labels_map_rev
            )
            obj.id = self._anno_id
            obj.image_id = self._image_id
            self._annotations.append(obj)

    def close(self, *args):
        # Populate observed category IDs, if necessary
        if self.classes is None:
            classes = sorted(self._classes)
            labels_map_rev = _to_labels_map_rev(classes)
            for anno in self._annotations:
                anno.category_id = labels_map_rev[anno.category_id]
        else:
            classes = self.classes

        info = {
            "year": "",
            "version": "",
            "description": "Exported from FiftyOne",
            "contributor": "",
            "url": "https://voxel51.com/fiftyone",
            "date_created": datetime.now().replace(microsecond=0).isoformat(),
        }

        categories = [
            {"id": i, "name": l, "supercategory": "none"}
            for i, l in enumerate(classes)
        ]

        labels = {
            "info": info,
            "licenses": [],
            "categories": categories,
            "images": self._images,
            "annotations": self._annotations,
        }

        etas.write_json(labels, self._labels_path)


class COCOObject(etas.Serializable):
    """An object in COCO detection format.

    Args:
        id: the ID of the annotation
        image_id: the ID of the image in which the annotation appears
        category_id: the category ID of the object
        bbox: a bounding box for the object in ``[xmin, ymin, width, height]``
            format
        area (None): the area of the bounding box
        segmentation (None): a list of segmentation data
        iscrowd (None): 0 for polygon (object instance) segmentation and 1 for
            uncompressed RLE (crowd)
    """

    def __init__(
        self,
        id,
        image_id,
        category_id,
        bbox,
        area=None,
        segmentation=None,
        iscrowd=0,
    ):
        self.id = id
        self.image_id = image_id
        self.category_id = category_id
        self.bbox = bbox
        self.area = area
        self.segmentation = segmentation
        self.iscrowd = iscrowd

    @classmethod
    def from_annotation_dict(cls, d):
        """Creates a :class:`COCOObject` from a COCO annotation dict.

        Args:
            d: an annotation dict

        Returns:
            a :class:`COCOObject`
        """
        return cls.from_dict(d)

    @classmethod
    def from_detection(cls, detection, metadata, labels_map_rev=None):
        """Creates a :class:`COCOObject` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            detection: a :class:`fiftyone.core.labels.Detection`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image
            labels_map_rev (None): an optional dict mapping labels to category
                IDs

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
        area = round(bbox[2] * bbox[3], 1)

        return cls(None, None, category_id, bbox, area=area)

    def to_detection(self, frame_size, classes):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image
            classes: the list of classes

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label = classes[self.category_id]

        width, height = frame_size
        x, y, w, h = self.bbox
        bounding_box = [x / width, y / height, w / width, h / height]

        detection = fol.Detection(label=label, bounding_box=bounding_box)

        if self.area is not None:
            # pylint: disable=unsupported-assignment-operation
            area = self.area / (width * height)
            detection.attributes["area"] = fol.NumericAttribute(value=area)

        return detection

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return [
            "id",
            "image_id",
            "category_id",
            "bbox",
            "area",
            "segmentation",
            "iscrowd",
        ]

    @classmethod
    def from_dict(cls, d):
        """Creates a :class:`COCOObject` from a JSON dictionary.

        Args:
            d: a JSON dict

        Returns:
            a :class:`COCOObject`
        """
        return cls(**d)


def load_coco_detection_annotations(json_path):
    """Loads the COCO annotations from the given JSON file.

    See :class:`fiftyone.types.COCODetectionDataset` for format details.

    Args:
        json_path: the path to the annotations JSON file

    Returns:
        classes: a list of classes
        images: a dict mapping image filenames to image dicts
        annotations: a dict mapping image IDs to list of :class:`COCOObject`
            instances
    """
    d = etas.load_json(json_path)

    # Load classes
    categories = d.get("categories", None)
    if categories:
        classes = coco_categories_to_classes(categories)
    else:
        classes = None

    # Load image metadata
    images = {i["id"]: i for i in d.get("images", [])}

    # Load annotations
    annotations = defaultdict(list)
    for a in d["annotations"]:
        annotations[a["image_id"]].append(COCOObject.from_annotation_dict(a))

    return classes, images, dict(annotations)


def coco_categories_to_classes(categories):
    """Converts the COCO categories list to a class list.

    The returned list contains all class IDs from ``[0, max_id]``, inclusive.

    Args:
        categories: a dict of the form::

            [
                ...
                {
                    "id": 2,
                    "name": "cat",
                    "supercategory": "none"
                },
                ...
            ]

    Returns:
        a list of classes
    """
    labels_map = {c["id"]: c["name"] for c in categories}

    classes = []
    for idx in range(max(labels_map) + 1):
        classes.append(labels_map.get(idx, str(idx)))

    return classes


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
        images_dir: the path to the directory containing the extracted images
        anno_path: the path to the detections JSON file, or ``None`` if
            ``split == "test"``
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

    try:
        anno_src_path = _ANNOTATION_DOWNLOAD_LINKS[year]
        anno_path = os.path.join(dataset_dir, _ANNOTATION_PATHS[year][split])
        anno_zip_path = os.path.join(
            dataset_dir, os.path.basename(anno_src_path)
        )
    except KeyError:
        # No annotations
        return images_dir, None

    if not os.path.isfile(anno_path):
        logger.info("Downloading annotations zip to '%s'", anno_zip_path)
        etaw.download_file(anno_src_path, path=anno_zip_path)
        logger.info("Extracting annotations to '%s'", anno_path)
        etau.extract_zip(anno_zip_path, delete_zip=cleanup)
    else:
        logger.info("Annotations file '%s' already exists", anno_path)

    return images_dir, anno_path


_IMAGE_DOWNLOAD_LINKS = {
    "2014": {
        "train": "http://images.cocodataset.org/zips/train2014.zip",
        "validation": "http://images.cocodataset.org/zips/validation2014.zip",
        "test": "http://images.cocodataset.org/zips/test2014.zip",
    },
    "2017": {
        "train": "http://images.cocodataset.org/zips/train2017.zip",
        "validation": "http://images.cocodataset.org/zips/validation2017.zip",
        "test": "http://images.cocodataset.org/zips/test2017.zip",
    },
}

_ANNOTATION_DOWNLOAD_LINKS = {
    "2014": "http://images.cocodataset.org/annotations/annotations_trainval2014.zip",
    "2017": "http://images.cocodataset.org/annotations/annotations_trainval2017.zip",
}

_ANNOTATION_PATHS = {
    "2014": {
        "train": "annotations/instances_train2017.json",
        "validation": "annotations/instances_val2017.json",
    },
    "2017": {
        "train": "annotations/instances_train2017.json",
        "validation": "annotations/instances_val2017.json",
    },
}


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}
