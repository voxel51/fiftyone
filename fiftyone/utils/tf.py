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

import logging
import multiprocessing

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

fou.ensure_tensorflow()
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
        image_paths: a list of image paths
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits decoded images
    """
    return tf.data.Dataset.from_tensor_slices(image_paths).map(
        _parse_image, num_parallel_calls=num_parallel_calls
    )


def from_image_paths_and_labels(image_paths, labels, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for an image classification dataset stored
    as a list of image paths and labels.

    Args:
        image_paths: a list of image paths
        labels: a list of labels
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits ``(img, label)`` pairs
    """

    def parse_sample(img_path, label):
        img_bytes = tf.io.read_file(img_path)
        img = tf.image.decode_image(img_bytes)
        return img, label

    return tf.data.Dataset.from_tensor_slices((image_paths, labels)).map(
        parse_sample, num_parallel_calls=num_parallel_calls,
    )


def from_image_classification_labeled_dataset(
    labeled_dataset, num_parallel_calls=None
):
    """Creates a ``tf.data.Dataset`` for the given image classification
    dataset.

    Args:
        labeled_dataset: a ``eta.core.datasets.LabeledImageDataset``
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset` that emits ``(img, label)`` pairs
    """
    return from_labeled_image_dataset(
        labeled_dataset,
        ImageClassificationFeatures,
        num_parallel_calls=num_parallel_calls,
    )


