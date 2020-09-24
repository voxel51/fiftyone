"""
The FiftyOne Dataset Zoo.

This package defines a collection of open source datasets made available for
download via FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.dataset as fod


logger = logging.getLogger(__name__)


# Initialized the first time `_get_zoo_datasets()` is called
__ZOO_DATASETS__ = None


def list_zoo_datasets():
    """Returns the list of available datasets in the FiftyOne Dataset Zoo.

    Returns:
        a list of dataset names
    """
    datasets = set()
    all_datasets = _get_zoo_datasets()
    for d in all_datasets.values():
        datasets |= d.keys()

    return sorted(datasets)


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
            if sub_dir == info.name:
                downloaded_datasets[info.name] = (dataset_dir, info)
        except OSError:
            pass

    return downloaded_datasets


def download_zoo_dataset(name, split=None, splits=None, dataset_dir=None):
    """Downloads the dataset of the given name from the FiftyOne Dataset Zoo.

    Any dataset splits that already exist in the specified directory are not
    re-downloaded.

    Args:
        name: the name of the zoo dataset to download. Call
            :func:`list_zoo_datasets` to see the available datasets
        split (None) a split to download, if applicable. Typical values are
            ``("train", "validation", "test")``. If neither ``split`` nor
            ``splits`` are provided, all available splits are downloaded.
            Consult the documentation for the :class:`ZooDataset` you specified
            to see the supported splits
        splits (None): a list of splits to download, if applicable. Typical
            values are ``("train", "validation", "test")``. If neither
            ``split`` nor ``splits`` are provided, all available splits are
            downloaded. Consult the documentation for the :class:`ZooDataset`
            you specified to see the supported splits
        dataset_dir (None): the directory into which to download the dataset.
            By default, :func:`fiftyone.core.dataset.get_default_dataset_dir`
            is used

    Returns:
        tuple of

        -   info: the :class:`fiftyone.zoo.ZooDatasetInfo` for the dataset
        -   dataset_dir: the directory containing the dataset
    """
    zoo_dataset, dataset_dir = _parse_dataset_details(name, dataset_dir)
    info = zoo_dataset.download_and_prepare(
        dataset_dir, split=split, splits=splits
    )
    return info, dataset_dir


def load_zoo_dataset(
    name,
    split=None,
    splits=None,
    dataset_name=None,
    dataset_dir=None,
    download_if_necessary=True,
    drop_existing_dataset=False,
    **kwargs
):
    """Loads the dataset of the given name from the FiftyOne Dataset Zoo as
    a :class:`fiftyone.core.dataset.Dataset`.

    By default, the dataset will be downloaded if it does not already exist in
    the specified directory.

    If you do not specify a custom ``dataset_name`` and you have previously
    loaded the same zoo dataset and split(s) into FiftyOne, the existing
    :class:`fiftyone.core.dataset.Dataset` will be returned.

    Args:
        name: the name of the zoo dataset to load. Call
            :func:`list_zoo_datasets` to see the available datasets
        split (None) a split to load, if applicable. Typical values are
            ``("train", "validation", "test")``. If neither ``split`` nor
            ``splits`` are provided, all available splits are loaded. Consult
            the documentation for the :class:`ZooDataset` you specified to see
            the supported splits
        splits (None): a list of splits to load, if applicable. Typical values
            are ``("train", "validation", "test")``. If neither ``split`` nor
            ``splits`` are provided, all available splits are loaded. Consult
            the documentation for the :class:`ZooDataset` you specified to see
            the supported splits
        dataset_name (None): an optional name to give the returned
            :class:`fiftyone.core.dataset.Dataset`. By default, a name will be
            constructed based on the dataset and split(s) you are loading
        dataset_dir (None): the directory in which the dataset is stored or
            will be downloaded. By default,
            :func:`fiftyone.core.dataset.get_default_dataset_dir` is used
        download_if_necessary (True): whether to download the dataset if it is
            not found in the specified dataset directory
        drop_existing_dataset (False): whether to drop an existing dataset
            with the same name if it exists
        **kwargs: optional keyword arguments to pass to the constructor of the
            :class:`fiftyone.utils.data.importers.DatasetImporter` for the
            dataset via the syntax ``DatasetImporter(dataset_dir, **kwargs)``

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    splits = _parse_splits(split, splits)

    if download_if_necessary:
        info, dataset_dir = download_zoo_dataset(
            name, splits=splits, dataset_dir=dataset_dir
        )
        zoo_dataset = info.get_zoo_dataset()
    else:
        zoo_dataset, dataset_dir = _parse_dataset_details(name, dataset_dir)
        info = zoo_dataset.load_info(dataset_dir)

    if dataset_name is None:
        dataset_name = zoo_dataset.name
        if splits is not None:
            dataset_name += "-" + "-".join(splits)

    if fo.dataset_exists(dataset_name):
        if not drop_existing_dataset:
            logger.info(
                "Loading existing dataset '%s'. To reload from disk, either "
                "delete the existing dataset or provide a custom "
                "`dataset_name` to use",
                dataset_name,
            )
            return fo.load_dataset(dataset_name)

        fo.delete_dataset(dataset_name)

    if splits is None and zoo_dataset.has_splits:
        splits = zoo_dataset.supported_splits

    dataset = fo.Dataset(dataset_name)
    dataset_type = info.get_dataset_type()

    if splits:
        for split in splits:
            split_dir = zoo_dataset.get_split_dir(dataset_dir, split)
            tags = [split]

            logger.info("Loading '%s' split '%s'", zoo_dataset.name, split)
            dataset.add_dir(split_dir, dataset_type, tags=tags, **kwargs)
    else:
        logger.info("Loading '%s'", zoo_dataset.name)
        dataset.add_dir(dataset_dir, dataset_type, **kwargs)

    if info.classes is not None:
        dataset.info["classes"] = info.classes
        dataset.save()

    return dataset


