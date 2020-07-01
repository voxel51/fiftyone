"""
Dataset exporters.

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
import os

import eta.core.datasets as etad
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou


def export_samples(samples, exporter, label_field=None):
    """Exports the given samples to disk as a dataset using the provided
    exporter.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances.
            For example, this may be a :class:`fiftyone.core.dataset.Dataset`
            or a :class:`fifyone.core.view.DatasetView`
        exporter: a :class:`DatasetExporter`
        label_field (None): the name of the label field to export, which is
            required if ``exporter`` is a :class:`LabeledImageDatasetExporter`
    """
    if isinstance(exporter, UnlabeledImageDatasetExporter):
        _export_unlabeled_image_dataset(samples, exporter)
    elif isinstance(exporter, LabeledImageDatasetExporter):
        _export_labeled_image_dataset(samples, exporter, label_field)
    else:
        raise ValueError("Unsupported exporter type %s" % type(exporter))


def _export_unlabeled_image_dataset(samples, exporter):
    with fou.ProgressBar() as pb:
        with exporter:
            for sample in pb(samples):
                image_path = sample.filepath

                metadata = sample.metadata
                if metadata is None and exporter.requires_image_metadata:
                    metadata = fom.ImageMetadata.build_for(image_path)

                exporter.export_sample(image_path, metadata=metadata)


def _export_labeled_image_dataset(samples, exporter, label_field):
    with fou.ProgressBar() as pb:
        with exporter:
            for sample in pb(samples):
                image_path = sample.filepath

                metadata = sample.metadata
                if metadata is None and exporter.requires_image_metadata:
                    metadata = fom.ImageMetadata.build_for(image_path)

                label = sample[label_field]

                exporter.export_sample(image_path, label, metadata=metadata)


class DatasetExporter(object):
    """Base interface for exporting :class:`fiftyone.core.dataset.Dataset`
    samples to disk.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        self.export_dir = export_dir

    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, *args):
        self.close(*args)

    def setup(self):
        """Performs any necessary setup before exporting the first sample in
        the dataset.

        This method is called when the exporter's context manager interface is
        entered, :function:`DatasetExporter.__enter__`.
        """
        pass

    def close(self, *args):
        """Performs any necessary actions after the last sample has been
        exported.

        This method is called when the importer's context manager interface is
        exited, :function:`DatasetExporter.__exit__`.

        Args:
            *args: the arguments to :func:`DatasetExporter.__exit__`
        """
        pass

    def export_sample(self, *args, **kwargs):
        """Exports the given sample to the dataset.

        Args:
            *args: subclass-specific positional arguments
            **kwargs: subclass-specific keyword arguments
        """
        raise NotImplementedError("subclass must implement export_sample()")


class UnlabeledImageDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of unlabeled image samples.

    Example Usage::

        import fiftyone as fo

        samples = ...  # Dataset, DatasetView, etc

        exporter = UnlabeledImageDatasetExporter(dataset_dir, ...)
        with exporter:
            for sample in samples:
                image_path = sample.filepath
                metadata = sample.metadata
                if exporter.requires_image_metadata and metadata is None:
                    metadata = fo.ImageMetadata.build_for(image_path)

                exporter.export_sample(image_path, metadata=metadata)

    Args:
        export_dir: the directory to write the export
    """

    @property
    def requires_image_metadata(self):
        """Whether this exporter requires
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each sample
        being exported.
        """
        raise NotImplementedError(
            "subclass must implement requires_image_metadata"
        )

    def export_sample(self, image_or_path, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            image_or_path: an image or the path to the image on disk
            metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                isinstance for the sample. Only required when
                :property:`requires_image_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")

    @staticmethod
    def is_image_path(image_or_path):
        """Determines whether the input is the path to an image on disk

        Args:
            image_or_path: an image or the path to the image on disk

        Returns:
            True/False
        """
        return etau.is_str(image_or_path)


class LabeledImageDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of labeled image samples.

    Example Usage::

        import fiftyone as fo

        samples = ...  # Dataset, DatasetView, etc
        label_field = ...

        exporter = LabeledImageDatasetExporter(dataset_dir, ...)
        with exporter:
            for sample in samples:
                image_path = sample.filepath
                label = sample[label_field]
                metadata = sample.metadata
                if exporter.requires_image_metadata and metadata is None:
                    metadata = fo.ImageMetadata.build_for(image_path)

                exporter.export_sample(image_path, label, metadata=metadata)

    Args:
        export_dir: the directory to write the export
    """

    @property
    def requires_image_metadata(self):
        """Whether this exporter requires
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each sample
        being exported.
        """
        raise NotImplementedError(
            "subclass must implement requires_image_metadata"
        )

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class exported by this
        exporter.
        """
        raise NotImplementedError("subclass must implement label_cls")

    def export_sample(self, image_or_path, label, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            image_or_path: an image or the path to the image on disk
            label: an instance of :property:`label_cls`
            metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                isinstance for the sample. Only required when
                :property:`requires_image_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")

    @staticmethod
    def is_image_path(image_or_path):
        """Determines whether the input is the path to an image on disk

        Args:
            image_or_path: an image or the path to the image on disk

        Returns:
            True/False
        """
        return etau.is_str(image_or_path)


class ImageDirectoryExporter(UnlabeledImageDatasetExporter):
    """Exporter that writes a directory of images to disk.

    See :class:`fiftyone.types.ImageDirectory` for format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return False

    def export_sample(self, image_or_path, metadata=None):
        if self.is_image_path(image_or_path):
            image_path = image_or_path
            out_image_path = self._filename_maker.get_output_path(image_path)
            etau.copy_file(image_path, out_image_path)
        else:
            img = image_or_path
            out_image_path = self._filename_maker.get_output_path()
            etai.write(img, out_image_path)

    def setup(self):
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self.export_dir, default_ext=self.image_format
        )


class ImageClassificationDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image classification dataset to disk.

    See :class:`fiftyone.types.ImageClassificationDataset` for format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        classes (None): the list of possible class labels
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, classes=None, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self.classes = classes
        self._data_dir = None
        self._labels_path = None
        self._labels_dict = None
        self._labels_map_rev = _to_labels_map_rev(classes) if classes else None
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_path = os.path.join(self.export_dir, "labels.json")
        self._labels_dict = {}
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )

    def export_sample(self, image_or_path, classification, metadata=None):
        if self.is_image_path(image_or_path):
            image_path = image_or_path
            out_image_path = self._filename_maker.get_output_path(image_path)
            etau.copy_file(image_path, out_image_path)
        else:
            img = image_or_path
            out_image_path = self._filename_maker.get_output_path()
            etai.write(img, out_image_path)

        name = os.path.splitext(os.path.basename(out_image_path))[0]
        self._labels_dict[name] = _parse_classification(
            classification, labels_map_rev=self._labels_map_rev
        )

    def close(self, *args):
        labels = {
            "classes": self.classes,
            "labels": self._labels_dict,
        }
        etas.write_json(labels, self._labels_path)


class ImageClassificationDirectoryTreeExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image classification directory tree to disk.

    See :class:`fiftyone.types.ImageClassificationDirectoryTree` for format
    details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self._class_counts = None
        self._filename_counts = None
        self._default_filename_patt = (
            fo.config.default_sequence_idx + image_format
        )

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        self._class_counts = defaultdict(int)
        self._filename_counts = defaultdict(int)
        etau.ensure_dir(self.export_dir)

    def export_sample(self, image_or_path, classification, metadata=None):
        is_image_path = self.is_image_path(image_or_path)

        _label = _parse_classification(classification)

        self._class_counts[_label] += 1

        if is_image_path:
            image_path = image_or_path
        else:
            img = image_or_path
            image_path = self._default_filename_patt % (
                self._class_counts[_label]
            )

        filename = os.path.basename(image_path)
        name, ext = os.path.splitext(filename)

        key = (_label, filename)
        self._filename_counts[key] += 1
        count = self._filename_counts[key]
        if count > 1:
            filename = name + ("-%d" % count) + ext

        out_image_path = os.path.join(self.export_dir, _label, filename)

        if is_image_path:
            etau.copy_file(image_path, out_image_path)
        else:
            etai.write(img, out_image_path)


class ImageDetectionDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image detection dataset to disk.

    See :class:`fiftyone.types.ImageDetectionDataset` for format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        classes (None): the list of possible class labels
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
        self._data_dir = None
        self._labels_path = None
        self._labels_dict = None
        self._labels_map_rev = _to_labels_map_rev(classes) if classes else None
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_path = os.path.join(self.export_dir, "labels.json")
        self._labels_dict = {}
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )

    def export_sample(self, image_or_path, detections, metadata=None):
        if self.is_image_path(image_or_path):
            image_path = image_or_path
            out_image_path = self._filename_maker.get_output_path(image_path)
            etau.copy_file(image_path, out_image_path)
        else:
            img = image_or_path
            out_image_path = self._filename_maker.get_output_path()
            etai.write(img, out_image_path)

        name = os.path.splitext(os.path.basename(out_image_path))[0]
        self._labels_dict[name] = _parse_detections(
            detections, labels_map_rev=self._labels_map_rev
        )

    def close(self, *args):
        labels = {
            "classes": self.classes,
            "labels": self._labels_dict,
        }
        etas.write_json(labels, self._labels_path)


class ImageLabelsDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image labels dataset to disk.

    See :class:`fiftyone.types.ImageLabelsDataset` for format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self._labeled_dataset = None
        self._data_dir = None
        self._labels_dir = None
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.ImageLabels

    def setup(self):
        self._labeled_dataset = etad.LabeledImageDataset.create_empty_dataset(
            self.export_dir
        )
        self._data_dir = self._labeled_dataset.data_dir
        self._labels_dir = self._labeled_dataset.labels_dir
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )

    def export_sample(self, image_or_path, image_labels, metadata=None):
        is_image_path = self.is_image_path(image_or_path)

        if is_image_path:
            image_path = image_or_path
            out_image_path = self._filename_maker.get_output_path(image_path)
        else:
            img = image_or_path
            out_image_path = self._filename_maker.get_output_path()

        name, ext = os.path.splitext(os.path.basename(out_image_path))
        new_image_filename = name + ext
        new_labels_filename = name + ".json"

        _image_labels = _parse_image_labels(image_labels)

        if etau.is_str(image_or_path):
            image_labels_path = os.path.join(
                self._labels_dir, new_labels_filename
            )
            _image_labels.write_json(image_labels_path)

            self._labeled_dataset.add_file(
                image_path,
                image_labels_path,
                new_data_filename=new_image_filename,
                new_labels_filename=new_labels_filename,
            )
        else:
            self._labeled_dataset.add_data(
                img, _image_labels, new_image_filename, new_labels_filename,
            )

    def close(self, *args):
        self._labeled_dataset.write_manifest()


def _parse_classification(classification, labels_map_rev=None):
    label = classification.label
    if labels_map_rev is not None:
        label = labels_map_rev[label]

    return label


def _parse_detections(detections, labels_map_rev=None):
    _detections = []
    for detection in detections.detections:
        label = detection.label
        if labels_map_rev is not None:
            label = labels_map_rev[label]

        _detection = {
            "label": label,
            "bounding_box": detection.bounding_box,
        }
        if detection.confidence is not None:
            _detection["confidence"] = detection.confidence

        _detections.append(_detection)

    return _detections


def _parse_image_labels(label):
    return label.labels


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}
