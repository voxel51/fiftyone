"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as voxd
import fiftyone.core.query as voxq

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
# Action 2: Query a Dataset
###############################################################################

query = voxq.DatasetQuery().sort("metadata.size_bytes").offset(5).limit(2)

print("Num results: %d" % query.count(dataset))

for query_idx, sample in query.iter_samples(dataset):
    print("Query Index: %d" % query_idx)
    print(sample)
    print()

###############################################################################
# Action 2: Query a DatasetView
###############################################################################

view = dataset.get_view("test")

print("Num results: %d" % query.count(view))

for query_idx, sample in query.iter_samples(view):
    print("Query Index: %d" % query_idx)
    print(sample)
    print()
