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

from bson.objectid import ObjectId

import eta.core.utils as etau

import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.core.view as fov


_DATABASE = "fiftyone"
_META_COLLECTION = "_meta"
_DATASET_COLLECTION_TYPE = "DATASET"


def list_dataset_names():
    """Returns the list of available FiftyOne datasets.

    Returns:
        a list of :class:`Dataset` names
    """
    return foo.ODMSample.objects.distinct("dataset")


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`
    """
    # @todo reflectively load the right `Dataset` subclass
    return Dataset(name=name)


class Dataset(object):
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

    # The `Sample` class that this dataset can contain
    _SAMPLE_CLS = fos.Sample

    def __init__(self, name):
        self._name = name

        # @todo populate this when reading an existing collection from the DB
        self._label_types = {}

    def __len__(self):
        return self._get_sample_objects().count()

    def __getitem__(self, sample_id):
        samples = self._get_sample_objects(id=sample_id)
        if not samples:
            raise ValueError("No sample found with ID '%s'" % sample_id)

        return self._SAMPLE_CLS(samples[0])

    def __delitem__(self, sample_id):
        return self[sample_id]._delete()

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    def get_tags(self):
        """Returns the list of tags for this dataset.

        Returns:
            a list of tags
        """
        return self._get_sample_objects().distinct("tags")

    def get_label_groups(self):
        """Returns the list of label groups attached to at least one sample
        in the dataset.

        Returns:
            a list of groups
        """
        return self._get_sample_objects().distinct("labels.group")

    def get_insight_groups(self):
        """Returns the list of insight groups attached to at least one sample
        in the dataset.

        Returns:
            a list of groups
        """
        return self._get_sample_objects().distinct("insights.group")

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for doc in self._get_sample_objects():
            yield self._SAMPLE_CLS(doc)

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

        sample_docs = self._get_sample_objects().insert(
            [s._doc for s in samples]
        )
        return [str(s.id) for s in sample_docs]

    def add_labels(self, group, labels_dict):
        """Adds the given labels to the dataset.

        Args:
            labels_dict: a dictionary mapping label group names to
                :class:`fiftyone.core.labels.Label` instances
        """
        # @todo(Tyler)
        raise NotImplementedError("TODO TYLER: Review this")
        self._register_label_cls(group, labels_dict)

        for sample_id, label in iteritems(labels_dict):
            self._validate_label(group, label)

            # @todo(Tyler) this could be done better...
            sample = self[sample_id]
            sample.add_label(label)

            # self._c.find_one_and_update(
            #     {"_id": ObjectId(sample_id)},
            #     {"$set": {"labels": label.serialize()}}
            # )
            self._c.find_one_and_replace(
                {"_id": ObjectId(sample_id)}, sample.serialize()
            )

    def default_view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        entire dataset.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        # @todo(Tyler)
        raise NotImplementedError("TODO TYLER: Review this")
        return fov.DatasetView(self)

    def _get_sample_objects(self, **kwargs):
        return foo.ODMSample.objects(dataset=self.name, **kwargs)

    def _validate_sample(self, sample):
        if not isinstance(sample, self._SAMPLE_CLS):
            raise ValueError(
                "Expected sample to be an instance of '%s'; found '%s'"
                % (
                    etau.get_class_name(self._SAMPLE_CLS),
                    etau.get_class_name(sample),
                )
            )

    def _validate_label(self, group, label):
        # @todo(Tyler)
        raise NotImplementedError("TODO TYLER: Review this")
        label_cls = self._label_types[group]
        if not isinstance(label, label_cls):
            raise ValueError(
                "Expected label to be an instance of '%s'; found '%s'"
                % (etau.get_class_name(label_cls), etau.get_class_name(label),)
            )

    def _register_label_cls(self, group, labels_dict):
        # @todo(Tyler)
        raise NotImplementedError("TODO TYLER: Review this")
        if group not in self._label_types:
            self._label_types[group] = next(itervalues(labels_dict)).__class__


class ImageDataset(Dataset):
    """A FiftyOne dataset of images."""

    _SAMPLE_CLS = fos.ImageSample
