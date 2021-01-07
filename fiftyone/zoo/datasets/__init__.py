"""
The FiftyOne Dataset Zoo.

This package defines a collection of open source datasets made available for
download via FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
import inspect
import logging
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo


logger = logging.getLogger(__name__)


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
        base_dir (None): the base directory to search for downloaded datasets.
            By default, ``fo.config.dataset_zoo_dir`` is used

    Returns:
        a dict mapping dataset names to (dataset dir, :class:`ZooDatasetInfo`)
        tuples
    """
    if base_dir is None:
        base_dir = fo.config.dataset_zoo_dir

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
        except:
            pass

    return downloaded_datasets


def download_zoo_dataset(
    name,
    split=None,
    splits=None,
    dataset_dir=None,
    overwrite=False,
    cleanup=True,
    **kwargs
):
    """Downloads the dataset of the given name from the FiftyOne Dataset Zoo.

    Any dataset splits that already exist in the specified directory are not
    re-downloaded, unless ``overwrite == True`` is specified.

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
            By default, it is downloaded to a subdirectory of
            ``fiftyone.config.dataset_zoo_dir``
        overwrite (False): whether to overwrite any existing files
        cleanup (True): whether to cleanup any temporary files generated during
            download
        **kwargs: optional arguments for the :class:`ZooDataset` constructor

    Returns:
        tuple of

        -   info: the :class:`ZooDatasetInfo` for the dataset
        -   dataset_dir: the directory containing the dataset
    """
    zoo_dataset, dataset_dir = _parse_dataset_details(
        name, dataset_dir, **kwargs
    )
    return zoo_dataset.download_and_prepare(
        dataset_dir=dataset_dir,
        split=split,
        splits=splits,
        overwrite=overwrite,
        cleanup=cleanup,
    )


