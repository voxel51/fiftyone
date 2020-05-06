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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import os

from mongoengine.errors import InvalidDocumentError

import eta.core.image as etai

import fiftyone.core.document as fod
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo


class Sample(fod.BackedByDocument):
    """A sample in a :class:`fiftyone.core.dataset.Dataset`.

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.
    """

    _ODM_DOCUMENT_CLS = foo.ODMSample

    def __init__(self, document):
        super(Sample, self).__init__(document)
        self._dataset = None

    @classmethod
    def create(cls, filepath, tags=None, labels=None, insights=None):
        """Creates a new :class:`Sample`.

        Args:
            filepath: the path to the data on disk
            tags (None): the set of tags associated with the sample
            labels (None): a list of :class:`fiftyone.core.labels.Label`
                instances associated with the sample
            insights (None): a list of :class:`fiftyone.core.insights.Insight`
                instances associated with the sample
        """
        if labels is not None:
            _labels = [l._backing_doc for l in labels]
        else:
            _labels = None

        if insights is not None:
            _insights = [i._backing_doc for i in insights]
        else:
            _insights = None

        return cls._create_new(
            filepath=os.path.abspath(os.path.expanduser(filepath)),
            tags=tags,
            labels=_labels,
            insights=_insights,
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
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        return self._dataset.name if self._dataset is not None else None

    @property
    def filepath(self):
        """The path to the raw data on disk."""
        return self._backing_doc.filepath

    @property
    def filename(self):
        """The name of the raw data file on disk."""
        return os.path.basename(self.filepath)

    @property
    def tags(self):
        """The set of tags attached to the sample."""
        return set(self._backing_doc.tags)

    @property
    def insights(self):
        """A dict mapping groups to :class:`fiftyone.core.insights.Insight`
        instances attached to the sample.
        """
        raise NotImplementedError("Not yet implemented")

    @property
    def labels(self):
        """A dict mapping groups to :class:`fiftyone.core.labels.Label`
        instances attached to the sample.
        """
        _labels = [fol.Label.from_doc(l) for l in self._backing_doc.labels]
        return {l.group: l for l in _labels}

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
            if not self._backing_doc.modify(add_to_set__tags=tag):
                self._backing_doc.reload()  # this will raise a DoesNotExist error
        except InvalidDocumentError:
            # document not in the database, add tag locally
            if tag not in self.tags:
                self._backing_doc.tags.append("train")

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
            if not self._backing_doc.modify(pull__tags=tag):
                self._backing_doc.reload()  # this will raise a DoesNotExist error
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

    def add_label(self, label):
        """Adds the given label to the sample.

        Args:
            label: a :class:`fiftyone.core.labels.Label`
        """
        self._dataset._validate_label(label)
        self.labels.append(label._backing_doc)
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
    def create(
        cls, filepath, tags=None, labels=None, insights=None, metadata=None
    ):
        """Creates a new :class:`ImageSample`.

        Args:
            filepath: the path to the image on disk
            tags (None): the set of tags associated with the sample
            labels (None): a list of :class:`fiftyone.core.labels.Label`
                instances associated with the sample
            insights (None): a list of :class:`fiftyone.core.insights.Insight`
                instances associated with the sample
            metadata (None): an ``eta.core.image.ImageMetadata`` instance for
                the image
        """
        if labels is not None:
            _labels = [l._backing_doc for l in labels]
        else:
            _labels = None

        if insights is not None:
            _insights = [i._backing_doc for i in insights]
        else:
            _insights = None

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

        return cls._create_new(
            filepath=os.path.abspath(os.path.expanduser(filepath)),
            tags=tags,
            labels=_labels,
            insights=_insights,
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
