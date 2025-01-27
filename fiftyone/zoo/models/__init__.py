"""
The FiftyOne Model Zoo.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import importlib
import logging
import os
import sys
import weakref

from eta.core.config import ConfigError
import eta.core.learning as etal
import eta.core.models as etam
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.models as fom
from fiftyone.utils.github import GitHubRepository


MODELS_MANIEST_FILENAME = "manifest.json"
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_BUILTIN_MODELS_MANIFEST_PATT = os.path.join(_THIS_DIR, "manifest-*.json")
_MODELS = weakref.WeakValueDictionary()

logger = logging.getLogger(__name__)


def list_zoo_models(tags=None, source=None):
    """Returns the list of available models in the FiftyOne Model Zoo.

    Also includes models from any remote sources that you've registered.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # List all zoo models
        #

        names = foz.list_zoo_models()
        print(names)

        #
        # List all zoo models with the specified tag(s)
        #

        names = foz.list_zoo_models(tags="torch")
        print(names)

    Args:
        tags (None): only include models that have the specified tag or list
            of tags
        source (None): only include models available via the given remote
            source

    Returns:
        a list of model names
    """
    models = _list_zoo_models(tags=tags, source=source)
    return sorted(model.name for model in models)


def _list_zoo_models(tags=None, source=None):
    manifest, remote_sources = _load_zoo_models_manifest()

    if source is not None:
        manifest = remote_sources.get(source, None)
        if manifest is None:
            return []

    if tags is not None:
        if etau.is_str(tags):
            tags = {tags}
        else:
            tags = set(tags)

        manifest = [model for model in manifest if tags.issubset(model.tags)]

    return list(manifest)


def list_downloaded_zoo_models():
    """Returns information about the zoo models that have been downloaded.

    Returns:
        a dict mapping model names to (model path, :class:`ZooModel`) tuples
    """
    manifest, _ = _load_zoo_models_manifest()
    models_dir = fo.config.model_zoo_dir

    models = {}
    for model in manifest:
        if model.is_in_dir(models_dir):
            model_path = model.get_path_in_dir(models_dir)
            models[model.name] = (model_path, model)

    return models


def is_zoo_model_downloaded(name):
    """Determines whether the zoo model of the given name is downloaded.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model

    Returns:
        True/False
    """
    model = _get_model(name)
    models_dir = fo.config.model_zoo_dir
    return model.is_in_dir(models_dir)


def download_zoo_model(name_or_url, model_name=None, overwrite=False):
    """Downloads the specified model from the FiftyOne Model Zoo.

    If the model is already downloaded, it is not re-downloaded unless
    ``overwrite == True`` is specified.

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Args:
        name_or_url: the name of the zoo model to download, which can have
            ``@<ver>`` appended to refer to a specific version of the model, or
            the remote source to download it from, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
        model_name (None): the specific model to download, if ``name_or_url``
            is a remote source
        overwrite (False): whether to overwrite any existing files

    Returns:
        tuple of

        -   model: the :class:`ZooModel` for the model
        -   model_path: the path to the downloaded model on disk
    """
    model, model_path = _get_model_in_dir(name_or_url, model_name=model_name)

    if not overwrite and is_zoo_model_downloaded(model.name):
        logger.info("Model '%s' is already downloaded", model.name)
    elif model.manager is not None:
        model.manager.download_model(model_path, force=overwrite)
    else:
        logger.info(
            "Model '%s' downloading is not managed by FiftyOne",
            model.name,
        )

    return model, model_path


def install_zoo_model_requirements(name, error_level=None):
    """Installs any package requirements for the specified zoo model.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model
        error_level (None): the error level to use, defined as:

            -   0: raise error if a requirement install fails
            -   1: log warning if a requirement install fails
            -   2: ignore install fails requirements

            By default, ``fo.config.requirement_error_level`` is used
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    model = _get_model(name)
    model.install_requirements(error_level=error_level)


