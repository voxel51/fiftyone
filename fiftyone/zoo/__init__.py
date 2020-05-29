"""
The FiftyOne Dataset Zoo.

This package defines a collection of open source datasets made available for
download via FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from collections import defaultdict
import logging
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.types as fot


logger = logging.getLogger(__name__)


# Initialized the first time `_get_zoo_datasets()` is called
__ZOO_DATASETS__ = None


def list_zoo_datasets():
    """Returns the list of available datasets in the FiftyOne Dataset Zoo.

    Returns:
        a list of dataset names
    """
    datasets = set()
    for d in itervalues(_get_zoo_datasets()):
        datasets |= d.keys()

    return list(datasets)


def list_downloaded_zoo_datasets(base_dir=None):
    """Returns information about the zoo datasets that have been downloaded.

    Args:
        base_dir (None): the base directory to search. By default,
            ``fo.config.default_dataset_dir`` is used

    Returns:
        a dict mapping dataset names to (dataset dir, :class:`ZooDatasetInfo`)
        tuples
    """
    if base_dir is None:
        base_dir = fo.config.default_dataset_dir

    try:
        sub_dirs = etau.list_subdirs(base_dir)
    except OSError:
        sub_dirs = []

    downloaded_datasets = {}
    for sub_dir in sub_dirs:
        try:
            dataset_dir = os.path.join(base_dir, sub_dir)
            info = ZooDataset.load_info(dataset_dir)
            downloaded_datasets[info.name] = (dataset_dir, info)
        except:
            pass

    return downloaded_datasets


def download_zoo_dataset(name, splits=None, dataset_dir=None):
    """Downloads the dataset of the given name from the FiftyOne Dataset Zoo.

    Any dataset splits that already exist in the specified directory are not
    re-downloaded.

    Args:
        name: the name of the zoo dataset to download. Call
            :func:`list_zoo_datasets` to see the available datasets
        splits (None): an optional list of splits to download, if applicable.
            Typical values are ``("train", "validation", "test")``. If not
            specified, all available splits are downloaded. Consult the
            documentation for the :class:`ZooDataset` you specified to see the
            supported splits
        dataset_dir (None): the directory into which to download the dataset.
            By default, :func:`fiftyone.core.dataset.get_default_dataset_dir`
            is used

    Returns:
        info: the :class:`fiftyone.zoo.ZooDatasetInfo` for the dataset
        dataset_dir: the directory containing the dataset
    """
    zoo_dataset, dataset_dir = _parse_dataset_details(name, dataset_dir)
    info = zoo_dataset.download_and_prepare(dataset_dir, splits=splits)
    return info, dataset_dir


def load_zoo_dataset(
    name, splits=None, dataset_dir=None, download_if_necessary=True,
):
    """Loads the dataset of the given name from the FiftyOne Dataset Zoo as
    a :class:`fiftyone.core.dataset.Dataset`.

    By default, the dataset will be downloaded if it does not already exist in
    the specified directory.

    Args:
        name: the name of the zoo dataset to load. Call
            :func:`list_zoo_datasets` to see the available datasets
        splits (None): an optional list of splits to load, if applicable.
            Typical values are ``("train", "validation", "test")``. If not
            specified, all available splits are loaded. Consult the
            documentation for the :class:`ZooDataset` you specified to see the
            supported splits
        dataset_dir (None): the directory in which the dataset is stored or
            will be downloaded. By default,
            :func:`fiftyone.core.dataset.get_default_dataset_dir` is used
        download_if_necessary (True): whether to download the dataset if it is
            not found in the specified dataset directory

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    if download_if_necessary:
        info, dataset_dir = download_zoo_dataset(
            name, splits=splits, dataset_dir=dataset_dir
        )
        zoo_dataset = info.zoo_dataset
    else:
        zoo_dataset, dataset_dir = _parse_dataset_details(name, dataset_dir)
        info = zoo_dataset.load_info(dataset_dir)

    name = zoo_dataset.name
    if splits is not None:
        name += "-" + "-".join(splits)

    if splits is None and zoo_dataset.has_splits:
        splits = zoo_dataset.supported_splits

    dataset = fo.Dataset(name)
    format = info.format

    if splits:
        for split in splits:
            split_dir = zoo_dataset.get_split_dir(dataset_dir, split)
            tags = [split]

            logger.info("Loading '%s' split '%s'", zoo_dataset.name, split)
            if issubclass(format, fot.ImageClassificationDataset):
                dataset.add_image_classification_dataset(split_dir, tags=tags)
            elif issubclass(format, fot.ImageDetectionDataset):
                dataset.add_image_detection_dataset(split_dir, tags=tags)
            elif issubclass(format, fot.ImageLabelsDataset):
                dataset.add_image_labels_dataset(split_dir, tags=tags)
            else:
                raise ValueError(
                    "Unsupported dataset format '%s'"
                    % etau.get_class_name(format)
                )
    else:
        logger.info("Loading '%s'", zoo_dataset.name)
        if issubclass(format, fot.ImageClassificationDataset):
            dataset.add_image_classification_dataset(dataset_dir)
        elif issubclass(format, fot.ImageDetectionDataset):
            dataset.add_image_detection_dataset(dataset_dir)
        elif issubclass(format, fot.ImageLabelsDataset):
            dataset.add_image_labels_dataset(dataset_dir)
        else:
            raise ValueError(
                "Unsupported dataset format '%s'" % etau.get_class_name(format)
            )

    return dataset


