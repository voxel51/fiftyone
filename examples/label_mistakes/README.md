# Finding Label Mistakes with FiftyOne

This walkthrough provides an example of how FiftyOne can be used to help you
find mistakes in your labels. It covers the following concepts:

-   Loading your existing dataset in FiftyOne
-   Adding predictions from your model to your FiftyOne dataset
-   Computing insights into your dataset relating to possible mistakes
-   Visualizing the mistake in the FiftyOne dashboard

## Setup

-   Install `torch` and `torchvision`, if necessary:

```shell
# Modify as necessary (e.g., GPU install). See https://pytorch.org for options
pip install torch
pip install torchvision
```

-   Download a pretrained CIFAR-10 PyTorch model

```shell
# Download the software
git clone https://github.com/huyvnphan/PyTorch_CIFAR10

# Download the pretrained model (90MB)
eta gdrive download --public \
    1dGfpeFK_QG0kV-U6QDHMX2EOGXPqaNzu \
    PyTorch_CIFAR10/cifar10_models/state_dicts/resnet50.pt
```

## Manipulating the data

For this walkthrough, we will artificially perturb an existing dataset with
mistakes on the labels. Of course, in your normal workflow, you would not add
labeling mistakes; this is only for the sake of the walkthrough.

The code block below loads the test split of the CIFAR-10 dataset into FiftyOne
and randomly breaks 10% (1000 samples) of the labels:

```py
import random

import fiftyone as fo
import fiftyone.zoo as foz

# Load the CIFAR-10 test split
# Downloads the dataset from the web if necessary
dataset = foz.load_zoo_dataset("cifar10", splits=["test"])

# Get the CIFAR-10 classes list
info = foz.load_zoo_dataset_info("cifar10")
classes = info.classes

# Artificially make 10% of sample labels mistakes
for sample in dataset.view().take(1000):
    mistake = random.randint(0, 9)
    while classes[mistake] == sample.ground_truth.label:
        mistake = random.randint(0, 9)

    sample.tags.append("mistake")
    sample["ground_truth"] = fo.Classification(label=classes[mistake])
    sample.save()
```

Let's print some information about the dataset to verify the operation that we
performed:

```py
# Verify that the `mistake` tag is now in the dataset's schema
print(dataset)

# Count the number of samples with the `mistake` tag
num_mistakes = len(dataset.view().match_tag("mistake"))
print("%d ground truth labels are now mistakes" % num_mistakes)
```

## Run predictions on the dataset

Using an off-the-shelf model, let's now add predictions to the dataset, which
are necessary for us to deduce some understanding of the possible label
mistakes.

The code block below adds model predictions to another randomly chosen 10%
(1000 samples) of the dataset:

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
view = dataset.view().take(num_samples)
image_paths, sample_ids = zip(
    *[(s.filepath, s.id) for s in view.iter_samples()]
)
data_loader = make_cifar10_data_loader(image_paths, sample_ids, batch_size)

#
# Perform prediction and store results in dataset
#

for imgs, sample_ids in data_loader:
    predictions, _, logits_ = predict(model, imgs)

    # Add predictions to your FiftyOne dataset
    for sample_id, prediction, logits in zip(sample_ids, predictions, logits_):
        sample = dataset[sample_id]
        sample.tags.append("processed")
        sample[model_name] = fo.Classification(
            label=classes[prediction], logits=logits,
        )
        sample.save()
```

Let's print some information about the predictions that were generated and how
many of them correspond to samples whose ground truth labels were corrupted:

```py
# Count the number of samples with the `processed` tag
num_processed = len(dataset.view().match_tag("processed"))

# Count the number of samples with both `processed` and `mistake` tags
num_corrupted = len(dataset.view().match_tag("processed").match_tag("mistake"))

print("Added predictions to %d samples" % num_processed)
print("%d of these samples have label mistakes" % num_corrupted)
```

## Find the mistakes

Now we can run a method from FiftyOne that estimates the mistakenness of the
ground samples for which we generated predictions:

```py
import fiftyone.brain as fob

# Get samples for which we added predictions
h_view = dataset.view().match_tag("processed")

# Compute mistakenness
fob.compute_mistakenness(h_view, model_name, label_field="ground_truth")
```

The above method added `mistakenness` field to all samples for which we added
predictions. We can easily sort by likelihood of mistakenness from code:

```py
# Sort by likelihood of mistake (most likely first)
mistake_view = (dataset.view()
    .match_tag("processed")
    .sort_by("mistakenness", reverse=True)
)

# Print some information about the view
print(mistake_view)

# Inspect the first few samples
print(mistake_view.head())
```

Let's use the dashboard to visually inspect the results:

```py
# Launch the FiftyOne dashboard
session = fo.launch_dashboard()

# Open your dataset in the dashboard
session.dataset = dataset

# Show only the samples that were processed
session.view = dataset.view().match_tag("processed")

# Show only the samples for which we added label mistakes
session.view = dataset.view().match_tag("mistake")

# Show the samples we processed in rank order by the mistakenness
session.view = mistake_view
```
