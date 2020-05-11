"""
Data utilities.

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

from collections import defaultdict
import logging
import os

import numpy as np

import eta.core.datasets as etads
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.types as fot


logger = logging.getLogger(__name__)


def parse_labeled_images(
    samples,
    dataset_dir,
    sample_parser=None,
    num_samples=None,
    image_format=fo.config.default_image_ext,
):
    """Parses the given labeled image samples, writing the images to disk in
    the specified directory and returning their paths and associated
    :class:`fiftyone.core.labels.Label` instances in-memory.

    Args:
        samples: an iterable of samples
        dataset_dir: the directory to which to write the images
        sample_parser (None): a :class:`LabeledImageSampleParser`
            instance whose :func:`LabeledImageSampleParser.parse` method
            will be used to parse the samples. If not provided, the default
            :class:`LabeledImageSampleParser` instance is used
        num_samples (None): the number of samples in ``samples``. If omitted,
            it is assumed that this can be computed via ``len(samples)``
        image_format (``fiftyone.config.default_image_ext``): the image format
            to use to write the images to disk

    Returns:
        the list of ``(image_path, label)`` tuples that were parsed
    """
    if sample_parser is None:
        sample_parser = LabeledImageSampleParser()

    if num_samples is None:
        num_samples = len(samples)

    uuid_patt = etau.get_int_pattern_with_capacity(num_samples)
    images_patt = os.path.join(dataset_dir, uuid_patt + image_format)

    logger.info(
        "Parsing %d labeled image samples and writing images to '%s'...",
        num_samples,
        dataset_dir,
    )

    _samples = []
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for idx, sample in enumerate(samples, 1):
            img, label = sample_parser.parse(sample)
            image_path = images_patt % idx
            etai.write(img, image_path)
            _samples.append((image_path, label))
            bar.update()

    logger.info("Parsing complete")

    return _samples


def to_images_dir(
    samples,
    dataset_dir,
    sample_parser=None,
    num_samples=None,
    image_format=fo.config.default_image_ext,
):
    """Writes the given images to disk in the given directory.

    Args:
        samples: an iterable of samples
        dataset_dir: the directory to which to write the images
        sample_parser (None): a :class:`UnlabeledImageSampleParser`
            instance whose :func:`UnlabeledImageSampleParser.parse` method
            will be used to parse the samples. If not provided, the default
            :class:`UnlabeledImageSampleParser` instance is used
        num_samples (None): the number of samples in ``samples``. If omitted,
            it is assumed that this can be computed via ``len(samples)``
        image_format (``fiftyone.config.default_image_ext``): the image format
            to use to write the images to disk

    Returns:
        the list of image paths that were written
    """
    if sample_parser is None:
        sample_parser = UnlabeledImageSampleParser()

    if num_samples is None:
        num_samples = len(samples)

    uuid_patt = etau.get_int_pattern_with_capacity(num_samples)
    images_patt = os.path.join(dataset_dir, uuid_patt + image_format)

    logger.info("Writing %d images to '%s'...", num_samples, dataset_dir)

    image_paths = []
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for idx, sample in enumerate(samples, 1):
            img = sample_parser.parse(sample)
            image_path = images_patt % idx
            etai.write(img, image_path)
            image_paths.append(image_path)
            bar.update()

    logger.info("Images written")

    return image_paths


def to_image_classification_dataset(
    samples,
    dataset_dir,
    sample_parser=None,
    num_samples=None,
    image_format=fo.config.default_image_ext,
):
    """Writes the given samples to disk as an image classification dataset.

    See :class:`fiftyone.types.ImageClassificationDataset` for format details.

    Args:
        samples: an iterable of samples
        dataset_dir: the directory to which to write the dataset
        sample_parser (None): a :class:`ImageClassificationSampleParser`
            instance whose :func:`ImageClassificationSampleParser.parse` method
            will be used to parse the samples. If not provided, the default
            :class:`ImageClassificationSampleParser` instance is used
        num_samples (None): the number of samples in ``samples``. If omitted,
            it is assumed that this can be computed via ``len(samples)``
        image_format (``fiftyone.config.default_image_ext``): the image format
            to use to write the images to disk
    """
    if sample_parser is None:
        sample_parser = ImageClassificationSampleParser()

    # Store labels map separately, if provided
    labels_map = sample_parser.labels_map
    sample_parser.labels_map = None

    if num_samples is None:
        num_samples = len(samples)

    data_dir = os.path.join(dataset_dir, "data")
    uuid_patt = etau.get_int_pattern_with_capacity(num_samples)
    images_patt = os.path.join(data_dir, uuid_patt + image_format)
    labels_path = os.path.join(dataset_dir, "labels.json")

    logger.info(
        "Writing %d samples to '%s' in '%s' format...",
        num_samples,
        dataset_dir,
        etau.get_class_name(fot.ImageClassificationDataset),
    )

    etau.ensure_dir(data_dir)
    labels_dict = {}
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for idx, sample in enumerate(samples, 1):
            img, label = sample_parser.parse(sample)
            etai.write(img, images_patt % idx)
            labels_dict[uuid_patt % idx] = label.label
            bar.update()

    logger.info("Writing labels to '%s'", labels_path)
    labels = {
        "labels_map": labels_map,
        "labels": labels_dict,
    }
    etas.write_json(labels, labels_path, pretty_print=True)

    logger.info("Dataset created")


def to_image_detection_dataset(
    samples,
    dataset_dir,
    sample_parser=None,
    num_samples=None,
    image_format=fo.config.default_image_ext,
):
    """Writes the given samples to disk as an image detection dataset.

    See :class:`fiftyone.types.ImageDetectionDataset` for format details.

    Args:
        samples: an iterable of samples
        dataset_dir: the directory to which to write the dataset
        sample_parser (None): a :class:`ImageDetectionSampleParser` instance
            whose :func:`ImageDetectionSampleParser.parse` method will be
            used to parse the samples. If not provided, the default
            :class:`ImageDetectionSampleParser` instance is used
        num_samples (None): the number of samples in ``samples``. If omitted,
            it is assumed that this can be computed via ``len(samples)``
        image_format (``fiftyone.config.default_image_ext``): the image format
            to use to write the images to disk
    """
    if sample_parser is None:
        sample_parser = ImageDetectionSampleParser()

    # Store labels map separately, if provided
    labels_map = sample_parser.labels_map
    sample_parser.labels_map = None

    if num_samples is None:
        num_samples = len(samples)

    data_dir = os.path.join(dataset_dir, "data")
    uuid_patt = etau.get_int_pattern_with_capacity(num_samples)
    images_patt = os.path.join(data_dir, uuid_patt + image_format)
    labels_path = os.path.join(dataset_dir, "labels.json")

    logger.info(
        "Writing %d samples to '%s' in '%s' format...",
        num_samples,
        dataset_dir,
        etau.get_class_name(fot.ImageDetectionDataset),
    )

    etau.ensure_dir(data_dir)
    labels_dict = {}
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for idx, sample in enumerate(samples, 1):
            img, label = sample_parser.parse(sample)
            etai.write(img, images_patt % idx)
            labels_dict[uuid_patt % idx] = label.detections
            bar.update()

    logger.info("Writing labels to '%s'", labels_path)
    labels = {
        "labels_map": labels_map,
        "labels": labels_dict,
    }
    etas.write_json(labels, labels_path, pretty_print=True)

    logger.info("Dataset created")


def to_image_labels_dataset(
    samples,
    dataset_dir,
    sample_parser=None,
    num_samples=None,
    image_format=fo.config.default_image_ext,
):
    """Writes the given samples to disk as a multitask image labels dataset.

    See :class:`fiftyone.types.ImageLabelsDataset` for format details.

    Args:
        samples: an iterable of samples
        dataset_dir: the directory to which to write the
            ``eta.core.datasets.LabeledImageDataset``
        sample_parser (None): a :class:`ImageLabelsSampleParser` instance whose
            :func:`ImageLabelsSampleParser.parse` method will be used to parse
            the samples. If not provided, the default
            :class:`ImageLabelsSampleParser` instance is used
        num_samples (None): the number of samples in ``samples``. If omitted,
            it is assumed that this can be computed via ``len(samples)``
        image_format (``fiftyone.config.default_image_ext``): the image format
            to use to write the images to disk
    """
    if sample_parser is None:
        sample_parser = ImageLabelsSampleParser()

    if num_samples is None:
        num_samples = len(samples)

    int_patt = etau.get_int_pattern_with_capacity(num_samples)
    images_patt = int_patt + image_format
    labels_patt = int_patt + ".json"

    logger.info(
        "Writing %d samples to '%s' in '%s' format...",
        num_samples,
        dataset_dir,
        etau.get_class_name(fot.ImageLabelsDataset),
    )

    lid = etads.LabeledImageDataset.create_empty_dataset(dataset_dir)
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for idx, sample in enumerate(samples, 1):
            img, label = sample_parser.parse(sample)
            lid.add_data(
                img, label.labels, images_patt % idx, labels_patt % idx
            )
            bar.update()

    logger.info("Writing manifest to '%s'", lid.manifest_path)
    lid.write_manifest()

    logger.info("Dataset created")


def export_image_classification_dataset(image_paths, labels, dataset_dir):
    """Exports the given data to disk as an image classification dataset.

    See :class:`fiftyone.types.ImageClassificationDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        image_paths: an iterable of image paths
        labels: an iterable of
            :class:`fiftyone.core.labels.ClassificationLabel` instances
        dataset_dir: the directory to which to write the dataset
    """
    num_samples = len(image_paths)
    data_filename_counts = defaultdict(int)

    data_dir = os.path.join(dataset_dir, "data")
    labels_path = os.path.join(dataset_dir, "labels.json")

    logger.info(
        "Writing %d samples to '%s' in '%s' format...",
        num_samples,
        dataset_dir,
        etau.get_class_name(fot.ImageClassificationDataset),
    )

    etau.ensure_dir(data_dir)
    labels_dict = {}
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for img_path, label in zip(image_paths, labels):
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            out_img_path = os.path.join(data_dir, name + ext)
            etau.copy_file(img_path, out_img_path)

            labels_dict[name] = label.label

            bar.update()

    logger.info("Writing labels to '%s'", labels_path)
    labels = {
        "labels_map": None,  # @todo get this somehow?
        "labels": labels_dict,
    }
    etas.write_json(labels, labels_path, pretty_print=True)

    logger.info("Dataset created")


def export_image_detection_dataset(image_paths, labels, dataset_dir):
    """Exports the given data to disk as an image detection dataset.

    See :class:`fiftyone.types.ImageDetectionDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        image_paths: an iterable of image paths
        labels: an iterable of :class:`fiftyone.core.labels.DetectionLabels`
            instances
        dataset_dir: the directory to which to write the dataset
    """
    num_samples = len(image_paths)
    data_filename_counts = defaultdict(int)

    data_dir = os.path.join(dataset_dir, "data")
    labels_path = os.path.join(dataset_dir, "labels.json")

    logger.info(
        "Writing %d samples to '%s' in '%s' format...",
        num_samples,
        dataset_dir,
        etau.get_class_name(fot.ImageDetectionDataset),
    )

    etau.ensure_dir(data_dir)
    labels_dict = {}
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for img_path, label in zip(image_paths, labels):
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            out_img_path = os.path.join(data_dir, name + ext)
            etau.copy_file(img_path, out_img_path)

            labels_dict[name] = label.detections

            bar.update()

    logger.info("Writing labels to '%s'", labels_path)
    labels = {
        "labels_map": None,  # @todo get this somehow?
        "labels": labels_dict,
    }
    etas.write_json(labels, labels_path, pretty_print=True)

    logger.info("Dataset created")


def export_image_labels_dataset(image_paths, labels, dataset_dir):
    """Exports the given data to disk as a multitask image labels dataset.

    See :class:`fiftyone.types.ImageLabelsDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        image_paths: an iterable of image paths
        labels: an iterable of :class:`fiftyone.core.labels.ImageLabels`
            instances
        dataset_dir: the directory to which to write the dataset
    """
    num_samples = len(image_paths)
    data_filename_counts = defaultdict(int)

    logger.info(
        "Writing %d samples to '%s' in '%s' format...",
        num_samples,
        dataset_dir,
        etau.get_class_name(fot.ImageLabelsDataset),
    )

    lid = etads.LabeledImageDataset.create_empty_dataset(dataset_dir)
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for img_path, label in zip(image_paths, labels):
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            new_img_filename = name + ext
            new_labels_filename = name + ".json"

            image_labels_path = os.path.join(lid.labels_dir, name + ".json")
            label.labels.write_json(image_labels_path)

            lid.add_file(
                img_path,
                image_labels_path,
                new_data_filename=new_img_filename,
                new_labels_filename=new_labels_filename,
            )
            bar.update()

    logger.info("Writing manifest to '%s'", lid.manifest_path)
    lid.write_manifest()

    logger.info("Dataset created")


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
        an iterable of ``(image_path, label)`` pairs, where ``label`` is an
        instance of :class:`fiftyone.core.labels.ClassificationLabel`
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
    labels_map = labels.get("labels_map", None)
    if labels_map is not None:
        # @todo avoid the need to cast here
        labels_map = {int(k): v for k, v in iteritems(labels_map)}
        sample_parser.labels_map = labels_map

    for uuid, target in iteritems(labels["labels"]):
        image_path = image_paths_map[uuid]
        label = sample_parser.parse_label((image_path, target))
        yield image_path, label


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
        an iterable of ``(image_path, label)`` pairs, where ``label`` is an
        instance of :class:`fiftyone.core.labels.DetectionLabels`
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
    labels_map = labels.get("labels_map", None)
    if labels_map is not None:
        # @todo avoid the need to cast here
        labels_map = {int(k): v for k, v in iteritems(labels_map)}
        sample_parser.labels_map = labels_map

    for uuid, target in iteritems(labels["labels"]):
        image_path = image_paths_map[uuid]
        label = sample_parser.parse_label((image_path, target))
        yield image_path, label


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
        an iterable of ``(image_path, image_labels)`` pairs, where ``label`` is
        an instance of :class:`fiftyone.core.labels.ImageLabels`
    """
    if sample_parser is None:
        sample_parser = ImageLabelsSampleParser()

    labeled_dataset = etads.load_dataset(dataset_dir)

    for image_path, image_labels in zip(
        labeled_dataset.iter_data_paths(), labeled_dataset.iter_labels(),
    ):
        label = sample_parser.parse_label((image_path, image_labels))
        yield image_path, label


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
        samples: a list of ``(image path, label)`` pairs
        labels_map: a dict mapping class IDs to label strings
    """
    # Get labels map
    class_labels = etau.list_subdirs(dataset_dir)
    labels_map = {idx: label for idx, label in enumerate(sorted(class_labels))}

    # Generate dataset
    glob_patt = os.path.join(dataset_dir, "*", "*")
    samples = []
    for path in etau.get_glob_matches(glob_patt):
        chunks = path.split(os.path.sep)
        if any(s.startswith(".") for s in chunks[-2:]):
            continue

        samples.append((path, chunks[-2]))

    return samples, labels_map


class SampleParser(object):
    """Abstract interface for parsing samples emitted by dataset iterators."""

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            the parsed sample
        """
        raise NotImplementedError("subclasses must implement parse()")


class UnlabeledImageSampleParser(SampleParser):
    """Interface for parsing unlabeled image samples emitted by dataset
    iterators.

    This interface enforces the contract that the `sample` passed to
    :func:`parse` must contain an image (or path to one) that will be
    parsed/decoded/loaded and outputted as a numpy array.

    Subclasses can customize this behavior as necessary, but, the default
    implementation here assumes that the provided sample is either an image
    that can be converted to numpy format via ``np.asarray()`` or the path
    to an image on disk.
    """

    def parse(self, sample):
        """Parses the given image.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        if etau.is_str(sample):
            return etai.read(sample)

        return np.asarray(sample)


class LabeledImageSampleParser(SampleParser):
    """Interface for parsing labeled image samples emitted by dataset
    iterators whose labels are to be stored as
    :class:`fiftyone.core.labels.Label` instances.

    This interface enforces the contract that the `sample` passed to
    :func:`LabeledImageSampleParser.parse` must contain the following two
    items:

        - an image (or path to one) that will be parsed/decoded/loaded and
          outputted as a numpy array

        - labels that will be outputted in :class:`fiftyone.core.labels.Label`
          format

    The default implementation provided by this class supports samples that are
    ``(image_or_path, label)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``label`` is a :class:`fiftyone.core.labels.Label` instance

    To support situations where either the image or label, but not both, are
    desired, this interface provides individual
    :func:`LabeledImageSampleParser.parse_image` and
    :func:`LabeledImageSampleParser.parse_label` methods that can parse each
    respective component of the sample in isolation.

    See the subclasses of this method for implementations that parse labels for
    common tasks:

        - Image classification: :class:`ImageClassificationSampleParser`

        - Object detection: :class:`ImageDetectionSampleParser`

        - Multitask image prediction: :class:`ImageLabelsSampleParser`
    """

    def parse_image(self, sample):
        """Parses the image from the given sample.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        image_or_path = sample[0]
        if etau.is_str(image_or_path):
            return etai.read(image_or_path)

        return np.asarray(image_or_path)

    def parse_label(self, sample):
        """Parses the label from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.Label` instance
        """
        return sample[1]

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            img: a numpy image
            label: a :class:`fiftyone.core.labels.Label` instance
        """
        img = self.parse_image(sample)
        label = self.parse_label(sample)
        return img, label


