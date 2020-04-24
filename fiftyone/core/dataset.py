"""

"""
import pymongo

import fiftyone.core.features as voxf
import fiftyone.core.sample as voxs


DEFAULT_DATABASE = "fiftyone"

META_COLLECTION = "_meta"


def _get_dataset(name, database_name=None):
    db = _get_database(name=database_name)

    # if it exists, make sure it's in the right category

    if name in db.list_collection_names():
        # make sure it's a dataset
        assert name in db[META_COLLECTION]["datasets"], "raise a better error!"
    else:
        # add to meta collection
        # @todo(Tyler)
        # db[META_COLLECTION]["datasets"].append(name)
        pass

    return db[name]

def _get_view(name, dataset_name, tag, database_name=None):
    db = _get_database(name=database_name)

    # if it exists, make sure it's in the right category

    if name in db.list_collection_names():
        # make sure it's a dataset
        assert name in db[META_COLLECTION]["views"], "raise a better error!"
    else:
        # add to meta collection
        # @todo(Tyler)
        # db[META_COLLECTION]["view"].append(name)

        # create view
        db.command({
            "create": name,
            "viewOn": dataset_name,
            "pipeline": [
                {"$match": {"tags": tag}}
            ]
        })

    return db[name]


def list_dataset_names(database_name=None):
    db = _get_database(name=database_name)

    # maybe there's a better way to check if a collection is a view...
    dataset_names = []
    for collection_name in db.list_collection_names():
        try:
            db.validate_collection(collection_name)
        except pymongo.errors.OperationFailure:
            continue
        dataset_names.append(collection_name)

    return dataset_names

def ingest_dataset():
    pass


def load_dataset(name, database=None):
    return Dataset(name=name, database=database)


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
        return self._db[self.name]


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
        if not self.name in self._db.list_collection_names():
            # create view
            self._db.command({
                "create": self.name,
                "viewOn": self.dataset.name,
                "pipeline": [
                    {"$match": {"tags": self.tag}}
                ]
            })

        return self._db[self.name]

    def _drop_view(self):
        # not sure if this is needed, but I want it available in case
        self._c.drop()


# PRIVATE #####################################################################


def _get_database(name=None):
    return pymongo.MongoClient()[name or DEFAULT_DATABASE]
