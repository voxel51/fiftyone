"""
File Hash End-to-End Example

This example goes through the full process of ingesting a dataset, computing
file hashes on the data, removing duplicates and exporting the resulting
dataset.

"""
import os

import fiftyone as fo
from fiftyone.utils.data import parse_image_classification_dir_tree
import fiftyone.core.features as fof
import fiftyone.core.insights as foi


###############################################################################
# 1. Create a `fiftyone.Dataset`
###############################################################################

dataset_name = "cifar100_with_duplicates"

src_data_dir = os.path.join("/tmp/fiftyone", dataset_name)

samples, _ = parse_image_classification_dir_tree(src_data_dir)
dataset = fo.Dataset.from_image_classification_samples(
    samples, name=dataset_name
)


###############################################################################
# 2. Explore
###############################################################################

dataset = fo.Dataset(name=dataset_name)

print(dataset.summary())

sample = next(dataset.iter_samples())
print(sample)
print()

import sys

sys.exit("SUCCESS")

###############################################################################
# 3. Compute file hashes
###############################################################################

for idx, sample in enumerate(dataset):
    if idx % 1000 == 0:
        print("%d/%d" % (idx, len(dataset)))

    # compute the insight
    file_hash = fof.compute_filehash(sample.filepath)

    # add the insight to the sample
    sample.add_insight(
        "file_hash", foi.FileHashInsight.create(file_hash=file_hash)
    )

unique_filehashes = dataset._get_query_set().distinct(
    "insights.file_hash.file_hash"
)
print(len(unique_filehashes))

###############################################################################
# 4. Find and visualize duplicates
###############################################################################

pipeline = [
    {"$group": {"_id": "$insights.file_hash.file_hash", "count": {"$sum": 1}}},
    {"$match": {"count": {"$gt": 1}}},
]

dup_filehashes = [d["_id"] for d in dataset.aggregate(pipeline)]

print("Number of unique images that are duplicated: %d" % len(dup_filehashes))

view = dataset.default_view().filter(
    filter={"insights.file_hash.file_hash": {"$in": dup_filehashes}}
)

print("Number of images that have a duplicate: %d" % len(dup_filehashes))

###############################################################################
# 5. Delete the duplicates
###############################################################################

print("Length of dataset before: %d" % len(dataset))

for d in dataset.aggregate(pipeline):
    file_hash = d["_id"]
    count = d["count"]

    view = (
        dataset.default_view()
        .filter(filter={"insights.file_hash.file_hash": file_hash})
        .take(count - 1)
    )

    for sample in view:
        del dataset[sample.id]

print("Length of dataset after: %d" % len(dataset))


###############################################################################
# 6. Export the dataset
###############################################################################

view = dataset.default_view().take(100, random=True)

view.export(
    group="ground_truth", export_dir=os.path.join("/tmp", dataset.name)
)
