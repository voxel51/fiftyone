"""
Examples of common FiftyOne workflows.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os

import fiftyone as fo

# import fiftyone.core.config as foc
# foc.set_config_settings(default_ml_backend="torch")
# foc.set_config_settings(default_ml_backend="tensorflow")

import fiftyone.zoo as foz
import fiftyone.core.odm as foo


# Prints a few random samples from the dataset
def print_random(dataset, num_samples=5):
    view = dataset.default_view().take(num_samples, random=True)
    for sample in view.iter_samples():
        label = sample.get_label("ground_truth").label
        print("%s: %s" % (label, sample.filepath))


###############################################################################
# Load a dataset from the Dataset Zoo
###############################################################################

# List available Zoo datasets
print(foz.list_zoo_datasets())

# Load a Zoo dataset
dataset = foz.load_zoo_dataset("cifar10")

print_random(dataset)


###############################################################################
# Load an image classification dataset manually
###############################################################################

#
# `dataset_dir` contains an image classification dataset in the following
# format::
#
#    <dataset_dir>/
#        data/
#            <uuid1>.<ext>
#            <uuid2>.<ext>
#            ...
#        labels.json
#
# where ``labels.json`` is a JSON file in the following format::
#
#    {
#        "labels_map": {
#            <targetA>: <labelA>,
#            <targetB>: <labelB>,
#            ...
#        },
#        "labels": {
#            <uuid1>: <target1>,
#            <uuid2>: <target2>,
#            ...
#        }
#    }
#

# This will be populated after you've run `foz.load_zoo_dataset("cifar10")`
# from above at least once in the past
dataset_dir = foz.get_default_zoo_dataset_dir("cifar10")
images_dir = os.path.join(dataset_dir, "data")
labels_path = os.path.join(dataset_dir, "labels.json")

# Maps image UUID to image path
image_uuids_to_paths = {
    os.path.splitext(n)[0]: os.path.join(images_dir, n)
    for n in os.listdir(images_dir)
}

with open(labels_path, "rt") as f:
    _labels = json.load(f)

# Maps int targets to label strings
labels_map = {int(k): v for k, v in _labels["labels_map"].items()}

# Maps image UUID to int targets
labels = _labels["labels"]

# Make a list of (image_path, label) samples
samples = [(image_uuids_to_paths[u], labels_map[t]) for u, t in labels.items()]

# Build a FiftyOne dataset from the samples
dataset = fo.Dataset.from_image_classification_samples(
    samples, name="my-dataset"
)

print_random(dataset)


###############################################################################
# Add predictions to a dataset
###############################################################################

import fiftyone.core.torchutils as fotu
