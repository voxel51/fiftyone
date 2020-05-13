"""
FiftyOne datasets.

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
import numbers
import os

import eta.core.serial as etas

# import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.odm as foo

# import fiftyone.core.view as fov
# import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


def list_dataset_names():
    """Returns the list of available FiftyOne datasets.

    Returns:
        a list of :class:`Dataset` names
    """
    # pylint: disable=no-member
    # @todo(Tyler) list_dataset_names()
    raise NotImplementedError("TODO")


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`
    """
    return Dataset(name, create_empty=False)


def get_default_dataset_name():
    """Returns a default dataset name based on the current time.

    Returns:
        a dataset name
    """
    name = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logger.info("Using default dataset name '%s'", name)
    return name


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

    logger.info("Using default dataset directory '%s'", dataset_dir)
    return dataset_dir


class Dataset(foc.SampleCollection):
    """A FiftyOne dataset.

    Datasets represent a homogeneous collection of
    :class:`fiftyone.core.sample.Sample` instances that describe a particular
    type of raw media (e.g., images) together with one or more sets of
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

    _instances = {}

    def __new__(cls, name, *args, **kwargs):
        if name not in cls._instances:
            cls._instances[name] = super(Dataset, cls).__new__(cls)
        return cls._instances[name]

    def __init__(self, name, create_empty=True):
        self._name = name

        # @todo(Tyler) use MetaDataset to load this class from the DB
        self._Doc = type(self._name, (foo.ODMDataset,), {})

    def __len__(self):
        return self._get_query_set().count()

    def __getitem__(self, sample_id):
        if isinstance(sample_id, numbers.Integral):
            raise ValueError(
                "Accessing dataset samples by numeric index is not supported. "
                "Use sample IDs instead"
            )

        if isinstance(sample_id, slice):
            raise ValueError(
                "Slicing datasets is not supported. Use `view()` to "
                "obtain a DatasetView if you want to slice your samples"
            )

        samples = self._get_query_set(id=sample_id)
        if not samples:
            raise ValueError("No sample found with ID '%s'" % sample_id)

        return samples[0]

    def __delitem__(self, sample_id):
        self[sample_id].delete()

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        fields = self.get_sample_fields()
        max_len = max([len(field_name) for field_name in fields])
        fields_str = "\n".join(
            "\t%s: %s" % (field_name.ljust(max_len), field.__class__)
            for field_name, field in iteritems(fields)
        )

        return "\n".join(
            [
                "Name:           %s" % self.name,
                "Num samples:    %d" % len(self),
                "Tags:           %s" % self.get_tags(),
                "Sample Fields:",
                fields_str,
            ]
        )

    def get_sample_fields(self, field_type=None):
        return self._Doc.get_fields(field_type=field_type)

    def get_tags(self):
        """Returns the list of tags in the dataset.

        Returns:
            a list of tags
        """
        return self.distinct("tags")

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for doc in self._get_query_set():
            yield doc

    def add_sample(self, *args, **kwargs):
        """Adds the given sample to the dataset.

        Args:
            args and kwargs used to initialize a sample (this varies depending
                on what fields the dataset has)

        Returns:
            the ID of the sample
        """
        sample = self._Doc(*args, **kwargs)
        sample.save()
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

    def view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        entire dataset.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        # @todo(Tyler) Dataset.view()
        raise NotImplementedError("TODO")
        # return fov.DatasetView(self)

    def take(self, num_samples=3):
        """Returns a string summary of a few random samples from the dataset.

        Args:
            num_samples (3): the number of samples

        Returns:
            a string representation of the samples
        """
        return self.view().take(num_samples).head(num_samples=num_samples)

    def distinct(self, field):
        return self._get_query_set().distinct(field)

    def aggregate(self, pipeline=None):
        """Calls the current MongoDB aggregation pipeline on the dataset.

        Args:
            pipeline (None): an optional aggregation pipeline (list of dicts)
                to aggregate on

        Returns:
            an iterable over the aggregation result
        """
        if pipeline is None:
            pipeline = []

        return self._get_query_set().aggregate(pipeline)

    def serialize(self):
        """Serializes the dataset.

        Returns:
            a JSON representation of the dataset
        """
        return {"name": self.name}

    def _get_query_set(self, **kwargs):
        # pylint: disable=no-member
        return self._Doc.objects(**kwargs)
