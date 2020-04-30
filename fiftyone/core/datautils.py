"""
Core data utilities.

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

import numpy as np

import eta.core.data as etad
import eta.core.datasets as etads
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.learning as etal
import eta.core.objects as etao
import eta.core.utils as etau

import fiftyone as fo


logger = logging.getLogger(__name__)


def to_labeled_image_dataset(
    dataset,
    dataset_dir,
    sample_parser=None,
    num_samples=None,
    image_format=fo.config.default_image_ext,
):
    """Converts a dataset to ``eta.core.datasets.LabeledImageDataset`` format.

    Args:
        dataset: an iterable of samples that can be parsed by the provided
            sample parser. If no ``sample_parser`` is provideed, the dataset
            must directly emit (image, ImageLabels) tuples
        dataset_dir: the directory to which to write the LabeledImageDataset
        sample_parser: a ``fiftyone.core.datautils.LabeledImageSampleParser``
            for parsing
        num_samples: the number of samples in the dataset. If omitted, it is
            assumed that this can be computed via `len(dataset)`
        image_format: the image format to use to write the images to disk in
            the output dataset. The default is
            ``fiftyone.config.default_image_ext``

    Returns:
        the LabeledImageDataset instance
    """
    if num_samples is None:
        num_samples = len(dataset)

    logger.info("Creating LabeledImageDataset in '%s'...", dataset_dir)
    lid = etads.LabeledImageDataset.create_empty_dataset(dataset_dir)

    int_patt = etau.get_int_pattern_with_capacity(num_samples)
    data_patt = int_patt + image_format
    labels_patt = int_patt + ".json"

    logger.info("Parsing %d dataset samples", num_samples)
    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for idx, sample in enumerate(dataset, 1):
            if sample_parser is not None:
                img, image_labels = sample_parser.parse(sample)
            else:
                img, image_labels = sample

            lid.add_data(img, image_labels, data_patt % idx, labels_patt % idx)
            bar.update()

    lid.write_manifest()
    logger.info("Dataset created")

    return lid


def write_labeled_image_dataset(image_paths, labels, dataset_dir):
    """Writes the given data to disk in
    ``eta.core.datasets.LabeledImageDataset`` format.

    Args:
        image_paths: an iterable of image paths
        labels: an iterable of ImageLabels
        dataset_dir: the directory to which to write the LabeledImageDataset

    Returns:
        the LabeledImageDataset instance
    """
    logger.info("Creating LabeledImageDataset in '%s'", dataset_dir)
    lid = etads.LabeledImageDataset.create_empty_dataset(dataset_dir)

    num_samples = len(image_paths)
    data_filename_counts = defaultdict(int)

    with etau.ProgressBar(num_samples, show_remaining_time=True) as bar:
        for img_path, image_labels in zip(image_paths, labels):
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            new_img_filename = name + ext
            new_labels_filename = name + ".json"

            image_labels_path = os.path.join(lid.labels_dir, name + ".json")
            image_labels.write_json(image_labels_path)

            lid.add_file(
                img_path,
                image_labels_path,
                new_data_filename=new_img_filename,
                new_labels_filename=new_labels_filename,
            )
            bar.update()

    lid.write_manifest()
    logger.info("Dataset complete")

    return lid


def parse_image_classification_dataset_directory(dataset_dir):
    """Parses the contents of the given image classification dataset directory,
    which should have the following format::

        dataset_dir/
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
        labels_map: a dict mapping class IDs to class strings
    """
    # Get labels map
    class_labels = etau.list_subdirs(dataset_dir)
    labels_map = _class_labels_to_labels_map(class_labels)

    # Generate dataset
    glob_patt = os.path.join(dataset_dir, "*", "*")
    samples = []
    for path in etau.get_glob_matches(glob_patt):
        chunks = path.split(os.path.sep)
        if any(s.startswith(".") for s in chunks[-2:]):
            continue

        samples.append((path, chunks[-2]))

    return samples, labels_map


def _class_labels_to_labels_map(class_labels):
    return {idx: label for idx, label in enumerate(sorted(class_labels))}


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
    """Interface for parsing unlabeled images from dataset samples.

    Subclasses can customize this behavior if desired, but, by default, this
    class assumes that the provided sample is either an image that can be
    converted to numpy format via ``np.asarray(img)`` or the path to an image
    on disk.

    Instances of ``UnlabeledImageSampleParser`` must output images as numpy
    arrays.
    """

    def parse(self, sample):
        """Extracts the image from the given sample.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        if etau.is_str(sample):
            return etai.read(sample)

        return np.asarray(sample)


