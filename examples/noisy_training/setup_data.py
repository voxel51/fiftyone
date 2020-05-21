"""
Loads the train and test splits of the CIFAR-10 dataset
Sets up the data for the walkthrough:
-   Loads CIFAR-10 both splits and adds some
label noise. Uses the global namespace so everything is available during the
next steps in the walkthrough.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.zoo as foz


def load_zoo_samples(zoo_dataset_name, split):
    samples = []
    for sample in foz.load_zoo_dataset(zoo_dataset_name, split=split):
        sample.tags.append(split)
        samples.append(sample)

    foo.drop_database()
    return samples


# Load `train` and `test` splits of CIFAR-10 into a FiftyOne dataset
# @todo update after zoo is upgraded
dataset = fo.Dataset("cifar10")
dataset.add_samples(load_zoo_samples("cifar10", "train"))
dataset.add_samples(load_zoo_samples("cifar10", "test"))

print(dataset.summary())
print(dataset.view().first())

labels = "airplane,automobile,bird,cat,deer,dog,frog,horse,ship,truck".split(
    ","
)

# Artificially corrupt 20% of the training labels
train_view = dataset.view().match_tag("train")
num_mistakes = 0.2 * len(train_view)
for sample in train_view.take(num_mistakes):
    # Mark the sample as a mistake
    sample.tags.append("mistake")

    # @todo remove when visualizing tags is supported
    sample["mistake"] = fo.Classification(label="yes")

    # Pick a new incorrect label
    mistake = random.randint(0, 9)
    while labels[mistake] == sample.ground_truth.label:
        mistake = random.randint(0, 9)

    # Corrupt the ground truth label
    sample.ground_truth = fo.Classification(label=labels[mistake])
    sample.save()
