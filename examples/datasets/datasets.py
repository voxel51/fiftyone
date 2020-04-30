"""
Examples of loading common datasets via Torchvision.

See https://pytorch.org/docs/stable/torchvision/datasets.html for a complete
list of available datasets.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import numpy as np
import torchvision
import matplotlib.pyplot as plt

import eta.core.utils as etau
import eta.core.web as etaw


DATASETS_DIR = "/Users/Brian/dev/__datasets__"


def show_sample(dataset):
    # Extract first sample
    img, target = dataset[0]
    img = np.asarray(img)
    target_label = dataset.classes[target]

    plt.imshow(img)
    plt.title(
        "Dataset root: %s\nNumber of samples: %d\nSample image: %s" % (
            dataset.root, len(dataset), target_label)
    )
    plt.show()


def show_coco_sample(dataset):
    # Extract first sample
    img, target = dataset[0]
    img = np.asarray(img)

    plt.imshow(img)
    dataset.coco.showAnns(target)
    plt.title(
        "Dataset root: %s\nNumber of samples: %d" % (
            dataset.root, len(dataset))
    )
    plt.show()


#
# CIFAR10
#

CIFAR10_DIR = os.path.join(DATASETS_DIR, "cifar10")
etau.ensure_dir(CIFAR10_DIR)
cifar10 = torchvision.datasets.CIFAR10(CIFAR10_DIR, train=True, download=True)

show_sample(cifar10)


#
# MNIST
#

MNIST_DIR = os.path.join(DATASETS_DIR, "mnist")
etau.ensure_dir(MNIST_DIR)
mnist = torchvision.datasets.MNIST(MNIST_DIR, train=True, download=True)

show_sample(mnist)


#
# MS-COCO Detection
#
# Steps below taken from
# https://medium.com/randomai/pytorch-torchvision-coco-dataset-b7f5e8cad82
#
# @todo I haven't actually run this! Dataset is too big for my laptop
#
COCO_DIR = os.path.join(DATASETS_DIR, "coco")

COCO_TRAIN_ZIP_PATH = os.path.join(COCO_DIR, "train2017.zip")
etaw.download_file("http://images.cocodataset.org/zips/train2017.zip", path=COCO_TRAIN_ZIP_PATH)
etau.extract_zip(COCO_TRAIN_ZIP_PATH)

COCO_ANNO_ZIP_PATH = os.path.join(COCO_DIR, "annotations_trainval2017.zip")
etaw.download_file("http://images.cocodataset.org/annotations/annotations_trainval2017.zip", path=COCO_ANNO_ZIP_PATH)
etau.extract_zip(COCO_ANNO_ZIP_PATH)

coco_data_path = os.path.join(COCO_DIR, "train2017")
coco_anno_path = os.path.join(COCO_DIR, "annotations/instances_train2017.json")
coco = torchvision.datasets.CocoDetection(coco_data_path, coco_anno_path)

show_coco_sample(coco)
