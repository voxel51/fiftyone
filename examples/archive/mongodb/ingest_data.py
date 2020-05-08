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

dataset_name = "cifar100"

partitions = ["train", "test"]

########
# CODE #
########

dir_path = os.path.dirname(os.path.realpath(__file__))
data_dir = os.path.abspath(os.path.join(dir_path, "..", "data", dataset_name))

fine_labels_template = os.path.join(data_dir, "%s_fine.json")
coarse_labels_template = os.path.join(data_dir, "%s_coarse.json")

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
