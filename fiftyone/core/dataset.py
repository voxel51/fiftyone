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
        self._dataset = client[database or self.DEFAULT_DATABASE][name]


class DataFrameDataset(_Dataset):
    pass


# Toggle which dataset model to use
class Dataset(NoSQLDataset):
# class Dataset(DataFrameDataset):
    pass



"""
Ingest CIFAR100 data in noSQL database

"""
from datetime import datetime
import logging
import os



import eta.core.image as etai
import eta.core.serial as etas


logger = logging.getLogger(__name__)


##############
# PARAMETERS #
##############

partitions = ["train", "test"]

fine_labels_template = "../data/%s_fine.json"
coarse_labels_template = "../data/%s_coarse.json"


########
# CODE #
########


def get_metadata(filepath):
    return etai.ImageMetadata.build_for(filepath).serialize()


def get_filehash(filepath):
    with open(filepath, "rb") as f:
        filehash = hash(f.read())
    return filehash


for partition in partitions:
    logger.info("Ingesting '%s' partition" % partition)

    fine_labels = etas.read_json(fine_labels_template % partition)
    coarse_labels = etas.read_json(coarse_labels_template % partition)

    ingest_time = datetime.now()

    images = [
        {
            "filepath": os.path.abspath(filepath),
            "filename": os.path.basename(filepath),
            "partition": partition,
            "labels": {
                "fine_label": fine_labels[key],
                "coarse_label": coarse_labels[key],
            },
            "metadata": get_metadata(filepath),
            # "hash": get_filehash(filepath),
            "ingest_time": ingest_time,
        }
        for filepath, key in [
            (os.path.join("..", key), key) for key in fine_labels
        ]
    ]
    dataset.insert_many(images)
