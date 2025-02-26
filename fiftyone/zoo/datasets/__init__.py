"""
The FiftyOne Dataset Zoo.

This package defines a collection of open source datasets made available for
download via FiftyOne.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import OrderedDict
import importlib
import inspect
import logging
import os
import sys

import yaml

import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud
from fiftyone.utils.github import GitHubRepository


DATASET_METADATA_FILENAMES = ("fiftyone.yml", "fiftyone.yaml")

logger = logging.getLogger(__name__)


def list_zoo_datasets(tags=None, source=None, license=None):
    """Lists the available datasets in the FiftyOne Dataset Zoo.

    Also includes any remotely-sourced zoo datasets that you've downloaded.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # List all zoo datasets
        #

        names = foz.list_zoo_datasets()
        print(names)

        #
        # List all zoo datasets with (both of) the specified tags
        #

        names = foz.list_zoo_datasets(tags=["image", "detection"])
        print(names)

        #
        # List all zoo datasets available via the given source
        #

        names = foz.list_zoo_datasets(source="torch")
        print(names)

    Args:
        tags (None): only include datasets that have the specified tag or list
            of tags
        source (None): only include datasets available via the given source or
            list of sources
        license (None): only include datasets that are distributed under the
            specified license or any of the specified list of licenses. Run
            ``fiftyone zoo datasets list`` to see the available licenses

    Returns:
        a sorted list of dataset names
    """
    datasets = _list_zoo_datasets(tags=tags, source=source, license=license)
    return sorted(datasets.keys())


def _list_zoo_datasets(tags=None, source=None, license=None):
    all_datasets, all_sources, _ = _get_zoo_datasets()

    if etau.is_str(source):
        sources = [source]
    elif source is not None:
        sources = list(sources)
    else:
        sources = all_sources

    datasets = {}

    for source in sources:
        source_datasets = all_datasets.get(source, {})
        for name, zoo_dataset in source_datasets.items():
            if name not in datasets:
                datasets[name] = zoo_dataset

    if tags is not None:
        if etau.is_str(tags):
            tags = {tags}
        else:
            tags = set(tags)

        datasets = {
            name: zoo_dataset
            for name, zoo_dataset in datasets.items()
            if tags.issubset(zoo_dataset.tags)
        }

    if license is not None:
        if etau.is_str(license):
            licenses = {license}
        else:
            licenses = set(license)

        datasets = {
            name: zoo_dataset
            for name, zoo_dataset in datasets.items()
            if zoo_dataset.license
            and licenses.intersection(zoo_dataset.license.split(","))
        }

    return datasets


def list_zoo_dataset_sources():
    """Returns the list of available zoo dataset sources.

    Returns:
        a list of sources
    """
    _, all_sources, _ = _get_zoo_datasets()
    return all_sources


def list_downloaded_zoo_datasets():
    """Returns information about the zoo datasets that have been downloaded.

    Returns:
        a dict mapping dataset names to
        (``dataset_dir``, :class:`ZooDatasetInfo`) tuples
    """
    root_dir = fo.config.dataset_zoo_dir
    if not root_dir or not os.path.isdir(root_dir):
        return {}

    downloaded_datasets = {}

    for dataset_dir, dirs, _ in os.walk(root_dir, followlinks=True):
        if dataset_dir == root_dir:
            continue

        if ZooDataset.has_info(dataset_dir):
            try:
                info = ZooDataset.load_info(dataset_dir)
                downloaded_datasets[info.name] = (dataset_dir, info)
            except Exception as e:
                logger.debug(
                    "Failed to load info for '%s': %s", dataset_dir, e
                )

            # Stop traversing once we find a dataset info file
            dirs[:] = []
        else:
            # Ignore hidden directories
            dirs[:] = [d for d in dirs if not d.startswith(".")]

    return downloaded_datasets


def download_zoo_dataset(
    name_or_url,
    split=None,
    splits=None,
    overwrite=False,
    cleanup=True,
    **kwargs,
):
    """Downloads the specified dataset from the FiftyOne Dataset Zoo.

    Any dataset splits that have already been downloaded are not re-downloaded,
    unless ``overwrite == True`` is specified.

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Args:
        name_or_url: the name of the zoo dataset to download, or the remote
            source to download it from, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
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
        overwrite (False): whether to overwrite any existing files
        cleanup (True): whether to cleanup any temporary files generated during
            download
        **kwargs: optional arguments for the :class:`ZooDataset` constructor
            or the remote dataset's ``download_and_prepare()`` method

    Returns:
        a tuple of

        -   info: the :class:`ZooDatasetInfo` for the dataset
        -   dataset_dir: the directory containing the dataset
    """
    if overwrite:
        _overwrite_download(name_or_url, split=split, splits=splits)

    zoo_dataset, dataset_dir = _parse_dataset_details(
        name_or_url, overwrite=overwrite, **kwargs
    )
    info = zoo_dataset.download_and_prepare(
        dataset_dir,
        split=split,
        splits=splits,
        cleanup=cleanup,
    )
    return info, dataset_dir


def _overwrite_download(name_or_url, split=None, splits=None):
    try:
        dataset_dir = _parse_dataset_identifier(name_or_url)[1]
        assert dataset_dir is not None
    except:
        return

    splits = _parse_splits(split, splits)

    if splits:
        for split in splits:
            split_dir = os.path.join(dataset_dir, split)
            if os.path.isdir(split_dir):
                logger.info("Overwriting existing directory '%s'", split_dir)
                etau.delete_dir(split_dir)
    else:
        if os.path.isdir(dataset_dir):
            logger.info("Overwriting existing directory '%s'", dataset_dir)
            etau.delete_dir(dataset_dir)


def load_zoo_dataset(
    name_or_url,
    split=None,
    splits=None,
    label_field=None,
    dataset_name=None,
    download_if_necessary=True,
    drop_existing_dataset=False,
    persistent=False,
    overwrite=False,
    cleanup=True,
    progress=None,
    **kwargs,
):
    """Loads the specified dataset from the FiftyOne Dataset Zoo.

    By default, the dataset will be downloaded if necessary.

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    If you do not specify a custom ``dataset_name`` and you have previously
    loaded the same zoo dataset and split(s) into FiftyOne, the existing
    dataset will be returned.

    Args:
        name_or_url: the name of the zoo dataset to load, or the remote source
            to load it from, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
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
        label_field (None): the label field (or prefix, if the dataset contains
            multiple label fields) in which to store the dataset's labels. By
            default, this is ``"ground_truth"`` if the dataset contains a
            single label field. If the dataset contains multiple label fields
            and this value is not provided, the labels will be stored under
            dataset-specific field names
        dataset_name (None): an optional name to give the returned
            :class:`fiftyone.core.dataset.Dataset`. By default, a name will be
            constructed based on the dataset and split(s) you are loading
        download_if_necessary (True): whether to download the dataset if it is
            not found in the specified dataset directory
        drop_existing_dataset (False): whether to drop an existing dataset
            with the same name if it exists
        persistent (False): whether the dataset should persist in the database
            after the session terminates
        overwrite (False): whether to overwrite any existing files if the
            dataset is to be downloaded
        cleanup (True): whether to cleanup any temporary files generated during
            download
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
        **kwargs: optional arguments to pass to the
            :class:`fiftyone.utils.data.importers.DatasetImporter` constructor
            or the remote dataset's ``load_dataset()` method. If
            ``download_if_necessary == True``, then ``kwargs`` can also contain
            arguments for :func:`download_zoo_dataset`

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    splits = _parse_splits(split, splits)

    if download_if_necessary:
        zoo_dataset_cls = _parse_dataset_identifier(name_or_url)[0]
        if issubclass(zoo_dataset_cls, RemoteZooDataset):
            download_kwargs = kwargs
        else:
            download_kwargs, _ = fou.extract_kwargs_for_class(
                zoo_dataset_cls, kwargs
            )

        info, dataset_dir = download_zoo_dataset(
            name_or_url,
            splits=splits,
            overwrite=overwrite,
            cleanup=cleanup,
            **download_kwargs,
        )
        zoo_dataset = info.get_zoo_dataset()
    else:
        download_kwargs = {}
        zoo_dataset, dataset_dir = _parse_dataset_details(
            name_or_url, **kwargs
        )
        info = zoo_dataset.load_info(dataset_dir, warn_deprecated=True)

    dataset_type = info.get_dataset_type()
    if dataset_type is not None:
        dataset_importer_cls = dataset_type.get_dataset_importer_cls()

        #
        # For unlabeled (e.g., test) splits, some importers need to be
        # explicitly told to generate samples for media with no corresponding
        # labels entry.
        #
        # By convention, all such importers use `include_all_data` for this
        # flag. If a new zoo dataset is added that requires a different
        # customized parameter, we'd need to improve this logic here
        #
        kwargs["include_all_data"] = True

        importer_kwargs, unused_kwargs = fou.extract_kwargs_for_class(
            dataset_importer_cls, kwargs
        )

        # Inject default importer kwargs, if any
        if zoo_dataset.importer_kwargs:
            for key, value in zoo_dataset.importer_kwargs.items():
                if key not in importer_kwargs:
                    importer_kwargs[key] = value

        for key, value in unused_kwargs.items():
            if (
                key in download_kwargs
                or key == "include_all_data"
                or value is None
            ):
                continue

            logger.warning(
                "Ignoring unsupported parameter '%s' for importer type %s",
                key,
                dataset_importer_cls,
            )
    else:
        importer_kwargs = kwargs

    if dataset_name is None:
        dataset_name = zoo_dataset.name
        if splits is not None:
            dataset_name += "-" + "-".join(splits)

        if "max_samples" in importer_kwargs:
            dataset_name += "-%s" % importer_kwargs["max_samples"]

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

    dataset = fo.Dataset(dataset_name, persistent=persistent)

    if splits:
        for split in splits:
            if not zoo_dataset.has_split(split):
                raise ValueError(
                    "Invalid split '%s'; supported values are %s"
                    % (split, zoo_dataset.supported_splits)
                )

        for split in splits:
            logger.info("Loading '%s' split '%s'", zoo_dataset.name, split)
            split_dir = zoo_dataset.get_split_dir(dataset_dir, split)
            if dataset_type is not None:
                dataset_importer, _ = foud.build_dataset_importer(
                    dataset_type, dataset_dir=split_dir, **importer_kwargs
                )
                dataset.add_importer(
                    dataset_importer,
                    label_field=label_field,
                    tags=[split],
                    progress=progress,
                )
            else:
                zoo_dataset._load_dataset(dataset, split_dir, split=split)
    else:
        logger.info("Loading '%s'", zoo_dataset.name)

        if dataset_type is not None:
            dataset_importer, _ = foud.build_dataset_importer(
                dataset_type, dataset_dir=dataset_dir, **importer_kwargs
            )
            dataset.add_importer(
                dataset_importer,
                label_field=label_field,
                progress=progress,
            )
        else:
            zoo_dataset._load_dataset(dataset, dataset_dir)

    if info.classes is not None and not dataset.default_classes:
        dataset.default_classes = info.classes

    logger.info("Dataset '%s' created", dataset.name)

    return dataset


