"""
Initial demo of the FiftyOne interface.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import random

import fiftyone.core.config as foc

# Set these to configure which ML backend will be used to provide zoo datasets
# foc.set_config_settings(default_ml_backend="tensorflow")
# foc.set_config_settings(default_ml_backend="torch")

import fiftyone.core.data as fod
import fiftyone.core.datautils as fodu
import fiftyone.zoo as foz


def print_images_head(dataset, num_samples=5, shuffle=False):
    context = dataset.get_image_context()
    view = context.get_view()
    if shuffle:
        view = view.shuffle()

    view = view.take(num_samples)
    for img in view.as_numpy_iterator():
        print("Image: %s" % (img.shape,))


def print_gt_classification_head(dataset, num_samples=5, shuffle=False):
    gt_context = dataset.get_ground_truth_context()
    context = gt_context.get_classification_context()
    view = context.get_view()
    if shuffle:
        view = view.shuffle()

    view = view.take(num_samples)
    for img, label in view.as_numpy_iterator():
        print("Image: %s, label: %s" % (img.shape, label))


def print_gt_detection_head(dataset, num_samples=5, shuffle=False):
    context = dataset.get_ground_truth_context()
    view = context.get_view()
    if shuffle:
        view = view.shuffle()

    view = view.take(num_samples)
    for img, image_labels in view.as_numpy_iterator():
        print("Image: %s, ImageLabels:%s" % (img.shape, image_labels))


#
# List available datasets in the zoo
#

print("Available datasets: %s" % foz.list_zoo_datasets())


#
# Load a classification dataset from the zoo
#

dataset1 = foz.load_zoo_dataset("cifar10")

print_gt_classification_head(dataset1, shuffle=True)


#
# Load a detection dataset from the zoo
#

dataset2 = foz.load_zoo_dataset("voc")

print_gt_detection_head(dataset2, num_samples=1, shuffle=True)


#
# Load a classification dataset stored on disk in the following format:
#
# dataset_dir/
#     <classA>/
#         <image1>.<ext>
#         <image2>.<ext>
#         ...
#     <classB>/
#         <image1>.<ext>
#         <image2>.<ext>
#         ...
#

class_dir = "/Users/Brian/Desktop/class-dir"
samples, _ = fodu.parse_image_classification_dataset_directory(class_dir)
dataset3 = fod.from_image_classification_samples(samples)

print_gt_classification_head(dataset3)


#
# Load a directory of unlabeled images
#

class_dir = "/Users/Brian/Desktop/class-dir"
dataset4 = fod.from_images_from_dir(class_dir, recursive=True)

print_images_head(dataset4)


#
# Register model predictions on a dataset
#

dataset1.register_model("my-classifier")

# Add predictions
# Predictions are propagated to the dataset when the `with` statement exits
sample_ids = []
with dataset1.get_model_context("my-classifier") as context:
    view = context.get_view().shuffle().take(5)
    for img, sample_id in view.as_numpy_iterator():
        sample_ids.append(sample_id)
        prediction = {
            "label": random.choice("abcdefghijklmnopqrstuvwxyz"),
            "confidence": random.random(),
        }
        context.add_prediction(sample_id, prediction)

# Verify that predictions were added to the dataset samples
for sample_id in sample_ids:
    print(dataset1[sample_id])


#
# Export a random subset of a dataset
#

export_dir = "/Users/Brian/Desktop/fiftyone-export"

# Export 5 random images and their ground truth annotations as a LabeledDataset
context = dataset1.get_ground_truth_context()
context.get_view().shuffle().take(5).export(export_dir)

# Re-export these samples in TFRecords format

import os
import eta.core.datasets as etads
import fiftyone.core.tfutils as fotu

labeled_dataset = etads.load_dataset(export_dir)
tf_records_path = os.path.join(export_dir, "dataset.tfrecords")
fotu.write_image_classification_tf_records(labeled_dataset, tf_records_path)

# Load the TFRecords back and print them
tf_dataset = fotu.load_image_classification_tf_records(tf_records_path)
for img, label in tf_dataset.as_numpy_iterator():
    print("Image: %s, label: %s" % (img.shape, label.decode()))
