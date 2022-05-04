"""
Utilities for working with datasets in YOLO format.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import warnings

import yaml

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


def add_yolo_labels(
    sample_collection,
    label_field,
    labels_path,
    classes=None,
    include_missing=False,
):
    """Adds the given YOLO-formatted labels to the collection.

    Each YOLO txt file should be a space-delimited file whose rows define
    objects in the following format::

        <target> <x-center> <y-center> <width> <height>

    where ``target`` is the zero-based integer index of the object class label
    from ``classes`` and the bounding box coordinates are expressed as relative
    coordinates in ``[0, 1] x [0, 1]``.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        label_field: the label field in which to store the labels. The field
            will be created if necessary
        labels_path: the YOLO-formatted labels to load. This can be any of the
            following:

            -   a dict mapping either image filenames or absolute filepaths to
                YOLO TXT filepaths. The image filenames/filepaths should match
                those in ``sample_collection``, in any order
            -   a list of YOLO TXT filepaths corresponding 1-1 to the samples
                in ``sample_collection``
            -   a directory containing YOLO TXT files whose filenames (less
                extension) correspond to image filenames in
                ``sample_collection``, in any order
        classes (None): the list of class label strings. If not provided, these
            must be available from
            :meth:`fiftyone.core.collections.SampleCollection.get_classes`
        include_missing (False): whether to insert empty
            :class:`Detections <fiftyone.core.labels.Detections>` instances for
            any samples in the input collection whose ``label_field`` is
            ``None`` after import
    """
    if classes is None:
        classes = sample_collection.get_classes(label_field)

    if not classes:
        raise ValueError(
            "You must provide `classes` in order to load YOLO labels"
        )

    if isinstance(labels_path, (list, tuple)):
        # Explicit list of labels files
        labels = [load_yolo_annotations(p, classes) for p in labels_path]
        sample_collection.set_values(label_field, labels)
        return

    if etau.is_str(labels_path):
        # Directory of label files matching image filenames (less extension)
        txt_map = {
            os.path.splitext(p)[0]: os.path.join(labels_path, p)
            for p in etau.list_files(labels_path, recursive=True)
        }
        match_type = "uuid"
    elif isinstance(labels_path, dict):
        # Dictionary mapping filename or filepath to label paths
        txt_map = labels_path
        if not txt_map:
            return

        if os.path.isabs(next(iter(txt_map.keys()))):
            match_type = "filepath"
        else:
            match_type = "basename"
    else:
        raise ValueError("Unsupported `labels_path` provided")

    if not txt_map:
        return

    filepaths, ids = sample_collection.values(["filepath", "id"])

    if match_type == "uuid":
        # Match basename, no extension
        id_map = {
            os.path.splitext(os.path.basename(k))[0]: v
            for k, v in zip(filepaths, ids)
        }
    elif match_type == "basename":
        # Match basename
        id_map = {os.path.basename(k): v for k, v in zip(filepaths, ids)}
    else:
        # Match entire filepath
        id_map = {k: v for k, v in zip(filepaths, ids)}

    matched_ids = []
    matched_paths = []
    bad_paths = []
    for key, txt_path in txt_map.items():
        _id = id_map.get(key, None)
        if _id is not None:
            matched_ids.append(_id)
            matched_paths.append(txt_path)
        else:
            bad_paths.append(txt_path)

    if bad_paths:
        mtype = "filepaths" if match_type == "filepath" else "filenames"
        logger.warning(
            "Ignoring %d label files (eg '%s') that do not match %s in the "
            "sample collection",
            len(bad_paths),
            bad_paths[0],
            mtype,
        )

    view = sample_collection.select(matched_ids, ordered=True)
    labels = [load_yolo_annotations(p, classes) for p in matched_paths]
    view.set_values(label_field, labels)

    if include_missing:
        missing_labels = sample_collection.exists(label_field, False)
        missing_labels.set_values(
            label_field, [fol.Detections()] * len(missing_labels)
        )


class YOLOv4DatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for YOLOv4 datasets stored on disk.

    See :ref:`this page <YOLOv4Dataset-import>` for format details.

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

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location of the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the labels are assumed to be in the same folder as the
            data
        images_path (None): an optional parameter that enables explicit
            control over the location of the image listing file. Can be any of
            the following:

            -   a filename like ``"images.txt"`` specifying the location of the
                image listing file labels in ``dataset_dir``
            -   an absolute filepath to the image listing file. In this case,
                ``dataset_dir`` has no effect on the location of the file

            If None, the parameter will default to ``images.txt``
        objects_path (None): an optional parameter that enables explicit
            control over the location of the object names file. Can be any of
            the following:

            -   a filename like ``"obj.names"`` specifying the location of the
                object names file labels in ``dataset_dir``
            -   an absolute filepath to the object names file. In this case,
                ``dataset_dir`` has no effect on the location of the file

            If None, the parameter will default to ``obj.names``
        classes (None): the list of possible class labels. This does not need
            to be provided if ``objects_path`` contains the class labels
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with labels (False)
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
        images_path=None,
        objects_path=None,
        classes=None,
        include_all_data=False,
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
            dataset_dir=dataset_dir, data_path=data_path, default="data/"
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir, labels_path=labels_path, default=None
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
        self.labels_path = labels_path
        self.images_path = images_path
        self.objects_path = objects_path
        self.classes = classes
        self.include_all_data = include_all_data

        self._info = None
        self._classes = None
        self._labels_paths_map = None
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

        labels_path = self._labels_paths_map.get(filepath, None)
        if labels_path:
            # Labeled image
            label = load_yolo_annotations(labels_path, self._classes)
        else:
            # Unlabeled image
            label = None

        return filepath, None, label

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
        if self.images_path is not None and os.path.isfile(self.images_path):
            root_dir = os.path.dirname(self.images_path)

            image_paths = []
            for path in _read_file_lines(self.images_path):
                if not os.path.isabs(path):
                    path = os.path.join(root_dir, path)

                image_paths.append(fou.normpath(path))
        else:
            if self.images_path is not None:
                logger.warning(
                    "Images file '%s' not found. Listing data directory '%s' "
                    "instead",
                    self.images_path,
                    self.data_path,
                )

            image_paths = [
                fou.normpath(p)
                for p in etau.list_files(
                    self.data_path, abs_paths=True, recursive=True
                )
                if not p.endswith(".txt")
            ]

        labels_paths_map = {}
        for image_path in image_paths:
            if self.labels_path is not None:
                # Labels directory was manually specified
                uuid = os.path.splitext(os.path.basename(image_path))[0]
                labels_path = os.path.join(self.labels_path, uuid + ".txt")
            else:
                # Labels are in same directory as images
                labels_path = os.path.splitext(image_path)[0] + ".txt"

            labels_path = fou.normpath(labels_path)

            if os.path.isfile(labels_path):
                labels_paths_map[image_path] = labels_path

        filepaths = set(labels_paths_map.keys())

        if self.include_all_data:
            filepaths.update(image_paths)

        filepaths = self._preprocess_list(sorted(filepaths))

        if self.classes is not None:
            classes = self.classes
        elif self.objects_path is not None and os.path.isfile(
            self.objects_path
        ):
            classes = _read_file_lines(self.objects_path)
        else:
            classes = None

        info = {}
        if classes is not None:
            info["classes"] = classes

        self._info = info
        self._classes = classes
        self._labels_paths_map = labels_paths_map
        self._filepaths = filepaths
        self._num_samples = len(filepaths)

    def get_dataset_info(self):
        return self._info


class YOLOv5DatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for YOLOv5 datasets stored on disk.

    See :ref:`this page <YOLOv5Dataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``yaml_path``
            must be provided
        yaml_path (None): an optional parameter that enables explicit control
            over the location of the dataset YAML file. Can be any of the
            following:

            -   a filename like ``"dataset.yaml"`` specifying the name of the
                YAML file in ``dataset_dir``
            -   an absolute path to the YAML file. In this case,
                ``dataset_dir`` has no effect

            If None, the parameter will default to ``dataset.yaml``
        split ("val"): the split to load. Typical values are
            ``("train", "val")``
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with labels (False)
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
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and yaml_path is None:
            raise ValueError(
                "Either `dataset_dir` or `yaml_path` must be provided"
            )

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
        self.include_all_data = include_all_data

        self._info = None
        self._classes = None
        self._labels_paths_map = None
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

        labels_path = self._labels_paths_map.get(filepath, None)
        if labels_path:
            # Labeled image
            label = load_yolo_annotations(labels_path, self._classes)
        else:
            # Unlabeled image
            label = None

        return filepath, None, label

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

        if etau.is_str(data) and data.endswith(".txt"):
            txt_path = _parse_yolo_v5_path(data, self.yaml_path)
            image_paths = [
                _parse_yolo_v5_path(fou.normpath(p), txt_path)
                for p in _read_file_lines(txt_path)
            ]
        else:
            if etau.is_str(data):
                data_dirs = [data]
            else:
                data_dirs = data

            image_paths = []
            for data_dir in data_dirs:
                data_dir = fou.normpath(
                    _parse_yolo_v5_path(data_dir, self.yaml_path)
                )
                image_paths.extend(
                    etau.list_files(data_dir, abs_paths=True, recursive=True)
                )

        labels_paths_map = {}
        for image_path in image_paths:
            labels_path = _get_yolo_v5_labels_path(image_path)
            if os.path.isfile(labels_path):
                labels_paths_map[image_path] = labels_path

        filepaths = set(labels_paths_map.keys())

        if self.include_all_data:
            filepaths.update(image_paths)

        filepaths = self._preprocess_list(sorted(filepaths))

        info = {}
        if classes is not None:
            info["classes"] = classes

        self._info = info
        self._classes = classes
        self._labels_paths_map = labels_paths_map
        self._filepaths = filepaths
        self._num_samples = len(filepaths)

    def get_dataset_info(self):
        return self._info


class YOLOv4DatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes YOLOv4 datasets to disk.

    See :ref:`this page <YOLOv4Dataset-export>` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path``, ``objects_path``, and ``images_path`` are
            absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported data and labels. Can be any of
            the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the data and
                labels
            -   an absolute directory path in which to export the data and
                labels. In this case, the ``export_dir`` has no effect on the
                location of the data

            If None, the data will be written into ``export_dir`` using the
            default folder name
        labels_path (None): an optional parameter that enables explicit
            control over the location of the exported labels. Can be any of the
            following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location in ``export_dir`` in which to export the labels
            -   an absolute folder path to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of
                the labels

            If None, the labels will be written into the same directory as the
            exported media
        objects_path (None): an optional parameter that enables explicit
            control over the location of the object names file. Can be any of
            the following:

            -   a filename like ``"obj.names"`` specifying the location in
                ``export_dir`` in which to export the object names
            -   an absolute filepath to which to export the object names. In
                this case, the ``export_dir`` has no effect on the location of
                the object names

            If None, the object names will be written into ``export_dir``
            using the default filename, unless no media is being exported, in
            which case this file will not be written
        images_path (None): an optional parameter that enables explicit control
            over the location of the image listing file. Can be any of the
            following:

            -   a filename like ``"images.txt"`` specifying the location in
                ``export_dir`` in which to export the image listing
            -   an absolute filepath to which to export the image listing. In
                this case, the ``export_dir`` has no effect on the location of
                the image listing

            If None, the image listing will be written into ``export_dir``
            using the default filename, unless no media is being exported, in
            which case this file will not be written
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
        include_confidence (False): whether to include detection confidences in
            the export, if they exist
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        objects_path=None,
        images_path=None,
        export_media=None,
        classes=None,
        include_confidence=False,
        image_format=None,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir, labels_path=labels_path, default="data/"
        )

        objects_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=objects_path,
            default="obj.names",
        )

        images_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=images_path,
            default="images.txt",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.objects_path = objects_path
        self.images_path = images_path
        self.export_media = export_media
        self.classes = classes
        self.include_confidence = include_confidence
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

        export_path = self.data_path if self.export_media != False else None
        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=export_path,
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
        out_image_path, uuid = self._media_exporter.export(image_or_path)

        if self.export_media != False:
            self._images.append(os.path.relpath(out_image_path, self._rel_dir))

        if detections is None:
            return

        out_labels_path = os.path.join(self.labels_path, uuid + ".txt")

        self._writer.write(
            detections,
            out_labels_path,
            self._labels_map_rev,
            dynamic_classes=self._dynamic_classes,
            include_confidence=self.include_confidence,
        )

    def close(self, *args):
        self._media_exporter.close()

        if self.export_media == False:
            return

        if self._dynamic_classes:
            classes = _to_classes(self._labels_map_rev)
        else:
            classes = self.classes

        _write_file_lines(classes, self.objects_path)
        _write_file_lines(self._images, self.images_path)

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class YOLOv5DatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes YOLOv5 datasets to disk.

    See :ref:`this page <YOLOv5Dataset-export>` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path``, ``labels_path``, and ``yaml_path`` are
            absolute paths
        split ("val"): the split being exported. Typical values are
            ``("train", "val")``
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"images"`` or ``"images/"`` specifying a
                subfolder of ``export_dir`` in which to export the images
            -   an absolute directory path in which to export the images. In
                this case, the ``export_dir`` has no effect on the location of
                the images

            If None, the data will be written into ``export_dir`` using the
            default folder name
        labels_path (None): an optional parameter that enables explicit
            control over the location of the exported labels. Can be any of the
            following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location in ``export_dir`` in which to export the labels
            -   an absolute folder path to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of
                the labels

            If None, the labels will be written into ``export_dir`` using the
            default folder name
        yaml_path (None): an optional parameter that enables explicit control
            over the location of the dataset YAML file. Can be any of the
            following:

            -   a filename like ``"dataset.yaml"`` specifying the location in
                ``export_dir`` to write the YAML file
            -   an absolute filepath to which to write the YAML file. In this
                case, the ``export_dir`` has no effect on the location of
                the image listing

            If None, the dataset YAML file will be written into ``export_dir``
            using the default filename, unless no media is being exported, in
            which case this file will not be written
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
        include_confidence (False): whether to include detection confidences in
            the export, if they exist
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
        include_confidence=False,
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
        self.include_confidence = include_confidence
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
            include_confidence=self.include_confidence,
        )

    def close(self, *args):
        self._media_exporter.close()

        if self.export_media == False or self.data_path is None:
            return

        if os.path.isfile(self.yaml_path):
            d = _read_yaml_file(self.yaml_path)
        else:
            d = {}

        if self._dynamic_classes:
            classes = _to_classes(self._labels_map_rev)
        else:
            classes = self.classes

        d[self.split] = _make_yolo_v5_path(self.data_path, self.yaml_path)
        d["nc"] = len(classes)
        d["names"] = list(classes)

        _write_yaml_file(d, self.yaml_path, default_flow_style=False)

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class YOLOAnnotationWriter(object):
    """Class for writing annotations in YOLO-style TXT format."""

    def write(
        self,
        detections,
        txt_path,
        labels_map_rev,
        dynamic_classes=False,
        include_confidence=False,
    ):
        """Writes the detections to disk.

        Args:
            detections: a :class:`fiftyone.core.labels.Detections` instance
            txt_path: the path to write the annotation TXT file
            labels_map_rev: a dictionary mapping class label strings to target
                integers
            dynamic_classes (False): whether to dynamically add new labels to
                ``labels_map_rev``
            include_confidence (False): whether to include confidences in the
                export, if they exist
        """
        rows = []
        for detection in detections.detections:
            label = detection.label

            if dynamic_classes and label not in labels_map_rev:
                target = len(labels_map_rev)
                labels_map_rev[label] = target
            elif label not in labels_map_rev:
                msg = (
                    "Ignoring detection with label '%s' not in provided "
                    "classes" % label
                )
                warnings.warn(msg)
                continue
            else:
                target = labels_map_rev[label]

            if include_confidence:
                confidence = detection.confidence
            else:
                confidence = None

            row = _make_yolo_row(
                detection.bounding_box, target, confidence=confidence
            )
            rows.append(row)

        _write_file_lines(rows, txt_path)


def load_yolo_annotations(txt_path, classes):
    """Loads the YOLO-style annotations from the given TXT file.

    The txt file should be a space-delimited file where each row corresponds
    to an object in one the following formats::

        <target> <x-center> <y-center> <width> <height>
        <target> <x-center> <y-center> <width> <height> <confidence>

    where ``target`` is the zero-based integer index of the object class label
    from ``classes`` and the bounding box coordinates are expressed as relative
    coordinates in ``[0, 1] x [0, 1]``.

    Args:
        txt_path: the path to the annotations TXT file
        classes: the list of class label strings

    Returns:
        a :class:`fiftyone.core.detections.Detections`
    """
    detections = []
    for row in _read_file_lines(txt_path):
        detection = _parse_yolo_row(row, classes)
        detections.append(detection)

    return fol.Detections(detections=detections)


def _parse_yolo_v5_path(filepath, yaml_path):
    if os.path.isabs(filepath):
        return filepath

    # Interpret relative to YAML file
    root_dir = os.path.dirname(yaml_path)
    return os.path.normpath(os.path.join(root_dir, filepath))


def _make_yolo_v5_path(filepath, yaml_path):
    # Save path relative to YAML file
    root_dir = os.path.dirname(yaml_path)
    filepath = os.path.relpath(filepath, root_dir) + os.path.sep
    if not filepath.startswith("."):
        filepath = "." + os.path.sep + filepath

    return filepath


def _get_yolo_v5_labels_path(image_path):
    old = os.path.sep + "images" + os.path.sep
    new = os.path.sep + "labels" + os.path.sep

    chunks = image_path.rsplit(old, 1)

    if len(chunks) > 1:
        labels_path = new.join(chunks)
    elif image_path.startswith("images" + os.path.sep):
        labels_path = "labels" + image_path[len("images") :]
    else:
        raise ValueError(
            "Invalid image path '%s'. YOLOv5 image paths must contain '%s', "
            "which is replaced with '%s' to locate the corresponding labels"
            % (image_path, old, new)
        )

    root, ext = os.path.splitext(labels_path)

    if ext:
        ext = ".txt"

    return root + ext


def _parse_yolo_row(row, classes):
    row_vals = row.split()
    target, xc, yc, w, h = row_vals[:5]

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

    if len(row_vals) > 5:
        confidence = float(row_vals[5])
    else:
        confidence = None

    return fol.Detection(
        label=label, bounding_box=bounding_box, confidence=confidence
    )


def _make_yolo_row(bounding_box, target, confidence=None):
    xtl, ytl, w, h = bounding_box
    xc = xtl + 0.5 * w
    yc = ytl + 0.5 * h
    row = "%d %f %f %f %f" % (target, xc, yc, w, h)

    if confidence is not None:
        row += " %f" % confidence

    return row


def _read_yaml_file(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)


def _write_yaml_file(d, path, **kwargs):
    s = yaml.dump(d, **kwargs)
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