def find_zoo_dataset(name_or_url, split=None):
    """Returns the directory containing the given zoo dataset.

    If a ``split`` is provided, the path to the dataset split is returned;
    otherwise, the path to the root directory is returned.

    The dataset must be downloaded. Use :func:`download_zoo_dataset` to
    download datasets.

    Args:
        name_or_url: the name of the zoo dataset or its remote source, which
            can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
        split (None): a specific split to locate

    Returns:
        the directory containing the dataset or split

    Raises:
        ValueError: if the dataset or split does not exist or has not been
            downloaded
    """
    zoo_dataset, dataset_dir = _parse_dataset_details(name_or_url)
    try:
        zoo_dataset.load_info(dataset_dir)
    except OSError:
        raise ValueError("Dataset '%s' is not downloaded" % name_or_url)

    if split:
        if not zoo_dataset.has_split(split):
            raise ValueError(
                "Dataset '%s' has no split '%s'" % (name_or_url, split)
            )

        info = zoo_dataset.load_info(dataset_dir)
        if not info.is_split_downloaded(split):
            raise ValueError(
                "Dataset '%s' split '%s' is not downloaded"
                % (name_or_url, split)
            )

        return zoo_dataset.get_split_dir(dataset_dir, split)

    return dataset_dir


def load_zoo_dataset_info(name_or_url):
    """Loads the :class:`ZooDatasetInfo` for the specified zoo dataset.

    The dataset must be downloaded. Use :func:`download_zoo_dataset` to
    download datasets.

    Args:
        name_or_url: the name of the zoo dataset or its remote source, which
            can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file

    Returns:
        the :class:`ZooDatasetInfo` for the dataset

    Raises:
        ValueError: if the dataset has not been downloaded
    """
    zoo_dataset, dataset_dir = _parse_dataset_details(name_or_url)
    try:
        return zoo_dataset.load_info(dataset_dir)
    except OSError:
        raise ValueError("Dataset '%s' is not downloaded" % name_or_url)


