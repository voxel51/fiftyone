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
# Action 2: Check for tags on the dataset
#
# A Dataset can have arbitrary "tags" which could be used as dataset splits
# (train, test, etc.) but are not constrained to be disjoint and could be used
# for anything the user desires
#
# The CIFAR100 dataset was ingested with two disjoint tags: 'train' and 'test'
# and a third tag 'rand' that was randomly added to 30% of the samples.
###############################################################################

print("Tags: %s" % dataset.get_tags())
print()

###############################################################################
# Action 3: Check for label groups on the dataset
#
# Each sample in a dataset contains a dictionary of labels with label groups
# as keys. A label group spans all samples with the given label
###############################################################################

print("Label Groups: %s" % dataset.get_label_groups())
print()

###############################################################################
# Action 4: Check for insight groups on the dataset
#
# Similar to labels, each sample contains a set of insights. An insight group
# is a group of insights, one per sample, spanning across a dataset or subset
# of a dataset.
###############################################################################

print("Insight Groups: %s" % dataset.get_insight_groups())
print()

###############################################################################
# Action 5: Iterate samples of the dataset
###############################################################################

print("Sample from dataset:")
sample = next(dataset.iter_samples())
print(sample)
print("Ingested at: %s" % sample.ingest_time)
print()


###############################################################################
# Action 6: Access sample by ID
#
# When inserted into a dataset, a sample is automatically given a unique ID
# (universally unique but different from a UUID).
#
# The dataset can be keyed by this ID to return a sample.
###############################################################################

# ID not in dataset
sample_id = "F" * 24
print("Accessing invalid ID: %s" % sample_id)
print("ID in dataset? %s" % (sample_id in dataset))
try:
    print(dataset[sample_id])
except Exception as e:
    print(type(e), e)
print()

# ID in dataset
sample_id = next(dataset.iter_samples()).id
print("Accessing valid ID: %s" % sample_id)
print("ID in dataset? %s" % (sample_id in dataset))
print(dataset[sample_id])
print()
