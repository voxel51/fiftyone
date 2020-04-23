"""
Ingest CIFAR100 data in noSQL database

"""
import logging
import time

from pymongo import MongoClient
from tinymongo import TinyMongoClient

from tinydb.storages import JSONStorage
from tinydb.middlewares import CachingMiddleware

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau


logger = logging.getLogger(__name__)


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


class CachingTinyMongoClient(TinyMongoClient):
    @property
    def _storage(self):
        return CachingMiddleware(JSONStorage)


if USE_TINY:
    # you can include a folder name or absolute path
    # as a parameter if not it will default to "tinydb"
    client = CachingTinyMongoClient()
else:
    client = MongoClient()

# if Tiny:
# either creates a new database file or accesses an
# existing one named `fiftyone_database.json`
db = client.fiftyone_database

dataset = db.cifar100

for partition in partitions:
    logger.info("Ingesting '%s' partition" % partition)

    fine_labels = etas.read_json(fine_labels_template % partition)
    coarse_labels = etas.read_json(coarse_labels_template % partition)

    # images = [
    #     {
    #         "filepath": filepath,
    #         "labels": {
    #             "fine_label": fine_labels[filepath],
    #             "coarse_label": coarse_labels[filepath],
    #         },
    #         # "metadata": metadata.serialize(),
    #     }
    #     for filepath in fine_labels
    # ]
    # dataset.insert(images)

    last_draw_time = None

    with etau.ProgressBar(len(fine_labels)) as bar:
        for i, filepath in enumerate(fine_labels):
            if not last_draw_time or time.time() - last_draw_time > 0.25:
                last_draw_time = time.time()
                bar.set_iteration(
                    i, draw=True, suffix="%d/%d" % (i, len(fine_labels))
                )

            metadata = etai.ImageMetadata.build_for(filepath)

            image = {
                "filepath": filepath,
                "labels": {
                    "fine_label": fine_labels[filepath],
                    "coarse_label": coarse_labels[filepath],
                },
                "metadata": metadata.serialize(),
            }
            dataset.insert(image)

            # import sys
            # sys.exit("")
