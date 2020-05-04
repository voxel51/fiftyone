"""
Core Module for `fiftyone` Sample class

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

import eta.core.image as etai
import eta.core.serial as etas

import fiftyone.core.document as fod


class Sample(fod.Document):
    def __init__(self, filepath, tags=None, insights=None, labels=None):
        self._filepath = os.path.abspath(filepath)
        self._tags = tuple(tags) or ()
        self._insights = tuple(insights) or ()
        self._labels = tuple(labels) or ()

    @property
    def filepath(self):
        return self._filepath

    @property
    def filename(self):
        return os.path.basename(self.filepath)

    @property
    def tags(self):
        # @todo(Tyler)
        return self._tags

    @property
    def insights(self):
        # @todo(Tyler)
        return self._insights

    @property
    def labels(self):
        # @todo(Tyler)
        return self._labels

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of attributes
        """
        return ["filepath", "tags", "insights", "labels"]

    @property
    def dataset_name(self):
        """Backref to the dataset to which this sample belongs. Returns None
        if the sample has not been inserted in a dataset.
        """
        return self.collection_name

    # def add_insight(self, insight_group, insight):
    #     # @todo(Tyler) this does not write to the database
    #     self.insights[insight_group] = insight

    # def add_label(self, label_group, label):
    #     # @todo(Tyler) this does not write to the database
    #     self.labels[label_group] = label

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a Sample from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a Sample
        """
        filepath = d.pop("filepath")
        tags = d.pop("tags", None)

        insights = d.pop("insights", None)
        if insights:
            insights = [
                etas.Serializable.from_dict(insight_dict)
                for insight_dict in insights
            ]

        labels = d.pop("labels", None)
        if labels:
            labels = [
                etas.Serializable.from_dict(label_dict)
                for label_dict in labels
            ]

        return cls(
            filepath=filepath,
            tags=tags,
            insights=insights,
            labels=labels,
            **kwargs
        )


class ImageSample(Sample):
    def __init__(self, metadata=None, *args, **kwargs):
        super(ImageSample, self).__init__(*args, **kwargs)
        self.metadata = metadata or etai.ImageMetadata.build_for(self.filepath)

    def load_image(self):
        return etai.read(self.filepath)

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of attributes
        """
        _attrs = super(ImageSample, self).attributes()
        _attrs.append("metadata")
        return _attrs

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs an ImageSample from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            an ImageSample
        """
        metadata = d.pop("metadata", None)
        if metadata:
            metadata = etai.ImageMetadata.from_dict(metadata)

        return super(ImageSample, cls).from_dict(
            d, metadata=metadata, **kwargs
        )
