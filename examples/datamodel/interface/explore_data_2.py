"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as voxd

from pprint import pprint


logger = logging.getLogger(__name__)

dataset = voxd.Dataset(name="cifar100")

###############################################################################
# Action 1: Access sample by ID
###############################################################################

# ID not in dataset
sample_id = "F" * 24
print("Accessing invalid ID: %s" % sample_id)
print(dataset[sample_id])
print()

# ID in dataset
sample_id = next(dataset.iter_samples()).id
print("Accessing valid ID: %s" % sample_id)
print(dataset[sample_id])
print()

###############################################################################
# Action 2: Query dataset
###############################################################################

for query_idx, sample in dataset.query(
    sortby="metadata.size_bytes", sort_order=voxd.ASCENDING, skip=10, limit=3,
):
    print("Query Index: %d" % query_idx)
    print(sample)
    print()