class ImageClassificationSampleParser(LabeledImageSampleParser):
    """Interface for parsing image classification samples emitted by dataset
    iterators whose labels are to be stored as
    :class:`fiftyone.core.labels.ClassificationLabel` instances.

    The default implementation provided by this class supports samples that are
    ``(image_or_path, target)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``target`` is either a class ID (if a ``labels_map`` is provided) or
          a label string

    Subclasses can support other input sample formats as necessary.

    Args:
        labels_map (None): an optional dict mapping class IDs to label strings.
            If provided, it is assumed that ``target`` is a class ID that
            should be mapped to a label string via ``labels_map[target]``
    """

    def __init__(self, labels_map=None):
        self.labels_map = labels_map

    def parse_label(self, sample):
        """Parses the classification target from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.ClassificationLabel` instance
        """
        target = sample[1]

        if self.labels_map is not None:
            label = self.labels_map[target]
        else:
            label = target

        return fol.ClassificationLabel.create(label)


class ImageDetectionSampleParser(LabeledImageSampleParser):
    """Interface for parsing image detection samples emitted by dataset
    iterators whose labels are to be stored as
    :class:`fiftyone.core.labels.DetectionLabels` instances.

    The default implementation provided by this class supports samples that are
    ``(image_or_path, detections)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``detections`` is a list of detections in the following format::

            [
                {
                    "label": <label>,
                    "bounding_box": [
                        <top-left-x>, <top-left-y>, <width>, <height>
                    ],
                    "confidence": <optional-confidence>,
                },
                ...
            ]

          where ``label`` is either a class ID (if a ``labels_map`` is
          provided) or a label string, and the bounding box coordinates can
          either be relative coordinates in ``[0, 1]``
          (if ``normalized == True``) or absolute pixels coordinates
          (if ``normalized == False``).

          The input field names can be configured as necessary when
          instantiating the parser.

    Subclasses can support other input sample formats as necessary.

    Args:
        label_field ("label"): the name of the object label field in the
            target dicts
        bounding_box_field ("bounding_box"): the name of the bounding box field
            in the target dicts
        confidence_field ("confidence"): the name of the confidence field in
            the target dicts
        labels_map (None): an optional dict mapping class IDs to class
            strings. If provided, it is assumed that the ``label``s in
            ``target`` are class IDs that should be mapped to label strings
            via ``labels_map[target]``
        normalized (True): whether the bounding box coordinates provided in
            ``target`` are absolute pixel coordinates (``False``) or relative
            coordinates in [0, 1] (``True``)
    """

    def __init__(
        self,
        label_field="label",
        bounding_box_field="bounding_box",
        confidence_field="confidence",
        labels_map=None,
        normalized=True,
    ):
        self.label_field = label_field
        self.bounding_box_field = bounding_box_field
        self.confidence_field = confidence_field
        self.labels_map = labels_map
        self.normalized = normalized

    def parse_image(self, sample):
        """Parses the image from the given sample.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        image_or_path = sample[0]
        return self._parse_image(image_or_path)

    def parse_label(self, sample):
        """Parses the detection target from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.DetectionLabels` instance
        """
        target = sample[1]

        if not self.normalized:
            # Absolute bounding box coordinates were provided, so we must have
            # the image to convert to relative coordinates
            img = self._parse_image(sample[0])
        else:
            img = None

        return self._parse_label(target, img=img)

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            img: a numpy image
            label: a :class:`fiftyone.core.labels.DetectionLabels` instance
        """
        img, target = sample
        img = self._parse_image(img)
        label = self._parse_label(target, img=img)
        return img, label

    def _parse_image(self, image_or_path):
        if etau.is_str(image_or_path):
            return etai.read(image_or_path)

        return np.asarray(image_or_path)

    def _parse_label(self, target, img=None):
        detections = []
        for obj in target:
            label = obj[self.label_field]
            if self.labels_map is not None:
                label = self.labels_map[label]

            tlx, tly, w, h = obj[self.bounding_box_field]
            if not self.normalized:
                tlx, tly, w, h = _to_rel_bounding_box(tlx, tly, w, h, img)

            bounding_box = [tlx, tly, w, h]

            confidence = obj.get(self.confidence_field, None)

            detections.append(
                {
                    "label": label,
                    "bounding_box": bounding_box,
                    "confidence": confidence,
                }
            )

        return fol.DetectionLabels.create(detections)


class ImageLabelsSampleParser(LabeledImageSampleParser):
    """Interface for parsing labeled image samples emitted by dataset
    iterators whose labels are to be stored as
    :class:`fiftyone.core.labels.ImageLabels` instances.

    The default implementation provided by this class supports samples that are
    ``(image_or_path, image_labels)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``image_labels`` is an ``eta.core.image.ImageLabels`` instance or a
          serialized dict representation of one

    Subclasses can support other input sample formats as necessary.
    """

    def parse_label(self, sample):
        """Parses the labels from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.ImageLabels` instance
        """
        labels = sample[1]
        return fol.ImageLabels.create(labels)


def _to_rel_bounding_box(tlx, tly, w, h, img):
    height, width = img.shape[:2]
    return (
        tlx / width,
        tly / height,
        w / width,
        h / height,
    )
