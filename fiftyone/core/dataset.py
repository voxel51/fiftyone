"""

"""
import pymongo

import fiftyone.core.features as voxf
import fiftyone.core.sample as voxs


DEFAULT_DATABASE = "fiftyone"

META_COLLECTION = "_meta"


def list_dataset_names():
    return _list_collection_names(collection_type=Dataset.COLLECTION_TYPE)


def ingest_dataset():
    pass


def load_dataset(name):
    return Dataset(name=name)


class _SampleCollection(object):
    COLLECTION_TYPE = "subclass must specify"

    def __init__(self, name):
        self.name = name
        self._c = self._get_collection()

    def __len__(self):
        return self._c.count_documents({})

    # def all_samples(self):
    #     # iterator?
    #     pass
    #
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
        raise NotImplementedError("Subclass must implement")

    def _get_collection(self):
        '''Get the collection backing this _SampleCollection'''
        if self.name in _db().list_collection_names():
            # make sure it's the right collection type
            in_meta = _in_meta_collection(
                name=self.name, collection_type=self.COLLECTION_TYPE)
            assert in_meta, "raise a better error!"

        else:
            # add to meta collection
            c = _get_meta_collection()
            c.update_one({"collection_type": self.COLLECTION_TYPE},
                         {"$push": {"members": self.name}})

            self._init_collection()

        return _db()[self.name]


class Dataset(_SampleCollection):
    COLLECTION_TYPE = "dataset"

    def __init__(self, name):
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

    def _init_collection(self):
        pass


class DatasetView(_SampleCollection):
    COLLECTION_TYPE = "view"

    def __init__(self, dataset, tag):
        self.dataset = dataset
        self.tag = tag
        super(DatasetView, self).__init__(name=self._get_name())

    # PRIVATE #################################################################

    def _get_name(self):
        return self.dataset.name + "_view--" + self.tag

    def _init_collection(self):
        # create view
        _db().command({
            "create": self.name,
            "viewOn": self.dataset.name,
            "pipeline": [
                {"$match": {"tags": self.tag}}
            ]
        })

    def _drop_view(self):
        # not sure if this is needed, but I want it available in case
        self._c.drop()


# PRIVATE #####################################################################


def _db():
    return pymongo.MongoClient()[DEFAULT_DATABASE]


def list_view_names():
    return _list_collection_names(collection_type=DatasetView.COLLECTION_TYPE)


def _list_collection_names(collection_type):
    return [
        collection_name
        for collection_name in _db().list_collection_names()
        if _in_meta_collection(collection_name, collection_type)
    ]


def _get_meta_collection():
    '''Get the meta collection (and initialize if necessary)'''
    c = _db()[META_COLLECTION]
    if not c.count({"collection_type": Dataset.COLLECTION_TYPE}):
        c.insert_many(
            [
                {"collection_type": Dataset.COLLECTION_TYPE, "members": []},
                {"collection_type": DatasetView.COLLECTION_TYPE, "members": []}
            ]
        )
    return c


def _in_meta_collection(name, collection_type):
    c = _get_meta_collection()
    members = c.find_one({"collection_type": collection_type})["members"]
    return name in members