def from_labeled_image_dataset(
    labeled_dataset, features, num_parallel_calls=None
):
    """Creates a ``tf.data.Dataset`` for the given labeled image dataset.

    Args:
        labeled_dataset: a ``eta.core.datasets.LabeledImageDataset``
        features: a :class:`Features` instance describing how to format the
            samples in the output records
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset` that emits ``(img, label)`` pairs
    """
    data_paths = list(labeled_dataset.iter_data_paths())
    labels_paths = list(labeled_dataset.iter_labels_paths())

    return tf.data.Dataset.from_tensor_slices((data_paths, labels_paths)).map(
        features.parse_tf_sample, num_parallel_calls=num_parallel_calls,
    )


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
        a ``tf.data.Dataset` that emits ``(img, label)`` pairs
    """
    samples, labels_map = foud.parse_image_classification_dir_tree(dataset_dir)

    def parse_sample(sample):
        img_path, label = sample
        img = _parse_image(img_path)
        return img, label

    return tf.data.Dataset.from_tensor_slices(samples).map(
        parse_sample, num_parallel_calls=num_parallel_calls
    )


def write_image_classification_tf_records(labeled_dataset, tf_records_path):
    """Writes an ``eta.core.datasets.LabeledImageDataset`` for an image
    classification task to disk in TFRecord format.

    Args:
        labeled_dataset: an ``eta.core.datasets.LabeledImageDataset``
        tf_records_path: the path to write the ``.tfrecords`` file
    """
    dataset = labeled_dataset.iter_paths()
    features = ImageClassificationFeatures()
    write_tf_records(dataset, features, tf_records_path)


def load_image_classification_tf_records(
    tf_records_patt, buffer_size=None, num_parallel_reads=None,
):
    """Loads the image classification TFRecords from the given path(s) as a
    ``tf.data.Dataset``.

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
        a ``tf.data.Dataset` that emits ``(img, label)`` pairs
    """
    features = ImageClassificationFeatures()
    return load_tf_records(
        tf_records_patt,
        features,
        buffer_size=buffer_size,
        num_parallel_reads=num_parallel_reads,
    )


# @todo support writing sharded TFRecords
def write_tf_records(dataset, features, tf_records_path):
    """Writes the given dataset to disk in TFRecord format with features
    described by the provided :class:`Features` class.

    Args:
        dataset: an iterable that emits samples
        features: a :class:`Features` instance whose
            :func:`Features.make_tf_example` method can be used to format the
            samples in the output records
        tf_records_path: the path to write the ``.tfrecords`` file
    """
    with tf.io.TFRecordWriter(tf_records_path) as writer:
        for sample in dataset:
            tf_example = features.make_tf_example(sample)
            writer.write(tf_example.SerializeToString())


def load_tf_records(
    tf_records_patt, features, buffer_size=None, num_parallel_reads=None,
):
    """Loads the TFRecords from the given path(s) as a ``tf.data.Dataset``.

    Args:
        tf_records_patt: the path (or glob pattern of paths) to the TFRecords
            file(s) to load
        features: a :class:`Features` instance whose
            :func:`Features.parse_tf_example` method can be used to parse the
            input records
        buffer_size (None): an optional buffer size, in bytes, to use when
            reading the records. Reasonable values are 1-100MBs
        num_parallel_reads (None): an optional number of files to read in
            parallel. If a negative value is passed, this parameter is set to
            the number of CPU cores on the host machine. By default, the files
            are read in series

    Returns:
        a ``tf.data.Dataset``
    """
    if num_parallel_reads is not None and num_parallel_reads < 0:
        num_parallel_reads = multiprocessing.cpu_count()

    return tf.data.TFRecordDataset(
        tf.data.Dataset.list_files(tf_records_patt),
        buffer_size=buffer_size,
        num_parallel_reads=num_parallel_reads,
    ).map(
        features.parse_tf_example,
        num_parallel_calls=tf.data.experimental.AUTOTUNE,
    )


class Features(object):
    """Interface for reading/writing ``tf.train.Example`` instances for common
    dataset formats.
    """

    def make_tf_example(self, sample):
        """Makes a ``tf.train.Example`` for the given sample.

        Args:
            sample: the sample

        Returns:
            a ``tf.train.Example``
        """
        raise NotImplementedError(
            "subclasses must implement make_tf_example()"
        )

    def parse_tf_example(self, example_proto):
        """Parses the given ``tf.train.Example``.

        Args:
            example_proto: a ``tf.train.Example`` proto

        Returns:
            the parsed sample
        """
        raise NotImplementedError(
            "subclasses must implement parse_tf_example()"
        )


class ImageClassificationFeatures(Features):
    """Class for reading/writing ``tf.train.Example`` instances representing
    image classification samples.
    """

    _TF_EXAMPLE_FEATURES = {
        "height": tf.io.FixedLenFeature([], tf.int64),
        "width": tf.io.FixedLenFeature([], tf.int64),
        "depth": tf.io.FixedLenFeature([], tf.int64),
        "label": tf.io.FixedLenFeature([], tf.string),
        "image_bytes": tf.io.FixedLenFeature([], tf.string),
    }

    def parse_tf_sample(self, img_path, image_labels_path):
        """Parses the sample in the context of a TF data pipeline.

        Args:
            img_path: the path to the image on disk
            image_labels_path: the path to an ``eta.core.image.ImageLabels`` on
                disk

        Returns:
            img: the decoded image tensor
            label: the class label string tensor
        """
        img = _parse_image(img_path)
        labels_bytes = tf.io.read_file(image_labels_path)
        label = tf.py_function(_parse_labels, [labels_bytes], tf.string)
        return img, label

    def make_tf_example(self, sample):
        """Makes an image classification ``tf.train.Example`` for the given
        image and labels.

        Args:
            sample: an ``(img_path, image_labels_path)`` tuple containing the
                path to an image and ``eta.core.image.ImageLabels`` on disk

        Returns:
            a ``tf.train.Example``
        """
        img_path, image_labels_path = sample

        img_bytes = tf.io.read_file(img_path)
        img_shape = tf.image.decode_image(img_bytes).shape

        labels_bytes = tf.io.read_file(image_labels_path)
        label = _parse_labels(labels_bytes)

        feature = {
            "height": _int64_feature(img_shape[0]),
            "width": _int64_feature(img_shape[1]),
            "depth": _int64_feature(img_shape[2]),
            "label": _bytes_feature(label.encode()),  # string label
            "image_bytes": _bytes_feature(img_bytes),
        }

        return tf.train.Example(features=tf.train.Features(feature=feature))

    def parse_tf_example(self, example_proto):
        """Parses an image classification ``tf.train.Example``.

        Args:
            example_proto: a ``tf.train.Example`` proto

        Returns:
            img: a ``tf.Tensor`` containing the decoded image
            label: a ``tf.string`` containing the class label
        """
        features = tf.io.parse_single_example(
            example_proto, ImageClassificationFeatures._TF_EXAMPLE_FEATURES
        )
        img = tf.image.decode_image(features["image_bytes"])
        label = features["label"]
        return img, label


def _parse_image(img_path):
    img_bytes = tf.io.read_file(img_path)
    return tf.image.decode_image(img_bytes)


def _parse_labels(labels_bytes):
    labels_str = labels_bytes.numpy().decode()
    image_labels = etai.ImageLabels.from_str(labels_str)
    return image_labels.attrs.get_attr_value_with_name("label")


def _bytes_feature(value):
    # Extract bytes from EagerTensor, if necessary
    if isinstance(value, type(tf.constant(0))):
        value = value.numpy()

    return tf.train.Feature(bytes_list=tf.train.BytesList(value=[value]))


def _float_feature(value):
    return tf.train.Feature(float_list=tf.train.FloatList(value=[value]))


def _int64_feature(value):
    return tf.train.Feature(int64_list=tf.train.Int64List(value=[value]))
