"""
Fiftyone if fifteen minutes

"""
from pprint import pprint

import fiftyone as fo

dataset = fo.Dataset("fiftyone_in_fifteen")

###############################################################################
# Poking Around
###############################################################################

print("_" * 40 + " Poking Around" + "_ * 40")
print()

print("len(dataset) -> %s" % type(len(dataset)))
print(len(dataset))
print()

# get all accessible fields on samples of a dataset
print("dataset.get_sample_fields() -> %s" % type(dataset.get_sample_fields()))
pprint(dataset.get_sample_fields())
print()

import sys

sys.exit("SUCCESS")

# get all fields that are subclass of `Labels`
dataset.get_sample_fields(type=fo.Labels)  # -> dict
# {
#     "ground_truth_fine":   fo.core.fields.ClassificationLabel,
#     "ground_truth_coarse": fo.core.fields.ClassificationLabel,
#     "model_1_preds":       fo.core.fields.ClassificationLabel,
# }

dataset.sample_type  # -> type
# fiftyone.core.sample.ImageSample

dataset.summary()  # -> str
# <a string of all the above things>

dataset.view()  # -> fiftyone.core.view.DatasetView

# grab 5 random samples
dataset.view.sample(5)  # -> fiftyone.core.view.DatasetView

# all methods on views are also valid on datasets. The dataset merely creates
# a view and calls the method on that view:
dataset.sample(5)  # -> fiftyone.core.view.DatasetView
