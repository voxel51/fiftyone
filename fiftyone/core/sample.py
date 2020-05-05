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


class Sample(fod.Document):
    """A sample in a :class:`fiftyone.core.dataset.Dataset`.

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.

    Args:
        filepath: the path to the data on disk
        tags (None): a set of tags associated with the sample
        labels (None): a dict of :class:`fiftyone.core.labels.Label` instances
            associated with the sample
    """

    def __init__(self, filepath, tags=None, labels=None):
        self.filepath = os.path.abspath(filepath)
        self.filename = os.path.basename(filepath)
        self.tags = tags or set()
        self.labels = labels or {}
        self._dataset = None  # @ todo pass this reference

    @property
    def type(self):
        """The fully-qualified class name of the sample."""
        return etau.get_class_name(self)

    def add_label(self, group, label):
        """Adds the given label to the sample.

        Args:
            label: a :class:`fiftyone.core.label.Label` instance
        """
        self._dataset._validate_label(group, label)
        self.labels[group] = label

    def attributes(self):
        """Returns the list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return ["type", "filepath", "tags", "labels"]

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

        labels = d.get("labels", None)
        if labels is not None:
            labels = {k: fol.Label.from_dict(v) for k, v in iteritems(labels)}

        return sample_cls(
            filepath=d["filepath"],
            tags=d.get("tags", None),
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
