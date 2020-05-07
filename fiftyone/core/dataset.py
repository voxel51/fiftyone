"""
Core definitions of FiftyOne datasets.

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
import os

from bson.objectid import ObjectId

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.core.view as fov


def list_dataset_names():
    """Returns the list of available FiftyOne datasets.

    Returns:
        a list of :class:`Dataset` names
    """
    # pylint: disable=no-member
    return foo.ODMSample.objects.distinct("dataset")


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`
    """
    # @todo reflectively load the right `Dataset` subclass
    return Dataset(name, create_empty=False)


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
        split (None): an optional split

    Returns:
        the default dataset directory
    """
    dataset_dir = os.path.join(fo.config.default_dataset_dir, name)
    if split is not None:
        dataset_dir = os.path.join(dataset_dir, split)

    return dataset_dir


#
# @todo datasets should be registered in the DB even if they are empty
# Currently they only "appear" in the DB when they have their first sample
# added
#
class Dataset(foc.SampleCollection):
    """A FiftyOne dataset.

    Datasets represent a homogenous collection of
    :class:`fiftyone.core.sample.Sample` instances that describe a particular
    type of raw media (e.g., images) toegether with one or more sets of
    :class:`fiftyone.core.labels.Label` instances (e.g., ground truth
    annotations or model predictions) and metadata associated with those
    labels.

    FiftyOne datasets ingest and store the labels for all samples internally;
    raw media is stored on disk and the dataset provides paths to the data.

    Args:
        name: the name of the dataset
        create_empty (True): whether to create a dataset with the given name
            if it does not already exist
    """

    def __init__(self, name, create_empty=True):
        self._name = name

        # @todo populate this when reading an existing collection from the DB
        self._label_types = {}

        if not create_empty and not self:
            raise ValueError("Dataset '%s' not found" % name)

    def __len__(self):
        return self._get_query_set().count()

    def __getitem__(self, sample_id):
        samples = self._get_query_set(id=sample_id)
        if not samples:
            raise ValueError("No sample found with ID '%s'" % sample_id)

        return fos.Sample.from_doc(samples[0])

    def __delitem__(self, sample_id):
        return self[sample_id]._delete()

    def get_tags(self):
        """Returns the list of tags for this SampleCollection.

        Returns:
            a list of tags
        """
        return self._get_query_set().distinct("tags")

    def get_label_groups(self):
        """Returns the list of label groups attached to at least one sample
        in the SampleCollection.

        Returns:
            a list of groups
        """
        # @todo(Tyler) This does not work with DictField
        # return self._get_query_set().distinct("labels.group")
        raise NotImplementedError("Not yet implemented")

    def get_insight_groups(self):
        """Returns the list of insight groups attached to at least one sample
        in the SampleCollection.

        Returns:
            a list of groups
        """
        # @todo(Tyler) This does not work with DictField
        # return self._get_query_set().distinct("insights.group")
        raise NotImplementedError("Not yet implemented")

    def iter_samples(self):
        """Returns an iterator over the samples in the SampleCollection.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for doc in self._get_query_set():
            yield fos.Sample.from_doc(doc)

    @property
    def _sample_cls(self):
        """The :class:`fiftyone.core.sample.Sample` class that this dataset
        can contain.
        """
        return fos.Sample

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    def add_sample(self, sample):
        """Adds the given sample to the dataset.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`

        Returns:
            the ID of the sample
        """
        self._validate_sample(sample)
        sample._set_dataset(self)
        sample._save()
        return sample.id

    def add_samples(self, samples):
        """Adds the given samples to the dataset.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances

        Returns:
            a list of sample IDs
        """
        for sample in samples:
            self._validate_sample(sample)
            sample._set_dataset(self)

        sample_docs = self._get_query_set().insert(
            [s._backing_doc for s in samples]
        )
        return [str(s.id) for s in sample_docs]

    def default_view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        entire dataset.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return fov.DatasetView(self)

    @classmethod
    def from_image_classification_dataset(cls, dataset_dir, name=None):
        """Creates a :class:`Dataset` from the given image classification
        dataset on disk.

        See :class:`fiftyone.types.ImageClassificationDataset` for format
        details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = get_default_dataset_name()

    @classmethod
    def from_image_detection_dataset(cls, dataset_dir, name=None):
        """Creates a :class:`Dataset` from the given image detection dataset on
        disk.

        See :class:`fiftyone.types.ImageDetectionDataset` for format details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = get_default_dataset_name()

    @classmethod
    def from_image_labels_dataset(cls, dataset_dir, name=None):
        """Creates a :class:`Dataset` from the given image labels dataset on
        disk.

        See :class:`fiftyone.types.ImageLabelsDataset` for format details.

        Args:
            dataset_dir: the directory containing the dataset
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = get_default_dataset_name()

    def _get_query_set(self, **kwargs):
        # pylint: disable=no-member
        return foo.ODMSample.objects(dataset=self.name, **kwargs)

    def _validate_sample(self, sample):
        if not isinstance(sample, self._sample_cls):
            raise ValueError(
                "Expected sample to be an instance of '%s'; found '%s'"
                % (
                    etau.get_class_name(self._sample_cls),
                    etau.get_class_name(sample),
                )
            )

    def _validate_label(self, group, label):
        if group not in self._label_types:
            self._label_types[group] = label.__class__
        else:
            label_cls = self._label_types[group]
            if not isinstance(label, label_cls):
                raise ValueError(
                    "Expected label to be an instance of '%s'; found '%s'"
                    % (
                        etau.get_class_name(label_cls),
                        etau.get_class_name(label),
                    )
                )
