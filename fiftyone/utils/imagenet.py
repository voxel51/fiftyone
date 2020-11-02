"""
Utilities for working with the `ImageNet dataset <http://www.image-net.org>`_.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os


def ensure_imagenet_manual_download(dataset_dir, split, devkit=False):
    """Ensures that the ImageNet archive(s) for the requested split have been
    manually downloaded to the required locations.

    Args:
        dataset_dir: the dataset directory
        split: the split of interest. Supported values are
            ``("train", "validation")``
        devkit (False): whether to ensure that the devkit archive is present

    Raises:
        OSError: if the required files are not present
    """
    if split == "train":
        archive_name = "ILSVRC2012_img_train.tar"
    elif split == "validation":
        archive_name = "ILSVRC2012_img_val.tar"
    else:
        raise ValueError(
            "Unsupported split '%s'; Supported values are "
            "('train', 'validation')"
        )

    _ensure_archive(archive_name, dataset_dir)

    if devkit:
        devkit_name = "ILSVRC2012_devkit_t12.tar.gz"
        _ensure_archive(devkit_name, dataset_dir)


def _ensure_archive(archive_name, dataset_dir):
    archive_path = os.path.join(dataset_dir, archive_name)
    if not os.path.isfile(archive_path):
        raise OSError(
            (
                "Archive '%s' not found in dataset directory '%s'."
                "\n\n"
                "You must download the source files for the ImageNet dataset "
                "manually to the dataset directory."
                "\n\n"
                "Register at http://www.image-net.org/download-images in "
                "order to get the link to download the dataset"
            )
            % (archive_name, dataset_dir)
        )