def get_zoo_dataset(name_or_url, overwrite=False, **kwargs):
    """Returns the :class:`ZooDataset` instance for the given dataset.

    If the dataset is available from multiple sources, the default source is
    used.

    Args:
        name_or_url: the name of the zoo dataset, or its remote source, which
            can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
        overwrite (False): whether to overwrite existing metadata if it has
            already been downloaded. Only applicable when ``name_or_url`` is a
            remote source
        **kwargs: optional arguments for :class:`ZooDataset`

    Returns:
        the :class:`ZooDataset` instance
    """
    zoo_dataset_cls, dataset_dir, url, is_local = _parse_dataset_identifier(
        name_or_url
    )

    if not is_local:
        dataset_dir = _download_dataset_metadata(
            name_or_url, overwrite=overwrite
        )
        url = name_or_url

    # Remote datasets
    try:
        if issubclass(zoo_dataset_cls, RemoteZooDataset):
            return zoo_dataset_cls(dataset_dir, url=url, **kwargs)
    except Exception as e:
        raise ValueError(
            "Failed to construct zoo dataset instance for '%s'. "
            "The dataset's YAML file may be malformed or missing" % name_or_url
        ) from e

    # Builtin datasets
    try:
        return zoo_dataset_cls(**kwargs)
    except Exception as e:
        raise ValueError(
            "Failed to construct zoo dataset instance using syntax "
            "%s(%s); you may need to supply mandatory arguments via kwargs. "
            "Please consult the documentation of %s to learn more"
            % (
                zoo_dataset_cls.__name__,
                ", ".join("%s=%s" % (k, v) for k, v in kwargs.items()),
                etau.get_class_name(zoo_dataset_cls),
            )
        ) from e


