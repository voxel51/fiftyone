"""
The FiftyOne Model Zoo.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import logging
import os

from eta.core.config import ConfigError
import eta.core.learning as etal
import eta.core.models as etam
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.models as fom


logger = logging.getLogger(__name__)


_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_MODELS_MANIFEST_PATT = os.path.join(_THIS_DIR, "manifest-*.json")


def list_zoo_models():
    """Returns the list of available models in the FiftyOne Model Zoo.

    Returns:
        a list of model names
    """
    manifest = _load_zoo_models_manifest()
    return sorted([model.name for model in manifest])


def list_downloaded_zoo_models():
    """Returns information about the zoo models that have been downloaded.

    Returns:
        a dict mapping model names to (model path, :class:`ZooModel`) tuples
    """
    manifest = _load_zoo_models_manifest()
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
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is used

    Returns:
        True/False
    """
    model = _get_model(name)
    models_dir = fo.config.model_zoo_dir
    return model.is_in_dir(models_dir)


def download_zoo_model(name, overwrite=False):
    """Downloads the model of the given name from the FiftyOne Dataset Zoo.

    If the model is already downloaded, it is not re-downloaded unless
    ``overwrite == True`` is specified.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is used. Call
            :func:`list_zoo_models` to see the available models
        overwrite (False): whether to overwrite any existing files

    Returns:
        tuple of

        -   model: the :class:`ZooModel` for the model
        -   model_path: the path to the downloaded model on disk
    """
    model, model_path = _get_model_in_dir(name)

    if not overwrite and is_zoo_model_downloaded(name):
        logger.info("Model '%s' is already downloaded", name)
    else:
        model.manager.download_model(model_path, force=overwrite)

    return model, model_path


def install_zoo_model_requirements(name, error_level=None):
    """Installs any package requirements for the zoo model with the given name.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is used. Call
            :func:`list_zoo_models` to see the available models
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
    """Ensures that the package requirements for the zoo model with the given
    name are satisfied.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is used. Call
            :func:`list_zoo_models` to see the available models
        error_level (None): the error level to use when installing/ensuring
            requirements, defined as:

            -   0: raise error if a requirement is not satisfied
            -   1: log warning if a requirement is not satisifed
            -   2: ignore unsatisifed requirements

            By default, ``fo.config.requirement_error_level`` is used
        log_success (True): whether to generate a log message when a
            requirement is satisifed
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    model = _get_model(name)
    model.ensure_requirements(error_level=error_level, log_success=log_success)


def load_zoo_model(
    name,
    download_if_necessary=True,
    install_requirements=False,
    error_level=None,
    **kwargs,
):
    """Loads the model of the given name from the FiftyOne Model Zoo.

    By default, the model will be downloaded if necessary if it does not
    exist in ``fiftyone.config.model_zoo_dir``.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is downloaded. Call
            :func:`list_zoo_models` to see the available models
        download_if_necessary (True): whether to download the model if it is
            not found in the specified directory
        install_requirements: whether to install any requirements before
            loading the model. By default, this is False
        error_level (None): the error level to use when installing/ensuring
            requirements, defined as:

            -   0: raise error if a requirement is not satisfied
            -   1: log warning if a requirement is not satisifed
            -   2: ignore unsatisifed requirements

            By default, ``fo.config.requirement_error_level`` is used
        **kwargs: keyword arguments to inject into the model's ``Config``
            instance

    Returns:
        a :class:`fiftyone.core.models.Model`
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    model = _get_model(name)
    models_dir = fo.config.model_zoo_dir

    if not model.is_in_dir(models_dir):
        if not download_if_necessary:
            raise ValueError("Model '%s' is not downloaded" % name)

        download_zoo_model(name)

    if install_requirements:
        model.install_requirements(error_level=error_level)
    else:
        model.ensure_requirements(error_level=error_level)

    config_dict = deepcopy(model.default_deployment_config_dict)
    model_path = model.get_path_in_dir(models_dir)

    return fom.load_model(config_dict, model_path=model_path, **kwargs)


def find_zoo_model(name):
    """Returns the path to the zoo model on disk.

    The model must be downloaded. Use :func:`download_zoo_model` to download
    models.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is used

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
    """Returns the :class:`ZooModel` instance for the model with the given
    name.

    Args:
        name: the name of the zoo model

    Returns:
        a :class:`ZooModel`
    """
    return _get_model(name)


def delete_zoo_model(name):
    """Deletes the zoo model from local disk, if necessary.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is used
    """
    model, model_path = _get_model_in_dir(name)
    model.flush_model(model_path)


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
        base_filename: the base filename of the model (no version info)
        manager: the :class:`fiftyone.core.models.ModelManager` instance that
            describes the remote storage location of the model
        version (None): the version of the model
        description (None): the description of the model
        source (None): the source of the model
        size_bytes (None): the size of the model on disk
        default_deployment_config_dict (None): a
            :class:`fiftyone.core.models.ModelConfig` dict describing the
            recommended settings for deploying the model
        requirements (None): the ``eta.core.models.ModelRequirements`` for the
            model
        tags (None): a list of tags for the model
        date_added (None): the datetime that the model was added to the zoo
    """

    _REQUIREMENT_ERROR_SUFFIX = (
        "If you think this error is inaccurate, you can set "
        "`fiftyone.config.requirement_error_level` to 1 (warning) or 2 (ignore).\n"
        "See https://docs.voxel51.com/user_guide/config.html for details."
    )


class ZooModelsManifest(etam.ModelsManifest):
    """Class that describes the collection of models in the FiftyOne Model Zoo.

    Args:
        models: a list of :class:`ZooModel` instances
    """

    _MODEL_CLS = ZooModel


def _load_zoo_models_manifest():
    manifest = ZooModelsManifest()

    manifest_paths = etau.get_glob_matches(_MODELS_MANIFEST_PATT)
    if fo.config.model_zoo_manifest_paths:
        manifest_paths.extend(fo.config.model_zoo_manifest_paths)

    for manifest_path in manifest_paths:
        manifest.merge(ZooModelsManifest.from_json(manifest_path))

    return manifest


def _get_model_in_dir(name):
    model = _get_model(name)
    models_dir = fo.config.model_zoo_dir
    model_path = model.get_path_in_dir(models_dir)
    return model, model_path


def _get_model(name):
    if ZooModel.has_version_str(name):
        return _get_exact_model(name)

    return _get_latest_model(name)


def _get_exact_model(name):
    manifest = _load_zoo_models_manifest()
    try:
        return manifest.get_model_with_name(name)
    except etam.ModelError:
        raise ValueError("No model with name '%s' was found" % name)


def _get_latest_model(base_name):
    manifest = _load_zoo_models_manifest()
    try:
        return manifest.get_latest_model_with_base_name(base_name)
    except etam.ModelError:
        raise ValueError("No models found with base name '%s'" % base_name)
