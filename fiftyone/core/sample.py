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

from mongoengine.errors import InvalidDocumentError

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.backed_by_doc as fob
import fiftyone.core.labels as fol
import fiftyone.core.insights as foi
import fiftyone.core.odm as foo


class Sample(fob.BackedByDocument):
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

    _ODM_DOCUMENT_TYPE = foo.ODMSample

    @staticmethod
    def get_odm_kwargs(filepath, tags=None, insights=None, labels=None):
        kwargs = {"filepath": os.path.abspath(os.path.expanduser(filepath))}

        if tags:
            kwargs["tags"] = tags

        if insights:
            kwargs["insights"] = insights

        if labels:
            kwargs["labels"] = labels

        return kwargs

    @property
    def dataset(self):
        raise NotImplementedError("TODO TYLER")

    @property
    def filepath(self):
        return self._doc.filepath

    @property
    def filename(self):
        return os.path.basename(self.filepath)

    @property
    def tags(self):
        return self._doc.tags

    @property
    def insights(self):
        return self._doc.insights

    @property
    def labels(self):
        return self._doc.labels

    def add_tag(self, tag):
        """Adds the given tag to the sample only if it is not already there.

        Args:
            tag: the tag

        Returns:
            True on success (even if tag is not added)

        Raises:
            fiftyone.core.odm.DoesNotExist if the sample has been deleted
        """
        try:
            if not self._doc.modify(add_to_set__tags=tag):
                self._doc.reload()  # this will raise a DoesNotExist error
        except InvalidDocumentError:
            # document not in the database, add tag locally
            if tag not in self.tags:
                self._doc.tags.append("train")
            pass
        return True

    def remove_tag(self, tag):
        """Adds the given tag to the sample.

        Args:
            tag: the tag

        Returns:
            True on success (even if tag is not removed)

        Raises:
            fiftyone.core.odm.DoesNotExist if the sample has been deleted
        """
        try:
            if not self._doc.modify(pull__tags=tag):
                self._doc.reload()  # this will raise a DoesNotExist error
        except InvalidDocumentError:
            # document not in the database, remove tag locally
            if tag in self.tags:
                self.tags.pop(self.tags.index(tag))
        return True

    # def add_insight(self, group, insight):
    #     """Adds the given insight to the sample.
    #
    #     Args:
    #         insight: a :class:`fiftyone.core.insights.Insight` instance
    #     """
    #     # @todo(Tyler) this needs to write to the DB
    #     self._insights[group] = insight
    #
    # def add_label(self, group, label):
    #     """Adds the given label to the sample.
    #
    #     Args:
    #         label: a :class:`fiftyone.core.label.Label` instance
    #     """
    #     # @todo(Tyler) this needs to write to the DB
    #     self._dataset._validate_label(group, label)
    #     self._labels[group] = label

    def _set_dataset(self, dataset):
        assert (
            not self._is_in_db()
        ), "This should never be called on a document in the database!"
        self._doc.dataset = dataset.name


class ImageSample(Sample):
    """An image sample in a :class:`fiftyone.core.dataset.Dataset`.

    The data associated with ``ImageSample`` instances are images.

    Args:
        metadata (None): an ``eta.core.image.ImageMetadata`` instance for the
            image
        **kwargs: keyword arguments for :func:`Sample.__init__`
    """

    _ODM_DOCUMENT_TYPE = foo.ODMImageSample

    @staticmethod
    def get_odm_kwargs(
        filepath, tags=None, metadata=None, insights=None, labels=None
    ):
        kwargs = super(ImageSample).get_odm_kwargs(
            filepath=filepath, tags=tags, insights=insights, labels=labels
        )

        if not isinstance(metadata, etai.ImageMetadata):
            # WARNING: this reads the image from disk, so will be slow...
            metadata = etai.ImageMetadata.build_for(kwargs["filepath"])

        kwargs["metadata"] = foo.ODMImageMetadata(
            size_bytes=metadata.size_bytes,
            mime_type=metadata.mime_type,
            width=metadata.frame_size[0],
            height=metadata.frame_size[1],
            num_channels=metadata.num_channels,
        )

        return kwargs

    def load_image(self):
        """Loads the image for the sample.

        Returns:
            a numpy image
        """
        return etai.read(self.filepath)
