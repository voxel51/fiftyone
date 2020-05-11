"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as fod
import fiftyone.core.features as fof
import fiftyone.core.insights as foi


logger = logging.getLogger(__name__)


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
