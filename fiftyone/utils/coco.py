"""
Utilities for working with datasets in
`COCO format <http://cocodataset.org/#home>`_.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from datetime import datetime
import logging
import os

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class COCODetectionSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples in
    `COCO detection format <http://cocodataset.org/#home>`_.

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
          the sample. Or, for unlabeled images, ``annotations`` can be
          ``None``.

    See :class:`fiftyone.types.dataset_types.COCODetectionDataset` for format
    details.

    Args:
        classes (None): a list of class label strings. If not provided, the
            ``category_id`` of the annotations will be used as labels
        supercategory_map (None): a dict mapping class labels to
            supercategories. If provided, ``supercategory`` attributes will be
            added to all parsed detections
    """

    def __init__(self, classes=None, supercategory_map=None):
        super().__init__(
            label_field=None,
            bounding_box_field=None,
            confidence_field=None,
            attributes_field=None,
            classes=classes,
            normalized=False,  # image required to convert to relative coords
        )
        self.supercategory_map = supercategory_map

    def _parse_detection(self, obj, img=None):
        coco_obj = COCOObject.from_annotation_dict(obj)
        frame_size = etai.to_frame_size(img=img)
        return coco_obj.to_detection(
            frame_size,
            classes=self.classes,
            supercategory_map=self.supercategory_map,
        )


class COCODetectionDatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for COCO detection datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.COCODetectionDataset` for format
    details.

    Args:
        dataset_dir: the dataset directory
    """

    def __init__(self, dataset_dir):
        super().__init__(dataset_dir)
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

        if self._annotations is not None:
            frame_size = (width, height)
            detections = fol.Detections(
                detections=[
                    obj.to_detection(
                        frame_size,
                        classes=self._classes,
                        supercategory_map=self._supercategory_map,
                    )
                    for obj in self._annotations.get(image_id, [])
                ]
            )
        else:
            detections = None

        return image_path, image_metadata, detections

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
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
        self._filenames = etau.list_files(self._data_dir, abs_paths=False)

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
    """

    def __init__(self, export_dir, classes=None, info=None, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.classes = classes
        self.info = info
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
        if self.classes is None and "classes" in sample_collection.info:
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


class COCOObject(etas.Serializable):
    """An object in COCO detection format.

    Args:
        id: the ID of the annotation
        image_id: the ID of the image in which the annotation appears
        category_id: the category ID of the object
        bbox: a bounding box for the object in ``[xmin, ymin, width, height]``
            format
        area (None): the area of the bounding box, in pixels
        iscrowd (None): 0 for polygon (object instance) segmentation and 1 for
            uncompressed RLE (crowd)
        segmentation (None): a list of segmentation data
    """

    def __init__(
        self,
        id,
        image_id,
        category_id,
        bbox,
        area=None,
        iscrowd=None,
        segmentation=None,
        **kwargs
    ):
        self.id = id
        self.image_id = image_id
        self.category_id = category_id
        self.bbox = bbox
        self.area = area
        self.iscrowd = iscrowd
        self.segmentation = segmentation

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

        if detection.has_attribute("area"):
            area = detection.get_attribute_value("area")
        else:
            # Round to one decimal place, as recommended by COCO authors
            area = round(bbox[2] * bbox[3], 1)

        if detection.has_attribute("iscrowd"):
            iscrowd = int(detection.get_attribute_value("iscrowd"))
        else:
            iscrowd = None

        # @todo parse `segmentation`

        return cls(None, None, category_id, bbox, area=area, iscrowd=iscrowd)

    def to_detection(self, frame_size, classes=None, supercategory_map=None):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image
            classes (None): the list of classes
            supercategory_map (None): a dict mapping class names to
                supercategories

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        if classes:
            label = classes[self.category_id]
        else:
            label = str(self.category_id)

        width, height = frame_size
        x, y, w, h = self.bbox
        bounding_box = [x / width, y / height, w / width, h / height]

        detection = fol.Detection(label=label, bounding_box=bounding_box)

        if supercategory_map is not None:
            supercategory = supercategory_map.get(label, None)
        else:
            supercategory = None

        if supercategory is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["supercategory"] = fol.CategoricalAttribute(
                value=supercategory
            )

        if self.area is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["area"] = fol.NumericAttribute(
                value=self.area
            )

        if self.iscrowd is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["iscrowd"] = fol.NumericAttribute(
                value=self.iscrowd
            )

        # @todo parse `segmentation`

        return detection

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        _attrs = [
            "id",
            "image_id",
            "category_id",
            "bbox",
        ]
        if self.area is not None:
            _attrs.append("area")
        if self.iscrowd is not None:
            _attrs.append("iscrowd")
        if self.segmentation is not None:
            _attrs.append("segmentation")
        return _attrs

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
            annotations[a["image_id"]].append(
                COCOObject.from_annotation_dict(a)
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
