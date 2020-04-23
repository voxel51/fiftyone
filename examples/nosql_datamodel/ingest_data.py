'''
Ingest CIFAR100 data in noSQL database

'''
from pymongo import MongoClient
from tinymongo import TinyMongoClient

import eta.core.image as etai
import eta.core.serial as etas


##############
# PARAMETERS #
##############

USE_TINY = True

partitions = ["train", "test"]

fine_labels_template = "data/%s_fine.json"
coarse_labels_template = "data/%s_coarse.json"



########
# CODE #
########


if USE_TINY:
    # you can include a folder name or absolute path
    # as a parameter if not it will default to "tinydb"
    client = TinyMongoClient()
else:
    client = MongoClient()

# if Tiny:
# either creates a new database file or accesses an 
# existing one named `fiftyone_database.json`
db = client.fiftyone_database

dataset = db.cifar100

for partition in partitions:
    fine_labels = etas.read_json(fine_labels_template  % partition)
    coarse_labels = etas.read_json(coarse_labels_template % partition)

    for filepath in fine_labels:
        metadata = etai.ImageMetadata.build_for(filepath)
        print(metadata)

        image = {
            "filepath": filepath,
            "labels": {
                "fine_label": fine_labels[filepath],
                "coarse_label": coarse_labels[filepath],
            },
            "metadata": metadata.serialize(),
        }
        image_id = dataset.insert_one(image).inserted_id