def ensure_zoo_model_requirements(name, error_level=None, log_success=True):
    """Ensures that the package requirements for the specified zoo model are
    satisfied.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model
        error_level (None): the error level to use when installing/ensuring
            requirements, defined as:

            -   0: raise error if a requirement is not satisfied
            -   1: log warning if a requirement is not satisfied
            -   2: ignore unsatisfied requirements

            By default, ``fo.config.requirement_error_level`` is used
        log_success (True): whether to generate a log message when a
            requirement is satisfied
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    model = _get_model(name)
    model.ensure_requirements(error_level=error_level, log_success=log_success)


def load_zoo_model(
    name_or_url,
    model_name=None,
    download_if_necessary=True,
    ensure_requirements=True,
    install_requirements=False,
    error_level=None,
    cache=True,
    **kwargs,
):
    """Loads the specified model from the FiftyOne Model Zoo.

    By default, the model will be downloaded if necessary, and any documented
    package requirements will be checked to ensure that they are installed.

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Args:
        name_or_url: the name of the zoo model to load, which can have
            ``@<ver>`` appended to refer to a specific version of the model, or
            the remote source to load it from, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
        model_name (None): the specific model to load, if ``name_or_url`` is a
            remote source
        download_if_necessary (True): whether to download the model if
            necessary
        ensure_requirements (True): whether to ensure any requirements are
            installed before loading the model
        install_requirements (False): whether to install any requirements
            before loading the model
        error_level (None): the error level to use when installing/ensuring
            requirements, defined as:

            -   0: raise error if a requirement is not satisfied
            -   1: log warning if a requirement is not satisfied
            -   2: ignore unsatisfied requirements

            By default, ``fo.config.requirement_error_level`` is used
        cache (True): whether to store a weak reference to the model so that
            running this method again will return the same instance while the
            model is still in use
        **kwargs: keyword arguments to inject into the model's ``Config``
            instance

    Returns:
        a :class:`fiftyone.core.models.Model`
    """
    if model_name is not None:
        name = model_name
    else:
        name = name_or_url

    if cache:
        key = _get_cache_key(name, **kwargs)
        if key is not None and key in _MODELS:
            return _MODELS[key]

    if error_level is None:
        error_level = fo.config.requirement_error_level

    model = _get_model(name_or_url, model_name=model_name)
    models_dir = fo.config.model_zoo_dir

    if model.manager is not None and not model.is_in_dir(models_dir):
        if not download_if_necessary:
            raise ValueError("Model '%s' is not downloaded" % name)

        download_zoo_model(name)

    if install_requirements:
        model.install_requirements(error_level=error_level)
    elif ensure_requirements:
        model.ensure_requirements(error_level=error_level)

    config_dict = deepcopy(model.default_deployment_config_dict)

    if isinstance(model, RemoteZooModel) and config_dict is None:
        model = model._load_model(**kwargs)
    else:
        model_path = model.get_path_in_dir(models_dir)
        model = fom.load_model(config_dict, model_path=model_path, **kwargs)

    if cache and key is not None:
        _MODELS[key] = model

    return model


def find_zoo_model(name):
    """Returns the path to the zoo model on disk.

    The model must be downloaded. Use :func:`download_zoo_model` to download
    models.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model

    Returns:
        the path to the model on disk

    Raises:
        ValueError: if the model does not exist or has not been downloaded
    """
    model, model_path = _get_model_in_dir(name)
    if not model.is_model_downloaded(model_path):
        raise ValueError("Model '%s' is not downloaded" % name)

    return model_path


def get_zoo_model(name):
    """Returns the :class:`ZooModel` instance for the specified zoo model.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model

    Returns:
        a :class:`ZooModel`
    """
    return _get_model(name)


def delete_zoo_model(name):
    """Deletes the zoo model from local disk, if necessary.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model
    """
    model, model_path = _get_model_in_dir(name)
    model.flush_model(model_path)


def list_zoo_model_sources():
    """Returns the list of remote model sources that are registered locally.

    Returns:
        the list of remote sources
    """
    _, remote_sources = _load_zoo_models_manifest()
    return sorted(remote_sources.keys())


def register_zoo_model_source(url_or_gh_repo, overwrite=False):
    """Registers a remote source of models, if necessary.

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Args:
        url_or_gh_repo: the remote source to register, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
        overwrite (False): whether to overwrite any existing files
    """
    _parse_model_identifier(url_or_gh_repo, overwrite=overwrite)


def delete_zoo_model_source(url_or_gh_repo):
    """Deletes the specified remote source and all downloaded models associated
    with it.

    Args:
        url_or_gh_repo: the remote source to delete, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file
    """
    url = _normalize_ref(url_or_gh_repo)
    _, remote_sources = _load_zoo_models_manifest()

    manifest = remote_sources.get(url, None)
    if manifest is not None:
        models_dir = os.path.dirname(manifest.path)
        if models_dir != fo.config.model_zoo_dir:
            etau.delete_dir(models_dir)
        else:
            logger.warning("Cannot delete top-level model zoo directory")
    else:
        raise ValueError(f"Source '{url_or_gh_repo}' not found in the zoo")


class HasZooModel(etal.HasPublishedModel):
    """Mixin class for Config classes of :class:`fiftyone.core.models.Model`
    instances whose models are stored in the FiftyOne Model Zoo.

    This class provides the following functionality:

    -   The model to load can be specified either by:

        (a) providing a `model_name`, which specifies the zoo model to load.
            The model will be downloaded, if necessary

        (b) providing a `model_path`, which directly specifies the path to the
            model to load

    -   :class:`fiftyone.core.models.ModelConfig` definitions that use zoo
        models with default deployments will have default values for any
        unspecified parameters loaded and applied at runtime

    Args:
        model_name: the name of the zoo model to load. If this value is
            provided, `model_path` does not need to be
        model_path: the path to an already downloaded zoo model on disk to
            load. If this value is provided, `model_name` does not need to be
    """

    def download_model_if_necessary(self):
        # pylint: disable=attribute-defined-outside-init
        if not self.model_name and not self.model_path:
            raise ConfigError(
                "Either `model_name` or `model_path` must be provided"
            )

        if self.model_path is None:
            self.model_path = download_zoo_model(self.model_name)

    @classmethod
    def _get_model(cls, model_name):
        return get_zoo_model(model_name)


class ZooModel(etam.Model):
    """Class describing a model in the FiftyOne Model Zoo.

    Args:
        base_name: the base name of the model (no version info)
        base_filename (None): the base filename or directory of the model
            (no version info), if applicable
        author (None): the author of the model
        version (None): the version of the model
        url (None): the URL at which the model is hosted
        license (None): the license under which the model is distributed
        source (None): the source of the model
        description (None): the description of the model
        tags (None): a list of tags for the model
        size_bytes (None): the size of the model on disk
        date_added (None): the datetime that the model was added to the zoo
        requirements (None): the ``eta.core.models.ModelRequirements`` for the
            model
        manager (None): the :class:`fiftyone.core.models.ModelManager` instance
            that describes the remote storage location of the model, if
            applicable
        default_deployment_config_dict (None): a
            :class:`fiftyone.core.models.ModelConfig` dict describing the
            recommended settings for deploying the model
    """

    _REQUIREMENT_ERROR_SUFFIX = (
        "If you think this error is inaccurate, you can set "
        "`fiftyone.config.requirement_error_level` to 1 (warning) or 2 (ignore).\n"
        "See https://docs.voxel51.com/user_guide/config.html for details."
    )


class RemoteZooModel(ZooModel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if self.manager is None:
            config = RemoteModelManagerConfig(dict(model_name=self.name))
            self.manager = RemoteModelManager(config)

    def _get_model_path(self):
        return self.get_path_in_dir(fo.config.model_zoo_dir)

    def _load_model(self, **kwargs):
        model_path = self._get_model_path()
        return _load_remote_model(self.name, model_path, **kwargs)

    def _get_parameters(self, ctx, inputs):
        model_path = self._get_model_path()
        _get_remote_model_parameters(self.name, model_path, ctx, inputs)

    def _parse_parameters(self, ctx, params):
        model_path = self._get_model_path()
        _parse_remote_model_parameters(self.name, model_path, ctx, params)


class RemoteModelManagerConfig(etam.ModelManagerConfig):
    def __init__(self, d):
        super().__init__(d)
        self.model_name = self.parse_string(d, "model_name")


class RemoteModelManager(etam.ModelManager):
    def _download_model(self, model_path):
        _download_remote_model(self.config.model_name, model_path)


def _download_remote_model(model_name, model_path):
    model_dir = os.path.dirname(model_path)

    module = _import_zoo_module(model_dir)
    if not hasattr(module, "download_model"):
        raise ValueError(
            f"Module {model_dir} has no 'download_model()' method"
        )

    module.download_model(model_name, model_path)


def _load_remote_model(model_name, model_path, **kwargs):
    model_dir = os.path.dirname(model_path)

    module = _import_zoo_module(model_dir)
    if not hasattr(module, "load_model"):
        raise ValueError(f"Module {model_dir} has no 'load_model()' method")

    return module.load_model(model_name, model_path, **kwargs)


def _get_remote_model_parameters(model_name, model_path, ctx, inputs):
    model_dir = os.path.dirname(model_path)

    module = _import_zoo_module(model_dir)
    if hasattr(module, "get_parameters"):
        module.get_parameters(model_name, ctx, inputs)


def _parse_remote_model_parameters(model_name, model_path, ctx, params):
    model_dir = os.path.dirname(model_path)

    module = _import_zoo_module(model_dir)
    if hasattr(module, "parse_parameters"):
        module.parse_parameters(model_name, ctx, params)


def _import_zoo_module(model_dir):
    module_path = os.path.join(model_dir, "__init__.py")
    module_name = os.path.relpath(model_dir, fo.config.model_zoo_dir).replace(
        "/", "."
    )
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module.__name__] = module
    spec.loader.exec_module(module)
    return module


class ZooModelsManifest(etam.ModelsManifest):
    """Class that describes the collection of models in the FiftyOne Model Zoo.

    Args:
        models: a list of :class:`ZooModel` instances
    """

    _MODEL_CLS = ZooModel


class RemoteZooModelsManifest(ZooModelsManifest):
    """Class that describes the collection of remotely-sourced models in the
    FiftyOne Model Zoo.

    Args:
        models: a list of :class:`RemoteZooModel` instances
    """

    _MODEL_CLS = RemoteZooModel


def _load_zoo_models_manifest():
    manifest = ZooModelsManifest()
    remote_sources = {}

    # Builtin manifests
    manifest_paths = etau.get_glob_matches(_BUILTIN_MODELS_MANIFEST_PATT)
    if fo.config.model_zoo_manifest_paths:
        manifest_paths.extend(fo.config.model_zoo_manifest_paths)

    # Custom manifests
    for manifest_path in manifest_paths:
        _merge_manifest(manifest, manifest_path)

    # Remote manifests
    for manifest_path in _iter_model_manifests():
        _merge_remote_manifest(manifest, remote_sources, manifest_path)

    return manifest, remote_sources


def _merge_manifest(manifest, manifest_path, sources=None):
    try:
        _manifest = ZooModelsManifest.from_json(manifest_path)
    except Exception as e:
        logger.warning(f"Failed to load manifest '{manifest_path}': {e}")
        return

    if sources is not None and _manifest.url is not None:
        sources[manifest_path] = _manifest

    manifest.merge(_manifest, error_level=1)


def _merge_remote_manifest(manifest, sources, manifest_path):
    try:
        _manifest = RemoteZooModelsManifest.from_json(manifest_path)
    except Exception as e:
        logger.warning(f"Failed to load manifest '{manifest_path}': {e}")
        return

    if _manifest.url is not None:
        _manifest.path = manifest_path
        sources[_manifest.url] = _manifest

    manifest.merge(_manifest, error_level=1)


def _iter_model_manifests(root_dir=None):
    if root_dir is None:
        root_dir = fo.config.model_zoo_dir

    if not root_dir or not os.path.isdir(root_dir):
        return

    for root, dirs, files in os.walk(root_dir, followlinks=True):
        # Ignore hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for file in files:
            if os.path.basename(file) == MODELS_MANIEST_FILENAME:
                yield os.path.join(root, file)

                # Stop traversing `root` once we find a plugin
                dirs[:] = []
                break


def _normalize_ref(url_or_gh_repo):
    if etaw.is_url(url_or_gh_repo):
        return url_or_gh_repo

    return "https://github.com/" + url_or_gh_repo


def _download_model_metadata(url_or_gh_repo, overwrite=False):
    url = _normalize_ref(url_or_gh_repo)
    if "github" in url:
        repo = GitHubRepository(url_or_gh_repo)
    else:
        repo = None

    with etau.TempDir() as tmpdir:
        logger.info(f"Downloading {url_or_gh_repo}...")
        try:
            if repo is not None:
                repo.download(tmpdir)
            else:
                _download_archive(url, tmpdir)
        except Exception as e:
            raise ValueError(
                f"Failed to retrieve model metadata from '{url_or_gh_repo}'"
            ) from e

        manifest_paths = list(_iter_model_manifests(root_dir=tmpdir))

        if not manifest_paths:
            logger.info(f"No model manifests found in '{url_or_gh_repo}'")

        for manifest_path in manifest_paths:
            try:
                manifest = ZooModelsManifest.from_json(manifest_path)
            except Exception as e:
                logger.warning(
                    f"Failed to load manifest '{manifest_path}': {e}"
                )
                continue

            if manifest.name is None:
                logger.warning(
                    f"Skipping manifest '{manifest_path}' with no 'name'"
                )
                continue

            from_dir = os.path.dirname(manifest_path)
            models_dir = os.path.join(fo.config.model_zoo_dir, manifest.subdir)
            if os.path.isdir(models_dir):
                if overwrite:
                    logger.info(
                        f"Overwriting existing model source '{models_dir}'"
                    )
                else:
                    raise ValueError(
                        f"A model source with name '{manifest.name}' already "
                        "exists. Pass 'overwrite=True' if you wish to "
                        "overwrite it"
                    )

            # We could be working with a specific branch or commit, so store it
            manifest.url = url
            manifest.write_json(manifest_path, pretty_print=True)

            etau.copy_dir(from_dir, models_dir)


def _download_archive(url, outdir):
    archive_name = os.path.basename(url)
    if not os.path.splitext(archive_name)[1]:
        raise ValueError(f"Cannot infer appropriate archive type for '{url}'")

    archive_path = os.path.join(outdir, archive_name)
    etaw.download_file(url, path=archive_path)
    etau.extract_archive(archive_path)


def _get_model_in_dir(name_or_url, model_name=None):
    model = _get_model(name_or_url, model_name=model_name)
    models_dir = fo.config.model_zoo_dir
    model_path = model.get_path_in_dir(models_dir)
    return model, model_path


def _parse_model_identifier(url_or_gh_repo, overwrite=False):
    url = _normalize_ref(url_or_gh_repo)

    _, remote_sources = _load_zoo_models_manifest()

    if overwrite or url not in remote_sources:
        _download_model_metadata(url, overwrite=overwrite)


def _get_model(name_or_url, model_name=None):
    if model_name is not None:
        name = model_name
        url_or_gh_repo = name_or_url
    else:
        name = name_or_url
        url_or_gh_repo = None

    if url_or_gh_repo is not None:
        _parse_model_identifier(url_or_gh_repo)

    if ZooModel.has_version_str(name):
        return _get_exact_model(name)

    return _get_latest_model(name)


def _get_exact_model(name):
    manifest, _ = _load_zoo_models_manifest()
    try:
        return manifest.get_model_with_name(name)
    except etam.ModelError:
        raise ValueError(f"Model '{name}' not found in the zoo")


def _get_latest_model(base_name):
    manifest, _ = _load_zoo_models_manifest()
    try:
        return manifest.get_latest_model_with_base_name(base_name)
    except etam.ModelError:
        raise ValueError(f"Model '{base_name}' not found in the zoo")


def _get_cache_key(name, **kwargs):
    if not kwargs:
        return name

    try:
        # convert to str because kwargs may contain unhashable types like lists
        return str(
            (("name", name),)
            + tuple((k, kwargs[k]) for k in sorted(kwargs.keys()))
        )
    except:
        return None
