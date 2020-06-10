"""
TensorFlow utilities.

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
import multiprocessing
import os

import contextlib2

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud

fou.ensure_tf()
import tensorflow as tf


logger = logging.getLogger(__name__)


def from_images_dir(images_dir, recursive=False, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for the given directory of images.

    Args:
        images_dir: a directory of images
        recursive (False): whether to recursively traverse subdirectories
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits decoded images
    """
    image_paths = etau.list_files(
        images_dir, abs_paths=True, recursive=recursive
    )
    return from_images(image_paths, num_parallel_calls=num_parallel_calls)


def from_image_patt(image_patt, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for the given glob pattern of images.

    Args:
        image_patt: a glob pattern of images like ``/path/to/images/*.jpg``
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits decoded images
    """
    image_paths = etau.parse_glob_pattern(image_patt)
    return from_images(image_paths, num_parallel_calls=num_parallel_calls)


def from_images(image_paths, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for the given list of images.

    Args:
        image_paths: an iterable of image paths
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits decoded images
    """
    return tf.data.Dataset.from_tensor_slices(list(image_paths)).map(
        _parse_image_tf, num_parallel_calls=num_parallel_calls
    )


def from_image_paths_and_labels(image_paths, labels, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for an image classification dataset stored
    as a list of image paths and labels.

    Args:
        image_paths: an iterable of image paths
        labels: an iterable of labels
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits ``(img, label)`` pairs
    """

    def parse_sample(image_path, label):
        img = _parse_image_tf(image_path)
        return img, label

    return tf.data.Dataset.from_tensor_slices(
        (list(image_paths), list(labels))
    ).map(parse_sample, num_parallel_calls=num_parallel_calls,)


def from_image_classification_dir_tree(dataset_dir, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for the given image classification dataset
    directory tree.

    The directory should have the following format::

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
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        dataset: a ``tf.data.Dataset` that emits ``(img, label)`` pairs
        classes: a list of class label strings
    """
    samples, classes = foud.parse_image_classification_dir_tree(dataset_dir)

    def parse_sample(sample):
        img_path, label = sample
        img = _parse_image_tf(img_path)
        return img, label

    dataset = tf.data.Dataset.from_tensor_slices(samples).map(
        parse_sample, num_parallel_calls=num_parallel_calls
    )
    return dataset, classes


def from_tf_records(
    tf_records_patt, buffer_size=None, num_parallel_reads=None,
):
    """Creates a ``tf.data.Dataset`` for the TFRecords at the given path(s).

    Args:
        tf_records_patt: the path (or glob pattern of paths) to the TFRecords
            file(s) to load
        buffer_size (None): an optional buffer size, in bytes, to use when
            reading the records. Reasonable values are 1-100MBs
        num_parallel_reads (None): an optional number of files to read in
            parallel. If a negative value is passed, this parameter is set to
            the number of CPU cores on the host machine. By default, the files
            are read in series

    Returns:
        a ``tf.data.Dataset`` that emits ``tf.train.Example`` protos
    """
    if num_parallel_reads is not None and num_parallel_reads < 0:
        num_parallel_reads = multiprocessing.cpu_count()

    return tf.data.TFRecordDataset(
        tf.data.Dataset.list_files(tf_records_patt),
        buffer_size=buffer_size,
        num_parallel_reads=num_parallel_reads,
    )


def write_tf_records(examples, tf_records_path, num_shards=None):
    """Writes the given ``tf.train.Example`` protos to disk as TFRecords.

    Args:
        examples: an iterable that emits ``tf.train.Example`` protos
        tf_records_path: the path to write the ``.tfrecords`` file. If sharding
            is requested ``-%%05d-%%05d`` is automatically appended to the path
        num_shards (None): an optional number of shards to split the records
            into (using a round robin strategy)
    """
    if num_shards:
        _write_sharded_tf_records(examples, tf_records_path, num_shards)
    else:
        _write_unsharded_tf_records(examples, tf_records_path)


def _write_unsharded_tf_records(examples, tf_records_path):
    with tf.io.TFRecordWriter(tf_records_path) as writer:
        for example in examples:
            writer.write(example.SerializeToString())


def _write_sharded_tf_records(examples, tf_records_path, num_shards):
    tf_records_patt = tf_records_path + "-%05d-%05d"
    tf_records_paths = [
        tf_records_patt % (i, num_shards) for i in range(1, num_shards + 1)
    ]

    with contextlib2.ExitStack() as exit_stack:
        writers = [
            exit_stack.enter_context(tf.io.TFRecordWriter(path))
            for path in tf_records_paths
        ]

        # Write records using round robin strategy
        for idx, example in enumerate(examples):
            writers[idx % num_shards].write(example.SerializeToString())


class TFRecordSampleParser(foud.LabeledImageSampleParser):
    """Base class for sample parsers that ingest ``tf.train.Example`` protos
    containing labeled images.
    """

    # Subclasses must implement this
    _FEATURES = {}

    def parse_image(self, sample):
        """Parses the image from the given sample.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        features = self._parse_features(sample)
        return self._parse_image(features)

    def parse_label(self, sample):
        """Parses the detection target from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.Labels` instance
        """
        features = self._parse_features(sample)
        return self._parse_label(features)

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            img: a numpy image
            label: a :class:`fiftyone.core.labels.Labels` instance
        """
        features = self._parse_features(sample)
        img = self._parse_image(features)
        label = self._parse_label(features)
        return img, label

    def _parse_features(self, sample):
        return tf.io.parse_single_example(sample, self._FEATURES)

    def _parse_image(self, features):
        raise NotImplementedError("subclasses must implement _parse_image()")

    def _parse_label(self, features):
        raise NotImplementedError("subclasses must implement _parse_label()")


class TFImageClassificationSampleParser(
    TFRecordSampleParser, foud.ImageClassificationSampleParser
):
    """Parser for samples in TF image classification format.

    This implementation supports samples that are ``tf.train.Example`` protos
    whose features follow the format described in
    :class:`fiftyone.types.TFImageClassificationDataset`.
    """

    _FEATURES = {
        "height": tf.io.FixedLenFeature([], tf.int64),
        "width": tf.io.FixedLenFeature([], tf.int64),
        "depth": tf.io.FixedLenFeature([], tf.int64),
        "filename": tf.io.FixedLenFeature([], tf.string),
        "image_bytes": tf.io.FixedLenFeature([], tf.string),
        "label": tf.io.FixedLenFeature([], tf.string),
    }

    def _parse_image(self, features):
        img_bytes = features["image_bytes"]
        img = tf.image.decode_image(img_bytes)
        return img.numpy()

    def _parse_label(self, features):
        return fol.Classification(features["label"])


class TFObjectDetectionSampleParser(
    TFRecordSampleParser, foud.ImageDetectionSampleParser
):
    """Parser for samples in TF Object Detection API format.

    This implementation supports samples that are ``tf.train.Example`` protos
    whose features follow the format described in
    :class:`fiftyone.types.TFObjectDetectionDataset`.
    """

    _FEATURES = {
        "image/height": tf.io.FixedLenFeature([], tf.int64),
        "image/width": tf.io.FixedLenFeature([], tf.int64),
        "image/filename": tf.io.FixedLenFeature([], tf.int64),
        "image/source_id": tf.io.FixedLenFeature([], tf.string),
        "image/encoded": tf.io.FixedLenFeature([], tf.string),
        "image/format": tf.io.FixedLenFeature([], tf.string),
        "image/object/bbox/xmin": tf.io.FixedLenFeature([], tf.float64),
        "image/object/bbox/xmax": tf.io.FixedLenFeature([], tf.float64),
        "image/object/bbox/ymin": tf.io.FixedLenFeature([], tf.float64),
        "image/object/bbox/ymax": tf.io.FixedLenFeature([], tf.float64),
        "image/object/class/text": tf.io.FixedLenFeature([], tf.string),
        "image/object/class/label": tf.io.FixedLenFeature([], tf.int64),
    }

    def _parse_image(self, features):
        img_bytes = features["image/encoded"]
        img = tf.image.decode_image(img_bytes)
        return img.numpy()

    def _parse_label(self, features):
        xmins = features["image/object/bbox/xmin"]
        xmaxs = features["image/object/bbox/xmax"]
        ymins = features["image/object/bbox/ymin"]
        ymaxs = features["image/object/bbox/ymax"]
        texts = features["image/object/class/text"]
        detections = []
        for xmin, xmax, ymin, ymax, text in zip(
            xmins, xmaxs, ymins, ymaxs, texts
        ):
            detections.append(
                fol.Detection(
                    label=text,
                    bounding_box=[xmin, ymin, xmax - xmin, ymax - ymin],
                )
            )

        return fol.Detections(detections=detections)


class TFRecordSampleWriter(object):
    """Base class for sample writers that emit ``tf.train.Example`` protos."""

    def make_tf_example(self, img_path, label, *args, **kwargs):
        """Makes a ``tf.train.Example`` for the given data.

        Args:
            img_path: the path to the image on disk
            label: a :class:`fiftyone.core.labels.Label`
            *args: subclass-specific positional arguments
            **kwargs: subclass-specific keyword arguments

        Returns:
            a ``tf.train.Example``
        """
        raise NotImplementedError(
            "subclasses must implement make_tf_example()"
        )


class TFImageClassificationSampleWriter(TFRecordSampleWriter):
    """Class for writing image classification samples as TFRecords.

    This implementation emits ``tf.train.Example`` protos whose features follow
    the format described in
    :class:`fiftyone.types.TFImageClassificationDataset`.
    """

    def make_tf_example(self, img_path, classification, filename=None):
        """Makes a ``tf.train.Example`` for the given data.

        Args:
            img_path: the path to the image on disk
            classification: a :class:`fiftyone.core.labels.Classification`
            filename (None): an optional filename to store. By default, the
                basename of ``img_path`` is used

        Returns:
            a ``tf.train.Example``
        """
        if filename is None:
            filename = os.path.basename(img_path)

        img_bytes = tf.io.read_file(img_path)
        img_shape = tf.image.decode_image(img_bytes).shape
        label = classification.label

        feature = {
            "height": _int64_feature(img_shape[0]),
            "width": _int64_feature(img_shape[1]),
            "depth": _int64_feature(img_shape[2]),
            "filename": _bytes_feature(filename.encode()),
            "image_bytes": _bytes_feature(img_bytes),
            "label": _bytes_feature(label.encode()),
        }

        return tf.train.Example(features=tf.train.Features(feature=feature))


class TFObjectDetectionSampleWriter(TFRecordSampleWriter):
    """Class for writing samples in TF Object Detection API format.

    This implementation emits ``tf.train.Example`` protos whose features follow
    the format described in
    :class:`fiftyone.types.TFObjectDetectionDataset`.
    """

    def make_tf_example(
        self, img_path, detections, labels_map_rev, filename=None
    ):
        """Makes a ``tf.train.Example`` for the given data.

        Args:
            img_path: the path to the image on disk
            detections: a :class:`fiftyone.core.labels.Detections`
            labels_map_rev: a dict mapping class label strings to class IDs
            filename (None): an optional filename to store. By default, the
                basename of ``img_path`` is used

        Returns:
            a ``tf.train.Example``
        """
        if filename is None:
            filename = os.path.basename(img_path)

        img_bytes = tf.io.read_file(img_path)
        img_shape = tf.image.decode_image(img_bytes).shape
        format = os.path.splitext(filename)[1][1:]  # no leading `.`

        xmins, xmaxs, ymins, ymaxs, texts, labels = [], [], [], [], [], []
        for detection in detections.detections:
            xmin, ymin, w, h = detection.bounding_box
            text = detection.label
            label = labels_map_rev[text]

            xmins.append(xmin)
            xmaxs.append(xmin + w)
            ymins.append(ymin)
            ymaxs.append(ymin + h)
            texts.append(text.encode())
            labels.append(label)

        feature = {
            "image/height": _int64_feature(img_shape[0]),
            "image/width": _int64_feature(img_shape[1]),
            "image/filename": _bytes_feature(filename.encode()),
            "image/source_id": _bytes_feature(filename.encode()),
            "image/encoded": _bytes_feature(img_bytes),
            "image/format": _bytes_feature(format.encode()),
            "image/object/bbox/xmin": _float_list_feature(xmins),
            "image/object/bbox/xmax": _float_list_feature(xmaxs),
            "image/object/bbox/ymin": _float_list_feature(ymins),
            "image/object/bbox/ymax": _float_list_feature(ymaxs),
            "image/object/class/text": _bytes_list_feature(texts),
            "image/object/class/label": _bytes_list_feature(labels),
        }

        return tf.train.Example(features=tf.train.Features(feature=feature))


def export_tf_image_classification_dataset(
    samples, label_field, dataset_dir, num_shards=None
):
    """Exports the given samples to disk as image classification TFRecords.

    See :class:`fiftyone.types.TFImageClassificationDataset` for format
    details.

    The filenames of the input images are maintained, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the
            :class:`fiftyone.core.labels.Classification` field of the samples
            to export
        dataset_dir: the directory to which to write the dataset
        num_shards (None): an optional number of shards to split the records
            into (using a round robin strategy)
    """
    tf_records_path = os.path.join(dataset_dir, "tf.records")

    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.TFImageClassificationDataset),
    )

    etau.ensure_dir(dataset_dir)

    def _example_generator():
        data_filename_counts = defaultdict(int)
        writer = TFImageClassificationSampleWriter()
        with fou.ProgressBar() as pb:
            for sample in pb(samples):
                img_path = sample.filepath
                name, ext = os.path.splitext(os.path.basename(img_path))
                data_filename_counts[name] += 1

                count = data_filename_counts[name]
                if count > 1:
                    name += "-%d" + count

                filename = name + ext

                label = sample[label_field]

                yield writer.make_tf_example(
                    img_path, label, filename=filename
                )

    examples = _example_generator()
    write_tf_records(examples, tf_records_path, num_shards=num_shards)

    logger.info("Dataset created")


def export_tf_object_detection_dataset(
    samples, label_field, dataset_dir, classes=None, num_shards=None
):
    """Exports the given samples to disk as TFRecords in TF Object Detection
    API format.

    See :class:`fiftyone.types.TFObjectDetectionDataset` for format details.

    The filenames of the input images are maintained, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the :class:`fiftyone.core.labels.Detections`
            field of the samples to export
        dataset_dir: the directory to which to write the dataset
        classes (None): an optional list of class labels. If omitted, this is
            dynamically computed from the observed labels
        num_shards (None): an optional number of shards to split the records
            into (using a round robin strategy)
    """
    if classes is None:
        classes = set()
        for sample in samples:
            for detection in samples[label_field].detections:
                classes.add(detection.label)

        classes = sorted(classes)

    labels_map_rev = _to_labels_map_rev(classes)

    tf_records_path = os.path.join(dataset_dir, "tf.records")

    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.TFObjectDetectionDataset),
    )

    etau.ensure_dir(dataset_dir)

    def _example_generator():
        data_filename_counts = defaultdict(int)
        writer = TFObjectDetectionSampleWriter()
        with fou.ProgressBar() as pb:
            for sample in pb(samples):
                img_path = sample.filepath
                name, ext = os.path.splitext(os.path.basename(img_path))
                data_filename_counts[name] += 1

                count = data_filename_counts[name]
                if count > 1:
                    name += "-%d" + count

                filename = name + ext

                label = sample[label_field]

                yield writer.make_tf_example(
                    img_path, label, labels_map_rev, filename=filename
                )

    examples = _example_generator()
    write_tf_records(examples, tf_records_path, num_shards=num_shards)

    logger.info("Dataset created")


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}


def _parse_image_tf(img_path):
    img_bytes = tf.io.read_file(img_path)
    return tf.image.decode_image(img_bytes)


def _bytes_feature(value):
    # Extract bytes from EagerTensor, if necessary
    if isinstance(value, type(tf.constant(0))):
        value = value.numpy()

    return tf.train.Feature(bytes_list=tf.train.BytesList(value=[value]))


def _bytes_list_feature(value):
    return tf.train.Feature(bytes_list=tf.train.BytesList(value=value))


def _float_feature(value):
    return tf.train.Feature(float_list=tf.train.FloatList(value=[value]))


def _float_list_feature(value):
    return tf.train.Feature(float_list=tf.train.FloatList(value=value))


def _int64_feature(value):
    return tf.train.Feature(int64_list=tf.train.Int64List(value=[value]))


def _int64_list_feature(value):
    return tf.train.Feature(int64_list=tf.train.Int64List(value=value))
