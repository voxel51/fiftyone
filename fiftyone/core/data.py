"""
Core dataset definitions.

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
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import datetime
import logging
import os
from uuid import uuid4

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as fc
import fiftyone.core.contexts as foc
import fiftyone.core.datautils as fodu
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def load_image_classification_dataset(
    dataset, labels_map=None, sample_parser=None, name=None, backing_dir=None,
):
    """Loads the given image classification dataset as a FiftyOne dataset.

    The input dataset can be any iterable that emits ``(image_path, target)``
    tuples, where:

        ``image_path`` is the path to the image on disk

        ``target`` is either a class ID (if a ``labels_map`` is provided) or a
            class string

    For example, ``dataset`` may be a ``tf.data.Dataset`` or a
    ``torch.utils.data.Dataset``.

    Args:
        dataset: the iterable dataset
        labels_map: an optional dict mapping class IDs to class strings. If
            provided, it is assumed that ``target`` is a class ID that should
            be mapped to a class string via ``labels_map[target]``
        sample_parser: an optional
            ``fiftyone.core.datautils.ImageClassificationSampleParser`` to use
            to parse the provided samples
        name: a name for the dataset. By default ``get_default_dataset_name()``
            is used
        backing_dir: an optional backing directory in which store
            FiftyOne-generated metadata about the dataset. The default is
            ``get_default_backing_dir(name)``

    Returns:
        a ``fiftyone.core.data.Dataset`` instance
    """
    if sample_parser is None:
        sample_parser = fodu.ImageClassificationSampleParser(
            labels_map=labels_map
        )

    return load_labeled_image_dataset(
        dataset,
        sample_parser=sample_parser,
        name=name,
        backing_dir=backing_dir,
    )


def load_image_detection_dataset(
    dataset, labels_map=None, sample_parser=None, name=None, backing_dir=None,
):
    """Loads the given image detection dataset as a FiftyOne dataset.

    The input dataset can be any iterable that emits ``(image_path, target)``
    tuples, where:

        ``image_path`` is the path to the image on disk

        ``target`` is a list of detections in the following format::

            [
                {
                    "bbox": [top-left-x, top-left-y, width, height],
                    "label": label,
                    ...
                },
                ...
            ]

    For example, ``dataset`` may be a ``tf.data.Dataset`` or a
    ``torch.utils.data.Dataset``.

    Args:
        dataset: the iterable dataset
        labels_map: an optional dict mapping class IDs to class strings. If
            provided, it is assumed that the ``label``s in ``target`` are class
            IDs that should be mapped to class strings via
            ``labels_map[target]``
        sample_parser: an optional
            ``fiftyone.core.datautils.ImageDetectionSampleParser`` to use to
            parse the provided samples
        name: a name for the dataset. By default ``get_default_dataset_name()``
            is used
        backing_dir: an optional backing directory in which store
            FiftyOne-generated metadata about the dataset. The default is
            ``get_default_backing_dir(name)``

    Returns:
        a ``fiftyone.core.data.Dataset`` instance
    """
    if sample_parser is None:
        sample_parser = fodu.ImageDetectionSampleParser(labels_map=labels_map)

    return load_labeled_image_dataset(
        dataset,
        sample_parser=sample_parser,
        name=name,
        backing_dir=backing_dir,
    )


def load_labeled_image_dataset(
    dataset, sample_parser=None, name=None, backing_dir=None,
):
    """Loads the given labeled image dataset as a FiftyOne dataset.

    The input dataset can be any iterable that emits ``(image_path, labels)``
    tuples, where:

        ``image_path`` is the path to the image on disk

        ``labels`` is an ``eta.core.image.ImageLabels`` instance, a serialized
            dict or string representation of one, or an arbitrary object that
            can be converted into this format by passing the sample to the
            ``parse_label()`` method of the provided ``sample_parser``

    For example, ``dataset`` may be a ``tf.data.Dataset`` or a
    ``torch.utils.data.Dataset``.

    Args:
        dataset: the iterable dataset
        sample_parser: an optional
            ``fiftyone.core.datautils.LabeledImageSampleParser`` to use to
            parse the provided samples
        name: a name for the dataset. By default ``get_default_dataset_name()``
            is used
        backing_dir: an optional backing directory in which store
            FiftyOne-generated metadata about the dataset. The default is
            ``get_default_backing_dir(name)``

    Returns:
        a ``fiftyone.core.data.Dataset`` instance
    """
    if name is None:
        name = get_default_dataset_name()

    if backing_dir is None:
        backing_dir = get_default_backing_dir(name)

    # Ingest labels
    image_paths = []
    labels = []
    for sample in dataset:
        image_path, image_labels = sample

        # Ingest image path
        image_paths.append(os.path.abspath(image_path))

        # Ingest labels
        if sample_parser is not None:
            image_labels = sample_parser.parse_label(sample)

        image_labels = fou.load_serializable(image_labels, etai.ImageLabels)
        labels.append(image_labels)

    return Dataset.from_ground_truth_dataset(image_paths, labels)


def load_images_from_dir(
    images_dir, recursive=False, name=None, backing_dir=None
):
    """Loads the images from the given directory as a FiftyOne dataset.

    Args:
        images_dir: a directory of images
        recursive: whether to recursively traverse subdirectories. By default,
            this is False
        name: a name for the dataset. By default ``get_default_dataset_name()``
            is used
        backing_dir: an optional backing directory in which store
            FiftyOne-generated metadata about the dataset. The default is
            ``get_default_backing_dir(name)``

    Returns:
        a ``fiftyone.core.data.Dataset`` instance
    """
    image_paths = etau.list_files(
        images_dir, abs_paths=True, recursive=recursive
    )
    return load_images(image_paths, name=name, backing_dir=backing_dir)


def load_images_from_patt(image_patt, name=None, backing_dir=None):
    """Loads the images from the given glob pattern as a FiftyOne dataset.

    Args:
        image_patt: a glob pattern of images like ``/path/to/images/*.jpg``
        recursive: whether to recursively traverse subdirectories. By default,
            this is False
        name: a name for the dataset. By default ``get_default_dataset_name()``
            is used
        backing_dir: an optional backing directory in which store
            FiftyOne-generated metadata about the dataset. The default is
            ``get_default_backing_dir(name)``

    Returns:
        a ``fiftyone.core.data.Dataset`` instance
    """
    image_paths = etau.parse_glob_pattern(image_patt)
    return load_images(image_paths, name=name, backing_dir=backing_dir)


def load_images(image_paths, name=None, backing_dir=None):
    """Loads the given list of images as a FiftyOne dataset.

    Args:
        image_paths: a list of image paths
        name: a name for the dataset. By default ``get_default_dataset_name()``
            is used
        backing_dir: an optional backing directory in which store
            FiftyOne-generated metadata about the dataset. The default is
            ``get_default_backing_dir(name)``

    Returns:
        a ``fiftyone.core.data.Dataset`` instance
    """
    if name is None:
        name = get_default_dataset_name()

    if backing_dir is None:
        backing_dir = get_default_backing_dir(name)

    image_paths = [os.path.abspath(p) for p in image_paths]

    return Dataset.from_unlabeled_data(image_paths)


def get_default_dataset_name():
    """Returns a default dataset name based on the current time.

    Returns:
        a dataset name
    """
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_default_dataset_dir(name, split=None):
    """Returns the default dataset directory for the dataset with the given
    name.

    Args:
        name: the dataset name
        split: an optional split

    Returns:
        the default dataset directory
    """
    dataset_dir = os.path.join(fo.config.default_dataset_dir, name)
    if split is not None:
        dataset_dir = os.path.join(dataset_dir, split)

    return dataset_dir


def get_default_backing_dir(name):
    """Returns the default backing directory for the dataset with the given
    name.

    Args:
        name: the dataset name

    Returns:
        the default backing directory
    """
    return os.path.join(fc.FIFTYONE_CONFIG_DIR, name)


class DatasetSample(etas.Serializable):
    """Class encapsulating a sample in a dataset."""

    def __init__(self, sample_id, data_path, gt_labels=None, **kwargs):
        """Creates a DatasetSample.

        Args:
            sample_id: the ID of the sample
            data_path: the path to the data on disk
            gt_labels: an optional ground truth ``eta.core.labels.Labels``
        """
        self.sample_id = sample_id
        self.data_path = data_path
        self.gt_labels = gt_labels
        for attr, value in kwargs.items():
            setattr(self, attr, value)

    @property
    def has_gt_labels(self):
        """Whether this sample has ground truth labels."""
        return self.gt_labels is not None

    @classmethod
    def from_dict(cls, d):
        """Creates a DatasetSample from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a DatasetSample
        """
        return cls(**d)


class Dataset(object):
    """Class encapsulating a FiftyOne dataset and its associated samples,
    ground truth annotations, and model(s) predictions.
    """

    def __init__(self, samples=None):
        """Creates a Dataset instance.

        Args:
            samples: a list of ``DatasetSample``s
        """
        if samples is None:
            samples = []

        self._samples = {sample.sample_id: sample for sample in samples}
        self._models = []

    def __len__(self):
        return len(self._samples)

    def __bool__(self):
        return bool(self._samples)

    def __getitem__(self, sample_id):
        return self._samples[sample_id]

    def __contains__(self, sample_id):
        return sample_id in self._samples

    def __iter__(self):
        return iter(itervalues(self._samples))

    def iter_sample_ids(self):
        """Returns an iterator over the sample IDs in the dataset.

        Returns:
            an iterator over sample IDs
        """
        return iter(self._samples)

    @classmethod
    def empty(cls):
        """Creates an empty Dataset.

        Returns:
            a Dataset
        """
        return cls()

    @classmethod
    def from_unlabeled_data(cls, data_paths):
        """Creates a Dataset from a list of unlabeled data paths.

        Args:
            data_paths: a list of data paths

        Returns:
            a Dataset
        """
        samples = []
        for data_path in data_paths:
            sample_id = str(uuid4())  # placeholder UUID
            samples.append(DatasetSample(sample_id, data_path))

        return cls(samples=samples)

    @classmethod
    def from_ground_truth_dataset(cls, data_paths, gt_labels):
        """Creates a Dataset from a set of samples with ground truth
        annotations.

        Args:
            data_paths: an iterable of data paths
            gt_labels: an iterable of ground truth labels

        Returns:
            a Dataset
        """
        samples = []
        for data_path, labels in zip(data_paths, gt_labels):
            sample_id = str(uuid4())  # placeholder UUID
            samples.append(
                DatasetSample(sample_id, data_path, gt_labels=labels)
            )

        return cls(samples=samples)

    @classmethod
    def from_ground_truth_labeled_dataset(cls, labeled_dataset):
        """Creates a Dataset from an ``eta.core.datasets.LabeledDataset`` of
        ground truth annotations.

        Args:
            labeled_dataset: an ``eta.core.datasets.LabeledDataset``

        Returns:
            a Dataset
        """
        data_paths = labeled_dataset.iter_data_paths()
        gt_labels = labeled_dataset.iter_labels()
        return cls.from_ground_truth_dataset(data_paths, gt_labels)

    def get_image_context(self):
        """Returns a ``fiftyone.core.contexts.ImageContext`` for the images in
        the dataset.

        Returns:
            a ``fiftyone.core.contexts.ImageContext``
        """
        return foc.ImageContext(self)

    def get_ground_truth_context(self):
        """Returns a ``fiftyone.core.contexts.LabeledImageContext`` for the
        ground truth annotations on the dataset.

        Returns:
            a ``fiftyone.core.contexts.LabeledImageContext``
        """
        return foc.LabeledImageContext(self, "gt_labels")

    def register_model(self, name):
        """Registers a model for use with the dataset.

        Args:
            name: a name for the model
        """
        if name in self._models:
            raise ValueError("Dataset already has a model named '%s'" % name)

        self._models.append(name)

    def get_models(self):
        """Returns the list of models registered with the dataset.

        Returns:
            the list of models
        """
        return self._models

    def get_model_context(self, name):
        """Returns a ``fiftyone.core.contexts.ModelContext`` for the dataset
        for the model with the given name.

        Args:
            name: the name of the model

        Returns:
            a ``fiftyone.core.contexts.ModelContext``
        """
        return foc.ModelContext(self, name)

    def publish_model_context(self, model_context):
        """Publishes the given ModelContext to the dataset.

        Args:
            model_context: a ``fiftyone.core.contexts.ModelContext``
        """
        if model_context.name not in self._models:
            raise ValueError("Dataset has no model '%s'" % model_context.name)

        label_field = model_context.name
        for sample_id, prediction in iteritems(model_context.predictions):
            setattr(self._samples[sample_id], label_field, prediction)
