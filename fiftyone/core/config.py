"""
FiftyOne config.

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

try:
    from importlib import metadata as importlib_metadata  # Python 3.8
except ImportError:
    import importlib_metadata  # Python < 3.8

from eta.core.config import EnvConfig

import fiftyone as fo
import fiftyone.constants as foc


logger = logging.getLogger(__name__)


class FiftyOneConfig(EnvConfig):
    """FiftyOne configuration settings."""

    def __init__(self, d):
        self.default_dataset_dir = self.parse_string(
            d,
            "default_dataset_dir",
            env_var="FIFTYONE_DEFAULT_DATASET_DIR",
            default=None,
        )
        self.default_ml_backend = self.parse_string(
            d,
            "default_ml_backend",
            env_var="FIFTYONE_DEFAULT_ML_BACKEND",
            default=None,
        )
        self.default_sequence_idx = self.parse_string(
            d,
            "default_sequence_idx",
            env_var="FIFTYONE_DEFAULT_SEQUENCE_IDX",
            default="%06d",
        )
        self.default_image_ext = self.parse_string(
            d,
            "default_image_ext",
            env_var="FIFTYONE_DEFAULT_IMAGE_EXT",
            default=".jpg",
        )

        self._set_defaults()

    def _set_defaults(self):
        if self.default_dataset_dir is None:
            self.default_dataset_dir = os.path.join(
                os.path.expanduser("~"), "fiftyone"
            )

        if self.default_ml_backend is None:
            installed_packages = _get_installed_packages()

            if "tensorflow" in installed_packages:
                logger.debug("Setting default ML backend to TensorFlow")
                self.default_ml_backend = "tensorflow"
            elif "torch" in installed_packages:
                logger.debug("Setting default ML backend to PyTorch")
                self.default_ml_backend = "torch"
            else:
                logger.debug("No suitable default ML backend found")


def load_config():
    """Loads the FiftyOne config.

    Returns:
        a ``fiftyone.config.FiftyOneConfig`` instance
    """
    # If a config file is not found on disk, the default config is created by
    # calling `FiftyOneConfig()`
    return FiftyOneConfig.from_json(foc.FIFTYONE_CONFIG_PATH)


def set_config_settings(**kwargs):
    """Sets the given FiftyOne config setting(s).

    Args:
        **kwargs: keyword arguments defining valid FiftyOneConfig attributes
            and and values

    Raises:
        EnvConfigError: if the settings were invalid
    """
    # Validiate settings
    _config = FiftyOneConfig.from_dict(kwargs)

    # Apply settings
    for field in kwargs:
        if not hasattr(fo.config, field):
            logger.warning("Skipping unknown config setting '%s'", field)
            continue

        val = getattr(_config, field)
        logger.debug("Setting config field %s = %s", field, str(val))
        setattr(fo.config, field, val)


def _get_installed_packages():
    try:
        return set(
            d.metadata["Name"] for d in importlib_metadata.distributions()
        )
    except:
        logger.debug("Failed to get installed packages")
        return set()
