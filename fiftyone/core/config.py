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
import eta.core.config as etac

import fiftyone.constants as foc


logger = logging.getLogger(__name__)


class Config(etac.Config):
    """Base class for JSON serializable config classes."""

    def __repr__(self):
        return self.__str__()


class Configurable(etac.Configurable):
    """Base class for classes that can be initialized with a :class:`Config`
    instance that configures their behavior.

    :class:`Configurable` subclasses must obey the following rules:

        (a) Configurable class ``Foo`` has an associated Config class
            ``FooConfig`` that is importable from the same namespace as ``Foo``

        (b) Configurable class ``Foo`` must be initializable via the syntax
            ``Foo(config)``, where config is a ``FooConfig`` instance

    Args:
        config: a :class:`Config`
    """

    def __init__(self, config):
        self.validate(config)
        self.config = config


class EnvConfig(etac.EnvConfig):
    def __repr__(self):
        return self.__str__()


class FiftyOneConfig(EnvConfig):
    """FiftyOne configuration settings."""

    def __init__(self, d=None):
        if d is None:
            d = {}

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

    def __init__(self, d=None):
        if d is None:
            d = {}

        self.color_pool = self.parse_string_array(
            d,
            "color_pool",
            env_var="FIFTYONE_APP_COLOR_POOL",
            default=foc.DEFAULT_APP_COLOR_POOL,
        )
        self.default_grid_zoom = self.parse_int(
            d,
            "default_grid_zoom",
            env_var="FIFTYONE_APP_GRID_ZOOM",
            default=5,
        )
        self.loop_videos = self.parse_bool(
            d,
            "loop_videos",
            env_var="FIFTYONE_APP_LOOP_VIDEOS",
            default=False,
        )
        self.notebook_height = self.parse_int(
            d,
            "notebook_height",
            env_var="FIFTYONE_APP_NOTEBOOK_HEIGHT",
            default=800,
        )
        self.show_confidence = self.parse_bool(
            d,
            "show_confidence",
            env_var="FIFTYONE_APP_SHOW_CONFIDENCE",
            default=True,
        )
        self.show_index = self.parse_bool(
            d, "show_index", env_var="FIFTYONE_APP_SHOW_INDEX", default=True,
        )
        self.show_label = self.parse_bool(
            d, "show_label", env_var="FIFTYONE_APP_SHOW_LABEL", default=True,
        )
        self.show_tooltip = self.parse_bool(
            d,
            "show_tooltip",
            env_var="FIFTYONE_APP_SHOW_TOOLTIP",
            default=True,
        )
        self.use_frame_number = self.parse_bool(
            d,
            "use_frame_number",
            env_var="FIFTYONE_APP_USE_FRAME_NUMBER",
            default=False,
        )

        self._validate()

    def _validate(self):
        if self.default_grid_zoom < 0 or self.default_grid_zoom > 10:
            raise AppConfigError(
                "`default_grid_zoom` must be in [0, 10]; found %d"
                % self.default_grid_zoom
            )


class AppConfigError(etac.EnvConfigError):
    """Exception raised when an invalid :class:`AppConfig` instance is
    encountered.
    """

    pass


def locate_config():
    """Returns the path to the :class:`FiftyOneConfig` on disk.

    The default location is ``~/.fiftyone/config.json``, but you can override
    this path by setting the ``FIFTYONE_CONFIG_PATH`` environment variable.

    Note that a config file may not actually exist on disk in the default
    location, in which case the default config settings will be used.

    Returns:
        the path to the :class:`FiftyOneConfig` on disk

    Raises:
        OSError: if the config path has been customized but the file does not
            exist on disk
    """
    if "FIFTYONE_CONFIG_PATH" not in os.environ:
        return foc.FIFTYONE_CONFIG_PATH

    config_path = os.environ["FIFTYONE_CONFIG_PATH"]
    if not os.path.isfile(config_path):
        raise OSError("Config file '%s' not found" % config_path)

    return config_path


def locate_app_config():
    """Returns the path to the :class:`AppConfig` on disk.

    The default location is ``~/.fiftyone/app_config.json``, but you can
    override this path by setting the ``FIFTYONE_APP_CONFIG_PATH`` environment
    variable.

    Note that a config file may not actually exist on disk in the default
    location, in which case the default config settings will be used.

    Returns:
        the path to the :class:`AppConfig` on disk

    Raises:
        OSError: if the App config path has been customized but the file does
            not exist on disk
    """
    if "FIFTYONE_APP_CONFIG_PATH" not in os.environ:
        return foc.FIFTYONE_APP_CONFIG_PATH

    config_path = os.environ["FIFTYONE_APP_CONFIG_PATH"]
    if not os.path.isfile(config_path):
        raise OSError("App config file '%s' not found" % config_path)

    return config_path


def load_config():
    """Loads the FiftyOne config.

    Returns:
        a :class:`FiftyOneConfig` instance
    """
    config_path = locate_config()
    if os.path.isfile(config_path):
        return FiftyOneConfig.from_json(config_path)

    return FiftyOneConfig()


def load_app_config():
    """Loads the FiftyOne App config.

    Returns:
        an :class:`AppConfig` instance
    """
    app_config_path = locate_app_config()
    if os.path.isfile(app_config_path):
        return AppConfig.from_json(app_config_path)

    return AppConfig()


def set_config_settings(**kwargs):
    """Sets the given FiftyOne config setting(s).

    Args:
        **kwargs: keyword arguments defining valid :class:`FiftyOneConfig`
            attributes and values

    Raises:
        EnvConfigError: if the settings were invalid
    """
    import fiftyone as fo

    # Validiate settings
    FiftyOneConfig.from_dict(kwargs)

    _set_settings(fo.config, kwargs)


def set_app_config_settings(**kwargs):
    """Sets the given FiftyOne App config setting(s).

    Args:
        **kwargs: keyword arguments defining valid :class:`AppConfig`
            attributes and values

    Raises:
        EnvConfigError: if the settings were invalid
    """
    import fiftyone as fo

    # Validiate settings
    AppConfig.from_dict(kwargs)

    _set_settings(fo.app_config, kwargs)


def _set_settings(config, kwargs):
    # Apply settings
    for field, val in kwargs.items():
        if not hasattr(config, field):
            logger.warning("Skipping unknown config setting '%s'", field)
            continue

        setattr(config, field, val)


def _get_installed_packages():
    try:
        return set(
            d.metadata["Name"] for d in importlib_metadata.distributions()
        )
    except:
        logger.debug("Failed to get installed packages")
        return set()
