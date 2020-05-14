# Finding Label Mistakes with FiftyOne

This walkthrough provides an example of how FiftyOne can be used to help you
find mistakes in your labels. It covers the following concepts:

-   Loading your existing dataset in FiftyOne
-   Adding predictions from your model to your FiftyOne dataset
-   Computing insights into your dataset relating to possible mistakes
-   Visualizing the mistake in the FiftyOne dashboard

This walkthrough is self-contained. If you have already completed the Model
Inference walkthrough, then you can skip the setup and data download sections.

## Setup

Install `torch` and `torchvision`, if necessary:

```
pip install torch
pip install torchvision
```

Download the test split of the CIFAR-10 dataset to `~/fiftyone/cifar10/test`:

```py
import fiftyone.zoo as foz
import fiftyone.core.config as foc
import fiftyone.core.odm as foo

# It is safe to run this multiple times; the data will not be re-downloaded
foc.set_config_settings(default_ml_backend="torch")
foz.load_zoo_dataset("cifar10")
foo.drop_database()
```

Download some pretrained CIFAR-10 PyTorch models

```
# Download the software
git clone https://github.com/huyvnphan/PyTorch_CIFAR10
cd PyTorch_CIFAR10

# Download pretrained models
eta http download \
    https://rutgers.box.com/shared/static/hm73mc6t8ncy1z499fwukpn1xes9rswe.zip \
    cifar10_models/models.zip
unzip cifar10_models/models.zip -d cifar10_models/
rm cifar10_models/models.zip
```

## Manipulating the data

For this walkthrough, we will artificially perturb an existing dataset with
mistakes on the labels. Of course, in your normal workflow, you would not add
labeling mistakes; this is only for the sake of the walkthrough.

Let's use the CIFAR-10 dataset in the zoo and work with a subset of it.

```py
import fiftyone as fo
import fiftyone.zoo as foz
import random

dataset = foz.load_zoo_dataset("cifar10")

labels_map = "airplane, automobile, bird, cat, deer, dog, frog, horse, ship, truck".split(', ')

# make 10% samples artificially be mistakes
mistake_label = fo.ClassificationLabel.create("yes")
for sample in dataset.default_view().sample(1000).iter_samples():
    sample.add_tag("mistake")
    label = sample.get_labels()["ground_truth"].label

    mistaker = random.randint(0, 9)
    while labels_map[mistaker] == label:
        mistaker = random.randint(0, 9)

    bad_label = fo.ClassificationLabel.create(labels_map[mistaker])
    sample.add_label("ground_truth", bad_label)
    sample.add_label("label_mistake", mistake_label)
```

## Run predictions on the dataset

Using an off-the-shelf, model let's now add predictions to the dataset, which
are necessary for us to deduce some understanding of the possible label
mistakes.

```py
import sys

import numpy as np
import torch
import torchvision
from torch.utils.data import DataLoader

import fiftyone.utils.torch as fout

sys.path.insert(1, "PyTorch_CIFAR10")
from cifar10_models import *


def make_cifar10_data_loader(image_paths, sample_ids, batch_size):
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
    return DataLoader(dataset, batch_size=batch_size, num_workers=4)


def predict(model, imgs):
    logits = model(imgs).detach().cpu().numpy()
    predictions = np.argmax(logits, axis=1)
    odds = np.exp(logits)
    confidences = np.max(odds, axis=1) / np.sum(odds, axis=1)
    return predictions, confidences, logits


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

model = resnet50(pretrained=True)
model_name = "resnet50"

#
# Extract a few images to process
# (some of these will have been manipulated above)
#

num_samples = 1000
batch_size = 20
view = dataset.default_view().sample(num_samples)
image_paths, sample_ids = zip(
    *[(s.filepath, s.id) for s in view.iter_samples()]
)
data_loader = make_cifar10_data_loader(image_paths, sample_ids, batch_size)

#
# Perform prediction and store results in dataset
#

for imgs, sample_ids in data_loader:
    predictions, _, logits = predict(model, imgs)

    # Add predictions to your FiftyOne dataset
    for the_sample_id, the_prediction, the_logits in zip(
        sample_ids, predictions, logits
    ):
        sample = dataset[the_sample_id]
        sample.add_tag("processed")
        sample.add_label(
            model_name,
            fo.ClassificationLabel.create(
                labels_map[the_prediction], logits=the_logits
            )
        )

#
# Print some information about the predictions
#

num_processed = len(
    dataset.default_view().match_tag("processed")
)
num_corrupted = len(
    dataset.default_view().match_tag("processed").match_tag("mistake")
)
print(
    "Processed %d images and %d of these have artificially corrupted labels" %
    (num_processed, num_corrupted)
)
```

## Find the mistakes

Now we can run a method from FiftyOne that estimate the hardness of the samples
we processed. We can use this to find possible label mistakes both in the code
and in the visualization.

```py
import fiftyone.brain.mistakenness as fbm

h_view = dataset.default_view().match_tag("processed")
fbm.compute_mistakenness(h_view, model_name, key_insight="mistakenness")

# Launch the FiftyOne dashboard
session = fo.launch_dashboard()

# Open your dataset in the dashboard
session.dataset = dataset

# Show only the samples that were processed
view = dataset.default_view().match_tag("processed")
session.view = view

# Show only the samples for which we added label mistakes
view = dataset.default_view().match_tag("mistake")
session.view = view

# Show the samples we processed in rank order by the hardness
mistake_view = (dataset.default_view()
    .match_tag("processed")
    .sort_by("insights.mistakenness.scalar", reverse=True)
)
session.view = mistake_view
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
