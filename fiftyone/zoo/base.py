"""
Base definitions of the FiftyOne Dataset Zoo.

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

import logging
import os

import eta.core.datasets as etads
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.experimental.data as fed


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


def load_zoo_dataset(
    name, split=None, dataset_dir=None, download_if_necessary=True,
):
    """Loads the dataset of the given name from the FiftyOne Dataset Zoo as
    a :class:`fiftyone.core.data.Dataset`.

    Args:
        name: the name of the zoo dataset to load. Call
            :func:`list_zoo_datasets` to see the available datasets
        split (None): an optional split of the dataset to load, if applicable.
            Typical values are ``("train", "validation", "test")``. If not
            specified, the default split is loaded. Consult the documentation
            for the :class:`fiftyone.zoo.ZooDataset` you specified to see the
            supported splits
        dataset_dir (None): the directory in which the dataset is stored or
            will be downloaded. By default,
            :func:`fiftyone.core.data.get_default_dataset_dir` is used
        download_if_necessary (True): whether to download the dataset if it is
            not found in the specified dataset directory

    Returns:
        a :class:`fiftyone.core.data.Dataset`
    """
    zoo_dataset = _get_zoo_dataset(name)
    name = zoo_dataset.name  # get the official name

    if split is None:
        split = zoo_dataset.default_split
        if split is not None:
            logger.info("Using default split '%s'", split)

    if dataset_dir is None:
        dataset_dir = fed.get_default_dataset_dir(name, split=split)
        logger.info("Using default dataset directory '%s'", dataset_dir)

    if download_if_necessary:
        zoo_dataset.download_and_prepare(dataset_dir, split=split)

    return fed.from_labeled_image_dataset(dataset_dir, name=name)


def _get_zoo_dataset(name):
    __init_zoo_datasets__()

    if name.lower() not in AVAILABLE_DATASETS:
        raise ValueError("Dataset '%s' not found in the zoo" % name)

    zoo_dataset_cls = AVAILABLE_DATASETS[name.lower()]
    return zoo_dataset_cls()


class ZooDatasetInfo(etas.Serializable):
    """Class containing info about a dataset in the FiftyOne Dataset Zoo."""

    def __init__(
        self, name, zoo_dataset, split, num_samples, format, labels_map=None
    ):
        """Creates a ZooDatasetInfo instance.

        Args:
            name: the name of the dataset
            zoo_dataset: the :class:`ZooDataset` class
            split: the dataset split
            num_samples: the number of samples in the dataset
            format: the class of the dataset on disk
            labels_map (None): an optional dict mapping class IDs to class
                labels
        """
        self.name = name
        self.zoo_dataset = etau.get_class_name(zoo_dataset)
        self.split = split
        self.num_samples = num_samples
        self.format = etau.get_class_name(format)
        self.labels_map = labels_map

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
        """Loads a ZooDatasetInfo from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a ZooDatasetInfo
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
        """
        info_path = os.path.join(dataset_dir, "info.json")

        if os.path.isfile(info_path):
            logger.debug("ZooDatasetInfo file '%s' already exists", info_path)
            logger.info("Dataset already downloaded")
            return

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
