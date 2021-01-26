"""
FiftyOne config.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

try:
    from importlib import metadata as importlib_metadata  # Python 3.8
except ImportError:
    import importlib_metadata  # Python < 3.8

import eta
from eta.core.config import EnvConfig

import fiftyone.constants as foc


logger = logging.getLogger(__name__)


class FiftyOneConfig(EnvConfig):
    """FiftyOne configuration settings."""

    def __init__(self, d):
        self.database_dir = self.parse_string(
            d,
            "database_dir",
            env_var="FIFTYONE_DATABASE_DIR",
            default=foc.DEFAULT_DB_DIR,
        )
        self.dataset_zoo_dir = self.parse_string(
            d,
            "dataset_zoo_dir",
            env_var="FIFTYONE_DATASET_ZOO_DIR",
            default=None,
        )
        self.model_zoo_dir = self.parse_string(
            d, "model_zoo_dir", env_var="FIFTYONE_MODEL_ZOO_DIR", default=None,
        )
        self.dataset_zoo_manifest_paths = self.parse_string_array(
            d,
            "dataset_zoo_manifest_paths",
            env_var="FIFTYONE_DATASET_ZOO_MANIFEST_PATHS",
            default=None,
        )
        self.model_zoo_manifest_paths = self.parse_string_array(
            d,
            "model_zoo_manifest_paths",
            env_var="FIFTYONE_MODEL_ZOO_MANIFEST_PATHS",
            default=None,
        )
        self.default_app_config_path = self.parse_string(
            d,
            "default_app_config_path",
            env_var="FIFTYONE_DEFAULT_APP_CONFIG_PATH",
            default=foc.FIFTYONE_APP_CONFIG_PATH,
        )
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
        self.default_batch_size = self.parse_int(
            d,
            "default_batch_size",
            env_var="FIFTYONE_DEFAULT_BATCH_SIZE",
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
        self.default_video_ext = self.parse_string(
            d,
            "default_video_ext",
            env_var="FIFTYONE_DEFAULT_VIDEO_EXT",
            default=".mp4",
        )
        self.default_app_port = self.parse_int(
            d,
            "default_app_port",
            env_var="FIFTYONE_DEFAULT_APP_PORT",
            default=5151,
        )
        self.desktop_app = self.parse_bool(
            d, "desktop_app", env_var="FIFTYONE_DESKTOP_APP", default=False,
        )
        self._show_progress_bars = None  # declare
        self.show_progress_bars = self.parse_bool(
            d,
            "show_progress_bars",
            env_var="FIFTYONE_SHOW_PROGRESS_BARS",
            default=True,
        )
        self.do_not_track = self.parse_bool(
            d, "do_not_track", env_var="FIFTYONE_DO_NOT_TRACK", default=False,
        )
        self.requirement_error_level = self.parse_int(
            d,
            "requirement_error_level",
            env_var="FIFTYONE_REQUIREMENT_ERROR_LEVEL",
            default=0,
        )

        self._set_defaults()
        self._validate()

    @property
    def show_progress_bars(self):
        return self._show_progress_bars

    @show_progress_bars.setter
    def show_progress_bars(self, value):
        self._show_progress_bars = value
        try:
            # Keep ETA config in-sync
            eta.config.show_progress_bars = value
        except:
            pass

    def attributes(self):
        # Includes `show_progress_bars`
        return super().custom_attributes(dynamic=True)

    def _set_defaults(self):
        if self.default_dataset_dir is None:
            self.default_dataset_dir = os.path.join(
                os.path.expanduser("~"), "fiftyone"
            )

        if self.dataset_zoo_dir is None:
            self.dataset_zoo_dir = self.default_dataset_dir

        if self.model_zoo_dir is None:
            self.model_zoo_dir = os.path.join(
                self.default_dataset_dir, "__models__"
            )

        if self.default_ml_backend is None:
            installed_packages = _get_installed_packages()

            if "torch" in installed_packages:
                self.default_ml_backend = "torch"
            elif "tensorflow" in installed_packages:
                self.default_ml_backend = "tensorflow"

    def _validate(self):
        if self.default_ml_backend is not None:
            self.default_ml_backend = self.default_ml_backend.lower()


class AppConfig(EnvConfig):
    """FiftyOne App configuration settings."""

    def __init__(self, d):
        self.color_pool = self.parse_string_array(
            d,
            "color_pool",
            env_var="FIFTYONE_DEFAULT_APP_COLOR_POOL",
            default=foc.DEFAULT_APP_COLOR_POOL,
        )
        self.notebook_height = self.parse_int(
            d,
            "notebook_height",
            env_var="FIFTYONE_DEFAULT_APP_HEIGHT",
            default=800,
        )
        self.show_confidence = self.parse_bool(
            d,
            "show_confidence",
            env_var="FIFTYONE_DEFAULT_APP_SHOW_CONFIDENCE",
            default=True,
        )
        self.show_attributes = self.parse_bool(
            d,
            "show_attributes",
            env_var="FIFTYONE_DEFAULT_APP_SHOW_ATTRIBUTES",
            default=True,
        )


def locate_config():
    """Returns the path to the FiftyOne config on disk.

    The default location is ``~/.fiftyone/config.json``, but you can override
    this path by setting the ``FIFTYONE_CONFIG_PATH`` environment variable.

    Note that a config file may not actually exist on disk in the default
    location, in which case the default config settings will be used.

    Returns:
        the path to the config

    Raises:
        OSError: if the FiftyOne config path has been customized but the file
            does not exist on disk
    """
    if "FIFTYONE_CONFIG_PATH" not in os.environ:
        return foc.FIFTYONE_CONFIG_PATH

    config_path = os.environ["FIFTYONE_CONFIG_PATH"]
    if not os.path.isfile(config_path):
        raise OSError("Config file '%s' not found" % config_path)

    return config_path


def load_app_config(path):
    """Loads an App config.

    Args:
        path: the path to where an AppConfig may exist

    Returns:
        a ``fiftyone.core.config.AppConfig`` instance
    """
    if os.path.isfile(path):
        return AppConfig.from_json(path)

    return AppConfig({})


def load_config():
    """Loads the FiftyOne config.

    Returns:
        a ``fiftyone.config.FiftyOneConfig`` instance
    """
    config_path = locate_config()
    if os.path.isfile(config_path):
        return FiftyOneConfig.from_json(config_path)

    return FiftyOneConfig({})


def set_app_config_settings(**kwargs):
    """Sets the given FiftyOne App config setting(s).

    Args:
        **kwargs: keyword arguments defining valid AppConfig attributes and
            values

    Raises:
        EnvConfigError: if the settings were invalid
    """
    import fiftyone as fo

    # Validiate settings
    _config = AppConfig.from_dict(kwargs)

    _set_settings(fo.app_config, _config, kwargs)


def set_config_settings(**kwargs):
    """Sets the given FiftyOne config setting(s).

    Args:
        **kwargs: keyword arguments defining valid FiftyOneConfig attributes
            and values

    Raises:
        EnvConfigError: if the settings were invalid
    """
    import fiftyone as fo

    # Validiate settings
    _config = FiftyOneConfig.from_dict(kwargs)

    _set_settings(fo.config, _config, kwargs)


def _set_settings(config, new_config, kwargs):
    # Apply settings
    for field in kwargs:
        if not hasattr(new_config, field):
            logger.warning("Skipping unknown config setting '%s'", field)
            continue

        val = getattr(new_config, field)
        setattr(config, field, val)


def _get_installed_packages():
    try:
        return set(
            d.metadata["Name"] for d in importlib_metadata.distributions()
        )
    except:
        logger.debug("Failed to get installed packages")
        return set()
