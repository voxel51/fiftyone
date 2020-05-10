"""
The FiftyOne Dataset Zoo.

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


# This list is updated when __init_zoo_datasets__() is called
AVAILABLE_DATASETS = {}


def __init_zoo_datasets__():
    # Imports datasets made available by the TensorFlow backend
    if fo.config.default_ml_backend == "tensorflow":
        import fiftyone.zoo.tf  # pylint: disable=unused-import

    # Imports datasets made available by the Torch backend
    if fo.config.default_ml_backend == "torch":
        import fiftyone.zoo.torch  # pylint: disable=unused-import


def list_zoo_datasets():
    """Returns the list of available datasets in the FiftyOne Dataset Zoo.

    Returns:
        a list of dataset names
    """
    __init_zoo_datasets__()
    return list(AVAILABLE_DATASETS.keys())


def list_downloaded_zoo_datasets(base_dir=None):
    """Returns information about the zoo datasets that have been downloaded to
    the given base directory.

    Args:
        base_dir (None): the base directory to search. By default,
            ``fo.config.default_dataset_dir`` is used, which is where all Zoo
            datasets are downloaded, by default

    Returns:
        a dict of the following form::

            {
                # Datasets with splits
                <name>: {
                    <split>: (dataset_dir, ZooDatasetInfo)
                    }
                },
                ...

                # Datasets with no splits
                <name>: (dataset_dir, ZooDatasetInfo),
                ...
            }
    """
    if base_dir is None:
        base_dir = fo.config.default_dataset_dir

    zoo_datasets = {}
    found_datasets = defaultdict(dict)
    for sub_dir in etau.list_subdirs(base_dir, recursive=True):
        # We're looking for subdirs of the form `<name>` or `<name>/<split>`
        chunks = sub_dir.split(os.path.sep)
        if len(chunks) > 2:
            continue

        name = chunks[0]
        split = chunks[1] if len(chunks) == 2 else None

        try:
            if name not in zoo_datasets:
                zoo_datasets[name] = _get_zoo_dataset(name)

            zoo_dataset = zoo_datasets[name]
            dataset_dir = os.path.join(base_dir, sub_dir)
            info = zoo_dataset.load_dataset_info(dataset_dir)

            if split is not None:
                found_datasets[name][split] = (dataset_dir, info)
            else:
                found_datasets[name] = (dataset_dir, info)
        except:
            pass

    return dict(found_datasets)


def download_zoo_dataset(name, split=None, dataset_dir=None):
    """Downloads the dataset of the given name from the FiftyOne Dataset Zoo.

    If the dataset already exists in the specified directory, it is not
    redownloaded.

    Args:
        name: the name of the zoo dataset to download. Call
            :func:`list_zoo_datasets` to see the available datasets
        split (None): an optional split of the dataset to download, if
            applicable. Typical values are ``("train", "validation", "test")``.
            If not specified, the default split is download. Consult the
            documentation for the :class:`ZooDataset` you specified to see the
            supported splits
        dataset_dir (None): the directory into which to download the dataset.
            By default, :func:`fiftyone.core.dataset.get_default_dataset_dir`
            is used

    Returns:
        info: the :class:`fiftyone.zoo.ZooDatasetInfo` for the dataset
        dataset_dir: the directory containing the dataset
    """
    zoo_dataset, split, dataset_dir = _parse_dataset_details(
        name, split, dataset_dir
    )
    info = zoo_dataset.download_and_prepare(dataset_dir, split=split)
    return info, dataset_dir


def load_zoo_dataset(
    name, split=None, dataset_dir=None, download_if_necessary=True,
):
    """Loads the dataset of the given name from the FiftyOne Dataset Zoo as
    a :class:`fiftyone.core.dataset.Dataset`.

    By default, the dataset will be downloaded if it does not already exist in
    the specified directory.

    Args:
        name: the name of the zoo dataset to load. Call
            :func:`list_zoo_datasets` to see the available datasets
        split (None): an optional split of the dataset to load, if applicable.
            Typical values are ``("train", "validation", "test")``. If not
            specified, the default split is loaded. Consult the documentation
            for the :class:`ZooDataset` you specified to see the supported
            splits
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
            name, split=split, dataset_dir=dataset_dir
        )
    else:
        zoo_dataset, _, dataset_dir = _parse_dataset_details(
            name, split, dataset_dir
        )
        info = zoo_dataset.load_dataset_info(dataset_dir)

    if issubclass(info.dataset_type, fot.ImageClassificationDataset):
        return fo.Dataset.from_image_classification_dataset(
            dataset_dir, name=info.name
        )

    if issubclass(info.dataset_type, fot.ImageDetectionDataset):
        return fo.Dataset.from_image_detection_dataset(
            dataset_dir, name=info.name
        )

    if issubclass(info.dataset_type, fot.ImageLabelsDataset):
        return fo.Dataset.from_image_labels_dataset(
            dataset_dir, name=info.name
        )

    raise ValueError(
        "Unsupported dataset type '%s'"
        % etau.get_class_name(info.dataset_type)
    )


