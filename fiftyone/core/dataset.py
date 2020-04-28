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

import fiftyone.core.client as voxc
import fiftyone.core.document as voxd
import fiftyone.core.sample as voxs


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


class _SampleCollection(object):
    COLLECTION_TYPE = "subclass must specify"

    def __init__(self, name):
        self.name = name
        self._c = self._get_collection()

    def __len__(self):
        return self._c.count_documents({})

    def __getitem__(self, sample_id):
        return self._deserialize(
            self._c.find_one({"_id": ObjectId(sample_id)})
        )

    def iter_samples(self):
        for sample_dict in self._c.find():
            # uses reflective `_CLS` to determine type
            yield self._deserialize(sample_dict)

    # def index_samples_by_filehash(self):
    #     index_id = None
    #     return index_id
    #
    # def select_samples(index, method="max-covering", num_samples=100,
    #                    format="voxf.types.datasets.PytorchImageDataset"):
    #     pass
    #
    # def export(self):
    #     '''
    #     samples.export(
    #        "/path/for/export", format=voxf.types.datasets.LabeledImageDataset,
    #     )
    #     '''
    #     pass

    # PRIVATE #################################################################

    def _init_collection(self):
        """If a collection (such as a view) needs initialization, that is
        populated here.
        """
        raise NotImplementedError("Subclass must implement")

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

            self._init_collection()

        return _db()[self.name]

    @staticmethod
    def _deserialize(sample_dict):
        if sample_dict is None:
            return sample_dict
        return etas.Serializable.from_dict(sample_dict)


class Dataset(_SampleCollection):
    COLLECTION_TYPE = "DATASET"

    def __init__(self, name):
        super(Dataset, self).__init__(name=name)

    def get_tags(self):
        return self._c.distinct("tags")

    def get_view(self, tag):
        return DatasetView(dataset=self, tag=tag)

    def get_views(self):
        return [self.get_view(tag) for tag in self.get_tags()]

    def add_sample(self, sample):
        voxs.Sample.validate(sample)
        voxd.insert_one(self._c, sample)

    def add_samples(self, samples):
        for sample in samples:
            voxs.Sample.validate(sample)
        voxd.insert_many(self._c, samples)

    def register_model(self):
        # @todo(Tyler)
        raise NotImplementedError("TODO")

    # PRIVATE #################################################################

    def _init_collection(self):
        pass


class DatasetView(_SampleCollection):
    COLLECTION_TYPE = "DATASET_VIEW"

    def __init__(self, dataset, tag):
        self.dataset = dataset
        self.tag = tag
        super(DatasetView, self).__init__(name=self._get_name())

    # PRIVATE #################################################################

    def _get_name(self):
        return self.dataset.name + "_view--" + self.tag

    def _init_collection(self):
        # create view
        _db().command(
            {
                "create": self.name,
                "viewOn": self.dataset.name,
                "pipeline": [{"$match": {"tags": self.tag}}],
            }
        )

    def _drop_view(self):
        # not sure if this is needed, but I want it available in case
        self._c.drop()


# PRIVATE #####################################################################


def _db():
    return MongoClient()[DEFAULT_DATABASE]


def _get_meta_collection():
    """Get the meta collection (and initialize if necessary)"""
    c = _db()[META_COLLECTION]
    if not c.count({"collection_type": Dataset.COLLECTION_TYPE}):
        c.insert_many(
            [
                {"collection_type": Dataset.COLLECTION_TYPE, "members": []},
                {
                    "collection_type": DatasetView.COLLECTION_TYPE,
                    "members": [],
                },
            ]
        )
    return c


def _get_members_for_collection_type(collection_type):
    c = _get_meta_collection()
    members = c.find_one({"collection_type": collection_type})["members"]
    return members
