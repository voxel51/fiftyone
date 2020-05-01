"""
Experimental dataset definitions.

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

from uuid import uuid4

from eta.core.serial import Serializable

import fiftyone.experimental.contexts as fec


class DatasetSample(Serializable):
    """Class encapsulating a sample in a dataset.

    Args:
        sample_id: the ID of the sample
        data_path: the path to the data on disk
        gt_labels (None): optional ground truth ``eta.core.image.ImageLabels``
    """

    def __init__(self, sample_id, data_path, gt_labels=None, **kwargs):
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

    Args:
        name: the name of the dataset
        samples (None): a list of :class:`DatasetSample`s
    """

    def __init__(self, name, samples=None):
        if samples is None:
            samples = []

        self._name = name
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

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    @classmethod
    def empty(cls, name):
        """Creates an empty Dataset.

        Args:
            name: the name of the dataset

        Returns:
            a Dataset
        """
        return cls(name)

    @classmethod
    def from_unlabeled_data(cls, name, data_paths):
        """Creates a Dataset from a list of unlabeled data paths.

        Args:
            name: the name of the dataset
            data_paths: a list of data paths

        Returns:
            a Dataset
        """
        samples = []
        for data_path in data_paths:
            sample_id = str(uuid4())  # placeholder UUID
            samples.append(DatasetSample(sample_id, data_path))

        return cls(name, samples=samples)

    @classmethod
    def from_ground_truth_samples(cls, name, data_paths, gt_labels):
        """Creates a Dataset from a set of samples with ground truth
        annotations.

        Args:
            name: the name of the dataset
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

        return cls(name, samples=samples)

    @classmethod
    def from_ground_truth_labeled_samples(cls, name, labeled_dataset):
        """Creates a Dataset from an ``eta.core.datasets.LabeledDataset`` of
        ground truth annotations.

        Args:
            name: the name of the dataset
            labeled_dataset: an ``eta.core.datasets.LabeledDataset``

        Returns:
            a Dataset
        """
        data_paths = labeled_dataset.iter_data_paths()
        gt_labels = labeled_dataset.iter_labels()
        return cls.from_ground_truth_samples(name, data_paths, gt_labels)

    def get_image_context(self):
        """Returns a :class:`fiftyone.core.contexts.ImageContext` for the
        images in the dataset.

        Returns:
            a :class:`fiftyone.core.contexts.ImageContext`
        """
        return fec.ImageContext(self)

    def get_ground_truth_context(self):
        """Returns a :class:`fiftyone.core.contexts.LabeledImageContext` for
        the ground truth annotations on the dataset.

        Returns:
            a :class:`fiftyone.core.contexts.LabeledImageContext`
        """
        return fec.LabeledImageContext(self, "gt_labels")

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
        """Returns a :class:`fiftyone.core.contexts.ModelContext` for the
        dataset for the model with the given name.

        Args:
            name: the name of the model

        Returns:
            a :class:`fiftyone.core.contexts.ModelContext`
        """
        return fec.ModelContext(self, name)

    def publish_model_context(self, model_context):
        """Publishes the given :class:`fiftyone.core.contexts.ModelContext` to
        the dataset.

        Args:
            model_context: a :class:`fiftyone.core.contexts.ModelContext`
        """
        if model_context.name not in self._models:
            raise ValueError("Dataset has no model '%s'" % model_context.name)

        label_field = model_context.name
        for sample_id, prediction in iteritems(model_context.predictions):
            setattr(self._samples[sample_id], label_field, prediction)
