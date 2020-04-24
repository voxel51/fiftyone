"""
Ingest CIFAR100 data in noSQL database

"""
import logging
import os
import random
import time

import eta.core.serial as etas

import fiftyone.core.dataset as voxd
import fiftyone.core.sample as voxs


logger = logging.getLogger(__name__)


##############
# PARAMETERS #
##############

dataset_name = "cifar100"

partitions = ["train", "test"]

fine_labels_template = "../data/%s_fine.json"
coarse_labels_template = "../data/%s_coarse.json"


########
# CODE #
########


dataset = voxd.Dataset(dataset_name)

start = time.time()
for partition in partitions:
    logger.info("Ingesting '%s' partition" % partition)

    fine_labels = etas.read_json(fine_labels_template % partition)
    coarse_labels = etas.read_json(coarse_labels_template % partition)

    samples = [
        voxs.ImageSample(
            filepath=filepath,
            tags=[partition] + (["rand"] if random.random() > 0.7 else []),
            # labels={
            #     "fine_label": fine_labels[key],
            #     "coarse_label": coarse_labels[key],
            # },
        )
        for filepath, key in [
            (os.path.join("..", key), key) for key in fine_labels
        ]
    ]
    dataset.add_samples(samples)
print("'%s' ingest time: %.2fs" % (dataset_name, time.time() - start))