def _extract_kwargs_for_class(cls, kwargs):
    class_kwargs = {}
    other_kwargs = {}
    spec = inspect.getfullargspec(cls)
    for k, v in kwargs.items():
        if k in spec.args:
            class_kwargs[k] = v
        else:
            other_kwargs[k] = v

    return class_kwargs, other_kwargs


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
            will be downloaded. By default, the dataset will be located in
            ``fiftyone.config.dataset_zoo_dir``
        download_if_necessary (True): whether to download the dataset if it is
            not found in the specified dataset directory
        drop_existing_dataset (False): whether to drop an existing dataset
            with the same name if it exists
        **kwargs: optional arguments to pass to the
            :class:`fiftyone.utils.data.importers.DatasetImporter` constructor.
            If ``download_if_necessary == True``, then ``kwargs`` can also
            contain arguments for :func:`download_zoo_dataset`

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    splits = _parse_splits(split, splits)

    if download_if_necessary:
        zoo_dataset_cls = _get_zoo_dataset_cls(name)
        download_kwargs, kwargs = _extract_kwargs_for_class(
            zoo_dataset_cls, kwargs
        )

        info, dataset_dir = download_zoo_dataset(
            name, splits=splits, dataset_dir=dataset_dir, **download_kwargs
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

        logger.info("Deleting existing dataset '%s'", dataset_name)
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

    logger.info("Dataset '%s' created", dataset.name)

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

    Raises:
        ValueError: if the dataset or split does not exist or has not been
            downloaded
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
            default, the dataset is located in
            ``fiftyone.config.dataset_zoo_dir``

    Returns:
        the :class:`ZooDatasetInfo` for the dataset

    Raises:
        ValueError: if the dataset has not been downloaded
    """
    zoo_dataset, dataset_dir = _parse_dataset_details(name, dataset_dir)
    try:
        return zoo_dataset.load_info(dataset_dir)
    except OSError:
        raise ValueError("Dataset '%s' is not downloaded" % name)


def get_zoo_dataset(name, **kwargs):
    """Returns the :class:`ZooDataset` instance for the dataset with the given
    name.

    If the dataset is available from multiple sources, the default source is
    used.

    Args:
        name: the name of the zoo dataset
        **kwargs: optional arguments for :class:`ZooDataset`

    Returns:
        the :class:`ZooDataset` instance
    """
    zoo_dataset_cls = _get_zoo_dataset_cls(name)

    try:
        zoo_dataset = zoo_dataset_cls(**kwargs)
    except Exception as e:
        zoo_dataset_name = zoo_dataset_cls.__name__
        kwargs_str = ", ".join("%s=%s" % (k, v) for k, v in kwargs.items())
        raise ValueError(
            "Failed to construct zoo dataset instance using syntax "
            "%s(%s); you may need to supply mandatory arguments "
            "to the constructor via `kwargs`. Please consult the "
            "documentation of `%s` to learn more"
            % (
                zoo_dataset_name,
                kwargs_str,
                etau.get_class_name(zoo_dataset_cls),
            )
        ) from e

    return zoo_dataset


def _get_zoo_dataset_cls(name):
    all_datasets = _get_zoo_datasets()
    all_sources, _ = _get_zoo_dataset_sources()
    for source in all_sources:
        if source not in all_datasets:
            continue

        datasets = all_datasets[source]
        if name in datasets:
            return datasets[name]

    raise ValueError("Dataset '%s' not found in the zoo" % name)


def delete_zoo_dataset(name, split=None):
    """Deletes the zoo dataset from local disk, if necessary.

    If a ``split`` is provided, only that split is deleted.

    Args:
        name: the name of the zoo dataset
        split (None) a valid dataset split
    """
    if split is None:
        # Delete root dataset directory
        dataset_dir = find_zoo_dataset(name)
        etau.delete_dir(dataset_dir)
        return

    # Delete split directory
    split_dir = find_zoo_dataset(name, split=split)
    etau.delete_dir(split_dir)

    # Remove split from ZooDatasetInfo
    dataset_dir = os.path.dirname(split_dir)
    info = ZooDataset.load_info(dataset_dir)
    info.remove_split(split)
    info_path = ZooDataset.get_info_path(dataset_dir)
    info.write_json(info_path, pretty_print=True)


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
    from .base import AVAILABLE_DATASETS as BASE_DATASETS
    from .torch import AVAILABLE_DATASETS as TORCH_DATASETS
    from .tf import AVAILABLE_DATASETS as TF_DATASETS

    zoo_datasets = OrderedDict()
    zoo_datasets["base"] = BASE_DATASETS
    zoo_datasets["torch"] = TORCH_DATASETS
    zoo_datasets["tensorflow"] = TF_DATASETS

    if fo.config.dataset_zoo_manifest_paths:
        for manifest_path in fo.config.dataset_zoo_manifest_paths:
            manifest = _load_zoo_dataset_manifest(manifest_path)
            zoo_datasets.update(manifest)

    return zoo_datasets


def _load_zoo_dataset_manifest(manifest_path):
    _manifest = etas.read_json(manifest_path)

    manifest = OrderedDict()
    for source, datasets in _manifest.items():
        manifest[source] = {
            name: etau.get_class(zoo_dataset_cls)
            for name, zoo_dataset_cls in datasets.items()
        }

    return manifest


def _get_zoo_dataset_sources():
    all_datasets = _get_zoo_datasets()
    all_sources = list(all_datasets.keys())
    default_source = fo.config.default_ml_backend

    sources = []

    try:
        # base first
        all_sources.remove("base")
        sources.append("base")
    except:
        pass

    try:
        # then default source
        all_sources.remove(default_source)
        sources.append(default_source)
    except ValueError:
        default_source = None

    # then remaining sources
    sources.extend(all_sources)

    return sources, default_source


def _parse_dataset_details(name, dataset_dir, **kwargs):
    zoo_dataset = get_zoo_dataset(name, **kwargs)

    if dataset_dir is None:
        dataset_dir = _get_zoo_dataset_dir(zoo_dataset.name)

    return zoo_dataset, dataset_dir


def _get_zoo_dataset_dir(name):
    return os.path.join(fo.config.dataset_zoo_dir, name)


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
        parameters (None): a dict of parameters for the dataset
        classes (None): a list of class label strings
    """

    def __init__(
        self,
        zoo_dataset,
        dataset_type,
        num_samples,
        downloaded_splits=None,
        parameters=None,
        classes=None,
    ):
        if zoo_dataset.has_splits and downloaded_splits is None:
            downloaded_splits = {}

        if parameters is None:
            parameters = zoo_dataset.parameters

        self._zoo_dataset = zoo_dataset
        self._dataset_type = dataset_type
        self.num_samples = num_samples
        self.downloaded_splits = downloaded_splits
        self.parameters = parameters
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

    def add_split(self, split_info):
        """Adds the split to the dataset.

        Args:
            split_info: a :class:`ZooDatasetSplitInfo`
        """
        self.downloaded_splits[split_info.split] = split_info
        self._compute_num_samples()

    def remove_split(self, split):
        """Removes the split from the dataset.

        Args:
            split: the name of the split
        """
        self.downloaded_splits.pop(split)
        self._compute_num_samples()

    def attributes(self):
        """Returns a list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        _attrs = ["name", "zoo_dataset", "dataset_type", "num_samples"]
        if self.downloaded_splits is not None:
            _attrs.append("downloaded_splits")
        if self.parameters is not None:
            _attrs.append("parameters")
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
        info, _ = cls._from_dict(d)
        return info

    @classmethod
    def from_json(cls, json_path, upgrade=False):
        """Loads a :class:`ZooDatasetInfo` from a JSON file on disk.

        Args:
            json_path: path to JSON file
            upgrade (False): whether to upgrade the JSON file on disk if any
                migrations were necessary

        Returns:
            a :class:`ZooDatasetInfo`
        """
        d = etas.read_json(json_path)
        info, migrated = cls._from_dict(d)

        if upgrade and migrated:
            logger.info("Migrating ZooDatasetInfo at '%s'", json_path)
            etau.move_file(json_path, json_path + ".bak")
            info.write_json(json_path, pretty_print=True)

        return info

    @classmethod
    def _from_dict(cls, d):
        # Handle any migrations from old `ZooDatasetInfo` instances
        d, migrated = _migrate_zoo_dataset_info(d)

        parameters = d.get("parameters", None)

        kwargs = parameters or {}
        zoo_dataset = etau.get_class(d["zoo_dataset"])(**kwargs)

        dataset_type = etau.get_class(d["dataset_type"])()

        downloaded_splits = d.get("downloaded_splits", None)
        if downloaded_splits is not None:
            downloaded_splits = {
                k: ZooDatasetSplitInfo.from_dict(v)
                for k, v in downloaded_splits.items()
            }

        info = cls(
            zoo_dataset,
            dataset_type,
            d["num_samples"],
            downloaded_splits=downloaded_splits,
            parameters=parameters,
            classes=d.get("classes", None),
        )

        return info, migrated

    def _compute_num_samples(self):
        self.num_samples = sum(
            si.num_samples for si in self.downloaded_splits.values()
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
    def tags(self):
        """A tuple of tags for the dataset."""
        return None

    @property
    def has_tags(self):
        """Whether the dataset has tags."""
        return self.tags is not None

    @property
    def parameters(self):
        """An optional dict of parameters describing the configuration of the
        zoo dataset when it was downloaded.
        """
        return None

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

    @property
    def requires_manual_download(self):
        """Whether this dataset requires some files to be manually downloaded.
        """
        return False

    def has_tag(self, tag):
        """Whether the dataset has the given tag.

        Args:
            tag: the tag

        Returns:
            True/False
        """
        return self.has_tags and (tag in self.tags)

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
        return ZooDatasetInfo.from_json(info_path, upgrade=True)

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

    def download_and_prepare(
        self,
        dataset_dir=None,
        split=None,
        splits=None,
        overwrite=False,
        cleanup=True,
    ):
        """Downloads the dataset and prepares it for use.

        If the requested splits have already been downloaded, they are not
        re-downloaded.

        Args:
            dataset_dir (None): the directory in which to construct the
                dataset. By default, it is written to a subdirectory of
                ``fiftyone.config.dataset_zoo_dir``
            split (None) a split to download, if applicable. If neither
                ``split`` nor ``splits`` are provided, the full dataset is
                downloaded
            splits (None): a list of splits to download, if applicable. If
                neither ``split`` nor ``splits`` are provided, the full dataset
                is  downloaded
            overwrite (False): whether to overwrite any existing files
            cleanup (True): whether to cleanup any temporary files generated
                during download

        Returns:
            tuple of

            -   info: the :class:`ZooDatasetInfo` for the dataset
            -   dataset_dir: the directory containing the dataset
        """
        if dataset_dir is None:
            dataset_dir = _get_zoo_dataset_dir(self.name)

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
            info = ZooDatasetInfo.from_json(info_path, upgrade=True)
        else:
            info = None

        # Create scratch directory
        scratch_dir = os.path.join(dataset_dir, "tmp-download")

        # Download dataset, if necessary
        write_info = False
        if splits:
            # Handle splits that have already been downloaded
            if info is not None:
                _splits = []
                for split in splits:
                    split_dir = self.get_split_dir(dataset_dir, split)
                    if os.path.isdir(split_dir):
                        if overwrite:
                            logger.info(
                                "Overwriting existing directory '%s'",
                                split_dir,
                            )
                            etau.delete_dir(split_dir)
                        elif split in info.downloaded_splits:
                            if self.requires_manual_download:
                                logger.info(
                                    "Split '%s' already prepared", split
                                )
                            else:
                                logger.info(
                                    "Split '%s' already downloaded", split
                                )

                            continue

                    _splits.append(split)

                splits = _splits

            for split in splits:
                split_dir = self.get_split_dir(dataset_dir, split)
                if self.requires_manual_download:
                    logger.info(
                        "Preparing split '%s' in '%s'", split, split_dir
                    )
                else:
                    logger.info(
                        "Downloading split '%s' to '%s'", split, split_dir
                    )

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

                split_info = ZooDatasetSplitInfo(split, num_samples)
                info.add_split(split_info)

                write_info = True
        else:
            if info is not None:
                if self.requires_manual_download:
                    logger.info("Dataset already prepared")
                else:
                    logger.info("Dataset already downloaded")
            else:
                if self.requires_manual_download:
                    logger.info("Preparing dataset in '%s'", dataset_dir)
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

        # Cleanup scratch directory, if necessary
        if cleanup:
            etau.delete_dir(scratch_dir)

        return info, dataset_dir

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        """Internal implementation of downloading the dataset and preparing it
        for use in the given directory.

        Args:
            dataset_dir: the directory in which to construct the dataset
            scratch_dir: a scratch directory to use to download and prepare
                any required intermediate files
            split: the split to download, or None if the dataset does not have
                splits

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


class DeprecatedZooDataset(ZooDataset):
    """Class representing a zoo dataset that no longer exists in the FiftyOne
    Dataset Zoo.
    """

    @property
    def name(self):
        return "????????"

    @property
    def supported_splits(self):
        return None

    def _download_and_prepare(self, *args, **kwargs):
        raise ValueError(
            "The zoo dataset you are trying to download is no longer "
            "available."
        )


def _migrate_zoo_dataset_info(d):
    migrated = False

    # @legacy field name
    if "zoo_dataset_cls" in d:
        d["zoo_dataset"] = d.pop("zoo_dataset_cls")
        migrated = True

    # @legacy field name
    if "format_cls" in d:
        d["dataset_type"] = d.pop("format_cls")
        migrated = True

    zoo_dataset = d["zoo_dataset"]
    dataset_type = d["dataset_type"]

    # @legacy pre-model zoo package namespaces
    old_pkg = "fiftyone.zoo."
    new_pkg = "fiftyone.zoo.datasets."
    if zoo_dataset.startswith(old_pkg) and not zoo_dataset.startswith(new_pkg):
        zoo_dataset = new_pkg + zoo_dataset[len(old_pkg) :]
        migrated = True

    # @legacy zoo dataset name
    old_name = "VideoQuickstartDataset"
    new_name = "QuickstartVideoDataset"
    if zoo_dataset.endswith(old_name):
        zoo_dataset = zoo_dataset[: -len(old_name)] + new_name
        migrated = True

    # @legacy dataset type names
    _dt = "fiftyone.types.dataset_types"
    if dataset_type.endswith(".ImageClassificationDataset"):
        dataset_type = _dt + ".FiftyOneImageClassificationDataset"
        migrated = True

    if dataset_type.endswith(".ImageDetectionDataset"):
        dataset_type = _dt + ".FiftyOneImageDetectionDataset"
        migrated = True

    # @legacy dataset implementations
    if zoo_dataset.endswith("tf.Caltech101Dataset"):
        zoo_dataset = etau.get_class_name(DeprecatedZooDataset)
        migrated = True

    if zoo_dataset.endswith("tf.KITTIDataset"):
        zoo_dataset = etau.get_class_name(DeprecatedZooDataset)
        migrated = True

    d["zoo_dataset"] = zoo_dataset
    d["dataset_type"] = dataset_type

    return d, migrated
