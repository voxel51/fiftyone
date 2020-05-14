# FiftyOne Finding Labeling Mistake Walkthrough

This walkthrough provides an example of how FiftyOne can be used to help you 
find mistakes in your labels during a model-training procedure. It covers the 
following concepts:

-   Integrating your existing model-training loop with FiftyOne
-   Adding predictions from your model to your FiftyOne dataset
-   Computing insights into your dataset relating to possible problems with the 
    datasets
-   Visualizing the problems in the FiftyOne dashboard

This walkthrough is self-contained.  

## Setup

Install `torch` and `torchvision`, if necessary:

```
pip install torch
pip install torchvision
```

## Data Download

Since we are going to train a model in this walkthrough, we need the training 
data too.  Download the train and test split of the CIFAR-10 dataset to
`~/fiftyone/cifar10`:

```py
import fiftyone.zoo as foz
import fiftyone.core.config as foc
import fiftyone.core.odm as foo

# It is safe to run this multiple times; the data will not be re-downloaded
foc.set_config_settings(default_ml_backend="torch")
foz.load_zoo_dataset("cifar10", split="train")
foz.load_zoo_dataset("cifar10", split="test")
foo.drop_database()
```

We use CIFAR-10 here as an illustrative example and use it via the FiftyOne 
zoo.  However, this is not a requirement for using FiftyOne.  You can use your 
datasets no matter where they are.  Refer to the other, data-related 
walkthroughs for more examples.


## Manipulating the data

For this walkthrough, we will artificially perturb the existing dataset with 
mistakes on the labels to create a noisy-training scenario.  Of course, in your 
normal workflow, you would not add labeling mistakes; this is only for the sake 
of the walkthrough.  So, let's manipulate the dataset and then we will actually 
train the model using the bad labels.

Let's continue to use the CIFAR-10 dataset in the FiftyOne zoo for ease, but 
without loss of generality

```py
import fiftyone as fo
import fiftyone.zoo as foz
import random

train_dataset = foz.load_zoo_dataset("cifar10", split="train")
valid_dataset = foz.load_zoo_dataset("cifar10", split="test")

labels_map = "airplane, automobile, bird, cat, deer, dog, frog, horse, ship, truck".split(', ')

# make 20% samples artificially be mistakes
artificial_mistakes = 0.2
num_mistakes = len(train_dataset)*artificial_mistakes

mistake_label = fo.ClassificationLabel.create("yes")
for sample in train_dataset.default_view().sample(num_mistakes).iter_samples():
    sample.add_tag("mistake")
    label = sample.get_labels()["ground_truth"].label

    mistaker = random.randint(0, 9)
    while labels_map[mistaker] == label:
        mistaker = random.randint(0, 9)

    bad_label = fo.ClassificationLabel.create(labels_map[mistaker])
    sample.add_label("ground_truth", bad_label)
    # This is just for the ability to easily render labels in the visualization 
    # since rendering tags is currently not supported.
    sample.add_label("label_mistake", mistake_label)
```

## Train and save a model

Using the simple model provided in `./simple_resnet.py`, let's now train a model and save it to disk.  We will train the model using the FiftyOne dataset we made above.  This is a lightweight wrapper around the original dataset.  Of course, in your work, you might choose to interact with your data prior to it being wrapped by FiftyOne; all good, FiftyOne will work with you on your terms.

XXX

## Run predictions on the dataset

Using the model we just trained, let's now add predictions to the dataset so 
that we can explore some of FiftyOne's capabilities in identifying hard samples 
and possible mistakes in the labels, which we know are there because we added 
them!


```py
import sys

import numpy as np
import torch
import torchvision
from torch.utils.data import DataLoader

import fiftyone.utils.torch as fout


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
# Extract a few images to process (some of these will have been manipulated above)
#
num_samples = 1000
batch_size = 20
view = train_view.sample(num_samples)
image_paths, sample_ids = zip(
    *[(s.filepath, s.id) for s in view.iter_samples()]
)
data_loader = make_cifar10_data_loader(image_paths, sample_ids, batch_size)

#
# Perform prediction and store results in dataset
#

    #model.train(False) # == model.eval()
    #
    #correct = 0
    #total = 0
    #class_correct = list(0. for i in range(10))
    #class_total = list(0. for i in range(10))
    #with torch.no_grad():
    #    for data in valid_batches.dataloader:
    #        images, labels = data
    #        inputs = dict(input=images.cuda().half())
    #        outputs = model(inputs)
    #        y = outputs['logits']
    #        _, predicted = torch.max(y, 1)
    #        total += labels.size(0)
    #        labels_gpu = labels.cuda().half()
    #        correct += (predicted == labels_gpu).sum().item()
    #        c = (predicted == labels_gpu).squeeze()
    #        for i in range(min(config.batch_size, len(labels))):
    #            label = labels[i]
    #            class_correct[label] += c[i].item()
    #            class_total[label] += 1
    #
    #iteration_stats["validation_accuracy"] = correct / total
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
            model_name, fo.ClassificationLabel.create(labels_map[the_prediction], 
                                                      logits=the_logits)
        )

#
# Print some information about the Predictions
#
num_processed = len(dataset.default_view().match_tag("processed"))
num_mistaken = len(dataset.default_view().match_tag("processed").match_tag("mistake"))
print("%d processed and %d of these have artificially corrupted labels" %
    (num_processed, num_mistaken))
```


## Find the Mistakes

Now we can run a method from FiftyOne that estimate the hardness of the samples 
we processed.  We can use this to find possible label mistakes both in the code 
and in the visualization.

```
import fiftyone.brain.hardness as fbh

h_view = dataset.default_view().match_tag("processed")
fbh.compute_hardness(h_view, model_name, "hardness")

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
    .sort_by("insights.hardness.scalar", reverse=True)
)
session.view = mistake_view

```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
