"""
Utilities for working with the
`Caltech 101 <https://data.caltech.edu/records/mzrjq-6wc02>` and
`Caltech 256 <https://data.caltech.edu/records/nyy15-4j048>` datasets.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import shutil

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.types as fot
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


_CALTECH_101_URL = "https://data.caltech.edu/records/mzrjq-6wc02/files/caltech-101.zip?download=1"
_CALTECH_256_URL = "https://data.caltech.edu/records/nyy15-4j048/files/256_ObjectCategories.tar?download=1"


def download_caltech101_dataset(dataset_dir, scratch_dir=None):
    """Downloads the Caltech 101 dataset.

    See :ref:`this page <ImageClassificationDirectoryTree-import>` for the
    format in which ``dataset_dir`` will be arranged.

    Args:
        dataset_dir: the directory in which to construct the dataset
        scratch_dir (None): a scratch directory to use to download any
            necessary temporary files

    Returns:
        a tuple of:

        -   num_samples: the total number of downloaded images
        -   classes: the list of all classes
        -   did_download: whether any content was downloaded (True) or if all
            necessary files were already downloaded (False)
    """
    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")

    did_download = False

    archive_path = os.path.join(scratch_dir, "caltech-101.zip")
    tar_path = os.path.join(
        scratch_dir, "caltech-101", "101_ObjectCategories.tar.gz"
    )
    dir_path = os.path.join(scratch_dir, "caltech-101", "101_ObjectCategories")

    if not os.path.isfile(archive_path):
        logger.info("Downloading dataset...")
        etaw.download_file(_CALTECH_101_URL, path=archive_path)
        did_download = True
    else:
        logger.info("Using existing archive '%s'", archive_path)

    logger.info("Extracting dataset...")
    etau.extract_archive(archive_path)
    etau.extract_archive(tar_path)

    _move_dir(dir_path, dataset_dir)

    # There is an extraneous item in the raw download...

    try:
        etau.delete_file(os.path.join(dataset_dir, "BACKGROUND_Google", "tmp"))
    except:
        pass

    # We must always delete `scratch_dir` because it would be confused as a
    # class folder
    etau.delete_dir(scratch_dir)

    logger.info("Parsing dataset metadata")
    dataset_type = fot.ImageClassificationDirectoryTree()
    importer = foud.ImageClassificationDirectoryTreeImporter
    classes = importer._get_classes(dataset_dir)
    num_samples = importer._get_num_samples(dataset_dir)
    logger.info("Found %d samples", num_samples)

    return num_samples, classes, did_download


def download_caltech256_dataset(dataset_dir, scratch_dir=None):
    """Downloads the Caltech 256 dataset.

    See :ref:`this page <ImageClassificationDirectoryTree-import>` for the
    format in which ``dataset_dir`` will be arranged.

    Args:
        dataset_dir: the directory in which to construct the dataset
        scratch_dir (None): a scratch directory to use to download any
            necessary temporary files

    Returns:
        a tuple of:

        -   num_samples: the total number of downloaded images
        -   classes: the list of all classes
        -   did_download: whether any content was downloaded (True) or if all
            necessary files were already downloaded (False)
    """
    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")

    did_download = False

    archive_path = os.path.join(scratch_dir, "256_ObjectCategories.tar")
    dir_path = os.path.join(scratch_dir, "256_ObjectCategories")

    if not os.path.isfile(archive_path):
        logger.info("Downloading dataset...")
        etaw.download_file(_CALTECH_256_URL, path=archive_path)
        did_download = True
    else:
        logger.info("Using existing archive '%s'", archive_path)

    logger.info("Extracting dataset...")
    etau.extract_archive(archive_path)

    _move_dir(dir_path, dataset_dir)

    # There are two extraneous items in the raw download...

    try:
        etau.delete_dir(os.path.join(dataset_dir, "056.dog", "greg"))
    except:
        pass

    try:
        etau.delete_file(os.path.join(dataset_dir, "198.spider", "RENAME2"))
    except:
        pass

    # We must always delete `scratch_dir` because it would be confused as a
    # class folder
    etau.delete_dir(scratch_dir)

    # Normalize labels
    logger.info("Normalizing labels")
    for old_label in etau.list_subdirs(dataset_dir):
        new_label = old_label.split(".", 1)[1]
        if new_label.endswith("-101"):
            new_label = new_label[:-4]

        etau.move_dir(
            os.path.join(dataset_dir, old_label),
            os.path.join(dataset_dir, new_label),
        )

    logger.info("Parsing dataset metadata")
    dataset_type = fot.ImageClassificationDirectoryTree()
    importer = foud.ImageClassificationDirectoryTreeImporter
    classes = importer._get_classes(dataset_dir)
    num_samples = importer._get_num_samples(dataset_dir)
    logger.info("Found %d samples", num_samples)

    return num_samples, classes, did_download


def _move_dir(src, dst):
    for f in os.listdir(src):
        _dst = os.path.join(dst, f)
        if os.path.isfile(_dst):
            os.remove(_dst)
        elif os.path.isdir(_dst):
            shutil.rmtree(_dst, ignore_errors=True)

        shutil.move(os.path.join(src, f), dst)
