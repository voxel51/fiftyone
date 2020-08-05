"""
PyTorch utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
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

    Instances of this class emit PIL images with no associated targets, either
    directly or as ``(image, sample_id)`` pairs if ``sample_ids`` are provided.

    Args:
        image_paths: an iterable of image paths
        sample_ids (None): an iterable of :class:`fiftyone.core.sample.Sample`
            IDs
        transform (None): an optional transform to apply to the images
        force_rgb (False): force convert the images to RGB
    """

    def __init__(
        self, image_paths, sample_ids=None, transform=None, force_rgb=False
    ):
        self.image_paths = list(image_paths)
        self.sample_ids = list(sample_ids) if sample_ids else None
        self.transform = transform
        self.force_rgb = force_rgb

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img = PIL.Image.open(self.image_paths[idx])

        if self.force_rgb:
            img = img.convert("RGB")

        if self.transform:
            img = self.transform(img)

        if self.has_sample_ids:
            # pylint: disable=unsubscriptable-object
            return img, self.sample_ids[idx]

        return img

    @property
    def has_sample_ids(self):
        """Whether this dataset has sample IDs."""
        return self.sample_ids is not None


class TorchImageClassificationDataset(Dataset):
    """A ``torch.utils.data.Dataset`` for image classification.

    Instances of this dataset emit PIL images and their associated targets,
    either directly as ``(image, target)`` pairs or as
    ``(image, target, sample_id)`` pairs if ``sample_ids`` are provided.

    Args:
        image_paths: an iterable of image paths
        targets: an iterable of targets
        sample_ids (None): an iterable of :class:`fiftyone.core.sample.Sample`
            IDs
        transform (None): an optional transform to apply to the images
        force_rgb (False): force convert the images to RGB
    """

    def __init__(
        self,
        image_paths,
        targets,
        sample_ids=None,
        transform=None,
        force_rgb=False,
    ):
        self.image_paths = list(image_paths)
        self.targets = list(targets)
        self.sample_ids = list(sample_ids) if sample_ids else None
        self.transform = transform
        self.force_rgb = force_rgb

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img = PIL.Image.open(self.image_paths[idx])
        target = self.targets[idx]

        if self.force_rgb:
            img = img.convert("RGB")

        if self.transform:
            img = self.transform(img)

        if self.has_sample_ids:
            # pylint: disable=unsubscriptable-object
            return img, target, self.sample_ids[idx]

        return img, target

    @property
    def has_sample_ids(self):
        """Whether this dataset has sample IDs."""
        return self.sample_ids is not None


def from_image_classification_dir_tree(dataset_dir):
    """Creates a ``torch.utils.data.Dataset`` for the given image
    classification dataset directory tree.

    The directory should have the following format::

        <dataset_dir>/
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
        a ``torchvision.datasets.ImageFolder``
    """
    return torchvision.datasets.ImageFolder(dataset_dir)
