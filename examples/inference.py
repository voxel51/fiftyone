"""
Examples of performing inference on CIFAR10 using pretrained Pytorch models.

Setup::

    # Clone repository
    git clone https://github.com/huyvnphan/PyTorch_CIFAR10
    cd PyTorch_CIFAR10

    # Download pretrained models
    eta http download \
        https://rutgers.box.com/shared/static/hm73mc6t8ncy1z499fwukpn1xes9rswe.zip \
        cifar10_models/models.zip
    unzip cifar10_models/models.zip -d cifar10_models/
    rm cifar10_models/models.zip

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import sys

import numpy as np
import torch
import torchvision
from torch.utils.data import DataLoader

sys.path.insert(1, "/Users/Brian/dev/fiftyone/examples/PyTorch_CIFAR10")
from cifar10_models import *


#
# This directory should contain `cifar-10-batches-py/`
#
# See `examples/dataset.py` for easy download of this
#
CIFAR10_DIR = "/Users/Brian/dev/__datasets__/cifar10"


def load_cifar10_dataset(dataset_dir, train=False):
    mean = [0.4914, 0.4822, 0.4465]
    std = [0.2023, 0.1994, 0.2010]
    transforms = torchvision.transforms.Compose([
        torchvision.transforms.ToTensor(),
        torchvision.transforms.Normalize(mean, std),
    ])
    return torchvision.datasets.CIFAR10(
        dataset_dir, train=train, transform=transforms
    )


def predict(model, batch):
    imgs, targets = batch
    logits = model(imgs)
    predictions = torch.argmax(logits, 1)

    return predictions.numpy(), targets.numpy()


# Load dataset and create a DataLoader to load samples from it
dataset = load_cifar10_dataset(CIFAR10_DIR)
data_loader = DataLoader(
    dataset, batch_size=10, num_workers=4, shuffle=True, pin_memory=True
)

#
# Load model
#
# Choices here are:
#   vgg11_bn, vgg13_bn, vgg16_bn, vgg19_bn, resnet18, resnet34, resnet50
#   densenet121, densenet161, densenet169, mobilenet_v2, googlenet
#   inception_v3
#
# Model performance numbers are available at:
#   https://github.com/huyvnphan/PyTorch_CIFAR10
#
model = inception_v3(pretrained=True)
class_labels = dataset.classes  # list of class labels

# Perform prediction on a batch of data
batch = next(iter(data_loader))
predictions, targets = predict(model, batch)

accuracy = sum(predictions == targets) / len(targets)
print("Accuracy: %.1f" % accuracy)
