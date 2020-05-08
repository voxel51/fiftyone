# FiftyOne Walkthrough

This walkthrough provides a glimpse into the possibilities for integrating
FiftyOne into your machine learning workflows. It covers the following
concepts:

- loading your existing dataset in FiftyOne
- adding predictions from your model to your FiftyOne dataset
- launching the FiftyOne dashboard to visualize your data
- integrating the visualizer into your code


## Importing FiftyOne

Importing FiftyOne is simple:

```
import fiftyone as fo
```


## Loading an image classification dataset


"""
Walkthrough of common FiftyOne workflows.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os

import fiftyone as fo


# Prints a few random samples from the dataset
def print_random(dataset, num_samples=5, group="ground_truth"):
    view = dataset.default_view().take(num_samples, random=True)
    for sample in view.iter_samples():
        label = sample.get_label(group).label
        print("%s: %s" % (label, sample.filepath))



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

# Maps image UUIDs to image paths
image_uuids_to_paths = {
    os.path.splitext(n)[0]: os.path.join(images_dir, n)
    for n in os.listdir(images_dir)
}

with open(labels_path, "rt") as f:
    _labels = json.load(f)

# Maps int targets to label strings
labels_map = {int(k): v for k, v in _labels["labels_map"].items()}

# Maps image UUIDs to int targets
labels = _labels["labels"]

# Make a list of (image_path, label) samples
samples = [(image_uuids_to_paths[u], labels_map[t]) for u, t in labels.items()]

# Build a FiftyOne dataset from the samples
dataset = fo.Dataset.from_image_classification_samples(
    samples, name="my-dataset"
)

# Print a few random samples
print_random(dataset)


###############################################################################
# Add predictions to a dataset
###############################################################################

#
# In order to run this code, you must download the pretrained models as
# described in `inference/README.md`
#

import sys

import torch
import torchvision
from torch.utils.data import DataLoader

import fiftyone.utils.torch as fout

sys.path.insert(1, "inference/PyTorch_CIFAR10")
from cifar10_models import *


def make_cifar10_data_loader(image_paths, sample_ids):
    mean = [0.4914, 0.4822, 0.4465]
    std = [0.2023, 0.1994, 0.2010]
    transforms = torchvision.transforms.Compose(
        [
            torchvision.transforms.ToTensor(),
            torchvision.transforms.Normalize(mean, std),
        ]
    )
    dataset = fout.TorchImageDataset(
        image_paths, sample_ids=sample_ids, transform=transforms
    )
    return DataLoader(dataset, batch_size=5, num_workers=4, pin_memory=True)


def predict(model, imgs):
    logits = model(imgs)
    predictions = torch.argmax(logits, 1)
    return predictions.numpy()


#
# Load a model
#
# Choices here are:
#   vgg11_bn, vgg13_bn, vgg16_bn, vgg19_bn, resnet18, resnet34, resnet50
#   densenet121, densenet161, densenet169, mobilenet_v2, googlenet
#   inception_v3
#
# Model performance numbers are available at:
#   https://github.com/huyvnphan/PyTorch_CIFAR10
#
model = inception_v3(pretrained=True)

#
# Extract a few images to process
#
num_samples = 25
view = dataset.default_view().take(num_samples, random=True)
image_paths, sample_ids = zip(
    *[(s.filepath, s.id) for s in view.iter_samples()]
)
data_loader = make_cifar10_data_loader(image_paths, sample_ids)

#
# Perform prediction and store results in dataset
#
for imgs, sample_ids in data_loader:
    predictions = predict(model, imgs)
    for prediction, sample_id in zip(predictions, sample_ids):
        label = fo.ClassificationLabel.create(labels_map[prediction])
        dataset[sample_id].add_label("inception_v3", label)

# Print a sample with a prediction
print(dataset[sample_id])


## Bonus: loading a dataset from the Dataset Zoo

The `fiftyone.zoo` package provides a collection of datasets that you can
download and load into FiftyOne with a single command:

```py
import fiftyone.zoo as foz

# List available datasets
print(foz.list_zoo_datasets())

# Load a zoo dataset
# The dataset will be downloaded from the web the first time you access it
dataset = foz.load_zoo_dataset("cifar10")

# Print a few samples from the dataset
print(dataset.default_view().take(3, random=True))
```


## Copyright

Copyright 2017-2020, Voxel51, Inc.<br>
voxel51.com
