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
import logging
import os

import eta.core.datasets as etads
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.types as fot


logger = logging.getLogger(__name__)


def export_samples(samples, exporter, label_field=None):
    """Exports the given samples to disk as a dataset using the provided
    exporter.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
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

    def export_sample(self, image_path, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            image_path: the path to the image
            metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                isinstance for the sample. Only required when
                :property:`requires_image_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")


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

    def export_sample(self, image_path, label, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            image_path: the path to the image
            label: an instance of :property:`label_cls`
            metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                isinstance for the sample. Only required when
                :property:`requires_image_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")


class ImageDirectoryExporter(UnlabeledImageDatasetExporter):
    """Exporter that writes a directory of images to disk.

    See :class:`fiftyone.types.ImageDirectory` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        super().__init__(export_dir)
        self._data_filename_counts = None

    @property
    def requires_image_metadata(self):
        return False

    def setup(self):
        etau.ensure_dir(self.export_dir)
        self._data_filename_counts = defaultdict(int)

    def export_sample(self, image_path, metadata=None):
        name, ext = os.path.splitext(os.path.basename(image_path))
        self._data_filename_counts[name] += 1

        count = self._data_filename_counts[name]
        if count > 1:
            name += "-%d" + count

        out_image_path = os.path.join(self.export_dir, name + ext)
        etau.copy_file(image_path, out_image_path)


class ImageClassificationDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image classification dataset to disk.

    See :class:`fiftyone.types.ImageClassificationDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        super().__init__(export_dir)
        self._data_dir = None
        self._labels_path = None
        self._labels_dict = None
        self._data_filename_counts = None

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
        self._data_filename_counts = defaultdict(int)

        etau.ensure_dir(self._data_dir)

    def export_sample(self, image_path, classification, metadata=None):
        name, ext = os.path.splitext(os.path.basename(image_path))
        self._data_filename_counts[name] += 1

        count = self._data_filename_counts[name]
        if count > 1:
            name += "-%d" + count

        out_image_path = os.path.join(self._data_dir, name + ext)
        etau.copy_file(image_path, out_image_path)

        self._labels_dict[name] = _parse_classification(classification)

    def close(self, *args):
        labels = {
            "classes": None,  # @todo get this somehow?
            "labels": self._labels_dict,
        }

        logger.info("Writing labels to '%s'", self._labels_path)
        etas.write_json(labels, self._labels_path)


class ImageClassificationDirectoryTreeExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image classification directory tree to disk.

    See :class:`fiftyone.types.ImageClassificationDirectoryTree` for format
    details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        super().__init__(export_dir)
        self._data_filename_counts = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        self._data_filename_counts = defaultdict(int)
        etau.ensure_dir(self.export_dir)  # in case dataset is empty

    def export_sample(self, image_path, classification, metadata=None):
        _label = _parse_classification(classification)
        name, ext = os.path.splitext(os.path.basename(image_path))
        key = (_label, name)
        self._data_filename_counts[key] += 1

        count = self._data_filename_counts[key]
        if count > 1:
            name += "-%d" + count

        out_image_path = os.path.join(self.export_dir, _label, name + ext)
        etau.copy_file(image_path, out_image_path)


class ImageDetectionDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image detection dataset to disk.

    See :class:`fiftyone.types.ImageDetectionDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        super().__init__(export_dir)
        self._data_dir = None
        self._labels_path = None
        self._labels_dict = None
        self._data_filename_counts = None

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
        self._data_filename_counts = defaultdict(int)

        etau.ensure_dir(self._data_dir)

    def export_sample(self, image_path, detections, metadata=None):
        name, ext = os.path.splitext(os.path.basename(image_path))
        self._data_filename_counts[name] += 1

        count = self._data_filename_counts[name]
        if count > 1:
            name += "-%d" + count

        out_image_path = os.path.join(self._data_dir, name + ext)
        etau.copy_file(image_path, out_image_path)

        self._labels_dict[name] = _parse_detections(detections)

    def close(self, *args):
        labels = {
            "classes": None,  # @todo get this somehow?
            "labels": self._labels_dict,
        }

        logger.info("Writing labels to '%s'", self._labels_path)
        etas.write_json(labels, self._labels_path)


class ImageLabelsDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image labels dataset to disk.

    See :class:`fiftyone.types.ImageLabelsDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        super().__init__(export_dir)
        self._labeled_dataset = None
        self._data_filename_counts = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.ImageLabels

    def setup(self):
        self._labeled_dataset = etads.LabeledImageDataset.create_empty_dataset(
            self.export_dir
        )
        self._data_filename_counts = defaultdict(int)

    def export_sample(self, image_path, image_labels, metadata=None):
        name, ext = os.path.splitext(os.path.basename(image_path))
        self._data_filename_counts[name] += 1

        count = self._data_filename_counts[name]
        if count > 1:
            name += "-%d" + count

        new_image_filename = name + ext
        new_labels_filename = name + ".json"

        image_labels_path = os.path.join(
            self._labeled_dataset.labels_dir, new_labels_filename
        )

        _image_labels = _parse_image_labels(image_labels)
        _image_labels.write_json(image_labels_path)

        self._labeled_dataset.add_file(
            image_path,
            image_labels_path,
            new_data_filename=new_image_filename,
            new_labels_filename=new_labels_filename,
        )

    def close(self, *args):
        logger.info(
            "Writing manifest to '%s'", self._labeled_dataset.manifest_path
        )
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
