"""
TEMP Module for Objects wrapping ODM Document Objects, until they replace
the files (dataset.py, view.py, sample.py, etc.)

- dataset name is analogous to ID (shows up when inserted)
instantiate
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

import eta.core.utils as etau

import fiftyone.core.odm as foo
import fiftyone.core.sample as fos


def list_dataset_names():
    return foo.ODMSample.objects.distinct("dataset")


class Dataset(object):
    _SAMPLE_CLS = fos.Sample

    def __init__(self, name):
        self._name = name

    @property
    def name(self):
        return self._name

    def __len__(self):
        return self._objects().count()

    def __getitem__(self, sample_id):
        samples = self._objects(id=sample_id)
        return samples[0] if samples else None

    def __delitem__(self, sample_id):
        return self[sample_id].delete()

    def get_tags(self):
        return self._objects().distinct("tags")

    def get_insight_groups(self):
        return self._objects().distinct("insights.group")

    def get_label_groups(self):
        return self._objects().distinct("labels.group")

    def iter_samples(self):
        # @todo(Tyler) return a fos.Sample instead
        for sample in foo.ODMSample.objects(dataset=self.name):
            yield sample

    def add_sample(self, sample):
        """Adds the given sample to the dataset.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
        """
        etau.validate_type(sample, self._SAMPLE_CLS)
        sample._set_dataset(self)
        sample._save()

    def add_samples(self, samples):
        """Adds the given samples to the dataset.

        Args:
            sample: an iterable of :class:`fiftyone.core.sample.Sample`
                instances
        """
        for sample in samples:
            etau.validate_type(sample, self._SAMPLE_CLS)
            sample._set_dataset(self)
        self._objects().insert(samples)

    def _objects(self, **kwargs):
        return foo.ODMSample.objects(dataset=self.name, **kwargs)


class DatasetView(object):
    def __init__(self, dataset):
        self.dataset = dataset
        self._pipeline = []

    def __len__(self):
        raise NotImplementedError("TODO")

    def iter_samples(self):
        raise NotImplementedError("TODO")

    def sample(self, size):
        raise NotImplementedError("TODO")
        stage = {"$sample": {"size": size}}
