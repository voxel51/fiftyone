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
    def create(cls, filepath, tags=None, labels=None):
        """Creates a :class:`Sample` instance.

        Args:
            filepath: the path to the data on disk
            tags (None): the set of tags associated with the sample
            labels (None): a list of :class:`fiftyone.core.labels.Label`
                instances associated with the sample
        """
        if labels is not None:
            _labels = []
            for group, ldoc in iteritems(labels):
                ldoc.group = group
                _labels.append(ldoc)
        else:
            _labels = None

        return cls._create_new(
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
    def labels(self):
        """A dict mapping groups to :class:`fiftyone.core.labels.Label`
        instances attached to the sample.
        """
        return {
            ld.group: fol.Label.from_doc(ld)
            for ld in self._backing_doc.labels
        }

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

    def add_label(self, group, label):
        """Adds the given label to the sample.

        Args:
            group: the group name for the label
            label: a :class:`fiftyone.core.labels.Label`
        """
        if self._dataset is not None:
            self._dataset._validate_label(group, label)

        # @todo optimize this?
        label._backing_doc.group = group
        self._backing_doc.labels.append(label._backing_doc)
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
            _labels = []
            for group, ldoc in iteritems(labels):
                ldoc.group = group
                _labels.append(ldoc)
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

        return cls._create_new(
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
