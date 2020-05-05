"""
TEMP Module for Objects wrapping ODM Document Objects, until they replace
the files (dataset.py, view.py, sample.py, etc.)

- dataset name is analogous to ID (shows up when inserted)
instantiate
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
import eta.core.utils as etau

import fiftyone.core.odm as foo


def list_dataset_names():
    return foo.ODMSample.objects.distinct("dataset")


class BackedByDocument(object):
    # MongoEngine Document Type
    _ODM_DOCUMENT_TYPE = foo.ODMDocument

    def __init__(self, document):
        etau.validate_type(document, self._ODM_DOCUMENT_TYPE)
        self._doc = document

    @property
    def id(self):
        """Document ObjectId value.

        - automatically created when added to the database)
        - None, if it has not been added

        The 12-byte ObjectId value consists of:
            - a 4-byte timestamp value, representing the ObjectId’s creation,
              measured in seconds since the Unix epoch
            - a 5-byte random value
            - a 3-byte incrementing counter, initialized to a random value
        """
        if self._is_in_db():
            return str(self._doc.id)
        return None

    @property
    def ingest_time(self):
        """Document UTC generation/ingest time

        - automatically created when added to the database)
        - None, if it has not been added
        """
        if self._is_in_db():
            return self._doc.id.generation_time
        return None

    @classmethod
    def create_new(cls, *args, **kwargs):
        """Creates a new instance of `BackedByDocument` that does not already
        have an existing _ODM_DOCUMENT_TYPE instance.
        """
        odm_kwargs = cls.get_odm_kwargs(*args, **kwargs)
        return cls(document=cls._ODM_DOCUMENT_TYPE(**odm_kwargs))

    @staticmethod
    def get_odm_kwargs(*args, **kwargs):
        raise NotImplementedError("Subclass must implement get_kwargs()")

    def _save(self):
        self._doc.save()

    def _is_in_db(self):
        """Returns True if the ODMDocument has been inserted into the database
        """
        return self._doc.id is not None


class Sample(BackedByDocument):
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
        return self._doc

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

    # def add_tag(self, tag):
    #     # @todo(Tyler) this first check assumes that the Sample is in sync with
    #     # the DB
    #     if tag in self._tags:
    #         return False
    #
    #     self._tags.add(tag)
    #
    #     if self._collection is None:
    #         return True
    #
    #     return fod.update_one(
    #         collection=self._collection,
    #         document=self,
    #         update={"$push": {"tags": tag}},
    #     )
    #
    # def remove_tag(self, tag):
    #     # @todo(Tyler) this first check assumes that the Sample is in sync with
    #     # the DB
    #     if tag not in self.tags:
    #         return False
    #
    #     self._tags.remove(tag)
    #
    #     if self._collection is None:
    #         return True
    #
    #     return fod.update_one(
    #         collection=self._collection,
    #         document=self,
    #         update={"$pull": {"tags": tag}},
    #     )

    # def add_insight(self, insight_group, insight):
    #     # @todo(Tyler) this does not write to the database
    #     self.insights[insight_group] = insight

    # def add_label(self, label_group, label):
    #     # @todo(Tyler) this does not write to the database
    #     self.labels[label_group] = label

    def _set_dataset(self, dataset):
        assert not self._is_in_db(), "This should never be called on a document in the database!"
        self._doc.dataset = dataset.name


class ImageSample(Sample):
    _ODM_DOCUMENT_TYPE = foo.ODMImageSample

    @staticmethod
    def get_odm_kwargs(
            filepath, tags=None, metadata=None, insights=None, labels=None):
        kwargs = super(ImageSample).get_odm_kwargs(
            filepath=filepath, tags=tags, insights=insights, labels=labels)

        if not isinstance(metadata, etai.ImageMetadata):
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
        return etai.read(self.filepath)


class Dataset(object):
    _SAMPLE_CLS = Sample

    def __init__(self, name):
        self._name = name

    @property
    def name(self):
        return self._name

    def __len__(self):
        return self._objects().count()

    def __getitem__(self, sample_id):
        samples = self._objects(id=sample_id)
        return samples[0] if samples else None

    def __delitem__(self, sample_id):
        return self[sample_id].delete()

    def get_tags(self):
        return self._objects().distinct("tags")

    def get_insight_groups(self):
        return self._objects().distinct("insights.group")

    def get_label_groups(self):
        return self._objects().distinct("labels.group")

    def iter_samples(self):
        # @todo(Tyler) return a fos.Sample instead
        for sample in foo.ODMSample.objects(dataset=self.name):
            yield sample

    def add_sample(self, sample):
        """Adds the given sample to the dataset.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
        """
        etau.validate_type(sample, self._SAMPLE_CLS)
        sample._set_dataset(self)
        sample._save()

    def add_samples(self, samples):
        """Adds the given samples to the dataset.

        Args:
            sample: an iterable of :class:`fiftyone.core.sample.Sample`
                instances
        """
        for sample in samples:
            etau.validate_type(sample, self._SAMPLE_CLS)
            sample._set_dataset(self)
        self._objects().insert(samples)

    def _objects(self, **kwargs):
        return foo.ODMSample.objects(dataset=self.name, **kwargs)


class DatasetView(object):
    def __init__(self, dataset):
        self.dataset = dataset
        self._pipeline = []

    def __len__(self):
        raise NotImplementedError("TODO")

    def iter_samples(self):
        raise NotImplementedError("TODO")

    def sample(self, size):
        raise NotImplementedError("TODO")
        stage = {"$sample": {"size": size}}
