"""

"""
import os

from pymongo import MongoClient

import eta.core.image as etai
import eta.core.serial as etas

import fiftyone.core.features as voxf


def ingest_dataset():
    pass


def load_dataset(name):
    pass


class Sample(etas.Serializable):
    def __init__(self, filepath, partition=None, labels=None):
        self.filepath = os.path.abspath(filepath)
        self.filename = os.path.basename(filepath)
        self.partition = partition
        self.labels = labels

    def add_label(self, label, tag):
        pass


class ImageSample(Sample):
    def __init__(self, metadata=None, *args, **kwargs):
        super(ImageSample, self).__init__(*args, **kwargs)
        self.metadata = metadata or etai.ImageMetadata.build_for(self.filepath)


class SampleContainer(object):
    '''Call this a view instead?'''
    def export(self):
        pass


class _Dataset(object):
    def __init__(self, name):
        self.name = name

    def register_model(self):
        pass

    def all_samples(self):
        # iterator?
        pass

    def index_samples_by_filehash(self):
        index_id = None
        return index_id

    def select_samples(index, method="max-covering", num_samples=100,
                       format="voxf.types.datasets.PytorchImageDataset"):
        pass


class NoSQLDataset(_Dataset):
    DEFAULT_DATABASE = "fiftyone"

    def __init__(self, name, database=None):
        super(NoSQLDataset, self).__init__(name=name)
        client = MongoClient()
        self._collection = client[database or self.DEFAULT_DATABASE][name]

    def __len__(self):
        return self._collection.count_documents({})


class DataFrameDataset(_Dataset):
    pass


# Toggle which dataset model to use
class Dataset(NoSQLDataset):
# class Dataset(DataFrameDataset):
    pass
