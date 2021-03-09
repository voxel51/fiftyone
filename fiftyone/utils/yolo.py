"""
Utilities for working with datasets in
`YOLO format <https://github.com/AlexeyAB/darknet>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


class YOLOSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples in
    `YOLO format <https://github.com/AlexeyAB/darknet>`_.

    This implementation supports samples that are
    ``(image_or_path, anno_txt_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``anno_txt_path`` is the path to a YOLO labels TXT file on disk. Or,
          for unlabeled images, ``anno_txt_path`` can be ``None``.

    See :class:`fiftyone.types.dataset_types.YOLODataset` for format details.

    Args:
        classes (None): a list of class label strings. If provided, it is
            assumed that the ``target`` values are class IDs that should be
            mapped to label strings via ``classes[target]``
    """

    def __init__(self, classes=None):
        super().__init__(
            label_field=None,
            bounding_box_field=None,
            confidence_field=None,
            attributes_field=None,
            classes=classes,
            normalized=True,
        )

    def _parse_label(self, target, img=None):
        if target is None:
            return None

        return load_yolo_annotations(target, self.classes)


class YOLODatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for YOLO datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.YOLODataset` for format details.

    Args:
        dataset_dir: the dataset directory
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
        self._classes = None
        self._info = None
        self._uuids_to_image_paths = None
        self._uuids_to_labels_paths = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        try:
            image_path = self._uuids_to_image_paths[uuid]
        except KeyError:
            raise ValueError("No image found for sample '%s'" % uuid)

        labels_path = self._uuids_to_labels_paths.get(uuid, None)
        if labels_path:
            # Labeled image
            detections = load_yolo_annotations(labels_path, self._classes)
        else:
            # Unlabeled image
            detections = None

        return image_path, None, detections

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        classes_path = os.path.join(self.dataset_dir, "obj.names")
        if os.path.exists(classes_path):
            classes = _read_file_lines(classes_path)
        else:
            classes = None

        info = {}
        if classes is not None:
            info["classes"] = classes

        images_path = os.path.join(self.dataset_dir, "images.txt")
        if os.path.exists(images_path):
            images = _read_file_lines(images_path)
        else:
            images = []

        uuids = []
        uuids_to_image_paths = {}
        uuids_to_labels_paths = {}
        for image in images:
            uuid = os.path.splitext(os.path.basename(image))[0]
            uuids.append(uuid)

            uuids_to_image_paths[uuid] = os.path.join(self.dataset_dir, image)

            labels_path = os.path.join(
                self.dataset_dir, os.path.splitext(image)[0] + ".txt"
            )

            if os.path.exists(labels_path):
                uuids_to_labels_paths[uuid] = labels_path

        if self.skip_unlabeled:
            uuids = list(uuids_to_labels_paths.keys())

        self._classes = classes
        self._info = info
        self._uuids = self._preprocess_list(uuids)
        self._uuids_to_image_paths = uuids_to_image_paths
        self._uuids_to_labels_paths = uuids_to_labels_paths
        self._num_samples = len(self._uuids)

    def get_dataset_info(self):
        return self._info


class YOLODatasetExporter(foud.LabeledImageDatasetExporter):
    """Exporter that writes YOLO datasets to disk.

    See :class:`fiftyone.types.dataset_types.YOLODataset` for format details.

    Args:
        export_dir: the directory to write the export
        classes (None): the list of possible class labels. If not provided,
            this list will be extracted when :meth:`log_collection` is called,
            if possible
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

        self._classes = None
        self._dynamic_classes = classes is None
        self._labels_map_rev = None
        self._obj_names_path = None
        self._images_path = None
        self._data_dir = None
        self._images = None
        self._filename_maker = None
        self._writer = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._obj_names_path = os.path.join(self.export_dir, "obj.names")
        self._images_path = os.path.join(self.export_dir, "images.txt")
        self._data_dir = os.path.join(self.export_dir, "data")

        self._classes = {}
        self._labels_map_rev = {}
        self._images = []

        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._writer = YOLOAnnotationWriter()

        etau.ensure_dir(self._data_dir)
        self._parse_classes()

    def log_collection(self, sample_collection):
        if self.classes is None:
            if sample_collection.default_classes:
                self.classes = sample_collection.default_classes
                self._parse_classes()
                self._dynamic_classes = False
            elif sample_collection.classes:
                self.classes = next(iter(sample_collection.classes.values()))
                self._parse_classes()
                self._dynamic_classes = False
            elif "classes" in sample_collection.info:
                self.classes = sample_collection.info["classes"]
                self._parse_classes()
                self._dynamic_classes = False

    def export_sample(self, image_or_path, detections, metadata=None):
        out_image_path = self._export_image_or_path(
            image_or_path, self._filename_maker
        )

        if detections is None:
            return

        self._images.append(os.path.relpath(out_image_path, self.export_dir))

        out_labels_path = os.path.splitext(out_image_path)[0] + ".txt"

        self._writer.write(
            detections,
            out_labels_path,
            self._labels_map_rev,
            dynamic_classes=self._dynamic_classes,
        )

    def close(self, *args):
        if self._dynamic_classes:
            classes = _to_classes(self._labels_map_rev)
        else:
            classes = self.classes

        _write_file_lines(classes, self._obj_names_path)
        _write_file_lines(self._images, self._images_path)

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class YOLOAnnotationWriter(object):
    """Class for writing annotations in YOLO format.

    See :class:`fiftyone.types.dataset_types.YOLODataset` for format details.
    """

    def write(
        self, detections, txt_path, labels_map_rev, dynamic_classes=False
    ):
        """Writes the detections to disk.

        Args:
            detections: a :class:`fiftyone.core.labels.Detections` instance
            txt_path: the path to write the annotation TXT file
            labels_map_rev: a dictionary mapping class label strings to target
                integers
            dynamic_classes (False): whether to dynamically add labels to
                labels_map_rev
        """
        rows = []
        for detection in detections.detections:
            row = _make_yolo_row(detection, labels_map_rev, dynamic_classes)
            rows.append(row)

        _write_file_lines(rows, txt_path)


def load_yolo_annotations(txt_path, classes):
    """Loads the YOLO annotations from the given TXT file.

    See :class:`fiftyone.types.dataset_types.YOLODataset` for format details.

    Args:
        txt_path: the path to the annotations TXT file
        classes: the list of class label strings

    Returns:
        a :class:`fiftyone.core.detections.Detections` instance
    """
    detections = []
    for row in _read_file_lines(txt_path):
        detection = _parse_yolo_row(row, classes)
        detections.append(detection)

    return fol.Detections(detections=detections)


def _parse_yolo_row(row, classes):
    target, xc, yc, w, h = row.split()

    try:
        label = classes[int(target)]
    except:
        label = str(target)

    bounding_box = [
        (float(xc) - 0.5 * float(w)),
        (float(yc) - 0.5 * float(h)),
        float(w),
        float(h),
    ]

    return fol.Detection(label=label, bounding_box=bounding_box)


def _make_yolo_row(detection, labels_map_rev, dynamic_classes):
    label = detection.label
    if dynamic_classes and label not in labels_map_rev:
        target = len(labels_map_rev)
        labels_map_rev[label] = target
    else:
        target = labels_map_rev[label]

    xtl, ytl, w, h = detection.bounding_box
    xc = xtl + 0.5 * w
    yc = ytl + 0.5 * h

    return "%d %f %f %f %f" % (target, xc, yc, w, h)


def _read_file_lines(path):
    with open(path, "r") as f:
        lines = [l.strip() for l in f.read().splitlines()]
        return [l for l in lines if l]


def _write_file_lines(lines, outpath):
    etau.write_file("\n".join(lines), outpath)


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}


def _to_classes(labels_map_rev):
    targets_to_labels = {v: k for k, v in labels_map_rev.items()}

    classes = []
    for target in range(max(targets_to_labels.keys()) + 1):
        if target in targets_to_labels:
            classes.append(targets_to_labels[target])
        else:
            classes.append(str(target))

    return classes
