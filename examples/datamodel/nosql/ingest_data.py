"""
Ingest CIFAR100 data in noSQL database

"""
from datetime import datetime
import logging
import os

from pymongo import MongoClient

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


client = MongoClient()

db = client.fiftyone_database

dataset = db.cifar100

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
