"""
Utilities for working with the
`Labeled Faces in the Wild dataset <http://vis-www.cs.umass.edu/lfw>`_.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def download_lfw_dataset(dataset_dir, scratch_dir=None, cleanup=True):
    """Downloads and extracts the Labeled Faces in the Wild dataset.

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
    images_dir = _download_videos(scratch_dir)
    test_path, train_path = _download_splits(scratch_dir)

    # Reorganize files into splits
    logger.info("Reorganizing images into splits...")

    # Test split
    logger.info("Creating test split...")
    test_folders = _load_split_info(test_path)
    with fou.ProgressBar() as pb:
        for test_folder in pb(test_folders):
            indir = os.path.join(images_dir, test_folder)
            outdir = os.path.join(dataset_dir, "test", test_folder)
            etau.move_dir(indir, outdir)

    # Train split
    logger.info("Creating train split...")
    train_folders = _load_split_info(train_path)
    with fou.ProgressBar() as pb:
        for train_folder in pb(train_folders):
            indir = os.path.join(images_dir, train_folder)
            outdir = os.path.join(dataset_dir, "train", train_folder)
            etau.move_dir(indir, outdir)

    if cleanup:
        etau.delete_dir(scratch_dir)


_VIDEOS_DOWNLOAD_LINK = "http://vis-www.cs.umass.edu/lfw/lfw.tgz"
_TEST_DOWNLOAD_LINK = "http://vis-www.cs.umass.edu/lfw/peopleDevTest.txt"
_TRAIN_DOWNLOAD_LINK = "http://vis-www.cs.umass.edu/lfw/peopleDevTrain.txt"


def _download_videos(scratch_dir):
    tar_path = os.path.join(scratch_dir, "lfw.tgz")
    images_dir = os.path.join(scratch_dir, "lfw")

    if not os.path.exists(tar_path):
        logger.info("Downloading dataset to '%s'", tar_path)
        etaw.download_file(_VIDEOS_DOWNLOAD_LINK, path=tar_path, verify=False)
    else:
        logger.info("File '%s' already exists", tar_path)

    logger.info("Unpacking images...")
    etau.extract_tar(tar_path, outdir=scratch_dir, delete_tar=False)

    return images_dir


def _download_splits(scratch_dir):
    test_path = os.path.join(scratch_dir, "peopleDevTest.txt")
    train_path = os.path.join(scratch_dir, "peopleDevTrain.txt")

    if not os.path.exists(test_path):
        logger.info("Downloading test split info to '%s'", test_path)
        etaw.download_file(_TEST_DOWNLOAD_LINK, path=test_path, verify=False)
    else:
        logger.info("File '%s' already exists", test_path)

    if not os.path.exists(train_path):
        logger.info("Downloading train split info to '%s'", train_path)
        etaw.download_file(_TRAIN_DOWNLOAD_LINK, path=train_path, verify=False)
    else:
        logger.info("File '%s' already exists", train_path)

    return test_path, train_path


def _load_split_info(split_path):
    with open(split_path, "r") as f:
        return [
            l.strip().split()[0]
            for idx, l in enumerate(f.readlines())
            if idx > 0  # first line contains count
        ]
