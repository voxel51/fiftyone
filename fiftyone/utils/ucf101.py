"""
Utilities for working with the
`UCF101 dataset <https://www.crcv.ucf.edu/research/data-sets/ucf101>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def download_ucf101_dataset(
    dataset_dir, scratch_dir=None, fold=1, cleanup=True
):
    """Downloads and extracts the UCF101 dataset.

    Any existing files are not re-downloaded.

    Args:
        dataset_dir: the directory to output the final dataset
        scratch_dir (None): a scratch directory to use to store temporary files
        fold (1): the test/train fold to use to arrange the files on disk. The
            supported values are ``(1, 2, 3)``
        cleanup (True): whether to cleanup the scratch directory after
            extraction
    """
    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")

    if fold not in (1, 2, 3):
        raise ValueError("fold must be (1, 2, 3); found %s" % fold)

    # Download dataset
    videos_dir = _download_videos(scratch_dir)
    splits_dir = _download_splits(scratch_dir)

    # Reorganize files into splits
    logger.info("Reorganizing videos into splits via fold %d...", fold)

    # Test split
    logger.info("Creating test split...")
    test_split_path = os.path.join(splits_dir, "testlist%02d.txt" % fold)
    test_filenames = _load_split_info(test_split_path)
    with fou.ProgressBar() as pb:
        for test_filename in pb(test_filenames):
            inpath = os.path.join(videos_dir, test_filename)
            outpath = os.path.join(dataset_dir, "test", test_filename)
            etau.move_file(inpath, outpath)

    # Train split
    logger.info("Creating train split...")
    train_split_path = os.path.join(splits_dir, "trainlist%02d.txt" % fold)
    train_filenames = _load_split_info(train_split_path)
    with fou.ProgressBar() as pb:
        for train_filename in pb(train_filenames):
            inpath = os.path.join(videos_dir, train_filename)
            outpath = os.path.join(dataset_dir, "train", train_filename)
            etau.move_file(inpath, outpath)

    if cleanup:
        etau.delete_dir(scratch_dir)


_VIDEOS_DOWNLOAD_LINK = (
    "https://www.crcv.ucf.edu/datasets/human-actions/ucf101/UCF101.rar"
)

_SPLITS_DOWNLOAD_LINK = (
    "https://www.crcv.ucf.edu/wp-content/uploads/2019/03/"
    "UCF101TrainTestSplits-RecognitionTask.zip"
)


def _download_videos(scratch_dir):
    rar_path = os.path.join(scratch_dir, "UCF101.rar")
    videos_dir = os.path.join(scratch_dir, "UCF-101")

    if not os.path.exists(rar_path):
        logger.info("Downloading dataset to '%s'", rar_path)
        etaw.download_file(_VIDEOS_DOWNLOAD_LINK, path=rar_path, verify=False)
    else:
        logger.info("File '%s' already exists", rar_path)

    logger.info("Unpacking videos...")
    etau.extract_rar(rar_path, outdir=scratch_dir, delete_rar=False)

    return videos_dir


def _download_splits(scratch_dir):
    zip_path = os.path.join(
        scratch_dir, "UCF101TrainTestSplits-RecognitionTask.zip"
    )
    splits_dir = os.path.join(scratch_dir, "ucfTrainTestlist")

    if not os.path.exists(zip_path):
        logger.info("Downloading split info to '%s'", zip_path)
        etaw.download_file(_SPLITS_DOWNLOAD_LINK, path=zip_path, verify=False)
    else:
        logger.info("File '%s' already exists", zip_path)

    logger.info("Unpacking split info...")
    etau.extract_zip(zip_path, outdir=scratch_dir, delete_zip=False)

    return splits_dir


def _load_split_info(split_path):
    with open(split_path, "r") as f:
        return [l.strip().split()[0] for l in f.readlines()]
