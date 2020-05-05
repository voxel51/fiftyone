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

import eta.core.utils as etau

import fiftyone.core.odm as foo


def list_dataset_names():
    return foo.Sample.objects.distinct("dataset")


class Dataset(object):
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
        for sample in foo.Sample.objects(dataset=self.name):
            yield sample

    def _objects(self, **kwargs):
        return foo.Sample.objects(dataset=self.name, **kwargs)


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


class Document(object):
    # MongoEngine Document Type
    _ME_DOCUMENT_TYPE = foo.Document

    def __init__(self, _doc):
        etau.validate_type(_doc, self._ME_DOCUMENT_TYPE)
        self._doc = _doc

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
        return str(self._doc.id)

    @property
    def ingest_time(self):
        """Document UTC generation/ingest time

        - automatically created when added to the database)
        - None, if it has not been added
        """
        return self._doc.id.generation_time

    @classmethod
    def _from_mongo_engine_document(cls, document):
        return cls(_doc=document)



class Sample(Document):
    _ME_DOCUMENT_TYPE = foo.Sample

    def __init__(self, filepath, tags=None, insights=None, labels=None,
                 **kwargs):
        document = self._ME_DOCUMENT_TYPE(

        )

        self._filepath = os.path.abspath(os.path.expanduser(filepath))
        self._tags = set(tags) if tags else set()
        self._insights = list(insights) if insights else []
        self._labels = list(labels) if labels else []

        metadata = foo.ImageMetadata(
            size_bytes=2048, mime_type=".jpg", width=32, height=32,
            num_channels=3,
        ),

        super(Sample, self).__init__(document=document)

    @property
    def dataset(self):
        raise NotImplementedError("TODO TYLER")

    @property
    def filepath(self):
        return self._filepath

    @property
    def filename(self):
        return os.path.basename(self.filepath)

    @property
    def tags(self):
        # returns a copy such that the original cannot be modified
        return list(self._tags)

    @property
    def insights(self):
        # returns a copy such that the original cannot be modified
        return list(self._insights)

    @property
    def labels(self):
        # returns a copy such that the original cannot be modified
        return list(self._labels)

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of attributes
        """
        return ["filepath", "tags", "insights", "labels"]

    def add_tag(self, tag):
        # @todo(Tyler) this first check assumes that the Sample is in sync with
        # the DB
        if tag in self._tags:
            return False

        self._tags.add(tag)

        if self._collection is None:
            return True

        return fod.update_one(
            collection=self._collection,
            document=self,
            update={"$push": {"tags": tag}},
        )

    def remove_tag(self, tag):
        # @todo(Tyler) this first check assumes that the Sample is in sync with
        # the DB
        if tag not in self.tags:
            return False

        self._tags.remove(tag)

        if self._collection is None:
            return True

        return fod.update_one(
            collection=self._collection,
            document=self,
            update={"$pull": {"tags": tag}},
        )

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

