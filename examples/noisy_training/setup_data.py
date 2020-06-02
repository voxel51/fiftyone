"""
Sets up the data for the noisy training walkthrough:
- Loads the train and test splits of the CIFAR-10 dataset
- Randomly corrupts a percentage of the ground truth labels

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random

import fiftyone as fo
import fiftyone.zoo as foz


# Load the CIFAR-10 train and test splits
dataset = foz.load_zoo_dataset("cifar10")

# Load the class list
info = foz.load_zoo_dataset_info("cifar10")
classes = info.classes

print(dataset)
print(dataset.view().first())

# Artificially corrupt 20% of the training labels
train_view = dataset.view().match_tag("train")
num_mistakes = int(0.2 * len(train_view))
for sample in train_view.take(num_mistakes):
    mistake = random.randint(0, 9)
    while classes[mistake] == sample.ground_truth.label:
        mistake = random.randint(0, 9)

    sample.tags.append("mistake")
    sample.ground_truth = fo.Classification(label=classes[mistake])
    sample.save()
