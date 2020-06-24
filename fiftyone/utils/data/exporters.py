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

import fiftyone.core.utils as fou
import fiftyone.types as fot


logger = logging.getLogger(__name__)


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
        self.close()

    def setup(self):
        """Performs any necessary setup before exporting the first sample in
        the dataset.

        This method is called when the exporter's context manager interface is
        entered, :function:`DatasetExporter.__enter__`.
        """
        pass

    def close(self):
        """Performs any necessary actions after the last sample has been
        exported.

        This method is called when the importer's context manager interface is
        exited, :function:`DatasetExporter.__exit__`.
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

    def export_sample(self, image_path, label, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            image_path: the path to the image
            label: a :class:`fiftyone.core.labels.Label` instance
            metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                isinstance for the sample. Only required when
                :property:`requires_image_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")


def export_images(samples, dataset_dir):
    """Exports the images in the given samples to the given directory.

    See :class:`fiftyone.types.ImageDirectory` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        dataset_dir: the directory to which to write the dataset
    """
    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.ImageDirectory),
    )

    etau.ensure_dir(dataset_dir)

    data_filename_counts = defaultdict(int)
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            img_path = sample.filepath
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            out_img_path = os.path.join(dataset_dir, name + ext)
            etau.copy_file(img_path, out_img_path)

    logger.info("Dataset created")


def export_image_classification_dataset(samples, label_field, dataset_dir):
    """Exports the given samples to disk as an image classification dataset.

    See :class:`fiftyone.types.ImageClassificationDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the
            :class:`fiftyone.core.labels.Classification` field of the samples
            to export
        dataset_dir: the directory to which to write the dataset
    """
    data_dir = os.path.join(dataset_dir, "data")
    labels_path = os.path.join(dataset_dir, "labels.json")

    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.ImageClassificationDataset),
    )

    etau.ensure_dir(data_dir)

    labels_dict = {}
    data_filename_counts = defaultdict(int)
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            img_path = sample.filepath
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            out_img_path = os.path.join(data_dir, name + ext)
            etau.copy_file(img_path, out_img_path)

            label = sample[label_field]
            labels_dict[name] = _parse_classification(label)

    logger.info("Writing labels to '%s'", labels_path)
    labels = {
        "classes": None,  # @todo get this somehow?
        "labels": labels_dict,
    }
    etas.write_json(labels, labels_path)

    logger.info("Dataset created")


def export_image_classification_dir_tree(samples, label_field, dataset_dir):
    """Exports the given samples to disk as an image classification directory
    tree.

    See :class:`fiftyone.types.ImageClassificationDirectoryTree` for format
    details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the
            :class:`fiftyone.core.labels.Classification` field of the samples
            to export
        dataset_dir: the directory to which to write the dataset
    """
    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.ImageClassificationDirectoryTree),
    )

    etau.ensure_dir(dataset_dir)

    data_filename_counts = defaultdict(int)
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            label = sample[label_field].label

            img_path = sample.filepath
            name, ext = os.path.splitext(os.path.basename(img_path))
            key = (label, name)
            data_filename_counts[key] += 1

            count = data_filename_counts[key]
            if count > 1:
                name += "-%d" + count

            out_img_path = os.path.join(dataset_dir, label, name + ext)
            etau.copy_file(img_path, out_img_path)

    logger.info("Dataset created")


def export_image_detection_dataset(samples, label_field, dataset_dir):
    """Exports the given samples to disk as an image detection dataset.

    See :class:`fiftyone.types.ImageDetectionDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the :class:`fiftyone.core.labels.Detections`
            field of the samples to export
        dataset_dir: the directory to which to write the dataset
    """
    data_dir = os.path.join(dataset_dir, "data")
    labels_path = os.path.join(dataset_dir, "labels.json")

    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.ImageDetectionDataset),
    )

    etau.ensure_dir(data_dir)

    data_filename_counts = defaultdict(int)
    labels_dict = {}
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            img_path = sample.filepath
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            out_img_path = os.path.join(data_dir, name + ext)
            etau.copy_file(img_path, out_img_path)

            label = sample[label_field]
            labels_dict[name] = _parse_detections(label)

    logger.info("Writing labels to '%s'", labels_path)
    labels = {
        "classes": None,  # @todo get this somehow?
        "labels": labels_dict,
    }
    etas.write_json(labels, labels_path)

    logger.info("Dataset created")


def export_image_labels_dataset(samples, label_field, dataset_dir):
    """Exports the given samples to disk as a multitask image labels dataset.

    See :class:`fiftyone.types.ImageLabelsDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the :class:`fiftyone.core.labels.ImageLabels`
            field of the samples to export
        dataset_dir: the directory to which to write the dataset
    """
    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.ImageLabelsDataset),
    )

    data_filename_counts = defaultdict(int)
    lid = etads.LabeledImageDataset.create_empty_dataset(dataset_dir)
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            img_path = sample.filepath
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            new_img_filename = name + ext
            new_labels_filename = name + ".json"

            image_labels_path = os.path.join(lid.labels_dir, name + ".json")

            label = sample[label_field]
            image_labels = _parse_image_labels(label)
            image_labels.write_json(image_labels_path)

            lid.add_file(
                img_path,
                image_labels_path,
                new_data_filename=new_img_filename,
                new_labels_filename=new_labels_filename,
            )

    logger.info("Writing manifest to '%s'", lid.manifest_path)
    lid.write_manifest()

    logger.info("Dataset created")


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