def delete_zoo_dataset(name_or_url, split=None):
    """Deletes the zoo dataset from local disk, if necessary.

    If a ``split`` is provided, only that split is deleted.

    Args:
        name_or_url: the name of the zoo dataset, or its remote source, which
            can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
        split (None) a specific split to delete
    """
    if split is None:
        # Delete root dataset directory
        dataset_dir = find_zoo_dataset(name_or_url)
        etau.delete_dir(dataset_dir)
        return

    # Delete split directory
    split_dir = find_zoo_dataset(name_or_url, split=split)
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

    if etau.is_str(splits):
        splits = [splits]

    if splits:
        _splits.extend(list(splits))

    return _splits


def _get_zoo_datasets():
    from .base import AVAILABLE_DATASETS as BASE_DATASETS
    from .torch import AVAILABLE_DATASETS as TORCH_DATASETS
    from .tf import AVAILABLE_DATASETS as TF_DATASETS

    zoo_datasets = OrderedDict()
    zoo_datasets["base"] = _init_zoo_datasets(BASE_DATASETS)
    zoo_datasets["torch"] = _init_zoo_datasets(TORCH_DATASETS)
    zoo_datasets["tensorflow"] = _init_zoo_datasets(TF_DATASETS)

    if fo.config.dataset_zoo_manifest_paths:
        for manifest_path in fo.config.dataset_zoo_manifest_paths:
            manifest = _load_zoo_dataset_manifest(manifest_path)
            for source, datasets in manifest.items():
                zoo_datasets[source] = _init_zoo_datasets(datasets)

    downloaded_datasets = list_downloaded_zoo_datasets()

    remote_datasets = {}
    for name, (_, info) in downloaded_datasets.items():
        zoo_dataset = info.get_zoo_dataset()
        if zoo_dataset.is_remote:
            remote_datasets[name] = zoo_dataset

    if remote_datasets:
        zoo_datasets["remote"] = remote_datasets

    sources, default_source = _get_zoo_dataset_sources(zoo_datasets)

    return zoo_datasets, sources, default_source


def _init_zoo_datasets(datasets):
    zoo_datasets = {}
    for name, zoo_dataset_cls in datasets.items():
        try:
            zoo_datasets[name] = zoo_dataset_cls()
        except Exception as e:
            logger.debug("Failed to initialize '%s': %s", name, e)

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


def _get_zoo_dataset_sources(zoo_datasets):
    all_sources = list(zoo_datasets.keys())
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


def _parse_dataset_details(name_or_url, overwrite=False, **kwargs):
    zoo_dataset = get_zoo_dataset(name_or_url, overwrite=overwrite, **kwargs)
    dataset_dir = _get_zoo_dataset_dir(zoo_dataset.name)

    return zoo_dataset, dataset_dir


def _parse_dataset_identifier(name_or_url):
    if "/" in name_or_url:
        name = name_or_url
        url = _normalize_ref(name_or_url)
    else:
        name = name_or_url
        url = None

    all_datasets, all_sources, _ = _get_zoo_datasets()
    for source in all_sources:
        datasets = all_datasets.get(source, {})
        for _name, zoo_dataset in datasets.items():
            if name == _name or (
                zoo_dataset.is_remote and zoo_dataset.url == url
            ):
                zoo_dataset_cls = type(zoo_dataset)
                dataset_dir = _get_zoo_dataset_dir(zoo_dataset.name)
                url = zoo_dataset.url if zoo_dataset.is_remote else None
                return zoo_dataset_cls, dataset_dir, url, True

    if "/" in name_or_url:
        return RemoteZooDataset, None, name_or_url, False

    raise ValueError("Dataset '%s' not found in the zoo" % name_or_url)


def _get_zoo_dataset_dir(name):
    return os.path.join(fo.config.dataset_zoo_dir, *name.split("/"))


