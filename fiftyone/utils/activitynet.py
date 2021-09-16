"""
Utilities for working with the
`ActivityNet <http://activity-net.org/index.html>`
dataset.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class ActivityNetDatasetImporter(foud.LabeledImageDatasetImporter):
    """Base class for importing datasets in ActivityNetDataset format.

    Args:
        dataset_dir: the dataset directory
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load per split. If
            ``classes`` are also specified, only up to the number of samples
            that contain at least one specified class will be loaded.
            By default, all matching samples are loaded
    """

    def __init__(
        self,
        dataset_dir,
        label_types=None,
        classes=None,
        attrs=None,
        image_ids=None,
        include_id=True,
        only_matching=False,
        load_hierarchy=True,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        pass


def download_activitynet_split(
    dataset_dir,
    split,
    classes=None,
    num_workers=None,
    shuffle=None,
    seed=None,
    max_samples=None,
):
    """Utility that downloads full or partial splits of the
    `ActivityNet <http://activity-net.org/index.html>`_. dataset

    See :class:`fiftyone.types.dataset_types.ActivityNetDataset` for the
    format in which ``dataset_dir`` will be arranged.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
        num_workers (None): the number of processes to use when downloading
            individual images. By default, ``multiprocessing.cpu_count()`` is
            used
        shuffle (False): whether to randomly shuffle the order in which samples
            are chosen for partial downloads
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load per split. If
            ``classes`` are also specified, only up to the number of samples
            that contain at least one specified class will be loaded.
            By default, all matching samples are loaded

    Returns:
        a tuple of:

        -   num_samples: the total number of downloaded videos, or ``None`` if
            everything was already downloaded
        -   classes: the list of all classes, or ``None`` if everything was
            already downloaded
        -   did_download: whether any content was downloaded (True) or if all
            necessary files were already downloaded (False)
    """
    return None, None, None
