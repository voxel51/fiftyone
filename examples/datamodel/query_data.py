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
#
# Query's accomplish something similar to Views but are a generalizable concept
# that can be applied to either a Dataset or a DatasetView.
#
# calls like `filter`, `sort`, `offset`, `limit` return a `DatasetQuery` object
# this the additional query "stage" appended to the query "pipeline"
#
# Once the query is defined, use:
#   - query.count(dataset)
#   - query.iter_samples(dataset)
# to apply the query to a dataset.
###############################################################################

query = voxq.DatasetQuery().sort("metadata.size_bytes").offset(5).limit(2)

print("Num results: %d" % query.count(dataset))

for query_idx, sample in query.iter_samples(dataset):
    print("Query Index: %d" % query_idx)
    print(sample)
    print()

###############################################################################
# Action 2: Query a DatasetView
#
# DatasetViews can be queried same as Datasets
###############################################################################

view = dataset.get_view("test")

print("Num results: %d" % query.count(view))

for query_idx, sample in query.iter_samples(view):
    print("Query Index: %d" % query_idx)
    print(sample)
    print()

###############################################################################
# Action 3: More complex queries
#
# `filter` is a very powerful but complex query stage. We may want to constrain
# the functionality here for the purpose of softening the learning curve, but
# for now this is a simple wrapper on the MongoDB `$match` stage.
#
# This query matches num_channels == 3 AND size_bytes > 1000
#
# ref: https://docs.mongodb.com/manual/tutorial/query-documents
###############################################################################

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
