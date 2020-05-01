"""
Initial demo of the FiftyOne interface.

Goals of this interface:
    "It's not magic": I have to do the things I want done and they aren't
        overly obfuscated

    "I can name it whatever I want":
        - fiftyone doesn't know which labels are GT
        - I can add/delete/name/organize samples, labels, views, ... as I please

TODO:
creating a voxl.FiftyOneImageLabels should be painless
I think there should be subclasses for each simple representation, and then
we can also provide a `CompositeLabel` which is composed of potentially many
other labels.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import random

import eta.core.data as etad

import fiftyone.core.dataset as voxd
import fiftyone.core.labels as voxl
import fiftyone.core.query as voxq

import fiftyone.core.data as fod
import fiftyone.core.datautils as fodu
import fiftyone.zoo as foz


def print_images_head(dataset, num_samples=5, shuffle=False):
    query = voxq.DatasetQuery()

    if shuffle:
        query = query.sample(num_samples)
    else:
        query = query.limit(num_samples)

    for _, sample in query.iter_samples(dataset):
        img = sample.load_image()
        print("Image: %s" % (img.shape,))


def print_classification_head(
    dataset, labels_group, num_samples=5, shuffle=False
):
    query = voxq.DatasetQuery()

    if shuffle:
        query = query.sample(num_samples)
    else:
        query = query.limit(num_samples)

    for _, sample in query.iter_samples(dataset):
        img = sample.load_image()
        label = sample.labels[labels_group].label
        print("Image: %s, label: %s" % (img.shape, label))


#
# Load a classification dataset that has been ingested into fiftyone
#

dataset = voxd.Dataset(name="cifar100")

print_classification_head(
    dataset, labels_group="ground_truth_fine", shuffle=False
)

#
# Load a directory of unlabeled images
#

# shown in {{fiftyone}}/examples/datamodel/ingest_data.py


#
# Register model predictions on a dataset
#

# there is no need to register a model
# dataset1.register_model("my-classifier")

# Add predictions
# Predictions are propagated to the dataset when the `with` statement exits
query = voxq.DatasetQuery().sample(2)


class MyClassifier:
    def predict(self, img):
        return {
            "label": random.choice("abcdefghijklmnopqrstuvwxyz"),
            "confidence": random.random(),
        }


group = "my-classifier_V1.0_preds"

for _, sample in query.iter_samples(dataset):
    prediction = MyClassifier().predict(sample.load_image())
    label = voxl.FiftyOneImageLabels(
        group=group,
        # model=MyClassifier, # TODO
        attrs=etad.AttributeContainer(
            attrs=[
                etad.CategoricalAttribute(
                    name="label",
                    value=prediction["label"],
                    confidence=prediction["confidence"],
                )
            ]
        ),
    )

    sample.add_label(label=label)

# or batch add
predictions = {}
for _, sample in query.iter_samples(dataset):
    prediction = MyClassifier().predict(sample.load_image())
    predictions[sample.id] = voxl.FiftyOneImageLabels(
        group=group,
        # model=MyClassifier, # TODO
        attrs=etad.AttributeContainer(
            attrs=[
                etad.CategoricalAttribute(
                    name="label",
                    value=prediction["label"],
                    confidence=prediction["confidence"],
                )
            ]
        ),
    )

dataset.add_labels(labels_dict=predictions)

# Verify that predictions were added to the dataset samples
for sample_id in predictions.keys():
    print(dataset[sample_id])

import sys

sys.exit("SUCCESS")


#
# Export a random subset of a dataset
#

# export_dir = "/Users/Brian/Desktop/fiftyone-export"
#
# # Export 5 random images and their ground truth annotations as a LabeledDataset
# context = dataset1.get_ground_truth_context()
# context.get_view().shuffle().take(5).export(export_dir)
#
# # Re-export these samples in TFRecords format
#
# import os
# import eta.core.datasets as etads
# import fiftyone.core.tfutils as fotu
#
# labeled_dataset = etads.load_dataset(export_dir)
# tf_records_path = os.path.join(export_dir, "dataset.tfrecords")
# fotu.write_image_classification_tf_records(labeled_dataset, tf_records_path)
#
# # Load the TFRecords back and print them
# tf_dataset = fotu.load_image_classification_tf_records(tf_records_path)
# for img, label in tf_dataset.as_numpy_iterator():
#     print("Image: %s, label: %s" % (img.shape, label.decode()))