class ZooDatasetInfo(etas.Serializable):
    """Class containing info about a dataset in the FiftyOne Dataset Zoo.

    Args:
        zoo_dataset: the :class:`ZooDataset` instance for the dataset
        dataset_type: the :class:`fiftyone.types.Dataset` type of the dataset
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

        if inspect.isclass(dataset_type):
            dataset_type = dataset_type()

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
        :class:`fiftyone.types.Dataset` type, if any.
        """
        if self._dataset_type is None:
            return None

        return etau.get_class_name(self._dataset_type)

    @property
    def supported_splits(self):
        """A tuple of supported splits for the dataset, or None if the dataset
        does not have splits.
        """
        return self._zoo_dataset.supported_splits

    @property
    def url(self):
        """The dataset's URL, or None if it is not remotely-sourced."""
        if not self._zoo_dataset.is_remote:
            return None

        return self._zoo_dataset.url

    def get_zoo_dataset(self):
        """Returns the :class:`ZooDataset` instance for the dataset.

        Returns:
            a :class:`ZooDataset` instance
        """
        return self._zoo_dataset

    def get_dataset_type(self):
        """Returns the :class:`fiftyone.types.Dataset` type instance for the
        dataset.

        Returns:
            a :class:`fiftyone.types.Dataset` instance
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
        if self.url is not None:
            _attrs.append("url")
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
    def from_json(
        cls,
        json_path,
        zoo_dataset=None,
        upgrade=False,
        warn_deprecated=False,
    ):
        """Loads a :class:`ZooDatasetInfo` from a JSON file on disk.

        Args:
            json_path: path to JSON file
            zoo_dataset (None): an existing :class:`ZooDataset` instance
            upgrade (False): whether to upgrade the JSON file on disk if any
                migrations were necessary
            warn_deprecated (False): whether to issue a warning if the dataset
                has a deprecated format

        Returns:
            a :class:`ZooDatasetInfo`
        """
        dataset_dir = os.path.dirname(json_path)
        d = etas.read_json(json_path)

        # Handle remote zoo datasets
        if zoo_dataset is None:
            zoo_dataset_cls = etau.get_class(d["zoo_dataset"])
            if issubclass(zoo_dataset_cls, RemoteZooDataset):
                url = d.get("url")
                zoo_dataset = zoo_dataset_cls(dataset_dir, url=url)

        info, migrated = cls._from_dict(d, zoo_dataset=zoo_dataset)

        # Handle migrated zoo datasets
        if upgrade and migrated:
            logger.info("Migrating ZooDatasetInfo at '%s'", json_path)
            etau.move_file(json_path, json_path + ".bak")
            info.write_json(json_path, pretty_print=True)

        # Handle deprecated zoo datasets
        if warn_deprecated:
            if isinstance(info.get_zoo_dataset(), DeprecatedZooDataset):
                logger.warning(
                    "You are loading a previously downloaded zoo dataset that "
                    "has been upgraded in this version of FiftyOne. We "
                    "recommend that you discard your existing download by "
                    "deleting the '%s' directory and then re-download the "
                    "dataset to ensure that all import/download features are "
                    "available to you",
                    dataset_dir,
                )

        return info

    @classmethod
    def _from_dict(cls, d, zoo_dataset=None):
        # Handle any migrations from old `ZooDatasetInfo` instances
        d, migrated = _migrate_zoo_dataset_info(d)

        parameters = d.get("parameters", None)
        if zoo_dataset is None:
            kwargs = parameters or {}
            zoo_dataset = etau.get_class(d["zoo_dataset"])(**kwargs)

        dataset_type = d["dataset_type"]
        if dataset_type is not None:
            dataset_type = etau.get_class(dataset_type)

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
    def is_remote(self):
        """Whether the dataset is remotely-sourced."""
        return False

    @property
    def license(self):
        """The license or list,of,licenses under which the dataset is
        distributed, or None if unknown.
        """
        return None

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
    def has_patches(self):
        """Whether the dataset has patches that may need to be applied to
        already downloaded files.
        """
        return False

    @property
    def supports_partial_downloads(self):
        """Whether the dataset supports downloading partial subsets of its
        splits.
        """
        return False

    @property
    def requires_manual_download(self):
        """Whether this dataset requires some files to be manually downloaded
        by the user before the dataset can be loaded.
        """
        return False

    @property
    def importer_kwargs(self):
        """A dict of default kwargs to pass to this dataset's
        :class:`fiftyone.utils.data.importers.DatasetImporter`.
        """
        return {}

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

    def get_split_dir(self, dataset_dir, split):
        """Returns the directory for the given split of the dataset.

        Args:
            dataset_dir: the dataset directory
            split: the dataset split

        Returns:
            the directory that will/does hold the specified split
        """
        if not self.has_split(split):
            raise ValueError(
                "Invalid split '%s'; supported values are %s"
                % (split, self.supported_splits)
            )

        return os.path.join(dataset_dir, split)

    @staticmethod
    def has_info(dataset_dir):
        """Determines whether the directory contains :class:`ZooDatasetInfo`.

        Args:
            dataset_dir: the dataset directory

        Returns:
            True/False
        """
        info_path = ZooDataset.get_info_path(dataset_dir)
        return os.path.isfile(info_path)

    @staticmethod
    def load_info(dataset_dir, upgrade=True, warn_deprecated=False):
        """Loads the :class:`ZooDatasetInfo` from the given dataset directory.

        Args:
            dataset_dir: the directory in which to construct the dataset
            upgrade (True): whether to upgrade the JSON file on disk if any
                migrations were necessary
            warn_deprecated (False): whether to issue a warning if the dataset
                has a deprecated format

        Returns:
            the :class:`ZooDatasetInfo` for the dataset
        """
        info_path = ZooDataset.get_info_path(dataset_dir)
        return ZooDatasetInfo.from_json(
            info_path, upgrade=upgrade, warn_deprecated=warn_deprecated
        )

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
        dataset_dir,
        split=None,
        splits=None,
        cleanup=True,
    ):
        """Downloads the dataset and prepares it for use.

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
            cleanup (True): whether to cleanup any temporary files generated
                during download

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
            info = ZooDatasetInfo.from_json(
                info_path,
                zoo_dataset=self,
                upgrade=True,
                warn_deprecated=True,
            )
        else:
            info = None

        scratch_dir = os.path.join(dataset_dir, "tmp-download")
        write_info = False

        # Download dataset, if necessary
        if splits:
            # Handle already downloaded splits
            if info is not None:
                download_splits = self._get_splits_to_download(
                    splits, dataset_dir, info
                )
            else:
                download_splits = splits

            # Download necessary splits
            for split in download_splits:
                split_dir = self.get_split_dir(dataset_dir, split)

                if self.supports_partial_downloads:
                    suffix = " if necessary"
                else:
                    suffix = ""

                if self.requires_manual_download:
                    logger.info(
                        "Preparing split '%s' in '%s'%s",
                        split,
                        split_dir,
                        suffix,
                    )
                else:
                    logger.info(
                        "Downloading split '%s' to '%s'%s",
                        split,
                        split_dir,
                        suffix,
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

                if self.supports_partial_downloads and num_samples is None:
                    logger.info(
                        "Existing download of split '%s' is sufficient", split
                    )
                    write_info = False
                else:
                    split_info = ZooDatasetSplitInfo(split, num_samples)
                    info.add_split(split_info)
                    write_info = True
        else:
            # Handle already downloaded datasets
            if not self._is_dataset_ready(dataset_dir, info):
                if self.supports_partial_downloads:
                    suffix = " if necessary"
                else:
                    suffix = ""

                if self.requires_manual_download:
                    logger.info(
                        "Preparing dataset in '%s'%s", dataset_dir, suffix
                    )
                else:
                    logger.info(
                        "Downloading dataset to '%s'%s", dataset_dir, suffix
                    )

                (
                    dataset_type,
                    num_samples,
                    classes,
                ) = self._download_and_prepare(dataset_dir, scratch_dir, None)

                if self.supports_partial_downloads and num_samples is None:
                    logger.info("Existing download is sufficient")
                    write_info = False
                else:
                    info = ZooDatasetInfo(
                        self, dataset_type, num_samples, classes=classes
                    )
                    write_info = True

        if write_info:
            info.write_json(info_path, pretty_print=True)
            logger.info("Dataset info written to '%s'", info_path)

        if cleanup:
            etau.delete_dir(scratch_dir)

        return info

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        """Internal implementation of downloading the dataset and preparing it
        for use in the given directory.

        Args:
            dataset_dir: the directory in which to construct the dataset. If
                a ``split`` is provided, this is the directory for the split
            scratch_dir: a scratch directory to use to download and prepare
                any required intermediate files
            split: the split to download, or None if the dataset does not have
                splits

        Returns:
            tuple of

            -   dataset_type: the :class:`fiftyone.types.Dataset` type of the
                dataset
            -   num_samples: the number of samples in the split. For datasets
                that support partial downloads, this can be ``None``, which
                indicates that all content was already downloaded
            -   classes: an optional list of class label strings
        """
        raise NotImplementedError(
            "subclasses must implement _download_and_prepare()"
        )

    def _patch_if_necessary(self, dataset_dir, split):
        """Internal method called when an already downloaded dataset may need
        to be patched.

        Args:
            dataset_dir: the directory containing the dataset
            split: the split to patch, or None if the dataset does not have
                splits
        """
        raise NotImplementedError(
            "subclasses must implement _patch_if_necessary()"
        )

    def _get_splits_to_download(self, splits, dataset_dir, info):
        download_splits = []
        for split in splits:
            if not self._is_split_ready(dataset_dir, split, info):
                download_splits.append(split)

        return download_splits

    def _is_split_ready(self, dataset_dir, split, info):
        split_dir = self.get_split_dir(dataset_dir, split)

        if not os.path.isdir(split_dir):
            return False

        if split not in info.downloaded_splits:
            return False

        if self.has_patches:
            self._patch_if_necessary(dataset_dir, split)

        if self.supports_partial_downloads:
            return False

        if self.requires_manual_download:
            logger.info("Split '%s' already prepared", split)
        else:
            logger.info("Split '%s' already downloaded", split)

        return True

    def _is_dataset_ready(self, dataset_dir, info):
        if not os.path.isdir(dataset_dir):
            return False

        if info is None:
            return False

        if self.has_patches:
            self._patch_if_necessary(dataset_dir, None)

        if self.supports_partial_downloads:
            return False

        if self.requires_manual_download:
            logger.info("Dataset already prepared")
        else:
            logger.info("Dataset already downloaded")

        return True


class RemoteZooDataset(ZooDataset):
    """Class for working with remotely-sourced datasets that are compatible
    with the FiftyOne Dataset Zoo.

    Args:
        dataset_dir: the dataset's local directory, which must contain a valid
            dataset YAML file
        url (None): the dataset's remote source, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file

            This is explicitly provided rather than relying on the YAML file's
            ``url`` property in case the caller has specified a particular
            branch or commit
        **kwargs: optional keyword arguments for the dataset's
            `download_and_prepare()` and/or `load_dataset()` methods
    """

    def __init__(self, dataset_dir, url=None, **kwargs):
        d = _load_dataset_metadata(dataset_dir)

        if url is not None:
            url = _normalize_ref(url)
        else:
            url = d.get("url")

        self._dataset_dir = dataset_dir
        self._metadata = d
        self._url = url
        self._kwargs = kwargs

        self._name = d["name"]
        self._author = d.get("author")
        self._version = d.get("version")
        self._source = d.get("source")
        self._license = d.get("license")
        self._description = d.get("description")
        self._fiftyone_version = d.get("fiftyone", {}).get("version", None)
        self._supports_partial_downloads = d.get(
            "supports_partial_downloads", False
        )
        self._tags = self._parse_tuple(d, "tags")
        self._splits = self._parse_tuple(d, "splits")
        self._size_samples = d.get("size_samples")

    @staticmethod
    def _parse_tuple(d, key):
        value = d.get(key)
        if value is None:
            return None

        if not etau.is_container(value):
            return (value,)

        return tuple(value)

    @property
    def metadata(self):
        return self._metadata.copy()

    @property
    def name(self):
        return self._name

    @property
    def url(self):
        return self._url

    @property
    def is_remote(self):
        return True

    @property
    def author(self):
        return self._author

    @property
    def version(self):
        return self._version

    @property
    def source(self):
        return self._source

    @property
    def license(self):
        return self._license

    @property
    def description(self):
        return self._description

    @property
    def fiftyone_version(self):
        return self._fiftyone_version

    @property
    def tags(self):
        return self._tags

    @property
    def supported_splits(self):
        return self._splits

    @property
    def supports_partial_downloads(self):
        return self._supports_partial_downloads

    @property
    def size_samples(self):
        return self._size_samples

    def _download_and_prepare(self, dataset_dir, _, split):
        if split is not None:
            dataset_dir = os.path.dirname(dataset_dir)

        module = self._import_module(dataset_dir)
        if not hasattr(module, "download_and_prepare"):
            raise ValueError(
                f"Module {dataset_dir} has no 'download_and_prepare()' method"
            )

        kwargs, _ = fou.extract_kwargs_for_function(
            module.download_and_prepare, self._kwargs
        )
        if split is not None:
            kwargs["split"] = split

        return module.download_and_prepare(dataset_dir, **kwargs)

    def _load_dataset(self, dataset, dataset_dir, split=None):
        if split is not None:
            dataset_dir = os.path.dirname(dataset_dir)

        module = self._import_module(dataset_dir)
        if not hasattr(module, "load_dataset"):
            raise ValueError(
                f"Module {dataset_dir} has no 'load_dataset()' method"
            )

        kwargs, _ = fou.extract_kwargs_for_function(
            module.load_dataset, self._kwargs
        )
        if split is not None:
            kwargs["split"] = split

        return module.load_dataset(dataset, dataset_dir, **kwargs)

    def _import_module(self, dataset_dir):
        module_path = os.path.join(dataset_dir, "__init__.py")
        module_name = os.path.relpath(
            dataset_dir, fo.config.dataset_zoo_dir
        ).replace("/", ".")
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module.__name__] = module
        spec.loader.exec_module(module)
        return module


