"""
PyTorch utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import numpy as np
from PIL import Image

import fiftyone.core.utils as fou

fou.ensure_torch()
import torch
import torchvision
from torch.utils.data import Dataset


logger = logging.getLogger(__name__)


class TorchImageDataset(Dataset):
    """A ``torch.utils.data.Dataset`` of images.

    Instances of this class emit images, or ``(image, sample_id)`` pairs if
    ``sample_ids`` are provided.

    Args:
        image_paths: an iterable of image paths
        sample_ids (None): an iterable of :class:`fiftyone.core.sample.Sample`
            IDs corresponding to each image
        transform (None): an optional transform to apply to the images
        force_rgb (False): whether to force convert the images to RGB
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
        img = Image.open(self.image_paths[idx])

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

    Instances of this dataset emit images and their associated targets, either
    directly as ``(image, target)`` pairs or as ``(image, target, sample_id)``
    pairs if ``sample_ids`` are provided.

    Args:
        image_paths: an iterable of image paths
        targets: an iterable of targets
        sample_ids (None): an iterable of :class:`fiftyone.core.sample.Sample`
            IDs corresponding to each image
        transform (None): an optional transform to apply to the images
        force_rgb (False): whether to force convert the images to RGB
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
        img = Image.open(self.image_paths[idx])
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


class TorchImagePatchesDataset(Dataset):
    """A ``torch.utils.data.Dataset`` of image patch tensors extracted from a
    list of images.

    Instances of this class emit Torch tensors containing the stacked
    (along axis 0) patches from each image, or ``(patch_tensor, sample_id)``
    pairs if ``sample_ids`` are provided.

    The provided ``transform`` must ensure that all image patches are resized
    to the same shape and formatted as torch Tensors so that they can be
    stacked.

    Args:
        image_paths: an iterable of image paths
        detections: an iterable of :class:`fiftyone.core.labels.Detections`
            instances specifying the image patch(es) to extract from each
            image
        transform: a torchvision transform to apply to each image patch
        sample_ids (None): an iterable of :class:`fiftyone.core.sample.Sample`
            IDs corresponding to each image
        force_rgb (False): whether to force convert the images to RGB
        force_square (False): whether to minimally manipulate the patch
            bounding boxes into squares prior to extraction
    """

    def __init__(
        self,
        image_paths,
        detections,
        transform,
        sample_ids=None,
        force_rgb=False,
        force_square=False,
    ):
        self.image_paths = list(image_paths)
        self.detections = list(detections)
        self.transform = transform
        self.sample_ids = list(sample_ids) if sample_ids else None
        self.force_rgb = force_rgb
        self.force_square = force_square

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        image_path = self.image_paths[idx]
        img = Image.open(image_path)

        if self.force_rgb:
            img = img.convert("RGB")

        detections = self.detections[idx].detections

        if not detections:
            raise ValueError(
                "No patches to extract from image '%s'" % image_path
            )

        img_patches = []
        for detection in detections:
            dobj = detection.to_detected_object()

            # @todo avoid PIL <-> numpy casts
            img_patch = dobj.bounding_box.extract_from(
                np.array(img), force_square=self.force_square
            )
            img_patch = Image.fromarray(img_patch)

            img_patch = self.transform(img_patch)

            img_patches.append(img_patch)

        img_patches = torch.stack(img_patches, dim=0)

        if self.has_sample_ids:
            # pylint: disable=unsubscriptable-object
            return img_patches, self.sample_ids[idx]

        return img_patches

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
