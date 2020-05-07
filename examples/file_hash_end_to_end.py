"""
File Hash End-to-End Example

"""
import os
import time

import fiftyone.core.dataset as fod
from fiftyone.core.datautils import parse_image_classification_dir_tree
import fiftyone.core.features as fof
import fiftyone.core.insights as foi
import fiftyone.core.odm as foo


###############################################################################
# 0. Clear the database state
###############################################################################

foo.drop_database()

###############################################################################
# 1. Ingest the dataset
###############################################################################

dataset_name = "cifar_fh_e2e"

src_data_dir = os.path.join("data", dataset_name)

start = time.time()
samples, _ = parse_image_classification_dir_tree(src_data_dir)
print("'%s' parse time: %.2fs" % (dataset_name, time.time() - start))

start = time.time()
dataset = fod.Dataset.from_image_classification_samples(
    samples, name=dataset_name
)
print("'%s' ingest time: %.2fs" % (dataset_name, time.time() - start))


import sys

sys.exit("SUCCESS")


dataset = fod.Dataset(name="cifar100")

for idx, sample in enumerate(dataset):
    if idx % 1000 == 0:
        print("%d/%d" % (idx, len(dataset)))

    # compute the insight
    file_hash = fof.compute_filehash(sample.filepath)

    # add the insight to the sample
    sample.add_insight(
        "file_hash", foi.FileHashInsight.create(file_hash=file_hash)
    )