def _normalize_ref(url_or_gh_repo):
    if etaw.is_url(url_or_gh_repo):
        return url_or_gh_repo

    return "https://github.com/" + url_or_gh_repo


def _load_dataset_metadata(dataset_dir):
    yaml_path = None

    for filename in DATASET_METADATA_FILENAMES:
        metadata_path = os.path.join(dataset_dir, filename)
        if os.path.isfile(metadata_path):
            yaml_path = metadata_path

    if yaml_path is None:
        raise ValueError(
            "Directory '%s' does not contain a dataset YAML file" % dataset_dir
        )

    with open(yaml_path, "r") as f:
        d = yaml.safe_load(f)

    type = d.get("type")
    if type is not None and type != "dataset":
        raise ValueError(
            "Expected type='dataset' but found type='%s' in YAML file '%s'"
            % (type, yaml_path)
        )

    return d


def _download_dataset_metadata(url_or_gh_repo, overwrite=False):
    url = None
    repo = None
    if etaw.is_url(url_or_gh_repo):
        if "github" in url_or_gh_repo:
            repo = GitHubRepository(url_or_gh_repo)
        else:
            url = url_or_gh_repo
    else:
        repo = GitHubRepository(url_or_gh_repo)

    with etau.TempDir() as tmpdir:
        logger.info(f"Downloading {url_or_gh_repo}...")
        try:
            if repo is not None:
                repo.download(tmpdir)
            else:
                _download_archive(url, tmpdir)
        except Exception as e:
            raise ValueError(
                f"Failed to retrieve dataset metadata from '{url_or_gh_repo}'"
            ) from e

        yaml_path = _find_dataset_metadata(tmpdir)

        if yaml_path is None:
            raise ValueError(f"No dataset YAML file found in {url_or_gh_repo}")

        with open(yaml_path, "r") as f:
            d = yaml.safe_load(f)

        name = d["name"]
        from_dir = os.path.dirname(yaml_path)
        dataset_dir = _get_zoo_dataset_dir(name)

        if ZooDataset.has_info(dataset_dir) and not overwrite:
            raise ValueError(
                f"A dataset with name '{name}' already exists. Pass "
                "'overwrite=True' if you wish to overwrite it"
            )

        etau.copy_dir(from_dir, dataset_dir)

        return dataset_dir


