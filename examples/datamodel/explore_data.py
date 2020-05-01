"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as fod


logger = logging.getLogger(__name__)


###############################################################################
# Action 0: List datasets
###############################################################################

print("Datasets: %s" % fod.list_dataset_names())
print()

###############################################################################
# Action 1: Load dataset
###############################################################################

dataset = fod.Dataset(name="cifar100")

print("Num samples: %d" % len(dataset))
print()

###############################################################################
# Action 2: Check for tags/views on the dataset
#
# A Dataset can have multiple `DatasetView`s on it, one for each "tag" which is
# simply the `DatasetView`'s name.
#
# The CIFAR100 dataset was ingested with two disjoint tags: 'train' and 'test'
# and a third tag 'rand' that was randomly added to 30% of the samples.
###############################################################################

import sys
sys.exit("SUCCESS")

print("Tags: %s" % dataset.get_tags())
for view in dataset.get_views():
    print("Num '%s' samples: %d" % (view.tag, len(view)))
print()

###############################################################################
# Action 3: Iterate samples of the dataset
###############################################################################

print("Sample from dataset:")
sample = next(dataset.iter_samples())
print(sample)
print("Ingested at: %s" % sample.ingest_time)
print()

###############################################################################
# Action 4: Iterate samples of a view
###############################################################################

print("Sample from dataset 'test' view:")
sample = next(dataset.get_view("test").iter_samples())
print(sample)
print("Ingested at: %s" % sample.ingest_time)

###############################################################################
# Action 5: Access sample by ID
#
# When inserted into a dataset, a sample is automatically given a unique ID
# (universally unique but different from a UUID).
#
# The dataset can be keyed by this ID to return a sample.
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
