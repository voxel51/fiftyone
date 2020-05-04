"""
Core Module for `fiftyone` Dataset class

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
from bson.objectid import ObjectId
from pymongo import MongoClient

import eta.core.serial as etas

import fiftyone.core.document as fod
import fiftyone.core.sample as fos
import fiftyone.core.view as fov


# We are currently assuming this is not configurable
DEFAULT_DATABASE = "fiftyone"

META_COLLECTION = "_meta"


def drop_database():
    client = MongoClient()
    client.drop_database(DEFAULT_DATABASE)


def list_dataset_names():
    members = _get_members_for_collection_type(Dataset.COLLECTION_TYPE)
    return [
        collection_name
        for collection_name in _db().list_collection_names()
        if collection_name in members
    ]


def load_dataset(name):
    return Dataset(name=name)


class Dataset(fov.SampleCollection):
    COLLECTION_TYPE = "DATASET"

    def __init__(self, name):
        self.name = name
        self._c = self._get_collection()

    def __len__(self):
        return self._c.count_documents({})

    def __getitem__(self, sample_id):
        return fos.Sample._from_db_dict(
            collection=self._c,
            d=self._c.find_one({"_id": ObjectId(sample_id)}),
        )

    def get_tags(self):
        return self._c.distinct("tags")

    def add_sample(self, sample):
        fos.Sample.validate(sample)
        fod.insert_one(self._c, sample)

    def add_samples(self, samples):
        for sample in samples:
            fos.Sample.validate(sample)
        fod.insert_many(self._c, samples)

    def add_labels(self, labels_dict):
        for sample_id, label in labels_dict.items():
            # @todo(Tyler) this could be done better...
            sample = self[sample_id]
            sample.add_label(label)

            # self._c.find_one_and_update(
            #     {"_id": ObjectId(sample_id)},
            #     {"$set": {"labels": label.serialize(reflective=True)}}
            # )
            self._c.find_one_and_replace(
                {"_id": ObjectId(sample_id)}, sample._to_db_dict()
            )

    def iter_samples(self):
        for d in self._c.find():
            # uses reflective `_CLS` to determine type
            yield fos.Sample._from_db_dict(collection=self._c, d=d)

    def default_view(self):
        return fov.DatasetView(dataset=self)

    # PRIVATE #################################################################

    def _get_collection(self):
        """Get the collection backing this _SampleCollection.
        Ensures that the collection is properly initialized and registered in
        the meta collection.
        """
        if self.name in _db().list_collection_names():
            # make sure it's the right collection type
            members = _get_members_for_collection_type(self.COLLECTION_TYPE)
            assert self.name in members, "raise a better error!"

        else:
            # add to meta collection
            c = _get_meta_collection()
            c.update_one(
                {"collection_type": self.COLLECTION_TYPE},
                {"$push": {"members": self.name}},
            )

        return _db()[self.name]


# PRIVATE #####################################################################


def _db():
    return MongoClient()[DEFAULT_DATABASE]


def _get_meta_collection():
    """Get the meta collection (and initialize if necessary)"""
    c = _db()[META_COLLECTION]
    if not c.count({"collection_type": Dataset.COLLECTION_TYPE}):
        c.insert_many(
            [{"collection_type": Dataset.COLLECTION_TYPE, "members": []}]
        )
    return c


def _get_members_for_collection_type(collection_type):
    c = _get_meta_collection()
    members = c.find_one({"collection_type": collection_type})["members"]
    return members