def load_zoo_dataset_info(name, dataset_dir=None):
    """Loads the :class:`ZooDatasetInfo` for the specified dataset.

    The dataset must be downloaded. Use :func:`download_zoo_dataset` to
    download datasets.

    Args:
        name: the name of the zoo dataset
        dataset_dir (None): the directory in which the dataset is stored. By
            default, :func:`fiftyone.core.dataset.get_default_dataset_dir` is
            used

    Returns:
        the :class:`ZooDatasetInfo` for the dataset

    Raises:
        OSError: if the dataset has not been downloaded
    """
    zoo_dataset, dataset_dir = _parse_dataset_details(name, dataset_dir)
    try:
        return zoo_dataset.load_info(dataset_dir)
    except OSError:
        raise OSError("Dataset '%s' not found at '%s'" % (name, dataset_dir))


def _get_zoo_dataset(name):
    all_datasets = _get_zoo_datasets()
    for source in _get_zoo_dataset_sources():
        datasets = all_datasets.get(source, {})
        if name in datasets:
            zoo_dataset_cls = datasets[name]
            return zoo_dataset_cls()

    raise ValueError("Dataset '%s' not found in the zoo" % name)


def _get_zoo_datasets():
    global __ZOO_DATASETS__

    if __ZOO_DATASETS__ is None:
        from fiftyone.zoo.torch import AVAILABLE_DATASETS as TORCH_DATASETS
        from fiftyone.zoo.tf import AVAILABLE_DATASETS as TF_DATASETS

        __ZOO_DATASETS__ = {
            "torch": TORCH_DATASETS,
            "tensorflow": TF_DATASETS,
        }

    return __ZOO_DATASETS__


def _get_zoo_dataset_sources():
    all_datasets = _get_zoo_datasets()
    all_sources = set(all_datasets.keys())
    default_source = fo.config.default_ml_backend

    try:
        all_sources.remove(default_source)
        return [default_source] + list(all_sources)
    except KeyError:
        return list(all_sources)


def _parse_dataset_details(name, dataset_dir):
    zoo_dataset = _get_zoo_dataset(name)

    if dataset_dir is None:
        dataset_dir = fod.get_default_dataset_dir(zoo_dataset.name)

    return zoo_dataset, dataset_dir


