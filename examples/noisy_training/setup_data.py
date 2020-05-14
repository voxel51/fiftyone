"""
Sets up the data for the walkthrough.  Loads CIFAR-10 both splits and adds some
label noise. Uses the global namespace so everything is available during the
next steps in the walkthrough.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
import fiftyone.zoo as foz
import random


# This is the current way to load a both splits of the CIFAR-10 dataset and tag
# each sample by its split.
# THIS NEEDS TO CHANGE AFTER PR#70 is merged
dataset = foz.load_zoo_dataset("cifar10", split="train")
for sample in dataset.iter_samples():
    sample.add_tag("train")
foz.load_zoo_dataset("cifar10", split="test")

train_view = dataset.default_view().match_tag("train")
valid_view = dataset.default_view().match({"tags": { "$ne": "train" } })
for sample in valid_view.iter_samples():
    sample.add_tag("valid")

cifar10_map = "airplane, automobile, bird, cat, deer, dog, frog, horse, ship, truck".split(', ')

# make 20% samples artificially be mistakes
artificial_mistakes = 0.2
num_mistakes = len(train_view)*artificial_mistakes

mistake_label = fo.ClassificationLabel.create("yes")
for sample in train_view.sample(num_mistakes).iter_samples():
    sample.add_tag("mistake")
    label = sample.get_labels()["ground_truth"].label

    mistaker = random.randint(0, 9)
    while cifar10_map[mistaker] == label:
        mistaker = random.randint(0, 9)

    bad_label = fo.ClassificationLabel.create(cifar10_map[mistaker])
    sample.add_label("ground_truth", bad_label)
    # This is just for the ability to easily render labels in the visualization
    # since rendering tags is currently not supported.
    sample.add_label("label_mistake", mistake_label)
