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
        self.filepath = os.path.abspath(filepath)
        self.filename = os.path.basename(filepath)
        self.tags = tags or []
        self.insights = insights or {}
        self.labels = labels or {}

    @property
    def dataset(self):
        # @todo(Tyler) This could be stored similar to how I originally
        # implemented ingest_time
        raise NotImplementedError("TODO")

    def add_insight(self, insight_group, insight):
        # @todo(Tyler) this does not write to the database
        self.insights[insight_group] = insight

    def add_label(self, label_group, label):
        # @todo(Tyler) this does not write to the database
        self.labels[label_group] = label

    @classmethod
    def validate(cls, sample):
        if not isinstance(sample, cls):
            raise ValueError(
                "Unexpected 'sample' type: '%s', expected: '%s'"
                % (type(sample), cls)
            )
        return sample

    @classmethod
    def _from_dict(cls, d, *args, **kwargs):
        sample = cls(**cls._parse_kwargs_from_dict(d))

        return sample

    # PRIVATE #################################################################

    @classmethod
    def _parse_kwargs_from_dict(cls, d):
        kwargs = {
            "filepath": d["filepath"],
            "tags": d.get("tags", None),
        }

        if "insights" in d:
            kwargs["insights"] = {
                insight_group: etas.Serializable.from_dict(insights_dict)
                for insight_group, insights_dict in d["insights"].items()
            }

        if "labels" in d:
            kwargs["labels"] = {
                label_group: etas.Serializable.from_dict(labels_dict)
                for label_group, labels_dict in d["labels"].items()
            }

        return kwargs


class ImageSample(Sample):
    def __init__(self, metadata=None, *args, **kwargs):
        super(ImageSample, self).__init__(*args, **kwargs)
        self.metadata = metadata or etai.ImageMetadata.build_for(self.filepath)

    def load_image(self):
        return etai.read(self.filepath)

    # PRIVATE #################################################################

    @classmethod
    def _parse_kwargs_from_dict(cls, d):
        kwargs = super(ImageSample, cls)._parse_kwargs_from_dict(d)

        if "metadata" in d:
            kwargs["metadata"] = etai.ImageMetadata.from_dict(d["metadata"])

        return kwargs