class ZooDatasetInfo(etas.Serializable):
    """Class containing info about a dataset in the FiftyOne Dataset Zoo.

    Args:
        zoo_dataset: the :class:`ZooDataset` instance for the dataset
        format: the :class:`fiftyone.types.DatasetType` of the dataset
        num_samples: the total number of samples in all downloaded splits of
            the dataset
        downloaded_splits (None): a dict of :class:`ZooDatasetSplitInfo`
            instances describing the downloaded splits of the dataset, if
            applicable
        classes (None): a list of class label strings
    """

    def __init__(
        self,
        zoo_dataset,
        format,
        num_samples,
        downloaded_splits=None,
        classes=None,
    ):
        # Parse inputs
        if zoo_dataset.has_splits and downloaded_splits is None:
            downloaded_splits = {}

        self.zoo_dataset = zoo_dataset
        self.format = format
        self.num_samples = num_samples
        self.downloaded_splits = downloaded_splits
        self.classes = classes

    @property
    def name(self):
        """The name of the dataset."""
        return self.zoo_dataset.name

    @property
    def zoo_dataset_cls(self):
        """The fully-qualified class string for the :class:`ZooDataset` of the
        dataset.
        """
        return etau.get_class_name(self.zoo_dataset)

    @property
    def format_cls(self):
        """The fully-qualified class string for the
        :class:`fiftyone.types.DatasetType` of the dataset.
        """
        return etau.get_class_name(self.format)

    @property
    def supported_splits(self):
        """A tuple of supported splits for the dataset, or None if the dataset
        does not have splits.
        """
        return self.zoo_dataset.supported_splits

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        _attrs = ["name", "zoo_dataset_cls", "format_cls", "num_samples"]
        if self.downloaded_splits is not None:
            _attrs.append("downloaded_splits")
        if self.classes is not None:
            _attrs.append("classes")

        return _attrs

    @classmethod
    def from_dict(cls, d):
        """Loads a :class:`ZooDatasetInfo` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a :class:`ZooDatasetInfo`
        """
        zoo_dataset_cls = etau.get_class(d["zoo_dataset_cls"])
        zoo_dataset = zoo_dataset_cls()

        format_cls = etau.get_class(d["format_cls"])

        downloaded_splits = d.get("downloaded_splits", None)
        if downloaded_splits is not None:
            downloaded_splits = {
                k: ZooDatasetSplitInfo.from_dict(v)
                for k, v in iteritems(downloaded_splits)
            }

        return cls(
            zoo_dataset,
            format_cls,
            d["num_samples"],
            downloaded_splits=downloaded_splits,
            classes=d.get("classes", None),
        )


class ZooDatasetSplitInfo(etas.Serializable):
    """Class containing info about a split of a dataset in the FiftyOne Dataset
    Zoo.

    Args:
        split: the name of the split
        num_samples: the number of samples in the split
    """

    def __init__(self, split, num_samples):
        self.split = split
        self.num_samples = num_samples

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return ["split", "num_samples"]

    @classmethod
    def from_dict(cls, d):
        """Loads a :class:`ZooDatasetSplitInfo` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a :class:`ZooDatasetSplitInfo`
        """
        return cls(d["split"], d["num_samples"])


