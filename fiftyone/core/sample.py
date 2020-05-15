"""
Dataset samples.

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

import fiftyone.core.document as fod
import fiftyone.core.insights as foi
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo


class Sample(fod.BackedByDocument):
    """A sample in a :class:`fiftyone.core.dataset.Dataset`.

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.

    Args:
        document: a :class:`fiftyone.core.odm.ODMSample`
    """

    _ODM_DOCUMENT_CLS = foo.ODMSample

    def __init__(self, document):
        super(Sample, self).__init__(document)
        self._dataset = None

    @classmethod
    def create(cls, filepath, tags=None, labels=None):
        """Creates a :class:`Sample` instance.

        Args:
            filepath: the path to the data on disk
            tags (None): the set of tags associated with the sample
            labels (None): a dict mapping group names to
                :class:`fiftyone.core.labels.Label` instances
        """
        if labels is not None:
            _labels = {g: l._backing_doc for g, l in iteritems(labels)}
        else:
            _labels = None

        return cls._create(
            filepath=os.path.abspath(os.path.expanduser(filepath)),
            tags=tags,
            labels=_labels,
        )

    @classmethod
    def from_doc(cls, document):
        """Creates an instance of the :class:`fiftyone.core.sample.Sample`
        class backed by the given document.

        Args:
            document: an :class:`fiftyone.core.odm.ODMSample` instance
        """
        sample_cls = _SAMPLE_CLS_MAP[document.__class__]
        return sample_cls(document)

    @property
    def in_dataset(self):
        """Whether the sample has been added to a dataset."""
        return self._dataset is not None

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        return self._dataset.name if self.in_dataset else None

    @property
    def filepath(self):
        """The path to the raw data on disk."""
        return self._backing_doc.filepath

    @property
    def filename(self):
        """The name of the raw data file on disk."""
        return os.path.basename(self.filepath)

    def get_tags(self):
        """Returns the set of tags attached to the sample."""
        return set(self._backing_doc.tags)

    def add_tag(self, tag):
        """Adds the given tag to the sample, if it does not already exist.

        Args:
            tag: the tag
        """
        try:
            if not self._backing_doc.modify(add_to_set__tags=tag):
                # This will raise an error if the sample does not exist
                self._backing_doc.reload()
        except InvalidDocumentError:
            # Sample is not yet in the database
            if tag not in self._backing_doc.tags:
                self._backing_doc.tags.append(tag)

        return True

    def remove_tag(self, tag):
        """Removes the given tag from the sample.

        Args:
            tag: the tag
        """
        try:
            if not self._backing_doc.modify(pull__tags=tag):
                # This will raise an error if the sample does not exist
                self._backing_doc.reload()
        except InvalidDocumentError:
            # Sample is not yet in the database
            self._backing_doc.tags.remove(tag)

    def get_label(self, group):
        """Gets the label with the given group for the sample.

        Args:
            group: the group name

        Returns:
            a :class:`fiftyone.core.labels.Label` instance
        """
        return fol.Label.from_doc(self._backing_doc.labels[group])

    def get_labels(self):
        """Returns the labels for the sample.

        Returns:
            a dict mapping group names to :class:`fiftyone.core.labels.Label`
            instances
        """
        return {
            g: fol.Label.from_doc(ld)
            for g, ld in iteritems(self._backing_doc.labels)
        }

    def add_label(self, group, label):
        """Adds the given label to the sample.

        Args:
            group: the group name for the label
            label: a :class:`fiftyone.core.labels.Label`
        """
        if self._in_db:
            self._dataset._validate_label(group, label)

        self._backing_doc.labels[group] = label._backing_doc

        if self._in_db:
            self._save()

    def get_insight(self, group):
        """Gets the insight with the given group for the sample.

        Args:
            group: the group name

        Returns:
            a :class:`fiftyone.core.insights.Insight` instance
        """
        return foi.Insight.from_doc(self._backing_doc.insights[group])

    def get_insights(self):
        """Returns the insights for the sample.

        Returns:
            a dict mapping group names to
            :class:`fiftyone.core.insights.Insight` instances
        """
        return {
            g: foi.Insight.from_doc(id)
            for g, id in iteritems(self._backing_doc.insights)
        }

    def add_insight(self, group, insight):
        """Adds the given insight to the sample.

        Args:
            group: the group name for the label
            insight: a :class:`fiftyone.core.insights.Insight`
        """
        self._backing_doc.insights[group] = insight._backing_doc

        if self._in_db:
            self._save()

    def _set_dataset(self, dataset):
        self._backing_doc.dataset = dataset.name
        self._dataset = dataset


class ImageSample(Sample):
    """An image sample in a :class:`fiftyone.core.dataset.Dataset`.

    The data associated with ``ImageSample`` instances are images.
    """

    _ODM_DOCUMENT_CLS = foo.ODMImageSample

    @classmethod
    def create(cls, filepath, tags=None, labels=None, metadata=None):
        """Creates an :class:`ImageSample` instance.

        Args:
            filepath: the path to the image on disk
            tags (None): a set of tags
            labels (None): a dict mapping group names to
                :class:`fiftyone.core.labels.Label` instances
            metadata (None): an ``eta.core.image.ImageMetadata`` instance
        """
        if labels is not None:
            _labels = {g: l._backing_doc for g, l in iteritems(labels)}
        else:
            _labels = None

        if metadata is not None:
            _metadata = foo.ODMImageMetadata(
                size_bytes=metadata.size_bytes,
                mime_type=metadata.mime_type,
                width=metadata.frame_size[0],
                height=metadata.frame_size[1],
                num_channels=metadata.num_channels,
            )
        else:
            _metadata = None

        return cls._create(
            filepath=os.path.abspath(os.path.expanduser(filepath)),
            tags=tags,
            labels=_labels,
            metadata=_metadata,
        )

    @property
    def metadata(self):
        """The image metadata."""
        # @todo(Tyler) this should NOT return the ODMDocument
        return self._backing_doc.metadata

    def load_image(self):
        """Loads the image for the sample.

        Returns:
            a numpy image
        """
        return etai.read(self.filepath)


_SAMPLE_CLS_MAP = {
    foo.ODMSample: Sample,
    foo.ODMImageSample: ImageSample,
}
