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


class Sample(etas.Serializable):
    def __init__(self, filepath, tags=None, labels=None):
        self.filepath = os.path.abspath(filepath)
        self.filename = os.path.basename(filepath)
        self.tags = tags or []
        self.labels = labels
        self._ingest_time = None
        self._id = None

    @property
    def id(self):
        return self._id

    @property
    def ingest_time(self):
        return self._ingest_time

    def attributes(self):
        return super(Sample, self).attributes() + ["_ingest_time"]

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
    def from_dict(cls, d, *args, **kwargs):
        sample = cls(**cls._parse_kwargs_from_dict(d))

        id = d.get("_id", None)
        if id:
            sample._set_id(id)

        ingest_time = d.get("_ingest_time", None)
        if ingest_time:
            sample._set_ingest_time(ingest_time)

        return sample

    # PRIVATE #################################################################

    @classmethod
    def _parse_kwargs_from_dict(cls, d):
        return {
            "filepath": d["filepath"],
            "tags": d.get("tags", None)
        }

    def _set_id(self, id):
        """This should only be set when reading from the database"""
        self._id = str(id)

    def _set_ingest_time(self, ingest_time):
        """This should only be set by the dataset"""
        self._ingest_time = ingest_time


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

