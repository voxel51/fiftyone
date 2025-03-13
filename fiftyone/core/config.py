"""
FiftyOne config.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
from importlib import metadata
import pytz

import eta
import eta.core.config as etac

import fiftyone.constants as foc
import fiftyone.core.utils as fou

fop = fou.lazy_import("fiftyone.core.plots.plotly")


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

        self.database_uri = self.parse_string(
            d, "database_uri", env_var="FIFTYONE_DATABASE_URI", default=None
        )
        self.database_validation = self.parse_bool(
            d,
            "database_validation",
            env_var="FIFTYONE_DATABASE_VALIDATION",
            default=True,
        )
        self.database_admin = self.parse_bool(
            d,
            "database_admin",
            env_var="FIFTYONE_DATABASE_ADMIN",
            default=True,
        )
        self.database_dir = self.parse_path(
            d,
            "database_dir",
            env_var="FIFTYONE_DATABASE_DIR",
            default=foc.DEFAULT_DB_DIR,
        )
        self.database_name = self.parse_string(
            d,
            "database_name",
            env_var="FIFTYONE_DATABASE_NAME",
            default="fiftyone",
        )
        self.dataset_zoo_dir = self.parse_path(
            d,
            "dataset_zoo_dir",
            env_var="FIFTYONE_DATASET_ZOO_DIR",
            default=None,
        )
        self.model_zoo_dir = self.parse_path(
            d, "model_zoo_dir", env_var="FIFTYONE_MODEL_ZOO_DIR", default=None
        )
        self.module_path = self.parse_string_array(
            d,
            "module_path",
            env_var="FIFTYONE_MODULE_PATH",
            default=None,
        )
        self.plugins_dir = self.parse_string(
            d, "plugins_dir", env_var="FIFTYONE_PLUGINS_DIR", default=None
        )
        self.plugins_cache_enabled = self.parse_bool(
            d,
            "plugins_cache_enabled",
            env_var="FIFTYONE_PLUGINS_CACHE_ENABLED",
            default=False,
        )
        self.operator_timeout = self.parse_int(
            d,
            "operator_timeout",
            env_var="FIFTYONE_OPERATOR_TIMEOUT",
            default=600,  # 600 seconds (10 minutes)
        )
        self.allow_legacy_orchestrators = self.parse_bool(
            d,
            "allow_legacy_orchestrators",
            env_var="FIFTYONE_ALLOW_LEGACY_ORCHESTRATORS",
            default=False,
        )
        self.dataset_zoo_manifest_paths = self.parse_path_array(
            d,
            "dataset_zoo_manifest_paths",
            env_var="FIFTYONE_DATASET_ZOO_MANIFEST_PATHS",
            default=None,
        )
        self.model_zoo_manifest_paths = self.parse_path_array(
            d,
            "model_zoo_manifest_paths",
            env_var="FIFTYONE_MODEL_ZOO_MANIFEST_PATHS",
            default=None,
        )
        self.default_dataset_dir = self.parse_path(
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
        self.default_batcher = self.parse_string(
            d,
            "default_batcher",
            env_var="FIFTYONE_DEFAULT_BATCHER",
            default="latency",
        )
        self.batcher_static_size = self.parse_int(
            d,
            "batcher_static_size",
            env_var="FIFTYONE_BATCHER_STATIC_SIZE",
            default=100,
        )
        self.batcher_target_size_bytes = self.parse_int(
            d,
            "batcher_target_size_bytes",
            env_var="FIFTYONE_BATCHER_TARGET_SIZE_BYTES",
            default=2**20,
        )
        self.batcher_target_latency = self.parse_number(
            d,
            "batcher_target_latency",
            env_var="FIFTYONE_BATCHER_TARGET_LATENCY",
            default=0.2,
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
        self.default_app_address = self.parse_string(
            d,
            "default_app_address",
            env_var="FIFTYONE_DEFAULT_APP_ADDRESS",
            default="localhost",
        )
        self.logging_level = self.parse_string(
            d,
            "logging_level",
            env_var="FIFTYONE_LOGGING_LEVEL",
            default="INFO",
        )
        self._show_progress_bars = None  # declare
        self.show_progress_bars = self.parse_bool(
            d,
            "show_progress_bars",
            env_var="FIFTYONE_SHOW_PROGRESS_BARS",
            default=True,
        )
        self.do_not_track = self.parse_bool(
            d,
            "do_not_track",
            env_var="FIFTYONE_DO_NOT_TRACK",
            default=False,
        )
        self.requirement_error_level = self.parse_int(
            d,
            "requirement_error_level",
            env_var="FIFTYONE_REQUIREMENT_ERROR_LEVEL",
            default=0,
        )
        self.timezone = self.parse_string(
            d, "timezone", env_var="FIFTYONE_TIMEZONE", default=None
        )
        self.max_thread_pool_workers = self.parse_int(
            d,
            "max_thread_pool_workers",
            env_var="FIFTYONE_MAX_THREAD_POOL_WORKERS",
            default=None,
        )
        self.max_process_pool_workers = self.parse_int(
            d,
            "max_process_pool_workers",
            env_var="FIFTYONE_MAX_PROCESS_POOL_WORKERS",
            default=None,
        )

        self._init()

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

    def _init(self):
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

        if self.plugins_dir is None:
            self.plugins_dir = os.path.join(
                self.default_dataset_dir,
                "__plugins__",
            )

        if self.default_ml_backend is None:
            installed_packages = _get_installed_packages()

            if "torch" in installed_packages:
                self.default_ml_backend = "torch"
            elif "tensorflow" in installed_packages:
                self.default_ml_backend = "tensorflow"

        if self.default_ml_backend is not None:
            self.default_ml_backend = self.default_ml_backend.lower()

        if self.module_path is not None:
            for idx, module_name in enumerate(self.module_path):
                try:
                    __import__(module_name)
                except ImportError as e:
                    logger.warning(
                        "Failed to import fiftyone.config.module_path[%d]: %s",
                        idx,
                        e,
                    )

        if self.timezone and self.timezone.lower() not in {"local", "utc"}:
            try:
                pytz.timezone(self.timezone)
            except:
                logger.warning("Ignoring invalid timezone '%s'", self.timezone)
                self.timezone = None


class FiftyOneConfigError(etac.EnvConfigError):
    """Exception raised when a FiftyOne configuration issue is encountered."""

    pass


class AppConfig(EnvConfig):
    """FiftyOne App configuration settings."""

    def __init__(self, d=None):
        if d is None:
            d = {}

        self.color_by = self.parse_string(
            d,
            "color_by",
            env_var="FIFTYONE_APP_COLOR_BY",
            default="field",
        )
        self.color_pool = self.parse_string_array(
            d,
            "color_pool",
            env_var="FIFTYONE_APP_COLOR_POOL",
            default=foc.DEFAULT_APP_COLOR_POOL,
        )
        self.colorscale = self.parse_string(
            d,
            "colorscale",
            env_var="FIFTYONE_APP_COLORSCALE",
            default="viridis",
        )
        self.grid_zoom = self.parse_int(
            d, "grid_zoom", env_var="FIFTYONE_APP_GRID_ZOOM", default=7
        )
        self.enable_query_performance = self.parse_bool(
            d,
            "enable_query_performance",
            env_var="FIFTYONE_APP_ENABLE_QUERY_PERFORMANCE",
            default=True,
        )
        self.default_query_performance = self.parse_bool(
            d,
            "default_query_performance",
            env_var="FIFTYONE_APP_DEFAULT_QUERY_PERFORMANCE",
            default=True,
        )
        self.loop_videos = self.parse_bool(
            d,
            "loop_videos",
            env_var="FIFTYONE_APP_LOOP_VIDEOS",
            default=False,
        )
        self.media_fallback = self.parse_bool(
            d,
            "media_fallback",
            env_var="FIFTYONE_APP_MEDIA_FALLBACK",
            default=False,
        )
        self.disable_frame_filtering = self.parse_bool(
            d,
            "disable_frame_filtering",
            env_var="FIFTYONE_APP_DISABLE_FRAME_FILTERING",
            default=False,
        )
        self.multicolor_keypoints = self.parse_bool(
            d,
            "multicolor_keypoints",
            env_var="FIFTYONE_APP_MULTICOLOR_KEYPOINTS",
            default=False,
        )
        self.notebook_height = self.parse_int(
            d,
            "notebook_height",
            env_var="FIFTYONE_APP_NOTEBOOK_HEIGHT",
            default=800,
        )
        self.proxy_url = self.parse_string(
            d,
            "proxy_url",
            env_var="FIFTYONE_APP_PROXY_URL",
            default=None,
        )
        self.show_confidence = self.parse_bool(
            d,
            "show_confidence",
            env_var="FIFTYONE_APP_SHOW_CONFIDENCE",
            default=True,
        )
        self.show_index = self.parse_bool(
            d,
            "show_index",
            env_var="FIFTYONE_APP_SHOW_INDEX",
            default=True,
        )
        self.show_label = self.parse_bool(
            d,
            "show_label",
            env_var="FIFTYONE_APP_SHOW_LABEL",
            default=True,
        )
        self.show_skeletons = self.parse_bool(
            d,
            "show_skeletons",
            env_var="FIFTYONE_APP_SHOW_SKELETONS",
            default=True,
        )
        self.show_tooltip = self.parse_bool(
            d,
            "show_tooltip",
            env_var="FIFTYONE_APP_SHOW_TOOLTIP",
            default=True,
        )
        self.theme = self.parse_string(
            d,
            "theme",
            env_var="FIFTYONE_APP_THEME",
            default="browser",
        )
        self.use_frame_number = self.parse_bool(
            d,
            "use_frame_number",
            env_var="FIFTYONE_APP_USE_FRAME_NUMBER",
            default=False,
        )
        self.plugins = d.get("plugins", {})

        self._init()

    def get_colormap(self, colorscale=None, n=256, hex_strs=False):
        """Generates a continuous colormap with the specified number of colors
        from the given colorscale.

        The provided ``colorscale`` can be any of the following:

        -   The string name of any colorscale recognized by plotly. See
            https://plotly.com/python/colorscales for possible options

        -   A manually-defined colorscale like the following::

                [
                    [0.000, "rgb(165,0,38)"],
                    [0.111, "rgb(215,48,39)"],
                    [0.222, "rgb(244,109,67)"],
                    [0.333, "rgb(253,174,97)"],
                    [0.444, "rgb(254,224,144)"],
                    [0.555, "rgb(224,243,248)"],
                    [0.666, "rgb(171,217,233)"],
                    [0.777, "rgb(116,173,209)"],
                    [0.888, "rgb(69,117,180)"],
                    [1.000, "rgb(49,54,149)"],
                ]

        The colorscale will be sampled evenly at the required resolution in
        order to generate the colormap.

        Args:
            colorscale (None): a valid colorscale. See above for possible
                options. By default, :attr:`colorscale` is used
            n (256): the desired number of colors
            hex_strs (False): whether to return ``#RRGGBB`` hex strings rather
                than ``(R, G, B)`` tuples

        Returns:
            a list of ``(R, G, B)`` tuples in `[0, 255]`, or, if ``hex_strs``
            is True, a list of `#RRGGBB` strings
        """
        if colorscale is None:
            colorscale = self.colorscale

        return fop.get_colormap(colorscale, n=n, hex_strs=hex_strs)

    def _init(self):
        supported_color_bys = {"field", "instance", "value"}
        default_color_by = "field"
        if self.color_by not in supported_color_bys:
            logger.warning(
                "Invalid color_by=%s. Must be one of %s. Defaulting to '%s'",
                self.color_by,
                supported_color_bys,
                default_color_by,
            )
            self.color_by = default_color_by

        supported_themes = {"browser", "dark", "light"}
        default_theme = "browser"
        if self.theme not in supported_themes:
            logger.warning(
                "Invalid theme=%s. Must be one of %s. Defaulting to '%s'",
                self.theme,
                supported_themes,
                default_theme,
            )
            self.theme = default_theme

        if self.grid_zoom < 0 or self.grid_zoom > 10:
            logger.warning(
                "`grid_zoom` must be in [0, 10]; found %d", self.grid_zoom
            )
            self.grid_zoom = 5

        if "MAPBOX_TOKEN" in os.environ:
            try:
                _set_nested_dict_value(
                    self.plugins,
                    "map.mapboxAccessToken",
                    os.environ["MAPBOX_TOKEN"],
                )
            except Exception as e:
                logger.warning("Failed to set mapbox token: %s", e)


class AppConfigError(etac.EnvConfigError):
    """Exception raised when an invalid :class:`AppConfig` instance is
    encountered.
    """

    pass


class AnnotationConfig(EnvConfig):
    """FiftyOne annotation configuration settings."""

    _BUILTIN_BACKENDS = {
        "cvat": {
            "config_cls": "fiftyone.utils.cvat.CVATBackendConfig",
            "url": "https://app.cvat.ai",
        },
        "labelbox": {
            "config_cls": "fiftyone.utils.labelbox.LabelboxBackendConfig",
            "url": "https://labelbox.com",
        },
        "labelstudio": {
            "config_cls": "fiftyone.utils.labelstudio.LabelStudioBackendConfig",
            "url": "https://labelstud.io",
        },
    }

    def __init__(self, d=None):
        if d is None:
            d = {}

        self.default_backend = self.parse_string(
            d,
            "default_backend",
            env_var="FIFTYONE_ANNOTATION_DEFAULT_BACKEND",
            default="cvat",
        )

        self.backends = self._parse_backends(d)
        if self.default_backend not in self.backends:
            self.default_backend = next(
                iter(sorted(self.backends.keys())), None
            )

    def _parse_backends(self, d):
        d = d.get("backends", {})
        env_vars = dict(os.environ)

        #
        # `FIFTYONE_ANNOTATION_BACKENDS` can be used to declare which backends
        # are exposed. This may exclude builtin backends and/or declare new
        # backends
        #

        if "FIFTYONE_ANNOTATION_BACKENDS" in env_vars:
            backends = env_vars["FIFTYONE_ANNOTATION_BACKENDS"].split(",")

            # Special syntax to append rather than override default backends
            if "*" in backends:
                backends = set(b for b in backends if b != "*")
                backends |= set(self._BUILTIN_BACKENDS.keys())

            d = {backend: d.get(backend, {}) for backend in backends}
        else:
            for backend in self._BUILTIN_BACKENDS.keys():
                if backend not in d:
                    d[backend] = {}

        #
        # Extract parameters from any environment variables of the form
        # `FIFTYONE_<BACKEND>_<PARAMETER>`
        #

        for backend, d_backend in d.items():
            prefix = "FIFTYONE_%s_" % backend.upper()
            for env_name, env_value in env_vars.items():
                if env_name.startswith(prefix):
                    name = env_name[len(prefix) :].lower()
                    value = _parse_env_value(env_value)
                    d_backend[name] = value

        #
        # Set default parameters for builtin annotation backends
        #

        for backend, defaults in self._BUILTIN_BACKENDS.items():
            if backend not in d:
                continue

            d_backend = d[backend]
            for name, value in defaults.items():
                if name not in d_backend:
                    d_backend[name] = value

        return d


class EvaluationConfig(EnvConfig):
    """FiftyOne evaluation configuration settings."""

    _BUILTIN_BACKENDS = {
        "regression": {
            "simple": {
                "config_cls": "fiftyone.utils.eval.regression.SimpleEvaluationConfig",
            },
        },
        "classification": {
            "simple": {
                "config_cls": "fiftyone.utils.eval.classification.SimpleEvaluationConfig",
            },
            "binary": {
                "config_cls": "fiftyone.utils.eval.classification.BinaryEvaluationConfig",
            },
            "top-k": {
                "config_cls": "fiftyone.utils.eval.classification.TopKEvaluationConfig",
            },
        },
        "detection": {
            "activitynet": {
                "config_cls": "fiftyone.utils.eval.activitynet.ActivityNetEvaluationConfig",
            },
            "coco": {
                "config_cls": "fiftyone.utils.eval.coco.COCOEvaluationConfig",
            },
            "open-images": {
                "config_cls": "fiftyone.utils.eval.openimages.OpenImagesEvaluationConfig",
            },
        },
        "segmentation": {
            "simple": {
                "config_cls": "fiftyone.utils.eval.segmentation.SimpleEvaluationConfig",
            },
        },
    }

    def __init__(self, d=None):
        if d is None:
            d = {}

        self.default_regression_backend = self.parse_string(
            d,
            "default_regression_backend",
            env_var="FIFTYONE_DEFAULT_REGRESSION_BACKEND",
            default="simple",
        )
        self.default_classification_backend = self.parse_string(
            d,
            "default_classification_backend",
            env_var="DEFAULT_FIFTYONE_CLASSIFICATION_BACKEND",
            default="simple",
        )
        self.default_detection_backend = self.parse_string(
            d,
            "default_detection_backend",
            env_var="DEFAULT_FIFTYONE_DETECTION_BACKEND",
            default="coco",
        )
        self.default_segmentation_backend = self.parse_string(
            d,
            "default_segmentation_backend",
            env_var="DEFAULT_FIFTYONE_SEGMENTATION_BACKEND",
            default="simple",
        )

        self.regression_backends = self._parse_backends(d, "regression")
        if self.default_regression_backend not in self.regression_backends:
            self.default_regression_backend = next(
                iter(sorted(self.regression_backends.keys())), None
            )

        self.classification_backends = self._parse_backends(
            d, "classification"
        )
        if (
            self.default_classification_backend
            not in self.classification_backends
        ):
            self.default_classification_backend = next(
                iter(sorted(self.classification_backends.keys())), None
            )

        self.detection_backends = self._parse_backends(d, "detection")
        if self.default_detection_backend not in self.detection_backends:
            self.default_detection_backend = next(
                iter(sorted(self.detection_backends.keys())), None
            )

        self.segmentation_backends = self._parse_backends(d, "segmentation")
        if self.default_segmentation_backend not in self.segmentation_backends:
            self.default_segmentation_backend = next(
                iter(sorted(self.segmentation_backends.keys())), None
            )

    def _parse_backends(self, d, type):
        TYPE = type.upper()

        d = d.get(f"{type}_backends", {})
        env_vars = dict(os.environ)

        #
        # `FIFTYONE_{TYPE}_BACKENDS` can be used to declare which backends
        # are exposed. This may exclude builtin backends and/or declare new
        # backends
        #

        if f"FIFTYONE_{TYPE}_BACKENDS" in env_vars:
            backends = env_vars[f"FIFTYONE_{TYPE}_BACKENDS"].split(",")

            # Special syntax to append rather than override default backends
            if "*" in backends:
                backends = set(b for b in backends if b != "*")
                backends |= set(self._BUILTIN_BACKENDS[type].keys())

            d = {backend: d.get(backend, {}) for backend in backends}
        else:
            for backend in self._BUILTIN_BACKENDS[type].keys():
                if backend not in d:
                    d[backend] = {}

        #
        # Extract parameters from any environment variables of the form
        # `FIFTYONE_{TYPE}_{BACKEND}_{PARAMETER}`
        #

        for backend, d_backend in d.items():
            BACKEND = backend.upper()
            prefix = f"FIFTYONE_{TYPE}_{BACKEND}_"
            for env_name, env_value in env_vars.items():
                if env_name.startswith(prefix):
                    name = env_name[len(prefix) :].lower()
                    value = _parse_env_value(env_value)
                    d_backend[name] = value

        #
        # Set default parameters for builtin similarity backends
        #

        for backend, defaults in self._BUILTIN_BACKENDS[type].items():
            if backend not in d:
                continue

            d_backend = d[backend]
            for name, value in defaults.items():
                if name not in d_backend:
                    d_backend[name] = value

        return d


def locate_config():
    """Returns the path to the :class:`FiftyOneConfig` on disk.

    The default location is ``~/.fiftyone/config.json``, but you can override
    this path by setting the ``FIFTYONE_CONFIG_PATH`` environment variable.

    Note that a config file may not actually exist on disk.

    Returns:
        the path to the :class:`FiftyOneConfig` on disk
    """
    if "FIFTYONE_CONFIG_PATH" not in os.environ:
        return foc.FIFTYONE_CONFIG_PATH

    return os.environ["FIFTYONE_CONFIG_PATH"]


def locate_app_config():
    """Returns the path to the :class:`AppConfig` on disk.

    The default location is ``~/.fiftyone/app_config.json``, but you can
    override this path by setting the ``FIFTYONE_APP_CONFIG_PATH`` environment
    variable.

    Note that the file may not actually exist.

    Returns:
        the path to the :class:`AppConfig` on disk
    """
    if "FIFTYONE_APP_CONFIG_PATH" not in os.environ:
        return foc.FIFTYONE_APP_CONFIG_PATH

    return os.environ["FIFTYONE_APP_CONFIG_PATH"]


def locate_annotation_config():
    """Returns the path to the :class:`AnnotationConfig` on disk.

    The default location is ``~/.fiftyone/annotation_config.json``, but you can
    override this path by setting the ``FIFTYONE_ANNOTATION_CONFIG_PATH``
    environment variable.

    Note that a config file may not actually exist on disk.

    Returns:
        the path to the :class:`AnnotationConfig` on disk
    """
    if "FIFTYONE_ANNOTATION_CONFIG_PATH" not in os.environ:
        return foc.FIFTYONE_ANNOTATION_CONFIG_PATH

    return os.environ["FIFTYONE_ANNOTATION_CONFIG_PATH"]


def locate_evaluation_config():
    """Returns the path to the :class:`EvaluationConfig` on disk.

    The default location is ``~/.fiftyone/evaluation_config.json``, but you can
    override this path by setting the ``FIFTYONE_EVALUATION_CONFIG_PATH``
    environment variable.

    Note that a config file may not actually exist on disk.

    Returns:
        the path to the :class:`EvaluationConfig` on disk
    """
    if "FIFTYONE_EVALUATION_CONFIG_PATH" not in os.environ:
        return foc.FIFTYONE_EVALUATION_CONFIG_PATH

    return os.environ["FIFTYONE_EVALUATION_CONFIG_PATH"]


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


def load_annotation_config():
    """Loads the FiftyOne annotation config.

    Returns:
        an :class:`AnnotationConfig` instance
    """
    annotation_config_path = locate_annotation_config()
    if os.path.isfile(annotation_config_path):
        return AnnotationConfig.from_json(annotation_config_path)

    return AnnotationConfig()


def load_evaluation_config():
    """Loads the FiftyOne evaluation config.

    Returns:
        an :class:`EvaluationConfig` instance
    """
    evaluation_config_path = locate_evaluation_config()
    if os.path.isfile(evaluation_config_path):
        return EvaluationConfig.from_json(evaluation_config_path)

    return EvaluationConfig()


def _parse_env_value(value):
    try:
        return int(value)
    except:
        pass

    try:
        return float(value)
    except:
        pass

    if value in ("True", "true"):
        return True

    if value in ("False", "false"):
        return False

    if value in ("None", ""):
        return None

    if "," in value:
        return [_parse_env_value(v) for v in value.split(",")]

    return value


def _get_installed_packages():
    try:
        return set(d.metadata["Name"] for d in metadata.distributions())
    except:
        logger.debug("Failed to get installed packages")
        return set()


def _set_nested_dict_value(d, path, value):
    keys = path.split(".")

    for key in keys[:-1]:
        if key not in d:
            d[key] = {}

        d = d[key]

    d[keys[-1]] = value
