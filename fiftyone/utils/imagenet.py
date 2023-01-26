"""
Utilities for working with the `ImageNet dataset <http://www.image-net.org>`_.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os


_TRAIN_IMAGES_TAR = "ILSVRC2012_img_train.tar"
_VAL_IMAGES_DIR = "ILSVRC2012_img_val.tar"
_DEVKIT_TAR = "ILSVRC2012_devkit_t12.tar.gz"


def ensure_imagenet_manual_download(source_dir, split, devkit=False):
    """Ensures that the ImageNet archive(s) for the requested split have been
    manually downloaded to the required locations.

    Args:
        source_dir: the dataset directory
        split: the split of interest. Supported values are
            ``("train", "validation")``
        devkit (False): whether to ensure that the devkit archive is present

    Raises:
        OSError: if the required files are not present
    """
    if split == "train":
        archive_name = _TRAIN_IMAGES_TAR
    elif split == "validation":
        archive_name = _VAL_IMAGES_DIR
    else:
        raise ValueError(
            "Unsupported split '%s'; Supported values are "
            "('train', 'validation')"
        )

    _ensure_archive(archive_name, source_dir)

    if devkit:
        devkit_name = _DEVKIT_TAR
        _ensure_archive(devkit_name, source_dir)


def _ensure_archive(archive_name, source_dir):
    if source_dir is None:
        _raise_imagenet_error(
            "You must provide a `source_dir` in order to load the ImageNet "
            "dataset."
        )

    archive_path = os.path.join(source_dir, archive_name)
    if not os.path.isfile(archive_path):
        _raise_imagenet_error(
            "Archive '%s' not found in directory '%s'."
            % (archive_name, source_dir)
        )


def _raise_imagenet_error(msg):
    raise OSError(
        "\n\n"
        + msg
        + "\n\n"
        + "You must download the source files for the ImageNet dataset "
        "manually."
        + "\n\n"
        + "Run `fiftyone zoo datasets info imagenet-2012` for more information"
    )