class LabeledImageSampleParser(SampleParser):
    """Interface for parsing labeled images from dataset samples.

    Implementations of this interface can support different input sample
    formats, but the output types of the methods defined here cannot change.
    """

    def parse_image(self, sample):
        """Parses the image from the given sample.

        Args:
            sample: the sample

        Retuns:
            a numpy image
        """
        raise NotImplementedError("subclasses must implement parse_image()")

    def parse_label(self, target):
        """Parses the classification target from the given sample.

        Args:
            sample: the sample

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        raise NotImplementedError("subclasses must implement parse_label()")

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            img: a numpy image
            image_labels: an ``eta.core.image.ImageLabels`` instance
        """
        img = self.parse_image(sample)
        image_labels = self.parse_label(sample)
        return img, image_labels


class ImageClassificationSampleParser(LabeledImageSampleParser):
    """Interface for parsing image classification samples from datasets.

    Subclasses can customize this behavior if desired, but, by default, this
    class assumes that the provided sample is an ``(img, target)`` tuple of the
    following form:

        ``img`` is either an image that can be converted to numpy format via
            ``np.asarray(img)`` or the path to an image on disk

        ``target`` is either a class ID (if a ``labels_map`` is provided) or a
            class string
    """

    def __init__(self, labels_map=None):
        """Creates an ImageClassificationSampleParser instance.

        Args:
            labels_map: an optional dict mapping class IDs to class strings. If
                provided, it is assumed that ``target`` is a class ID that
                should be mapped to a class string via ``labels_map[target]``
        """
        self.labels_map = labels_map

    def parse_image(self, sample):
        """Parses the image from the given sample.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        img = sample[0]
        if etau.is_str(img):
            return etai.read(img)

        return np.asarray(img)

    def parse_label(self, sample):
        """Parses the classification target from the given sample.

        Args:
            sample: the sample

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        target = sample[1]

        if self.labels_map is not None:
            target = self.labels_map[target]

        image_labels = etai.ImageLabels()
        image_labels.add_attribute(etad.CategoricalAttribute("label", target))
        return image_labels


class ImageDetectionSampleParser(LabeledImageSampleParser):
    """Interface for parsing image detection samples from datasets.

    Subclasses can customize this behavior if desired, but, by default, this
    class assumes that the provided sample is an ``(img, target)`` tuple of the
    following form:

        ``img`` is either an image that can be converted to numpy format via
            ``np.asarray(img)`` or the path to an image on disk

        ``target`` is a list of detections in the following format::

            [
                {
                    "bbox": [top-left-x, top-left-y, width, height],
                    "label": label,
                    ...
                },
                ...
            ]
    """

    def __init__(
        self,
        bbox_field="bbox",
        label_field="label",
        labels_map=None,
        normalized=False,
    ):
        """Creates an ImageDetectionSampleParser instance.

        Args:
            bbox_field: the name of the bounding box field in the target dicts.
                The default is "bbox"
            label_field: the name of the object label field in the target
                dicts. The default is "label"
            labels_map: an optional dict mapping class IDs to class strings. If
                provided, it is assumed that the ``label``s in ``target`` are
                class IDs that should be mapped to class strings via
                ``labels_map[target]``
            normalized: whether the bounding box coordinates provided in
                ``target`` are absolute pixel coordinates (False) or relative
                coordinates in [0, 1] (True). By default, absolute pixel
                coordinates are assumed
        """
        self.bbox_field = bbox_field
        self.label_field = label_field
        self.labels_map = labels_map
        self.normalized = normalized

    def parse_image(self, sample):
        """Parses the image from the given sample.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        img = sample[0]
        return self._parse_image(img)

    def parse_label(self, sample):
        """Parses the detection target from the given sample.

        Args:
            sample: the sample

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        target = sample[1]

        if self.normalized:
            img = None
        else:
            # Absolute bbox coordinates were provided, so we must have the
            # image to convert to relative coordinates
            img = self._parse_image(sample[0])

        return self._parse_label(target, img=img)

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            img: a numpy image
            image_labels: an ``eta.core.image.ImageLabels`` instance
        """
        img, target = sample
        img = self._parse_image(img)
        image_labels = self._parse_label(target, img=img)
        return img, image_labels

    def _parse_image(self, img_or_path):
        if etau.is_str(img_or_path):
            return etai.read(img_or_path)

        return np.asarray(img_or_path)

    def _parse_label(self, target, img=None):
        image_labels = etai.ImageLabels()
        for obj in target:
            tlx, tly, w, h = obj[self.bbox_field]
            brx = tlx + w
            bry = tly + h
            if self.normalized:
                bbox = etag.BoundingBox.from_coords(tlx, tly, brx, bry)
            else:
                bbox = etag.BoundingBox.from_abs_coords(
                    tlx, tly, brx, bry, img=img
                )

            label = obj[self.label_field]
            if self.labels_map is not None:
                label = self.labels_map[label]

            image_labels.add_object(
                etao.DetectedObject(label=label, bounding_box=bbox)
            )

        return image_labels
