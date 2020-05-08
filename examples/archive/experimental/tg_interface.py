"""
Initial demo of the FiftyOne interface.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import random

import fiftyone.core.dataset as voxd
import fiftyone.core.label as voxl
import fiftyone.core.query as voxq


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


label_group = "my-classifier_V1.0_preds"

for _, sample in query.iter_samples(dataset):
    prediction = MyClassifier().predict(sample.load_image())
    label = voxl.ClassificationLabel(
        group=label_group,
        label=prediction["label"],
        confidence=prediction["confidence"]
        # model=MyClassifier, # TODO
    )

    sample.add_label(label=label)

# or batch add
predictions = {}
for _, sample in query.iter_samples(dataset):
    prediction = MyClassifier().predict(sample.load_image())
    predictions[sample.id] = voxl.ClassificationLabel(
        group=label_group,
        label=prediction["label"],
        confidence=prediction["confidence"]
        # model=MyClassifier, # TODO
    )

dataset.add_labels(labels_dict=predictions)

# Verify that predictions were added to the dataset samples
for sample_id in predictions.keys():
    print(dataset[sample_id])


#
# Export a random subset of a dataset
#

export_dir = "~/Desktop/fiftyone-export"

# Export 5 random images and their ground truth annotations as a LabeledDataset
query = voxq.DatasetQuery().sample(5)
query.export(dataset, export_dir, pretty_print=True)

# Re-export these samples in TFRecords format

# @todo(Tyler)
# import os
# import eta.core.datasets as etads
# import fiftyone.utils.tf as fout
#
# labeled_dataset = etads.load_dataset(export_dir)
# tf_records_path = os.path.join(export_dir, "dataset.tfrecords")
# fout.write_image_classification_tf_records(labeled_dataset, tf_records_path)
#
# # Load the TFRecords back and print them
# tf_dataset = fout.load_image_classification_tf_records(tf_records_path)
# for img, label in tf_dataset.as_numpy_iterator():
#     print("Image: %s, label: %s" % (img.shape, label.decode()))
