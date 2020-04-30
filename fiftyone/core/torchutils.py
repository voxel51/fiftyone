"""
Core PyTorch utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import logging

import PIL

import eta.core.utils as etau

import fiftyone.core.utils as fou

fou.ensure_torch()
import torchvision
from torch.utils.data import Dataset


logger = logging.getLogger(__name__)


class TorchImageDataset(Dataset):
    """A ``torch.utils.data.Dataset`` of unlabeled images.

    Instances of this class emit images with no associated labels.
    """

    def __init__(self, image_paths, transform=None):
        """Creates a TorchImageDataset instance.

        Args:
            image_paths: a list of image paths
            transform: an optional transform to apply to the images. By
                default, no transform is applied
        """
        self.image_paths = image_paths
        self.transform = transform

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img = PIL.Image.open(self.image_paths[idx])

        if self.transform:
            img = self.transform(img)

        return img

    @classmethod
    def from_images_dir(cls, images_dir, recursive=False):
        """Creates a TorchImageDataset from a directory of images.

        Args:
            images_dir: a directory of images
            recursive: whether to recursively traverse subdirectories. By
                default, this is False

        Returns:
            a TorchImageDataset
        """
        image_paths = etau.list_files(
            images_dir, abs_paths=True, recursive=recursive
        )
        return cls(image_paths)

    @classmethod
    def from_image_patt(cls, image_patt):
        """Creates a TorchImageDataset from a pattern of images on disk.

        Args:
            image_patt: a glob pattern of images like ``/path/to/images/*.jpg``

        Returns:
            a TorchImageDataset
        """
        image_paths = etau.parse_glob_pattern(image_patt)
        return cls(image_paths)

    @classmethod
    def from_images(cls, image_paths):
        """Creates a TorchImageDataset from the given list of images.

        Args:
            image_paths: a list of image paths

        Returns:
            a TorchImageDataset
        """
        return cls(image_paths)


class TorchImageClassificationDataset(Dataset):
    """A ``torch.utils.data.Dataset`` for image classification.

    The dataset emits (img, label) pairs.
    """

    def __init__(
        self, image_paths, labels, transform=None,
    ):
        """Creates a TorchImageClassificationDataset instance.

        Args:
            image_paths: a list of image paths
            labels: a list of labels
            transform: an optional transform to apply to the images. By
                default, no transform is applied
        """
        self.image_paths = image_paths
        self.labels = labels
        self.transform = transform

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img = PIL.Image.open(self.image_paths[idx])
        label = self.labels[idx]

        if self.transform:
            img = self.transform(img)

        return img, label


def from_image_classification_dataset_directory(dataset_dir):
    """Loads the image classification dataset from the given directory as a
    ``torch.utils.data.Dataset``.

    The dataset directory should have the following format::

        dataset_dir/
            <classA>/
                <image1>.<ext>
                <image2>.<ext>
                ...
            <classB>/
                <image1>.<ext>
                <image2>.<ext>
                ...

    Args:
        dataset_dir: the dataset directory

    Returns:
        a ``torchvision.datasets.ImageFolder`` instance
    """
    return torchvision.datasets.ImageFolder(dataset_dir)


def from_labeled_image_dataset(labeled_dataset, attr_name):
    """Loads an ``eta.core.datasets.LabeledImageDataset`` as a
    ``torch.utils.data.Dataset``.

    Args:
        labeled_dataset: a ``eta.core.datasets.LabeledImageDataset``
        attr_name: the name of the frame attribute to extract as label

    Returns:
        a TorchImageClassificationDataset that emits (img, label) pairs
    """
    image_paths = list(labeled_dataset.iter_data_paths)
    labels = []
    for image_labels in labeled_dataset.iter_labels():
        label = image_labels.attrs.get_attr_value_with_name(attr_name)
        labels.append(label)

    return TorchImageClassificationDataset(image_paths, labels)
