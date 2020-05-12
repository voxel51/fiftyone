"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as fod
import fiftyone.core.view as fov


logger = logging.getLogger(__name__)


dataset = fod.Dataset(name="cifar100")

###############################################################################
# Action 0: Create an "empty" view
#
# A DatasetView is a powerful tool for looking at subsets of a dataset. A view
# is effectively a wrapper around a dataset and a pipeline of transforms.
# Transforms including filtering, sorting, random sampling, and many more
# powerful operations!
#
# We can perform basic operations on views like iterating over samples the
# same as with a dataset, however modifying the view by adding, removing,
# or replacing samples is not permitted. That being said, once a sample is
# accessed, modifications to the sample can be performed regardless of whether
# it was accessed from a dataset or a view on that dataset.
###############################################################################

view = fov.DatasetView(dataset=dataset)

print("Num samples: %d" % len(view))

print("Sample from view:")
sample = next(view.iter_samples())
print(sample)
print("Ingested at: %s" % sample.ingest_time)
print()

print("Samples can NOT be added, deleted or replaced from a view:")
print("Can add sample to dataset: %s" % hasattr(dataset, "add_sample"))
print("Can add sample to view: %s" % hasattr(view, "add_sample"))
print()

###############################################################################
# Action 1: Filter by "tag"
###############################################################################

tag = "rand"
view = fov.DatasetView(dataset=dataset).match_tag(tag)
print("Tags: %s" % view.get_tags())
print("Num samples with '%s' tag: %d" % (tag, len(view)))
print()

###############################################################################
# Action 2: Sort, Offset and Limit
#
# Transforms like `filter`, `sort`, `skip`, `limit` return a `DatasetView`
# object with the additional transform appended to the view pipeline.
###############################################################################

view = (
    fov.DatasetView(dataset=dataset)
    .sort_by("metadata.size_bytes")
    .skip(2)
    .limit(10)
)
print("Num samples in view: %d" % len(view))
for sample in view.iter_samples():
    print("sample.metadata.size_bytes: %d" % sample.metadata.size_bytes)
print()

view = (
    fov.DatasetView(dataset=dataset)
    .sort_by("labels.ground_truth_fine.label")
    .limit(10)
)
print("Num samples in view: %d" % len(view))
for sample in view.iter_samples():
    print(
        "sample.labels.ground_truth_fine.label: %s"
        % sample.get_label("ground_truth_fine").label
    )
print()

###############################################################################
# Action 3: More complex queries
#
# `match` is a very powerful but complex query stage. We may want to constrain
# the functionality here for the purpose of softening the learning curve, but
# for now this is a simple wrapper on the MongoDB `$match` stage.
#
# This query:
#   1) matches num_channels == 3 AND size_bytes > 1200
#   2) takes 5 random samples
#
# ref: https://docs.mongodb.com/manual/tutorial/query-documents
###############################################################################

view = (
    fov.DatasetView(dataset=dataset)
    .match({"metadata.num_channels": 3, "metadata.size_bytes": {"$gt": 1200},})
    .sample(5)
)
print("Num samples in view: %d" % len(view))
for sample in view.iter_samples():
    print("sample.metadata.size_bytes: %d" % sample.metadata.size_bytes)
print()
