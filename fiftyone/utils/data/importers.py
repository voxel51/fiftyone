"""
Dataset importers.

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
from future.utils import iteritems

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import os

import eta.core.datasets as etads
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.metadata as fom

from .parsers import (
    ImageClassificationSampleParser,
    ImageDetectionSampleParser,
    ImageLabelsSampleParser,
)


class DatasetImporter(object):
    """Base interface for importing datasets stored on disk into FiftyOne.

    Args:
        dataset_dir: the dataset directory
    """

    def __init__(self, dataset_dir):
        self.dataset_dir = dataset_dir

    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, *args):
        self.close()

    def __iter__(self):
        return self

    def __next__(self):
        return self.get_next_sample()

    def setup(self):
        """Performs any necessary setup before importing the first sample in
        the dataset.

        This method is called when the importer's context manager interface is
        entered, :function:`DatasetImporter.__enter__`.
        """
        pass

    def close(self):
        """Performs any necessary actions after the last sample has been
        imported.

        This method is called when the importer's context manager interface is
        exited, :function:`DatasetImporter.__exit__`.
        """
        pass

    def get_next_sample(self):
        """Returns the next sample in the dataset.

        Returns:
            subclass-specific information for the sample

        Raises:
            StopIteration: if no more samples exist
        """
        raise NotImplementedError("subclass must implement get_next_sample()")


class UnlabeledImageDatasetImporter(DatasetImporter):
    """Interface for importing datasets of unlabeled image samples.

    Example Usage::

        import fiftyone as fo

        dataset = fo.Dataset(...)

        importer = UnlabeledImageDatasetImporter(dataset_dir, ...)
        with importer:
            for image_path, image_metadata in importer:
                dataset.add_sample(
                    fo.Sample(filepath=image_path, metadata=image_metadata)
                )

    Args:
        dataset_dir: the dataset directory
    """

    @property
    def has_image_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each image.
        """
        raise NotImplementedError("subclass must implement has_image_metadata")

    def get_next_sample(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an ``(image_path, image_metadata)`` tuple, where:
            -   ``image_path`` is the path to the image on disk
            -   ``image_metadata`` is an
                :class:`fiftyone.core.metadata.ImageMetadata` instances for the
                image, or ``None`` if :property:`has_image_metadata` is
                ``False``

        Raises:
            StopIteration: if no more samples exist
        """
        raise NotImplementedError("subclass must implement get_next_sample()")


class LabeledImageDatasetImporter(DatasetImporter):
    """Interface for importing datasets of labeled image samples.

    Example Usage::

        import fiftyone as fo

        dataset = fo.Dataset(...)
        label_field = ...

        importer = LabeledImageDatasetImporter(dataset_dir, ...)
        with importer:
            for image_path, image_metadata, label in importer:
                dataset.add_sample(
                    fo.Sample(
                        filepath=image_path,
                        metadata=image_metadata,
                        **{label_field: label},
                    )
                )

    Args:
        dataset_dir: the dataset directory
    """

    @property
    def has_image_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each image.
        """
        raise NotImplementedError("subclass must implement has_image_metadata")

    def get_next_sample(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an  ``(image_path, image_metadata, label)`` tuple, where:
            -   ``image_path`` is the path to the image on disk
            -   ``image_metadata`` is an
                :class:`fiftyone.core.metadata.ImageMetadata` instances for the
                image, or ``None`` if :property:`has_image_metadata` is
                ``False``
            -   ``label`` is a :class:`fiftyone.core.label.Label` instance

        Raises:
            StopIteration: if no more samples exist
        """
        raise NotImplementedError("subclass must implement get_next_sample()")


def parse_images_dir(dataset_dir, recursive=True):
    """Parses the contents of the given directory of images.

    See :class:`fiftyone.types.ImageDirectory` for format details. In
    particular, note that files with non-image MIME types are omitted.

    Args:
        dataset_dir: the dataset directory
        recursive (True): whether to recursively traverse subdirectories

    Returns:
        a list of image paths
    """
    filepaths = etau.list_files(
        dataset_dir, abs_paths=True, recursive=recursive
    )
    return [p for p in filepaths if etai.is_image_mime_type(p)]


def parse_image_classification_dataset(dataset_dir, sample_parser=None):
    """Parses the contents of the image classification dataset backed by the
    given directory.

    See :class:`fiftyone.types.ImageClassificationDataset` for format details.

    Args:
        dataset_dir: the dataset directory
        sample_parser (None): a :class:`ImageClassificationSampleParser`
            instance whose :func:`ImageClassificationSampleParser.parse_label`
            method will be used to parse the sample labels. If not provided,
            the default :class:`ImageClassificationSampleParser` instance is
            used

    Returns:
        a list of ``(image_path, label)`` pairs, where ``label`` is an instance
        of :class:`fiftyone.core.labels.Classification`
    """
    if sample_parser is None:
        sample_parser = ImageClassificationSampleParser()

    data_dir = os.path.join(dataset_dir, "data")
    image_paths_map = {
        os.path.splitext(os.path.basename(p))[0]: p
        for p in etau.list_files(data_dir, abs_paths=True)
    }

    labels_path = os.path.join(dataset_dir, "labels.json")
    labels = etas.load_json(labels_path)
    sample_parser.classes = labels.get("classes", None)

    samples = []
    for uuid, target in iteritems(labels["labels"]):
        image_path = image_paths_map[uuid]
        label = sample_parser.parse_label((image_path, target))
        samples.append((image_path, label))

    return samples


def parse_image_classification_dir_tree(dataset_dir):
    """Parses the contents of the given image classification dataset directory
    tree, which should have the following format::

        <dataset_dir>/
            <classA>/
                <image1>.<ext>
                <image2>.<ext>
                ...
            <classB>/
                <image1>.<ext>
                <image2>.<ext>
                ...

    Args:
        dataset_dir: the dataset directory

    Returns:
        samples: a list of ``(image_path, target)`` pairs
        classes: a list of class label strings
    """
    # Get classes
    classes = sorted(etau.list_subdirs(dataset_dir))
    labels_map_rev = {c: i for i, c in enumerate(classes)}

    # Generate dataset
    glob_patt = os.path.join(dataset_dir, "*", "*")
    samples = []
    for path in etau.get_glob_matches(glob_patt):
        chunks = path.split(os.path.sep)
        if any(s.startswith(".") for s in chunks[-2:]):
            continue

        target = labels_map_rev[chunks[-2]]
        samples.append((path, target))

    return samples, classes


def parse_image_detection_dataset(dataset_dir, sample_parser=None):
    """Parses the contents of the image detection dataset backed by the given
    directory.

    See :class:`fiftyone.types.ImageDetectionDataset` for format details.

    Args:
        dataset_dir: the dataset directory
        sample_parser (None): a :class:`ImageDetectionSampleParser` instance
            whose :func:`ImageDetectionSampleParser.parse_label` method will be
            used to parse the sample labels. If not provided, the default
            :class:`ImageDetectionSampleParser` instance is used

    Returns:
        a list of ``(image_path, label)`` pairs, where ``label`` is an instance
        of :class:`fiftyone.core.labels.Detections`
    """
    if sample_parser is None:
        sample_parser = ImageDetectionSampleParser()

    data_dir = os.path.join(dataset_dir, "data")
    image_paths_map = {
        os.path.splitext(os.path.basename(p))[0]: p
        for p in etau.list_files(data_dir, abs_paths=True)
    }

    labels_path = os.path.join(dataset_dir, "labels.json")
    labels = etas.load_json(labels_path)
    sample_parser.classes = labels.get("classes", None)

    samples = []
    for uuid, target in iteritems(labels["labels"]):
        image_path = image_paths_map[uuid]
        label = sample_parser.parse_label((image_path, target))
        samples.append((image_path, label))

    return samples


def parse_image_labels_dataset(dataset_dir, sample_parser=None):
    """Parses the contents of the image labels dataset backed by the given
    directory.

    See :class:`fiftyone.types.ImageLabelsDataset` for format details.

    Args:
        dataset_dir: the dataset directory
        sample_parser (None): a :class:`ImageLabelsSampleParser` instance whose
            :func:`ImageLabelsSampleParser.parse_label` method will be used to
            parse the sample labels. If not provided, the default
            :class:`ImageLabelsSampleParser` instance is used

    Returns:
        a generator that emits ``(image_path, image_labels)`` pairs, where
        ``label`` is an instance of :class:`fiftyone.core.labels.ImageLabels`
    """
    if sample_parser is None:
        sample_parser = ImageLabelsSampleParser()

    labeled_dataset = etads.load_dataset(dataset_dir)

    for image_path, image_labels in zip(
        labeled_dataset.iter_data_paths(), labeled_dataset.iter_labels(),
    ):
        label = sample_parser.parse_label((image_path, image_labels))
        yield image_path, label
