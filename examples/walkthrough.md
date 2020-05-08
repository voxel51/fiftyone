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

```py
import fiftyone as fo
```


## Loading an image classification dataset

Suppose you have an image classification dataset on disk in `dataset_dir`
in the following format:

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

Let's construct a dataset of this kind on disk:

```py
import fiftyone.zoo as foz
import fiftyone.core.odm as foo

#
# This is a quick way to download CIFAR-10 in the above format on disk in
# `dataset_dir`.
#
# It is safe to run multiple times; the data will not be re-downloaded.
#

foz.load_zoo_dataset("cifar10")
foo.drop_database()
dataset_dir = foz.get_default_zoo_dataset_dir("cifar10")
```

In your current workflow, you may parse this data into a list of
`(image_path, label)` tuples as follows:

```py
import json
import os


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
dataset.head()
```


## Working with views into your dataset

FiftyOne provides a powerful notion of _dataset views_ for you to access
subsets of the samples in your dataset.

Here's an example operation:

```py
# Gets five random samples from among the first 100 samples in the dataset
view = (dataset.default_view()
    .take(100)
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

> In order to run this example, you must
>

The following code demonstrates how to add predictions from a model to your
FiftyOne dataset, with minimal changes to your existing ML code:

```py
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

    # Add predictions to your FiftyOne dataset
    for prediction, sample_id in zip(predictions, sample_ids):
        label = fo.ClassificationLabel.create(labels_map[prediction])
        dataset[sample_id].add_label("inception_v3", label)

# Print a sample with a prediction
print(dataset[sample_id])
```


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
dataset.head()
```


## Copyright

Copyright 2017-2020, Voxel51, Inc.<br>
voxel51.com
