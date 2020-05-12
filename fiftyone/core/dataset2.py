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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import logging
import fiftyone.core.odm2 as foo

import eta.core.serial as etas

logger = logging.getLogger(__name__)


def list_dataset_names():
    """Returns the list of available FiftyOne datasets.

    Returns:
        a list of :class:`Dataset` names
    """
    # pylint: disable=no-member
    # @todo(Tyler)
    return foo.ODMSample.objects.distinct("dataset")


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`
    """
    # @todo(Tyler)
    return Dataset(name, create_empty=False)


class MetaDataset:
    pass


class Dataset(object):
    _instances = {}

    def __new__(cls, name, *args, **kwargs):
        if name not in cls._instances:
            cls._instances[name] = super(Dataset, cls).__new__(cls)
        return cls._instances[name]

    def __init__(self, name, create_empty=True):
        self._name = name

        # @todo(Tyler) use MetaDataset to load this class from the DB
        self._Doc = type(self._name, (foo.Dataset,), {})

    @property
    def name(self):
        """The name of the dataset."""
        return self._name

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        return "\n".join(
            [
                "Name:           %s" % self.name,
                "Num samples:    %d" % len(self),
                "Sample Fields:",
                etas.pretty_str(self.get_sample_fields()),
                "Tags: %s" % self.distinct("tags"),
            ]
        )

    def get_sample_fields(self, field_type=None):
        return self._Doc.get_sample_fields(field_type=field_type)

    def add_sample(self, *args, **kwargs):
        sample = self._Doc(*args, **kwargs)
        sample.save()
        return sample

    def _get_query_set(self, **kwargs):
        # pylint: disable=no-member
        return self._Doc.objects(**kwargs)

    def iter_samples(self):
        """Returns an iterator over the samples in the dataset.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for doc in self._get_query_set():
            yield doc

    def distinct(self, field):
        return self._get_query_set().distinct(field)

    def __len__(self):
        return self._get_query_set().count()
