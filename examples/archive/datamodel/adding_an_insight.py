"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone as fo
import fiftyone.core.features as fof


logger = logging.getLogger(__name__)


dataset = fo.Dataset(name="cifar100")

for idx, sample in enumerate(dataset):
    if idx % 1000 == 0:
        print("%d/%d" % (idx, len(dataset)))

    # compute the insight
    file_hash = fof.compute_filehash(sample.filepath)

    # add the insight to the sample
    sample.add_insight("file_hash", fo.IntInsight.create(file_hash))
