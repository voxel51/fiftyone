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

import fiftyone.core.document as voxd


class Sample(voxd.Document):
    def __init__(self, filepath, tags=None, labels=None):
        self.filepath = os.path.abspath(filepath)
        self.filename = os.path.basename(filepath)
        self.tags = tags or []
        self.labels = labels

    def add_label(self, label, tag):
        pass

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
        return {"filepath": d["filepath"], "tags": d.get("tags", None)}


class ImageSample(Sample):
    def __init__(self, metadata=None, *args, **kwargs):
        super(ImageSample, self).__init__(*args, **kwargs)
        self.metadata = metadata or etai.ImageMetadata.build_for(self.filepath)

    # PRIVATE #################################################################

    @classmethod
    def _parse_kwargs_from_dict(cls, d):
        kwargs = super(ImageSample, cls)._parse_kwargs_from_dict(d)

        metadata = d.get("metadata", None)
        if metadata is not None:
            kwargs["metadata"] = etai.ImageMetadata.from_dict(metadata)

        return kwargs
