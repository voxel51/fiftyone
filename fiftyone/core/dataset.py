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
from pymongo import MongoClient

import eta.core.utils as etau

import fiftyone.core.collections as foc
import fiftyone.core.document as fod
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
    members = _get_members_for_collection_type(_DATASET_COLLECTION_TYPE)
    return [
        collection_name
        for collection_name in _db().list_collection_names()
        if collection_name in members
    ]


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`
    """
    # @todo reflectively load the right `Dataset` subclass
    return Dataset(name=name, create_empty=False)


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

    # The `Sample` class that this dataset can contain
    _SAMPLE_CLS = fos.Sample

    def __init__(self, name, create_empty=True):
        self.name = name
        self._c = _get_dataset_collection(name, create_empty)

        # @todo populate this when reading an existing collection from the DB
        self._label_types = {}

    def __len__(self):
        return self._c.count_documents({})

    def __getitem__(self, sample_id):
        return self._deserialize_sample(
            self._c.find_one({"_id": ObjectId(sample_id)})
        )

    def __delitem__(self, sample_id):
        return fod.delete_one(collection=self._c, document_id=sample_id)

    def get_tags(self):
        """Returns the set of tags for this dataset.

        Returns:
            a set of tags
        """
        return set(self._c.distinct("tags"))

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for sample_dict in self._c.find():
            yield self._deserialize_sample(sample_dict)

    def get_insight_groups(self):
        return self._c.distinct("insights.group")

    def get_label_groups(self):
        return self._c.distinct("labels.group")

    def add_sample(self, sample):
        """Adds the given sample to the dataset.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
        """
        self._validate_sample(sample)
        sample._set_dataset(self)

        fod.insert_one(self._c, sample)

    def add_samples(self, samples):
        """Adds the given samples to the dataset.

        Args:
            sample: an iterable of :class:`fiftyone.core.sample.Sample`
                instances
        """
        for sample in samples:
            self._validate_sample(sample)
            sample._set_dataset(self)

        fod.insert_many(self._c, samples)

    def add_labels(self, group, labels_dict):
        """Adds the given labels to the dataset.

        Args:
            labels_dict: a dictionary mapping label group names to
                :class:`fiftyone.core.labels.Label` instances
        """
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
        return fov.DatasetView(self)

    def _deserialize_sample(self, sample_dict):
        if sample_dict is None:
            return None

        sample = fos.Sample.from_dict(sample_dict)
        sample._set_dataset(self)
        return sample

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
        label_cls = self._label_types[group]
        if not isinstance(label, label_cls):
            raise ValueError(
                "Expected label to be an instance of '%s'; found '%s'"
                % (etau.get_class_name(label_cls), etau.get_class_name(label),)
            )

    def _register_label_cls(self, group, labels_dict):
        if group not in self._label_types:
            self._label_types[group] = next(itervalues(labels_dict)).__class__


class ImageDataset(Dataset):
    """A FiftyOne dataset of images."""

    _SAMPLE_CLS = fos.ImageSample


def drop_database():
    client = MongoClient()
    client.drop_database(_DATABASE)


def _db():
    return MongoClient()[_DATABASE]


def _get_dataset_collection(name, create_empty):
    """Gets the dataset collection of the given name from the database,
    initializing

    Args:
        name: the name of the dataset
        create_empty: whether to create a collection for the dataset if it does
            not already exist

    Returns:
        a ``pymongo.collection``
    """
    db = _db()

    if name in db.list_collection_names():
        # Collection already exists
        members = _get_members_for_collection_type(_DATASET_COLLECTION_TYPE)
        if name not in members:
            raise ValueError("'%s' is not a valid dataset" % name)
    elif create_empty:
        # Create new collection
        c = _get_meta_collection()
        c.update_one(
            {"collection_type": _DATASET_COLLECTION_TYPE},
            {"$push": {"members": name}},
        )

        # Create indexes
        c.create_index("filepath", unique=True)
    else:
        raise ValueError("Dataset '%s' does not exist" % name)

    return db[name]


def _get_meta_collection():
    """Gets the meta collection from the database.

    The meta collection is initialized to store dataset collections, if
    necessary.

    Returns:
        a ``pymongo.collection``
    """
    c = _db()[_META_COLLECTION]
    if not c.count({"collection_type": _DATASET_COLLECTION_TYPE}):
        c.insert_many(
            [{"collection_type": _DATASET_COLLECTION_TYPE, "members": []}]
        )

    return c


def _get_members_for_collection_type(collection_type):
    c = _get_meta_collection()
    members = c.find_one({"collection_type": collection_type})["members"]
    return members