def _find_dataset_metadata(root_dir):
    if not root_dir or not os.path.isdir(root_dir):
        return

    yaml_path = None
    for root, dirs, files in os.walk(root_dir, followlinks=True):
        # Ignore hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for file in files:
            if os.path.basename(file) in DATASET_METADATA_FILENAMES:
                _yaml_path = os.path.join(root, file)

                try:
                    with open(_yaml_path, "r") as f:
                        type = yaml.safe_load(f).get("type")
                except:
                    logger.warning(f"Failed to parse '{_yaml_path}'")
                    continue

                if type == "dataset":
                    return _yaml_path
                elif type is None:
                    # We found a YAML file with no type. If we don't find
                    # anything better, we'll use it
                    yaml_path = _yaml_path

    return yaml_path


def _download_archive(url, outdir):
    archive_name = os.path.basename(url)
    if not os.path.splitext(archive_name)[1]:
        raise ValueError(f"Cannot infer appropriate archive type for '{url}'")

    archive_path = os.path.join(outdir, archive_name)
    etaw.download_file(url, path=archive_path)
    etau.extract_archive(archive_path)


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
            "available via this source. "
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
    dataset_type = d.get("dataset_type", None)

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
    if dataset_type is not None:
        _dt = "fiftyone.types"
        if dataset_type.endswith(".ImageClassificationDataset"):
            dataset_type = _dt + ".FiftyOneImageClassificationDataset"
            migrated = True

        if dataset_type.endswith(".ImageDetectionDataset"):
            dataset_type = _dt + ".FiftyOneImageDetectionDataset"
            migrated = True

    # @legacy dataset implementations
    if zoo_dataset.endswith(
        (
            "tf.Caltech101Dataset",
            "tf.KITTIDataset",
            "tf.COCO2014Dataset",
            "tf.COCO2017Dataset",
            "torch.COCO2014Dataset",
            "torch.COCO2017Dataset",
        ),
    ):
        zoo_dataset = etau.get_class_name(DeprecatedZooDataset)
        migrated = True

    d["zoo_dataset"] = zoo_dataset
    d["dataset_type"] = dataset_type

    return d, migrated
