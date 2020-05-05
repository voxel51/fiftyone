"""
Core definitions of FiftyOne dataset samples.

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
from future.utils import iteritems

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import os

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.document as fod
import fiftyone.core.labels as fol
import fiftyone.core.insights as foi


class Sample(fod.Document):
    """A sample in a :class:`fiftyone.core.dataset.Dataset`.

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.

    Args:
        filepath: the path to the data on disk
        tags (None): the set of tags associated with the sample
        insights (None): a list of :class:`fiftyone.core.insights.Insight`
            instances associated with the sample
        labels (None): a list of :class:`fiftyone.core.labels.Label` instances
            associated with the sample
    """

    def __init__(self, filepath, tags=None, insights=None, labels=None):
        super(Sample, self).__init__()
        self._filepath = os.path.abspath(os.path.expanduser(filepath))
        self._tags = set(tags) if tags else set()
        self._insights = list(insights) if insights else []
        self._labels = list(labels) if labels else []
        self._dataset = None  # @ todo pass this reference

    @property
    def type(self):
        """The fully-qualified class name of the sample."""
        return etau.get_class_name(self)

    @property
    def filepath(self):
        return self._filepath

    @property
    def filename(self):
        return os.path.basename(self.filepath)

    @property
    def tags(self):
        # returns a copy such that the original cannot be modified
        return list(self._tags)

    @property
    def insights(self):
        # returns a copy such that the original cannot be modified
        return list(self._insights)

    @property
    def labels(self):
        # returns a copy such that the original cannot be modified
        return list(self._labels)

    def add_tag(self, tag):
        # @todo(Tyler) this first check assumes that the Sample is in sync with
        # the DB
        if tag in self._tags:
            return False

        self._tags.add(tag)

        if self._collection is None:
            return True

        return fod.update_one(
            collection=self._collection,
            document=self,
            update={"$push": {"tags": tag}},
        )

    def remove_tag(self, tag):
        # @todo(Tyler) this first check assumes that the Sample is in sync with
        # the DB
        if tag not in self.tags:
            return False

        self._tags.remove(tag)

        if self._collection is None:
            return True

        return fod.update_one(
            collection=self._collection,
            document=self,
            update={"$pull": {"tags": tag}},
        )

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs.

        Returns ``None`` is the sample has not been inserted into a dataset.
        """
        if self._dataset is None:
            return None

        return self._dataset.name

    def add_insight(self, group, insight):
        """Adds the given insight to the sample.

        Args:
            insight: a :class:`fiftyone.core.insights.Insight` instance
        """
        # @todo(Tyler) this needs to write to the DB
        self._insights[group] = insight

    def add_label(self, group, label):
        """Adds the given label to the sample.

        Args:
            label: a :class:`fiftyone.core.label.Label` instance
        """
        # @todo(Tyler) this needs to write to the DB
        self._dataset._validate_label(group, label)
        self._labels[group] = label

    def attributes(self):
        """Returns the list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return ["type", "filepath", "tags", "insights", "labels"]

    @staticmethod
    def get_kwargs(d):
        """Extracts the subclass-specific keyword arguments from the given
        JSON dictionary for constructing an instance of the :class:`Sample`.

        Args:
            d: a JSON dictionary

        Returns:
            a dictionary of parsed keyword arguments
        """
        raise NotImplementedError("Subclass must implement get_kwargs()")

    @classmethod
    def _from_dict(cls, d, **kwargs):
        sample_cls = etau.get_class(d["type"])

        insights = d.get("insights", None)
        if insights is not None:
            insights = {
                k: foi.Insight.from_dict(v) for k, v in iteritems(insights)
            }

        labels = d.get("labels", None)
        if labels is not None:
            labels = {k: fol.Label.from_dict(v) for k, v in iteritems(labels)}

        return sample_cls(
            filepath=d["filepath"],
            tags=d.get("tags", None),
            insights=insights,
            labels=labels,
            **sample_cls.get_kwargs(d),
            **kwargs,
        )


class ImageSample(Sample):
    """An image sample in a :class:`fiftyone.core.dataset.Dataset`.

    The data associated with ``ImageSample`` instances are images.

    Args:
        metadata (None): an ``eta.core.image.ImageMetadata`` instance for the
            image
        **kwargs: keyword arguments for :func:`Sample.__init__`
    """

    def __init__(self, metadata=None, **kwargs):
        super(ImageSample, self).__init__(**kwargs)

        # WARNING: this reads the image from disk, so will be slow...
        self.metadata = metadata or etai.ImageMetadata.build_for(self.filepath)

    def load_image(self):
        """Loads the image for the sample.

        Returns:
            a numpy image
        """
        return etai.read(self.filepath)

    def attributes(self):
        _attrs = super(ImageSample, self).attributes()
        if self.metadata is not None:
            _attrs.append("metadata")

        return _attrs

    @staticmethod
    def get_kwargs(d):
        metadata = d.get("metadata", None)
        if metadata is not None:
            metadata = etai.ImageMetadata.from_dict(d["metadata"])

        return {"metadata": metadata}
