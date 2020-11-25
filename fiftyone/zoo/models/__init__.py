"""
The FiftyOne Model Zoo.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import logging
import os

import eta.core.learning as etal
import eta.core.models as etam
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.models as fom


logger = logging.getLogger(__name__)


_MODELS_MANIFEST_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), etam.MODELS_MANIFEST_JSON
)


def list_zoo_models():
    """Returns the list of available models in the FiftyOne Model Zoo.

    Returns:
        a list of model names
    """
    manifest = _load_models_manifest()
    return sorted([model.name for model in manifest])


def list_downloaded_zoo_models(models_dir=None):
    """Returns information about the zoo models that have been downloaded.

    Args:
        models_dir (None): the directory to search for downloaded models. By
            default, ``fo.config.model_zoo_dir`` is used

    Returns:
        a dict mapping model names to (model path, :class:`ZooModel`) tuples
    """
    if models_dir is None:
        models_dir = fo.config.model_zoo_dir

    manifest = _load_models_manifest()
    models = {}
    for model in manifest:
        if model.is_in_dir(models_dir):
            model_path = model.get_path_in_dir(models_dir)
            models[model.name] = (model_path, model)

    return models


def is_zoo_model_downloaded(name, models_dir=None):
    """Determines whether the zoo model of the given name is downloaded.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is assumed
        models_dir (None): the models directory. By default,
            ``fiftyone.config.model_zoo_dir`` is used

    Returns:
        True/False
    """
    if models_dir is None:
        models_dir = fo.config.model_zoo_dir

    model = _get_model(name)
    return model.is_in_dir(models_dir)


def download_zoo_model(name, models_dir=None, overwrite=False):
    """Downloads the model of the given name from the FiftyOne Dataset Zoo.

    If the model is already downloaded, it is not re-downloaded unless
    ``overwrite == True`` is specified.

    Args:
        name: the name of the zoo model to download, which can have ``@<ver>``
            appended to refer to a specific version of the model. If no version
            is specified, the latest version of the model is downloaded. Call
            :func:`list_zoo_models` to see the available models
        models_dir (None): the directory into which to download the model. By
            default, it is downloaded to ``fiftyone.config.model_zoo_dir``
        overwrite (False): whether to overwrite any existing files

    Returns:
        tuple of

        -   model: the :class:`ZooModel` for the model
        -   model_path: the path to the downloaded model on disk
    """
    model, model_path = _get_model_in_dir(name, models_dir)
    model.manager.download_model(model_path, force=overwrite)
    return model, model_path


def load_zoo_model(
    name,
    models_dir=None,
    download_if_necessary=True,
    install_requirements=False,
    error_level=0,
):
    """Loads the model of the given name from the FiftyOne Model Zoo.

    By default, the model will be downloaded if necessary if it does not
    exist in the specified ``models_dir``.

    Args:
        name: the name of the zoo model to download, which can have ``@<ver>``
            appended to refer to a specific version of the model. If no version
            is specified, the latest version of the model is downloaded. Call
            :func:`list_zoo_models` to see the available models
        models_dir (None): the directory in which the model is stored or should
            be downloaded. By default, ``fiftyone.config.model_zoo_dir`` is
            used
        download_if_necessary (True): whether to download the model if it is
            not found in the specified directory
        install_requirements: whether to install any requirements before
            loading the model. By default, this is False
        error_level: the error level to use, defined as:

            0: raise error if a requirement is not satisfied
            1: log warning if a requirement is not satisifed
            2: ignore unsatisifed requirements

    Returns:
        a :class:`fiftyone.core.models.Model`
    """
    if models_dir is None:
        models_dir = fo.config.model_zoo_dir

    model = _get_model(name)

    if not model.is_in_dir(models_dir):
        if not download_if_necessary:
            raise ValueError("Model '%s' is not downloaded" % name)

        download_zoo_model(name, models_dir=models_dir)

    if install_requirements:
        model.install_requirements(error_level=error_level)
    else:
        model.ensure_requirements(error_level=error_level)

    config = fom.ModelConfig.from_dict(model.default_deployment_config_dict)

    if not isinstance(config, (HasZooModel, etal.HasPublishedModel)):
        raise ValueError(
            "Zoo model configs must implement the %s interface" % HasZooModel
        )

    config.model_path = model.get_path_in_dir(models_dir)

    return config.build()


def find_zoo_model(name, models_dir=None):
    """Returns the path to the zoo model on disk.

    The model must be downloaded. Use :func:`download_zoo_model` to download
    models.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is assumed
        models_dir (None): the directory in which the model is stored. By
            default, ``fiftyone.config.model_zoo_dir`` is used

    Returns:
        the path to the model on disk

    Raises:
        ValueError: if the model does not exist or has not been downloaded
    """
    _, model_path = _get_model_in_dir(name, models_dir)
    if not os.path.isfile(model_path):
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


def delete_zoo_model(name, models_dir=None):
    """Deletes the zoo model from local disk, if necessary.

    Args:
        name: the name of the zoo model, which can have ``@<ver>`` appended to
            refer to a specific version of the model. If no version is
            specified, the latest version of the model is assumed
        models_dir (None): the directory in which the model is stored. By
            default, ``fiftyone.config.model_zoo_dir`` is used
    """
    _, model_path = _get_model_in_dir(name, models_dir)
    if os.path.isfile(model_path):
        etau.delete_file(model_path)


def delete_old_zoo_models(models_dir=None):
    """Deletes local copies of any old models on disk, i.e., models for which
    a newer version of the model is also downloaded.

    models_dir (None): the models directory. By default,
        ``fiftyone.config.model_zoo_dir`` is used
    """
    # List downloaded models
    models = list_downloaded_zoo_models(models_dir=models_dir)

    # Group by base name
    bmodels = defaultdict(list)
    for model_path, model in models.values():
        bmodels[model.base_name].append((model, model_path))

    # Sort by version (newest first)
    bmodels = {
        k: sorted(v, reverse=True, key=lambda vi: vi[0].comp_version)
        for k, v in bmodels.items()
    }

    # Flush old models
    for base_name, models_list in bmodels.items():
        num_to_flush = len(models_list) - 1
        if num_to_flush > 0:
            logger.info(
                "*** Flushing %d old version(s) of model '%s'",
                num_to_flush,
                base_name,
            )
            for _, model_path in reversed(models_list[1:]):
                etau.delete_file(model_path)


class HasZooModel(etal.HasPublishedModel):
    """Mixin class for :class:`fiftyone.core.models.ModelConfig` instances
    whose models are stored in the FiftyOne Model Zoo.

    This class provides the following functionality:

    -   The model to load can be specified either by:

        (a) providing a `model_name`, which specifies the zoo model to load.
            The model will be downloaded, if necessary

        (b) providing a `model_path`, which directly specifies the path to the
            model to load

    -   :class:`fiftyone.core.models.ModelConfig` definitions that use zoo
        models with default deployments will have default values for any
        unspecified parameters loaded and applied at runtime

    Attributes:
        model_name: the name of the zoo model to load. If this value is
            provided, `model_path` does not need to be
        model_path: the path to an already downloaded zoo model on disk to
            load. If this value is provided, `model_name` does not need to be
    """

    def download_model_if_necessary(self):
        # pylint: disable=attribute-defined-outside-init
        if self.model_path is None:
            self.model_path = download_zoo_model(self.model_name)

    @classmethod
    def _get_model(cls, model_name):
        return get_zoo_model(model_name)


class ZooModel(etam.Model):
    """.. autoclass:: eta.core.models.Model"""

    pass


class ZooModelsManifest(etam.ModelsManifest):
    """Class that describes the collection of models in the model zoo."""

    _MODEL_CLS = ZooModel


def _load_models_manifest():
    return ZooModelsManifest.from_json(_MODELS_MANIFEST_PATH)


def _get_model_in_dir(name, models_dir):
    if models_dir is None:
        models_dir = fo.config.model_zoo_dir

    model = _get_model(name)
    model_path = model.get_path_in_dir(models_dir)
    return model, model_path


def _get_model(name):
    if ZooModel.has_version_str(name):
        return _get_exact_model(name)

    return _get_latest_model(name)


def _get_exact_model(name):
    manifest = _load_models_manifest()
    try:
        return manifest.get_model_with_name(name)
    except etam.ModelError:
        raise ValueError("No model with name '%s' was found" % name)


def _get_latest_model(base_name):
    manifest = _load_models_manifest()
    try:
        return manifest.get_latest_model_with_base_name(base_name)
    except etam.ModelError:
        raise ValueError("No models found with base name '%s'" % base_name)