def _get_zoo_dataset(name):
    __init_zoo_datasets__()

    if name.lower() not in AVAILABLE_DATASETS:
        raise ValueError("Dataset '%s' not found in the zoo" % name)

    zoo_dataset_cls = AVAILABLE_DATASETS[name.lower()]
    return zoo_dataset_cls()


def _parse_dataset_details(name, split, dataset_dir):
    zoo_dataset = _get_zoo_dataset(name)

    if split is None:
        split = zoo_dataset.default_split
        if split is not None:
            logger.info("Using default split '%s'", split)

    if dataset_dir is None:
        dataset_dir = fod.get_default_dataset_dir(
            zoo_dataset.name, split=split
        )

    return zoo_dataset, split, dataset_dir


class ZooDatasetInfo(etas.Serializable):
    """Class containing info about a dataset in the FiftyOne Dataset Zoo.

    Args:
        name: the name of the dataset
        zoo_dataset: the :class:`ZooDataset` class
        split: the dataset split
        num_samples: the number of samples in the dataset
        format: the :class:`fiftyone.types.DatasetType` of the dataset
        labels_map (None): an optional dict mapping class IDs to label strings
    """

    def __init__(
        self, name, zoo_dataset, split, num_samples, format, labels_map=None
    ):
        self.name = name
        self.zoo_dataset = etau.get_class_name(zoo_dataset)
        self.split = split
        self.num_samples = num_samples
        self.format = etau.get_class_name(format)
        self.labels_map = labels_map

        self._dataset_type = format

    @property
    def dataset_type(self):
        """The :class:`fiftyone.types.DatasetType` of the dataset."""
        return self._dataset_type

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        _attrs = ["name", "zoo_dataset", "split", "num_samples", "format"]
        if self.labels_map is not None:
            _attrs.append("labels_map")

        return _attrs

    @classmethod
    def from_dict(cls, d):
        """Loads a :class:`ZooDatasetInfo` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a :class:`ZooDatasetInfo`
        """
        labels_map = d.get("labels_map", None)
        return cls(
            d["name"],
            etau.get_class(d["zoo_dataset"]),
            d["split"],
            d["num_samples"],
            etau.get_class(d["format"]),
            labels_map=labels_map,
        )


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
    def default_split(self):
        """The default split for the dataset, or None if the dataset does
        not have splits.
        """
        raise NotImplementedError("subclasses must implement default_split")

    def load_dataset_info(self, dataset_dir):
        """Loads the :class:`ZooDatasetInfo` from the given dataset directory.

        Args:
            dataset_dir: the directory in which to construct the dataset

        Returns:
            the :class:`ZooDatasetInfo` for the dataset
        """
        info_path = self._get_info_path(dataset_dir)
        return ZooDatasetInfo.from_json(info_path)

    def download_and_prepare(self, dataset_dir, split=None):
        """Downloads the dataset and prepares it for use in the given directory
        as an ``eta.core.datasets.LabeledDataset``.

        If the :class:`ZooDatasetInfo` file already exists in the directory,
        this method assumes that the dataset is already downloaded, and does
        nothing.

        Args:
            dataset_dir: the directory in which to construct the dataset
            split (None): the dataset split to download, if applicable. If
                omitted, the default split is downloaded

        Returns:
            the :class:`ZooDatasetInfo` for the dataset
        """
        info_path = self._get_info_path(dataset_dir)

        if os.path.isfile(info_path):
            logger.debug("ZooDatasetInfo file '%s' already exists", info_path)
            logger.info("Dataset already downloaded")
            return self.load_dataset_info(dataset_dir)

        if split is None:
            split = self.default_split
            logger.info("Using default split '%s'", split)

        if split is not None and split not in self.supported_splits:
            raise ValueError(
                "Invalid split '%s'; supported values are %s"
                % (split, self.supported_splits)
            )

        logger.info("Downloading dataset to '%s'", dataset_dir)
        info = self._download_and_prepare(dataset_dir, split)

        info.write_json(info_path, pretty_print=True)
        logger.info("Dataset info written to '%s'", info_path)

        return info

    def _download_and_prepare(self, dataset_dir, split):
        """Internal implementation of downloading the dataset and preparing it
        for use in the given directory as an
        ``eta.core.datasets.LabeledDataset``.

        Args:
            dataset_dir: the directory in which to construct the dataset
            split: the dataset split to download, or None if not applicable

        Returns:
            the :class:`ZooDatasetInfo` for the dataset
        """
        raise NotImplementedError(
            "subclasses must implement download_and_prepare()"
        )

    @staticmethod
    def _get_info_path(dataset_dir):
        return os.path.join(dataset_dir, "info.json")