def find_zoo_dataset(name, split=None):
    """Returns the directory containing the given zoo dataset.

    If a ``split`` is provided, the path to the dataset split is returned;
    otherwise, the path to the root directory is returned.

    The dataset must be downloaded. Use :func:`download_zoo_dataset` to
    download datasets.

    Args:
        name: the name of the zoo dataset
        split (None) a dataset split to locate

    Returns:
        the directory containing the dataset
    """
    zoo_dataset, dataset_dir = _parse_dataset_details(name, None)
    try:
        zoo_dataset.load_info(dataset_dir)
    except OSError:
        raise ValueError("Dataset '%s' is not downloaded" % name)

    if split:
        if not zoo_dataset.has_split(split):
            raise ValueError("Dataset '%s' has no split '%s'" % (name, split))

        info = zoo_dataset.load_info(dataset_dir)
        if not info.is_split_downloaded(split):
            raise ValueError(
                "Dataset '%s' split '%s' is not downloaded" % (name, split)
            )

        return zoo_dataset.get_split_dir(dataset_dir, split)

    return dataset_dir


def load_zoo_dataset_info(name, dataset_dir=None):
    """Loads the :class:`ZooDatasetInfo` for the specified zoo dataset.

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


def get_zoo_dataset(name):
    """Returns the :class:`ZooDataset` instance for the dataset with the given
    name.

    If the dataset is available from multiple sources, the default source is
    used.

    Args:
        name: the name of the zoo dataset

    Returns:
        the :class:`ZooDataset` instance
    """
    all_datasets = _get_zoo_datasets()
    all_sources, _ = _get_zoo_dataset_sources()
    for source in all_sources:
        if source not in all_datasets:
            continue

        datasets = all_datasets[source]
        if name in datasets:
            zoo_dataset_cls = datasets[name]
            return zoo_dataset_cls()

    raise ValueError("Dataset '%s' not found in the zoo" % name)


def _parse_splits(split, splits):
    if split is None and splits is None:
        return None

    _splits = []

    if split:
        _splits.append(split)

    if splits:
        _splits.extend(list(splits))

    return _splits


def _get_zoo_datasets():
    global __ZOO_DATASETS__

    if __ZOO_DATASETS__ is None:
        from fiftyone.zoo.torch import AVAILABLE_DATASETS as TORCH_DATASETS
        from fiftyone.zoo.tf import AVAILABLE_DATASETS as TF_DATASETS
        from fiftyone.zoo.base import AVAILABLE_DATASETS as BASE_DATASETS

        __ZOO_DATASETS__ = {
            "torch": TORCH_DATASETS,
            "tensorflow": TF_DATASETS,
            "base": BASE_DATASETS,
        }

    return __ZOO_DATASETS__


def _get_zoo_dataset_sources():
    all_datasets = _get_zoo_datasets()
    all_sources = list(all_datasets.keys())
    default_source = fo.config.default_ml_backend

    try:
        all_sources.remove(default_source)
        all_sources = [default_source] + all_sources
        has_default = True
    except ValueError:
        has_default = False

    return all_sources, has_default


def _parse_dataset_details(name, dataset_dir):
    zoo_dataset = get_zoo_dataset(name)

    if dataset_dir is None:
        dataset_dir = fod.get_default_dataset_dir(zoo_dataset.name)

    return zoo_dataset, dataset_dir


class ZooDatasetInfo(etas.Serializable):
    """Class containing info about a dataset in the FiftyOne Dataset Zoo.

    Args:
        zoo_dataset: the :class:`ZooDataset` instance for the dataset
        dataset_type: the :class:`fiftyone.types.dataset_types.Dataset` type of
            the dataset
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
        dataset_type,
        num_samples,
        downloaded_splits=None,
        classes=None,
    ):
        # Parse inputs
        if zoo_dataset.has_splits and downloaded_splits is None:
            downloaded_splits = {}

        self._zoo_dataset = zoo_dataset
        self._dataset_type = dataset_type
        self.num_samples = num_samples
        self.downloaded_splits = downloaded_splits
        self.classes = classes

    @property
    def name(self):
        """The name of the dataset."""
        return self._zoo_dataset.name

    @property
    def zoo_dataset(self):
        """The fully-qualified class string for the :class:`ZooDataset` of the
        dataset.
        """
        return etau.get_class_name(self._zoo_dataset)

    @property
    def dataset_type(self):
        """The fully-qualified class string of the
        :class:`fiftyone.types.dataset_types.Dataset` type.
        """
        return etau.get_class_name(self._dataset_type)

    @property
    def supported_splits(self):
        """A tuple of supported splits for the dataset, or None if the dataset
        does not have splits.
        """
        return self._zoo_dataset.supported_splits

    def get_zoo_dataset(self):
        """Returns the :class:`ZooDataset` instance for the dataset.

        Returns:
            a :class:`ZooDataset` instance
        """
        return self._zoo_dataset

    def get_dataset_type(self):
        """Returns the :class:`fiftyone.types.dataset_types.Dataset` type
        instance for the dataset.

        Returns:
            a :class:`fiftyone.types.dataset_types.Dataset` instance
        """
        return self._dataset_type

    def is_split_downloaded(self, split):
        """Whether the given dataset split is downloaded.

        Args:
            split: the dataset split

        Returns:
            True/False
        """
        return (
            self.downloaded_splits is not None
            and split in self.downloaded_splits
        )

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        _attrs = ["name", "zoo_dataset", "dataset_type", "num_samples"]
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
        try:
            # @legacy field name
            zoo_dataset = d["zoo_dataset_cls"]
        except KeyError:
            zoo_dataset = d["zoo_dataset"]

        try:
            # @legacy field name
            dataset_type = d["format_cls"]
        except KeyError:
            dataset_type = d["dataset_type"]

        # @legacy dataset types
        _dt = "fiftyone.types.dataset_types"
        if dataset_type.endswith(".ImageClassificationDataset"):
            dataset_type = _dt + ".FiftyOneImageClassificationDataset"
        if dataset_type.endswith(".ImageDetectionDataset"):
            dataset_type = _dt + ".FiftyOneImageDetectionDataset"

        zoo_dataset = etau.get_class(zoo_dataset)()
        dataset_type = etau.get_class(dataset_type)()

        downloaded_splits = d.get("downloaded_splits", None)
        if downloaded_splits is not None:
            downloaded_splits = {
                k: ZooDatasetSplitInfo.from_dict(v)
                for k, v in downloaded_splits.items()
            }

        return cls(
            zoo_dataset,
            dataset_type,
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

    def has_split(self, split):
        """Whether the dataset has the given split.

        Args:
            split: the dataset split

        Returns:
            True/False
        """
        return self.has_splits and (split in self.supported_splits)

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

    def download_and_prepare(self, dataset_dir, split=None, splits=None):
        """Downloads the dataset and prepares it for use in the given
        directory.

        If the requested splits have already been downloaded, they are not
        re-downloaded.

        Args:
            dataset_dir: the directory in which to construct the dataset
            split (None) a split to download, if applicable. If neither
                ``split`` nor ``splits`` are provided, the full dataset is
                downloaded
            splits (None): a list of splits to download, if applicable. If
                neither ``split`` nor ``splits`` are provided, the full dataset
                is  downloaded

        Returns:
            the :class:`ZooDatasetInfo` for the dataset
        """
        # Parse splits
        splits = _parse_splits(split, splits)
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
        scratch_dir = os.path.join(dataset_dir, "tmp-download")

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
                (
                    dataset_type,
                    num_samples,
                    classes,
                ) = self._download_and_prepare(split_dir, scratch_dir, split)

                # Add split to ZooDatasetInfo
                if info is None:
                    info = ZooDatasetInfo(
                        self, dataset_type, 0, classes=classes
                    )

                if classes and not info.classes:
                    info.classes = classes

                info.downloaded_splits[split] = ZooDatasetSplitInfo(
                    split, num_samples
                )
                info.num_samples = sum(
                    si.num_samples for si in info.downloaded_splits.values()
                )

                write_info = True
        else:
            if info is not None:
                logger.info("Dataset already downloaded")
            else:
                logger.info("Downloading dataset to '%s'", dataset_dir)
                (
                    dataset_type,
                    num_samples,
                    classes,
                ) = self._download_and_prepare(dataset_dir, scratch_dir, None)

                # Create ZooDatasetInfo
                info = ZooDatasetInfo(
                    self, dataset_type, num_samples, classes=classes
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
        for use in the given directory.

        Args:
            dataset_dir: the directory in which to construct the dataset
            scratch_dir: a scratch directory to use to download and prepare
                any required intermediate files
            splits: the list of splits to download, or None if the dataset does
                not have splits

        Returns:
            tuple of

            -   dataset_type: the :class:`fiftyone.types.dataset_types.Dataset`
                    type of the dataset
            -   num_samples: the number of samples in the split
            -   classes: an optional list of class label strings
        """
        raise NotImplementedError(
            "subclasses must implement _download_and_prepare()"
        )
