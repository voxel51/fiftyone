"""
Utilities for working with the `Balanced Faces in the Wild dataset <https://github.com/visionjo/facerec-bias-bfw>`_.

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

import fiftyone.core.utils as fou

logger = logging.getLogger(__name__)


def download_bfw_dataset(dataset_dir, scratch_dir=None, cleanup=False):
    """Downloads and extracts the Balanced Faces in the Wild dataset.

    Any existing files are not re-downloaded.

    Args:
        dataset_dir: the directory to output the final dataset
        scratch_dir (None): a scratch directory to use to store temporary files
        cleanup (True): whether to cleanup the scratch directory after
            extraction
    """
    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")

    # Download dataset
    images_dir = _download_images(scratch_dir)
    pairs_path, meta_path = _download_lists(scratch_dir)

    logger.info("Images and lists are ready!")
    logger.info(
        f"Images: {images_dir}\nPairs: {pairs_path}\nMeta: {meta_path}"
    )

    if cleanup:
        etau.delete_dir(scratch_dir)


_IMAGES_DOWNLOAD_LINK = "1tD8Z8ewS-bi5kG1gXaVyZoOtzw81lrS5"
_LISTS_DOWNLOAD_LINK = "12Y6CYz07JBq2fXeN-EO01dYbkC9Ic-Tp"


def _download_images(scratch_dir):
    zip_path = Path(scratch_dir) / "data.zip"
    images_dir = zip_path.parent() / "bfw"

    if not zip_path.exists():
        logger.info(f"Downloading dataset to '{zip_path}'")
        etaw.download_google_drive_file(
            _IMAGES_DOWNLOAD_LINK, path=str(zip_path)
        )
    else:
        logger.info(f"File '{zip_path}' already exists")

    logger.info("Unpacking images...")
    etau.extract_zip(str(zip_path), outdir=str(images_dir), delete_zip=False)

    return str(images_dir)


def _download_lists(scratch_dir):
    zip_path = Path(scratch_dir) / "lists.zip"

    if not zip_path.exists():
        logger.info(
            f"Downloading pair list and sample meta info to '{zip_path}'"
        )
        etaw.download_google_drive_file(_LISTS_DOWNLOAD_LINK, path=zip_path)
    else:
        logger.info(f"File '{zip_path}' already exists")

    logger.info("Unpacking images...")
    etau.extract_zip(zip_path, outdir=scratch_dir, delete_zip=False)

    list_path = Path(str(zip_path).replace(".zip", ""))
    pairs_path = list_path / "pairs.csv"
    meta_path = list_path / "meta.csv"

    return pairs_path, meta_path


def _load_split_info(split_path):
    return pd.read_csv(split_path)
