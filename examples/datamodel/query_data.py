"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as voxd
import fiftyone.core.query as voxq


logger = logging.getLogger(__name__)

dataset = voxd.Dataset(name="cifar100")

###############################################################################
# Action 1: Query a Dataset
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

###############################################################################
# Action 3: More complex queries
###############################################################################

# Using filter we can use the full power of MongoDB query syntax
# This query matches num_channels == 3 AND size_bytes > 1000
# ref: https://docs.mongodb.com/manual/tutorial/query-documents

query = (
    voxq.DatasetQuery()
    .filter(
        {"metadata.num_channels": 3, "metadata.size_bytes": {"$gt": 1000},}
    )
    .sort("metadata.size_bytes")
    .offset(0)
    .limit(1)
)

for query_idx, sample in query.iter_samples(dataset):
    print("Query Index: %d" % query_idx)
    print(sample)
    print()