class ZooDataset(object):
    """Base class for datasets made available in the FiftyOne Dataset Zoo."""

    @property
    def name(self):
        """The name of the dataset."""
        raise NotImplementedError("subclasses must implement name")

    @property
    def supported_splits(self):
        """A tuple of supported splits for the dataset, or None if the dataset
        does not have splits.
        """
        raise NotImplementedError("subclasses must implement supported_splits")

    @property
    def has_splits(self):
        """Whether the dataset has splits."""
        return self.supported_splits is not None

    @staticmethod
    def load_info(dataset_dir):
        """Loads the :class:`ZooDatasetInfo` from the given dataset directory.

        Args:
            dataset_dir: the directory in which to construct the dataset

        Returns:
            the :class:`ZooDatasetInfo` for the dataset
        """
        info_path = ZooDataset.get_info_path(dataset_dir)
        return ZooDatasetInfo.from_json(info_path)

    @staticmethod
    def get_split_dir(dataset_dir, split):
        """Returns the directory for the given split of the dataset.

        Args:
            dataset_dir: the dataset directory
            split: the dataset split

        Returns:
            the directory that will/does hold the specified split
        """
        return os.path.join(dataset_dir, split)

    @staticmethod
    def get_info_path(dataset_dir):
        """Returns the path to the :class:`ZooDatasetInfo` for the dataset.

        Args:
            dataset_dir: the dataset directory

        Returns:
            the path to the :class:`ZooDatasetInfo`
        """
        return os.path.join(dataset_dir, "info.json")

    def download_and_prepare(self, dataset_dir, splits=None):
        """Downloads the dataset and prepares it for use in the given directory
        as a :class:`fiftyone.types.LabeledDataset`.

        If the requested splits have already been downloaded, they are not
        re-downloaded.

        Args:
            dataset_dir: the directory in which to construct the dataset
            splits (None): an optional list of splits to download, if
                applicable. If omitted, the full dataset is downloaded

        Returns:
            the :class:`ZooDatasetInfo` for the dataset
        """
        # Parse splits
        if splits:
            for split in splits:
                if split not in self.supported_splits:
                    raise ValueError(
                        "Invalid split '%s'; supported values are %s"
                        % (split, self.supported_splits)
                    )
        elif self.has_splits:
            splits = self.supported_splits

        # Load existing ZooDatasetInfo, if available
        info_path = self.get_info_path(dataset_dir)
        if os.path.isfile(info_path):
            info = ZooDatasetInfo.from_json(info_path)
        else:
            info = None

        # Create scratch directory
        scratch_dir = etau.make_temp_dir(basedir=dataset_dir)

        # Download dataset, if necessary
        write_info = False
        if splits:
            # Skip splits that have already been downloaded
            if info is not None:
                _splits = []
                for split in splits:
                    if split in info.downloaded_splits:
                        logger.info("Split '%s' already downloaded", split)
                    else:
                        _splits.append(split)

                splits = _splits

            for split in splits:
                split_dir = self.get_split_dir(dataset_dir, split)
                logger.info("Downloading split '%s' to '%s'", split, split_dir)
                format, num_samples, classes = self._download_and_prepare(
                    split_dir, scratch_dir, split
                )

                # Add split to ZooDatasetInfo
                if info is None:
                    info = ZooDatasetInfo(self, format, 0, classes=classes)

                info.downloaded_splits[split] = ZooDatasetSplitInfo(
                    split, num_samples
                )
                info.num_samples = sum(
                    si.num_samples for si in itervalues(info.downloaded_splits)
                )

                write_info = True
        else:
            if info is not None:
                logger.info("Dataset already downloaded")
            else:
                logger.info("Downloading dataset to '%s'", dataset_dir)
                format, num_samples, classes = self._download_and_prepare(
                    dataset_dir, scratch_dir, None
                )

                # Create ZooDastasetInfo
                info = ZooDatasetInfo(
                    self, format, num_samples, classes=classes
                )
                write_info = True

        # Write ZooDatasetInfo if necessary
        if write_info:
            info.write_json(info_path, pretty_print=True)
            logger.info("Dataset info written to '%s'", info_path)

        # Cleanup scratch directory
        etau.delete_dir(scratch_dir)

        return info

    def _download_and_prepare(self, dataset_dir, scratch_dir, splits):
        """Internal implementation of downloading the dataset and preparing it
        for use in the given directory as a
        class:`fiftyone.types.LabeledDataset`.

        Args:
            dataset_dir: the directory in which to construct the dataset
            scratch_dir: a scratch directory to use to download and prepare
                any required intermediate files
            splits: the list of splits to download, or None if the dataset does
                not have splits

        Returns:
            format: the :class:`fiftyone.types.DatasetType` of the dataset
            num_samples: the number of samples in the split
            classes: an optional list of class label strings
        """
        raise NotImplementedError(
            "subclasses must implement _download_and_prepare()"
        )
