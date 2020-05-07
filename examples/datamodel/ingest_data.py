"""
Ingest CIFAR100 data into the database

"""
import logging
import os
import random
import time

import eta.core.image as etai
import eta.core.serial as etas

import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.sample as fos


logger = logging.getLogger(__name__)


##############
# PARAMETERS #
##############

dataset_name = "cifar100"

partitions = [
    "train",
    "test"
]


########
# CODE #
########

dir_path = os.path.dirname(os.path.realpath(__file__))
data_dir = os.path.abspath(os.path.join(dir_path, "..", "data", dataset_name))

fine_labels_template = os.path.join(data_dir, "%s_fine.json")
coarse_labels_template = os.path.join(data_dir, "%s_coarse.json")

dataset = fod.Dataset(dataset_name)

start = time.time()

for partition in partitions:
    logger.info("Ingesting '%s' partition" % partition)

    fine_labels = etas.read_json(fine_labels_template % partition)
    coarse_labels = etas.read_json(coarse_labels_template % partition)

    samples = []
    for rel_img_path in fine_labels:
        filepath = os.path.join(data_dir, rel_img_path)

        metadata = etai.ImageMetadata.build_for(filepath)

        # this gives a second tag to a random 30% of the data
        tags = [partition] + (["rand"] if random.random() > 0.7 else [])

        labels = {
            "ground_truth_fine": fol.ClassificationLabel.create(
                label=fine_labels[rel_img_path]
            ),
            "ground_truth_coarse": fol.ClassificationLabel.create(
                label=coarse_labels[rel_img_path]
            ),
        }

        # create sample
        sample = fos.ImageSample.create(
            filepath=filepath, tags=tags, metadata=metadata, labels=labels,
        )

        samples.append(sample)

    dataset.add_samples(samples)

print("'%s' ingest time: %.2fs" % (dataset_name, time.time() - start))
