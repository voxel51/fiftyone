"""
Utilities for working with datasets in YOLO format.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import yaml

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class YOLOSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples whose labels are in YOLO-style format.

    This implementation supports samples that are
    ``(image_or_path, anno_txt_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``anno_txt_path`` is the path to a YOLO labels TXT file on disk. Or,
          for unlabeled images, ``anno_txt_path`` can be ``None``.

    See :class:`fiftyone.types.dataset_types.YOLOv4Dataset` or
    :class:`fiftyone.types.dataset_types.YOLOv5Dataset` for format details.

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


class YOLOv4DatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for YOLOv4 datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.YOLOv4Dataset` for format details.

    Args:
        dataset_dir (None): the dataset directory
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like "data" or "data/" specifying a subfolder of
                ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        images_path (None): an optional parameter that enables explicit
            control over the location of the image listing file. Can be any of
            the following:

            -   a filename like "images.txt" specifying the location of the
                image listing file labels in ``dataset_dir``
            -   an absolute filepath to the image listing file. In this case,
                ``dataset_dir`` has no effect on the location of the file

            If None, the parameter will default to ``images.txt``
        objects_path (None): an optional parameter that enables explicit
            control over the location of the object names file. Can be any of
            the following:

            -   a filename like "obj.names" specifying the location of the
                object names file labels in ``dataset_dir``
            -   an absolute filepath to the object names file. In this case,
                ``dataset_dir`` has no effect on the location of the file

            If None, the parameter will default to ``obj.names``
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
        images_path=None,
        objects_path=None,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        data_path = self._parse_data_path(
            dataset_dir=dataset_dir, data_path=data_path, default="data/",
        )

        images_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=images_path,
            default="images.txt",
        )

        objects_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=objects_path,
            default="obj.names",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.images_path = images_path
        self.objects_path = objects_path

        self._classes = None
        self._info = None
        self._image_paths_map = None
        self._labels_paths_map = None
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
            image_path = self._image_paths_map[uuid]
        except KeyError:
            raise ValueError("No image found for sample '%s'" % uuid)

        labels_path = self._labels_paths_map.get(uuid, None)
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
        if self.images_path is not None and os.path.exists(self.images_path):
            root_dir = os.path.dirname(self.images_path)

            image_paths_map = {}
            for path in _read_file_lines(self.images_path):
                uuid = os.path.splitext(os.path.basename(path))[0]
                if os.path.isabs(path):
                    image_paths_map[uuid] = path
                else:
                    image_paths_map[uuid] = os.path.join(root_dir, path)
        else:
            logger.warning(
                "Images file '%s' not found. Listing data directory '%s' "
                "instead",
                self.images_path,
                self.data_path,
            )

            image_paths_map = {
                path: os.path.splitext(os.path.basename(path))[0]
                for path in etau.list_files(self.data_path, abs_paths=True)
                if not path.endswith(".txt")
            }

        uuids = sorted(image_paths_map.keys())

        labels_paths_map = {}
        for uuid, image_path in image_paths_map.items():
            labels_path = os.path.splitext(image_path)[0] + ".txt"
            if os.path.exists(labels_path):
                labels_paths_map[uuid] = labels_path

        self._image_paths_map = image_paths_map
        self._labels_paths_map = labels_paths_map

        if self.objects_path is not None and os.path.exists(self.objects_path):
            classes = _read_file_lines(self.objects_path)
        else:
            classes = None

        info = {}
        if classes is not None:
            info["classes"] = classes

        self._classes = classes
        self._info = info
        self._uuids = self._preprocess_list(uuids)
        self._num_samples = len(self._uuids)

    def get_dataset_info(self):
        return self._info


class YOLOv5DatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for YOLOv5 datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.YOLOv5Dataset` for format details.

    Args:
        dataset_dir (None): the dataset directory
        yaml_path (None): an optional parameter that enables explicit control
            over the location of the dataset YAML file. Can be any of the
            following:

            -   a filename like "dataset.yaml" specifying the name of the YAML
                file in ``dataset_dir``
            -   an absolute path to the YAML file. In this case,
                ``dataset_dir`` has no effect

            If None, the parameter will default to ``dataset.yaml``
        split ("val"): the split to load. Typical values are
            ``("train", "val")``
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        yaml_path=None,
        split="val",
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        yaml_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=yaml_path,
            default="dataset.yaml",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.yaml_path = yaml_path
        self.split = split

        self._classes = None
        self._info = None
        self._image_paths_map = None
        self._labels_paths_map = None
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
            image_path = self._image_paths_map[uuid]
        except KeyError:
            raise ValueError("No image found for sample '%s'" % uuid)

        labels_path = self._labels_paths_map.get(uuid, None)
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
        d = _read_yaml_file(self.yaml_path)

        if self.split not in d:
            raise ValueError(
                "Dataset YAML '%s' does not contain split '%s'"
                % (self.yaml_path, self.split)
            )

        data = d[self.split]
        classes = d.get("names", None)

        if data.endswith(".txt"):
            txt_path = _parse_yolo_v5_data_path(data, self.yaml_path)
            image_paths = _read_file_lines(txt_path)
        else:
            if etau.is_str(data):
                data_dirs = [data]
            else:
                data_dirs = data

            image_paths = []
            for data_dir in data_dirs:
                data_dir = _parse_yolo_v5_data_path(data_dir, self.yaml_path)
                image_paths.extend(etau.list_files(data_dir, abs_paths=True))

        image_paths_map = {
            p: os.path.splitext(os.path.basename(p))[0] for p in image_paths
        }

        uuids = sorted(image_paths_map.keys())

        labels_paths_map = {}
        for uuid, image_path in image_paths_map.items():
            labels_path = _get_yolo_v5_labels_path(image_path)
            if os.path.exists(labels_path):
                labels_paths_map[uuid] = labels_path

        self._image_paths_map = image_paths_map
        self._labels_paths_map = labels_paths_map

        info = {}
        if classes is not None:
            info["classes"] = classes

        self._classes = classes
        self._info = info
        self._uuids = self._preprocess_list(uuids)
        self._num_samples = len(self._uuids)

    def get_dataset_info(self):
        return self._info


class YOLOv4DatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes YOLOv4 datasets to disk.

    See :class:`fiftyone.types.dataset_types.YOLOv4Dataset` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path``, ``objects_path``, and ``images_path`` are
            absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported data and labels. Can be any of
            the following:

            -   a folder name like "data" or "data/" specifying a subfolder of
                ``export_dir`` in which to export the data and labels
            -   an absolute directory path in which to export the data and
                labels. In this case, the ``export_dir`` has no effect on the
                location of the data

            If None, the data will be written into ``export_dir`` using the
            default folder name
        objects_path (None): an optional parameter that enables explicit
            control over the location of the object names file. Can be any of
            the following:

            -   a filename like "obj.names" specifying the location in
                ``export_dir`` in which to export the object names
            -   an absolute filepath to which to export the object names. In
                this case, the ``export_dir`` has no effect on the location of
                the object names

            If None, the object names will be written into ``export_dir``
            using the default filename
        images_path (None): an optional parameter that enables explicit control
            over the location of the image listing file. Can be any of the
            following:

            -   a filename like "images.txt" specifying the location in
                ``export_dir`` in which to export the image listing
            -   an absolute filepath to which to export the image listing. In
                this case, the ``export_dir`` has no effect on the location of
                the image listing

            If None, the image listing will be written into ``export_dir``
            using the default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        classes (None): the list of possible class labels. If not provided,
            this list will be extracted when :meth:`log_collection` is called,
            if possible
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        objects_path=None,
        images_path=None,
        export_media=None,
        classes=None,
        image_format=None,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        objects_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=objects_path,
            default="obj.names",
        )

        images_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=images_path,
            default="labels.txt",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.objects_path = objects_path
        self.images_path = images_path
        self.export_media = export_media
        self.classes = classes
        self.image_format = image_format

        self._classes = None
        self._dynamic_classes = classes is None
        self._labels_map_rev = None
        self._rel_dir = None
        self._images = None
        self._writer = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        if self.export_dir is None:
            rel_dir = self.data_path
        else:
            rel_dir = self.export_dir

        self._rel_dir = rel_dir

        self._classes = {}
        self._labels_map_rev = {}
        self._images = []
        self._writer = YOLOAnnotationWriter()

        self._parse_classes()

        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            supported_modes=(True, False, "move", "symlink"),
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

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
        out_image_path, _ = self._media_exporter.export(image_or_path)

        if detections is None:
            return

        self._images.append(os.path.relpath(out_image_path, self._rel_dir))

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

        _write_file_lines(classes, self.objects_path)
        _write_file_lines(self._images, self.images_path)

        self._media_exporter.close()

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class YOLOv5DatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes YOLOv5 datasets to disk.

    See :class:`fiftyone.types.dataset_types.YOLOv5Dataset` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path``, ``objects_path``, and ``images_path`` are
            absolute paths
        split ("val"): the split being exported. Typical values are
            ``("train", "val")``
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like "images" or "images/" specifying a subfolder
                of ``export_dir`` in which to export the images
            -   an absolute directory path in which to export the images. In
                this case, the ``export_dir`` has no effect on the location of
                the images

            If None, the data will be written into ``export_dir`` using the
            default folder name
        labels_path (None): an optional parameter that enables explicit
            control over the location of the exported labels. Can be any of the
            following:

            -   a folder name like "labels" or "labels/" specifying the
                location in ``export_dir`` in which to export the labels
            -   an absolute folder path to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of
                the object names

            If None, the object names will be written into ``export_dir``
            using the default filename
        yaml_path (None): an optional parameter that enables explicit control
            over the location of the dataset listing YAML file. Can be any of
            the following:

            -   a filename like "dataset.yaml" specifying the location in
                ``export_dir`` to write the YAML file
            -   an absolute filepath to which to write the YAML file. In this
                case, the ``export_dir`` has no effect on the location of
                the image listing

            If None, the image listing will be written into ``export_dir``
            using the default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        classes (None): the list of possible class labels. If not provided,
            this list will be extracted when :meth:`log_collection` is called,
            if possible
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self,
        export_dir=None,
        split="val",
        data_path=None,
        labels_path=None,
        yaml_path=None,
        export_media=None,
        classes=None,
        image_format=None,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="images/" + split,
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels/" + split,
        )

        yaml_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=yaml_path,
            default="dataset.yaml",
        )

        super().__init__(export_dir=export_dir)

        self.split = split
        self.data_path = data_path
        self.labels_path = labels_path
        self.yaml_path = yaml_path
        self.export_media = export_media
        self.classes = classes
        self.image_format = image_format

        self._classes = None
        self._dynamic_classes = classes is None
        self._labels_map_rev = None
        self._rel_dir = None
        self._images = None
        self._writer = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._classes = {}
        self._labels_map_rev = {}
        self._images = []
        self._writer = YOLOAnnotationWriter()

        self._parse_classes()

        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            supported_modes=(True, False, "move", "symlink"),
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

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
        _, uuid = self._media_exporter.export(image_or_path)

        if detections is None:
            return

        out_labels_path = os.path.join(self.labels_path, uuid + ".txt")

        self._writer.write(
            detections,
            out_labels_path,
            self._labels_map_rev,
            dynamic_classes=self._dynamic_classes,
        )

    def close(self, *args):
        if os.path.isfile(self.yaml_path):
            d = _read_yaml_file(self.yaml_path)
        else:
            d = {}

        if self._dynamic_classes:
            classes = _to_classes(self._labels_map_rev)
        else:
            classes = self.classes

        d[self.split] = _make_yolo_v5_data_path(self.data_path, self.yaml_path)
        d["nc"] = len(classes)
        d["names"] = list(classes)

        _write_yaml_file(d, self.yaml_path)

        self._media_exporter.close()

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class YOLOAnnotationWriter(object):
    """Class for writing annotations in YOLO-style TXT format."""

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
    """Loads the YOLO-style annotations from the given TXT file.

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


def _parse_yolo_v5_data_path(data_path, yaml_path):
    if os.path.isabs(data_path):
        return data_path

    # Interpret relative to YAML file
    root_dir = os.path.dirname(yaml_path)
    return os.path.normpath(os.path.join(root_dir, data_path))


def _make_yolo_v5_data_path(data_path, yaml_path):
    # Save path relative to YAML file
    root_dir = os.path.dirname(yaml_path)
    data_path = os.path.relpath(data_path, root_dir) + os.path.sep
    if not data_path.startswith("."):
        data_path = "." + os.path.sep + data_path

    return data_path


def _get_yolo_v5_labels_path(image_path):
    old = os.path.sep + "images" + os.path.sep
    new = os.path.sep + "labels" + os.path.sep

    chunks = image_path.rsplit(old, 1)
    if len(chunks) == 1:
        raise ValueError(
            "Invalid image path '%s'. YOLOv5 image paths must contain '%s', "
            "which is replaced with '%s' to locate the labels TXT file"
            % (image_path, old, new)
        )

    return os.path.splitext(new.join(chunks))[0] + ".txt"


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


def _read_yaml_file(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)


def _write_yaml_file(d, path):
    s = yaml.dump(d, default_flow_style=False)
    etau.write_file(s, path)


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
