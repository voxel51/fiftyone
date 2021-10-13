"""
Utilities for working with the
`Families In the Wild dataset <https://web.northeastern.edu/smilelab/fiw/>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
from pathlib import Path

import eta.core.utils as etau
import eta.core.web as etaw
import pandas as pd

logger = logging.getLogger(__name__)


def download_fiw_dataset(dataset_dir, scratch_dir=None, cleanup=True):
    """Downloads and extracts the Families in the Wild dataset.

    Any existing files are not re-downloaded.

    Args:
        dataset_dir: the directory to output the final dataset
        scratch_dir (None): a scratch directory to use to store temporary files
        cleanup (True): whether to cleanup the scratch directory after
            extraction
    """
    pass
    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")

    # Download dataset
    images_dir = _download_images(scratch_dir)
    test_path, val_path, train_path = _download_splits(scratch_dir)

    # Reorganize files into splits
    logger.info("Images and lists are ready!")
    logger.info(
        f"Images: {images_dir}\nTrain: {train_path}\nVal: {val_path}"
        f"\nTest: {test_path}"
    )

    if cleanup:
        logger.info(f"Cleaning up {scratch_dir}")
        etau.delete_dir(scratch_dir)

    return scratch_dir


_IMAGES_DOWNLOAD_LINK = "1rkrDGOjS0e_pptzRHZl5bRGq0yy5xQxQ"
_MD5_DATA_DOWNLOAD_LINK = "121lbbeaiY-qM2tK9sJXWNuvMczVuwi2p"
_LISTS_DOWNLOAD_LINK = "1nt22yiCfdGF7aIguUb-SJmsM_1CvcYjg"
_MD5_LISTS_DOWNLOAD_LINK = "1nt22yiCfdGF7aIguUb-SJmsM_1CvcYjg"


def _download_images(scratch_dir):
    zip_path = os.path.join(scratch_dir, "data.zip")
    images_dir = os.path.join(scratch_dir, "fiw")

    if not os.path.exists(zip_path):
        logger.info("Downloading dataset to '%s'", zip_path)
        etaw.download_google_drive_file(_IMAGES_DOWNLOAD_LINK, path=zip_path)
    else:
        logger.info("File '%s' already exists", zip_path)

    logger.info("Unpacking images...")
    etau.extract_zip(zip_path, outdir=scratch_dir, delete_zip=False)

    return images_dir


def _download_splits(scratch_dir):
    zip_path = Path(scratch_dir) / "lists.zip"
    if not zip_path.exists():
        logger.info(f"Downloading split info to '{zip_path}'")
        etaw.download_google_drive_file(_LISTS_DOWNLOAD_LINK, path=zip_path)

    else:
        logger.info(f"Directory '{zip_path}' already exists")

    logger.info("Unpacking images...")
    etau.extract_zip(zip_path, outdir=scratch_dir, delete_zip=False)

    list_path = Path(str(zip_path).replace(".zip", ""))
    test_path = list_path / "test.csv"
    val_path = list_path / "val.csv"
    train_path = list_path / "train.csv"

    return test_path, val_path, train_path


def _load_split_info(split_path):
    return pd.read_csv(split_path)
