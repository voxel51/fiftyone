# FiftyOne Walkthrough

This walkthrough provides a glimpse into the possibilities for integrating
FiftyOne into your machine learning workflows. It covers the following
concepts:

- Loading your existing dataset in FiftyOne
- Adding predictions from your model to your FiftyOne dataset
- Launching the FiftyOne dashboard and visualizing exploring your data
- Integrating the dashboard into your data wrangling workflow


## Setup

- Install `torch` and `torchvision`, if necessary:

```
pip install torch
pip install torchvision
```

- Download the test split of the CIFAR-10 dataset to `~/fiftyone/cifar10/test`:

```py
import fiftyone.zoo as foz
import fiftyone.core.config as foc
import fiftyone.core.odm as foo

# It is safe to run this multiple times; the data will not be re-downloaded
foc.set_config_settings(default_ml_backend="torch")
foz.load_zoo_dataset("cifar10")
foo.drop_database()
```

- Follow the instructions in `inference/README.md` to download some pre-trained
CIFAR-10 PyTorch models


## Importing FiftyOne

Importing the FiftyOne package is simple:

```py
import fiftyone as fo
```


## Loading an image classification dataset

Suppose you have an image classification dataset on disk in the following
format:

```
    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.json
```

where ``labels.json`` is a JSON file in the following format:

```
{
    "labels_map": {
        <targetA>: <labelA>,
        <targetB>: <labelB>,
        ...
    },
    "labels": {
        <uuid1>: <target1>,
        <uuid2>: <target2>,
        ...
    }
}
```

In your current workflow, you may parse this data into a list of
`(image_path, label)` tuples as follows:

```py
import json
import os

# The location of the dataset on disk
dataset_dir = os.path.expanduser("~/fiftyone/cifar10/test")

# Maps image UUIDs to image paths
images_dir = os.path.join(dataset_dir, "data")
image_uuids_to_paths = {
    os.path.splitext(n)[0]: os.path.join(images_dir, n)
    for n in os.listdir(images_dir)
}

labels_path = os.path.join(dataset_dir, "labels.json")
with open(labels_path, "rt") as f:
    _labels = json.load(f)

# Maps int targets to label strings
labels_map = {int(k): v for k, v in _labels["labels_map"].items()}

# Maps image UUIDs to int targets
labels = _labels["labels"]

# Make a list of (image_path, label) samples
samples = [(image_uuids_to_paths[u], labels_map[t]) for u, t in labels.items()]
```

Building a FiftyOne dataset from your samples is simple:

```py
dataset = fo.Dataset.from_image_classification_samples(
    samples, name="my-dataset"
)

# Print a few samples from the dataset
print(dataset.head())
```


## Working with views into your dataset

FiftyOne provides a powerful notion of _dataset views_ for you to access
subsets of the samples in your dataset.

Here's an example operation:

```py
# Gets five random airplanes from the dataset
view = (dataset.default_view()
    .filter(filter={"labels.ground_truth.label": "airplane"})
    .take(5, random=True)
)

# Print some information about the entire dataset
print(dataset.summary())

# Print some information about the view you created
print(view.summary())

# Print a few samples from the view
print(view.head())
```

Iterating over the samples in a view is easy:

```py
for sample in view.iter_samples():
    print(sample)
```


## Adding model predictions to your dataset

The following code demonstrates how to add predictions from a model to your
FiftyOne dataset, with minimal changes to your existing ML code:

```py
import sys

import numpy as np
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
    logits = model(imgs).detach().cpu().numpy()
    predictions = np.argmax(logits, axis=1)
    odds = np.exp(logits)
    confidences = np.max(odds, axis=1) / np.sum(odds, axis=1)
    return predictions, confidences


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
model_name = "inception_v3"

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
    predictions, confidences = predict(model, imgs)

    # Add predictions to your FiftyOne dataset
    for sample_id, prediction, confidence in zip(
        sample_ids, predictions, confidences
    ):
        sample = dataset[sample_id]
        sample.add_label(
            model_name, fo.ClassificationLabel.create(labels_map[prediction])
        )
        sample.add_insight(
            model_name, fo.ScalarInsight.create("confidence", confidence)
        )

#
# Get the last batch of samples for which we added predictions
#

view = dataset.default_view().select(sample_ids)
print(view.head())

#
# Get all samples for which we added predictions, in reverse order of
# confidence
#

view = (dataset.default_view()
    .filter(filter={"insights.inception_v3.name": "confidence"})
    .sort_by("insights.inception_v3.scalar", reverse=True)
)
print(view.head())
```


## Launching a dashboard session

```
# Launch the FiftyOne dashboard
session = fo.launch_dashboard()

# Open your dataset in the dashboard
session.dataset = dataset

# Show five random samples in the dashboard
session.view = dataset.default_view().take(5)

# Get currently selected samples from the dashboard
sample_ids = session.selected

# Print details about the selected samples
view = dataset.default_view().select(sample_ids)
```


## Copyright

Copyright 2017-2020, Voxel51, Inc.<br>
voxel51.com
