"""
Utilities for working with the
`HMDB51 dataset <https://serre-lab.clps.brown.edu/resource/hmdb-a-large-human-motion-database>`_.

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


def download_hmdb51_dataset(
    dataset_dir, scratch_dir=None, fold=1, cleanup=True
):
    """Downloads and extracts the HMDB51 dataset.

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

    # Parse splits info
    split_end = "_test_split%d.txt" % fold
    split_map = {
        os.path.basename(path)[: -len(split_end)]: path
        for path in etau.list_files(splits_dir, abs_paths=True)
        if path.endswith(split_end)
    }

    # Reorganize files into splits
    logger.info("Reorganizing videos into splits via fold %d...", fold)
    with fou.ProgressBar() as pb:
        for label, split_path in pb(split_map.items()):
            train_filenames, test_filenames = _load_split_info(split_path)

            # Train split
            for filename in train_filenames:
                inpath = os.path.join(videos_dir, label, filename)
                outpath = os.path.join(dataset_dir, "train", label, filename)
                etau.move_file(inpath, outpath)

            # Test split
            for filename in test_filenames:
                inpath = os.path.join(videos_dir, label, filename)
                outpath = os.path.join(dataset_dir, "test", label, filename)
                etau.move_file(inpath, outpath)

            # Other
            indir = os.path.join(videos_dir, label)
            outdir = os.path.join(dataset_dir, "other", label)
            etau.move_dir(indir, outdir)

    if cleanup:
        etau.delete_dir(scratch_dir)


_VIDEOS_DOWNLOAD_LINK = (
    "http://serre-lab.clps.brown.edu/wp-content/uploads/2013/10/hmdb51_org.rar"
)

_SPLITS_DOWNLOAD_LINK = (
    "http://serre-lab.clps.brown.edu/wp-content/uploads/2013/10/"
    "test_train_splits.rar"
)


def _download_videos(scratch_dir):
    rar_path = os.path.join(scratch_dir, "hmdb51_org.rar")
    videos_dir = os.path.join(scratch_dir, "videos")

    if not os.path.exists(rar_path):
        logger.info("Downloading dataset to '%s'", rar_path)
        etaw.download_file(_VIDEOS_DOWNLOAD_LINK, path=rar_path)
    else:
        logger.info("File '%s' already exists", rar_path)

    logger.info("Unpacking videos...")
    etau.extract_rar(rar_path, outdir=videos_dir, delete_rar=False)
    with fou.ProgressBar() as pb:
        for class_rar_path in pb(etau.list_files(videos_dir, abs_paths=True)):
            etau.extract_rar(
                class_rar_path, outdir=videos_dir, delete_rar=False
            )

    return videos_dir


def _download_splits(scratch_dir):
    rar_path = os.path.join(scratch_dir, "test_train_splits.rar")
    splits_dir = os.path.join(scratch_dir, "testTrainMulti_7030_splits")

    if not os.path.exists(rar_path):
        logger.info("Downloading split info to '%s'", rar_path)
        etaw.download_file(_SPLITS_DOWNLOAD_LINK, path=rar_path)
    else:
        logger.info("File '%s' already exists", rar_path)

    logger.info("Unpacking split info...")
    etau.extract_rar(rar_path, outdir=scratch_dir, delete_rar=False)

    return splits_dir


def _load_split_info(split_path):
    train = []
    test = []
    with open(split_path, "r") as f:
        for line in f.readlines():
            filename, split = line.strip().rsplit(maxsplit=1)
            if split == "1":
                train.append(filename)
            elif split == "2":
                test.append(filename)

    return train, test
