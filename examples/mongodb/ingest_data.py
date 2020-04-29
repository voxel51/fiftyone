"""
Ingest CIFAR100 data in noSQL database

"""
import logging
import os
import random
import time

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

dataset_name = "cifar100"


########
# CODE #
########


client = MongoClient()

db = client.fiftyone

dataset = db[dataset_name]

start = time.time()
for partition in partitions:
    logger.info("Ingesting '%s' partition" % partition)

    fine_labels = etas.read_json(fine_labels_template % partition)
    coarse_labels = etas.read_json(coarse_labels_template % partition)

    images = [
        {
            "filepath": os.path.abspath(filepath),
            "filename": os.path.basename(filepath),
            "partition": partition,
            # this gives a second tag to a random 30% of the data
            "tags": [partition] + (["rand"] if random.random() > 0.7 else []),
            "labels": {
                "fine_label": fine_labels[key],
                "coarse_label": coarse_labels[key],
            },
            "metadata": etai.ImageMetadata.build_for(filepath).serialize(),
        }
        for filepath, key in [
            (os.path.join("..", key), key) for key in fine_labels
        ]
    ]
    dataset.insert_many(images)
print("'%s' ingest time: %.2fs" % (dataset_name, time.time() - start))
