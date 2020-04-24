"""

"""
import pymongo

import fiftyone.core.features as voxf
import fiftyone.core.sample as voxs


DEFAULT_DATABASE = "fiftyone"

META_COLLECTION = "_meta"


def list_dataset_names(database_name=None):
    return _list_collection_names(collection_type="dataset", database_name=database_name)

def list_view_names(database_name=None):
    return _list_collection_names(collection_type="view", database_name=database_name)

def _list_collection_names(collection_type, database_name=None):
    db = _get_database(name=database_name)
    return [
        collection_name for collection_name in db.list_collection_names()
        if _in_meta_collection(collection_name, collection_type, database_name=database_name)
    ]

def ingest_dataset():
    pass


def load_dataset(name, database_name=None):
    return Dataset(name=name, database_name=database_name)


class _SampleCollection(object):

    def __init__(self, name):
        self.name = name
        self._c = self._get_collection()

    def __len__(self):
        return self._c.count_documents({})

    def all_samples(self):
        # iterator?
        pass

    def index_samples_by_filehash(self):
        index_id = None
        return index_id

    def select_samples(index, method="max-covering", num_samples=100,
                       format="voxf.types.datasets.PytorchImageDataset"):
        pass

    def export(self):
        '''
        samples.export(
           "/path/for/export", format=voxf.types.datasets.LabeledImageDataset,
        )
        '''
        pass

    # PRIVATE #################################################################

    def _get_collection(self):
        '''Get the collection backing this _SampleCollection'''
        raise NotImplementedError("Subclass must implement")


class Dataset(_SampleCollection):
    def __init__(self, name, database_name=None):
        self._database_name = database_name or DEFAULT_DATABASE
        super(Dataset, self).__init__(name=name)

    def get_tags(self):
        return self._c.distinct("tags")

    def get_view(self, tag):
        return DatasetView(dataset=self, tag=tag)

    def get_views(self):
        return [self.get_view(tag) for tag in self.get_tags()]

    def register_model(self):
        pass

    # PRIVATE #################################################################

    @property
    def _db(self):
        return _get_database(self._database_name)

    def _get_collection(self):
        return _get_dataset(self.name, database_name=self._database_name)


class DatasetView(_SampleCollection):
    def __init__(self, dataset, tag):
        self.dataset = dataset
        self.tag = tag
        super(DatasetView, self).__init__(name=self._get_name())

    # PRIVATE #################################################################

    def _get_name(self):
        return self.dataset.name + "_view--" + self.tag

    @property
    def _db(self):
        return self.dataset._db

    def _get_collection(self):
        return _get_view(
            name=self.name, dataset_name=self.dataset.name,
            tag=self.tag, database_name=self.dataset._database_name
        )

    def _drop_view(self):
        # not sure if this is needed, but I want it available in case
        self._c.drop()


# PRIVATE #####################################################################


def _get_database(name=None):
    return pymongo.MongoClient()[name or DEFAULT_DATABASE]


def _get_meta_collection(database_name=None):
    db = _get_database(name=database_name)
    c = db[META_COLLECTION]
    if not c.count({"collection_type": "dataset"}):
        c.insert_many(
            [
                {"collection_type": "dataset", "members": []},
                {"collection_type": "view", "members": []}
            ]
        )
    return c


def _in_meta_collection(name, collection_type, database_name=None):
    '''

    :param name:
    :param collection_type: "dataset" or "view"
    :param database_name:
    :return:
    '''
    c = _get_meta_collection(database_name=database_name)
    members = c.find_one({"collection_type": collection_type})["members"]
    return name in members


def _get_dataset(name, database_name=None):
    collection_type = "dataset"

    db = _get_database(name=database_name)

    if name in db.list_collection_names():
        # make sure it's a dataset
        in_meta = _in_meta_collection(name=name,
                                      collection_type=collection_type)
        assert in_meta, "raise a better error!"
    else:
        # add to meta collection
        c = _get_meta_collection(database_name=database_name)
        c.update_one({"collection_type": collection_type}, {"$push": {"members": name}})

    return db[name]


def _get_view(name, dataset_name, tag, database_name=None):
    collection_type = "view"

    db = _get_database(name=database_name)

    if name in db.list_collection_names():
        # make sure it's a view
        in_meta = _in_meta_collection(name=name,
                                      collection_type=collection_type)
        assert in_meta, "raise a better error!"
    else:
        # add to meta collection
        c = _get_meta_collection(database_name=database_name)
        c.update_one({"collection_type": "view"}, {"$push": {"members": name}})

        # create view
        db.command({
            "create": name,
            "viewOn": dataset_name,
            "pipeline": [
                {"$match": {"tags": tag}}
            ]
        })
