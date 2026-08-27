"""
Logical media references and asset resolution contracts.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from copy import deepcopy
from dataclasses import dataclass
from enum import Enum
import hashlib
import json
import math
import posixpath
import re
from typing import (
    Any,
    Callable,
    ClassVar,
    Dict,
    Mapping,
    Optional,
    Sequence,
    Tuple,
    Type,
    Union,
)

from pymongo.errors import DuplicateKeyError

import fiftyone.core.media as fom

LEROBOT_EPISODE_KIND = "lerobot-episode"
MAX_MEDIA_REFERENCE_BYTES = 64 * 1024
_MEDIA_REFERENCE_BINDINGS_COLLECTION = "media_reference_bindings"
_MEDIA_REFERENCE_BINDINGS_FILENAME = "media_reference_bindings.json"

_DRIVE_PREFIX_PATTERN = re.compile(r"^[A-Za-z]:")
_SHA256_FINGERPRINT_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
_ROW_COORDINATE_SYSTEMS = {
    "lerobot-v3-global-dataset-row",
    "parquet-file-row",
}


class MediaReferenceError(ValueError):
    """Base error raised for invalid or unavailable media references."""


class MissingMediaRootError(MediaReferenceError):
    """Raised when a media source binding has no available root."""


class MovedMediaRootError(MediaReferenceError):
    """Raised when a bound media source root moved or was renamed."""


class StaleMediaReferenceError(MediaReferenceError):
    """Raised when a stored locator no longer matches its source."""


class MissingMediaReferenceBindingError(MediaReferenceError):
    """Raised when a persisted reference has no private binding."""


class UnsupportedLeRobotVersionError(MediaReferenceError):
    """Raised when a LeRobot source version is not supported."""


class MalformedMediaSourceError(MediaReferenceError):
    """Raised when a referenced source is structurally invalid."""


class UnfinalizedMediaSourceError(MalformedMediaSourceError):
    """Raised when a source contains an unfinalized byte asset."""


class InvalidMediaLocationError(MalformedMediaSourceError):
    """Raised when an asset location is invalid for its source binding."""


class MediaSourceAuthorizationError(MediaReferenceError):
    """Raised when a media source binding is not authorized."""


class UnsupportedMediaReferenceOperation(MediaReferenceError):
    """Raised when a filepath operation receives a media reference."""


class UnsupportedLeRobotExportModeError(UnsupportedMediaReferenceOperation):
    """Raised when a LeRobot export requests an unsupported media mode."""

    def __init__(self, export_media, suggestion):
        self.export_media = export_media
        self.reason = _get_lerobot_export_mode_reason(export_media)
        super().__init__(
            "LeRobotDataset export does not support export_media=%r (%s); "
            "set export_media=True to create a self-contained v3 dataset, "
            "or %s" % (export_media, self.reason, suggestion)
        )


def _get_lerobot_export_mode_reason(export_media):
    if export_media is False:
        return "thin-reference-native-only"

    reasons = {
        "move": "shared-source-move-unsupported",
        "symlink": "self-contained-export-required",
        "manifest": "manifest-native-only",
    }
    return reasons.get(export_media, "unsupported-export-mode")


class MediaAssetRole(Enum):
    """Closed roles for assets described by media references."""

    PRIMARY_MEDIA = "primary-media"
    SCENE_ASSET = "scene-asset"
    DATASET_INFO = "dataset-info"
    DATASET_STATISTICS = "dataset-statistics"
    TASKS_METADATA = "tasks-metadata"
    EPISODE_METADATA = "episode-metadata"
    TABULAR_FRAME_DATA = "tabular-frame-data"
    IMAGE_PAYLOAD = "image-payload"
    VIDEO_STREAM = "video-stream"


@dataclass(frozen=True)
class DatasetRelativeLocation:
    """A canonical POSIX path relative to a bound dataset root."""

    kind: ClassVar[str] = "dataset-relative"

    path: str

    def __post_init__(self):
        if not isinstance(self.path, str) or not self.path:
            raise InvalidMediaLocationError(
                "Dataset-relative asset paths must be non-empty strings"
            )

        if (
            self.path.startswith("/")
            or self.path.startswith("\\")
            or _DRIVE_PREFIX_PATTERN.match(self.path)
        ):
            raise InvalidMediaLocationError(
                "Dataset-relative asset paths cannot be absolute"
            )

        if "\\" in self.path:
            raise InvalidMediaLocationError(
                "Dataset-relative asset paths must use POSIX separators"
            )

        if "\x00" in self.path:
            raise InvalidMediaLocationError(
                "Dataset-relative asset paths cannot contain NUL bytes"
            )

        components = self.path.split("/")
        if any(component in ("", ".", "..") for component in components):
            raise InvalidMediaLocationError(
                "Dataset-relative asset paths must be canonical and cannot "
                "contain empty, '.' or '..' components"
            )

        if posixpath.normpath(self.path) != self.path:
            raise InvalidMediaLocationError(
                "Dataset-relative asset paths must be canonical"
            )


@dataclass(frozen=True)
class WholeFile:
    """Selects an entire media asset."""

    kind: ClassVar[str] = "whole-file"


@dataclass(frozen=True)
class RowInterval:
    """Selects a half-open row interval in a named coordinate system."""

    kind: ClassVar[str] = "row-interval"

    coordinate_system: str
    start: int
    end: int

    def __post_init__(self):
        if self.coordinate_system not in _ROW_COORDINATE_SYSTEMS:
            raise MediaReferenceError(
                "Unsupported row coordinate system '%s'"
                % self.coordinate_system
            )

        if (
            isinstance(self.start, bool)
            or not isinstance(self.start, int)
            or isinstance(self.end, bool)
            or not isinstance(self.end, int)
            or self.start < 0
            or self.start >= self.end
        ):
            raise MediaReferenceError(
                "Row intervals must be non-empty half-open [start, end) bounds"
            )


@dataclass(frozen=True)
class VideoTimestampInterval:
    """Selects an exact LeRobot video timestamp interval."""

    kind: ClassVar[str] = "video-timestamp-interval"

    from_timestamp: float
    to_timestamp: float

    def __post_init__(self):
        for name, value in (
            ("from_timestamp", self.from_timestamp),
            ("to_timestamp", self.to_timestamp),
        ):
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
            ):
                raise MediaReferenceError(
                    "Video %s must be a finite number" % name
                )

        if self.from_timestamp < 0 or self.from_timestamp >= self.to_timestamp:
            raise MediaReferenceError(
                "Video timestamps must define a non-empty forward interval"
            )


MediaAssetSelector = Union[
    WholeFile,
    RowInterval,
    VideoTimestampInterval,
]


@dataclass(frozen=True)
class MediaAsset:
    """A typed, source-relative description of one required asset."""

    role: MediaAssetRole
    location: DatasetRelativeLocation
    selector: MediaAssetSelector
    media_type: Optional[str] = None
    feature_name: Optional[str] = None

    def __post_init__(self):
        if not isinstance(self.role, MediaAssetRole):
            raise TypeError("MediaAsset role must be a MediaAssetRole")

        if not isinstance(self.location, DatasetRelativeLocation):
            raise TypeError(
                "MediaAsset location must be a DatasetRelativeLocation"
            )

        if not isinstance(
            self.selector, (WholeFile, RowInterval, VideoTimestampInterval)
        ):
            raise TypeError("MediaAsset selector has an unsupported type")

        if self.media_type is not None and (
            not isinstance(self.media_type, str) or not self.media_type
        ):
            raise TypeError("MediaAsset media_type must be a non-empty string")

        if self.feature_name is not None and (
            not isinstance(self.feature_name, str) or not self.feature_name
        ):
            raise TypeError(
                "MediaAsset feature_name must be a non-empty string"
            )


@dataclass(frozen=True)
class LeRobotVideoLocator:
    """Bounded coordinates for one LeRobot video feature."""

    feature_name: str
    location: DatasetRelativeLocation
    chunk_index: int
    file_index: int
    timestamps: VideoTimestampInterval
    content_fingerprint: str

    def __post_init__(self):
        _validate_nonempty_string(self.feature_name, "video feature_name")
        if not isinstance(self.location, DatasetRelativeLocation):
            raise TypeError(
                "LeRobot video location must be a DatasetRelativeLocation"
            )
        if not isinstance(self.timestamps, VideoTimestampInterval):
            raise TypeError(
                "LeRobot video timestamps must be a VideoTimestampInterval"
            )

        _validate_nonnegative_int(self.chunk_index, "video chunk_index")
        _validate_nonnegative_int(self.file_index, "video file_index")
        _validate_fingerprint(
            self.content_fingerprint, "video content_fingerprint"
        )


@dataclass(frozen=True)
class LeRobotImageLocator:
    """Storage description for one LeRobot image feature."""

    feature_name: str
    location: DatasetRelativeLocation

    def __post_init__(self):
        _validate_nonempty_string(self.feature_name, "image feature_name")
        if not isinstance(self.location, DatasetRelativeLocation):
            raise TypeError(
                "LeRobot image location must be a DatasetRelativeLocation"
            )


@dataclass(frozen=True)
class LeRobotV3Locator:
    """A bounded, source-relative locator for one LeRobot v3 episode."""

    source_fingerprint: str
    locator_fingerprint: str
    info_location: DatasetRelativeLocation
    statistics_location: Optional[DatasetRelativeLocation]
    statistics_content_fingerprint: Optional[str]
    tasks_location: Optional[DatasetRelativeLocation]
    tasks_content_fingerprint: Optional[str]
    episode_metadata_location: DatasetRelativeLocation
    episode_metadata_row: int
    data_location: DatasetRelativeLocation
    data_content_fingerprint: str
    data_chunk_index: int
    data_file_index: int
    global_dataset_rows: RowInterval
    parquet_file_rows: RowInterval
    parquet_row_groups: Tuple[int, ...]
    videos: Tuple[LeRobotVideoLocator, ...]
    images: Tuple[LeRobotImageLocator, ...]

    def __post_init__(self):
        _validate_fingerprint(self.source_fingerprint, "source_fingerprint")
        _validate_fingerprint(self.locator_fingerprint, "locator_fingerprint")
        _validate_fingerprint(
            self.data_content_fingerprint, "data content_fingerprint"
        )
        for label, location in (
            ("info", self.info_location),
            ("episode metadata", self.episode_metadata_location),
            ("data", self.data_location),
        ):
            if not isinstance(location, DatasetRelativeLocation):
                raise TypeError(
                    "LeRobot %s location must be a DatasetRelativeLocation"
                    % label
                )

        for label, location, fingerprint in (
            (
                "statistics",
                self.statistics_location,
                self.statistics_content_fingerprint,
            ),
            ("tasks", self.tasks_location, self.tasks_content_fingerprint),
        ):
            if (location is None) != (fingerprint is None):
                raise MediaReferenceError(
                    "LeRobot %s location and fingerprint must appear together"
                    % label
                )
            if location is not None and not isinstance(
                location, DatasetRelativeLocation
            ):
                raise TypeError(
                    "LeRobot %s location must be a DatasetRelativeLocation"
                    % label
                )
            if fingerprint is not None:
                _validate_fingerprint(
                    fingerprint, "%s content_fingerprint" % label
                )
        _validate_nonnegative_int(
            self.episode_metadata_row, "episode metadata row"
        )
        _validate_nonnegative_int(self.data_chunk_index, "data chunk_index")
        _validate_nonnegative_int(self.data_file_index, "data file_index")

        if not isinstance(
            self.global_dataset_rows, RowInterval
        ) or not isinstance(self.parquet_file_rows, RowInterval):
            raise TypeError("LeRobot row bounds must be RowInterval values")

        if (
            self.global_dataset_rows.coordinate_system
            != "lerobot-v3-global-dataset-row"
        ):
            raise MediaReferenceError(
                "LeRobot global rows use the wrong coordinate system"
            )

        if self.parquet_file_rows.coordinate_system != "parquet-file-row":
            raise MediaReferenceError(
                "LeRobot Parquet rows use the wrong coordinate system"
            )

        if (
            not isinstance(self.parquet_row_groups, tuple)
            or not self.parquet_row_groups
            or any(
                isinstance(index, bool)
                or not isinstance(index, int)
                or index < 0
                for index in self.parquet_row_groups
            )
            or tuple(sorted(set(self.parquet_row_groups)))
            != self.parquet_row_groups
        ):
            raise MediaReferenceError(
                "LeRobot Parquet row groups must be unique nonnegative indexes"
            )

        if not isinstance(self.videos, tuple) or not isinstance(
            self.images, tuple
        ):
            raise TypeError(
                "LeRobot locator stream descriptions must be tuples"
            )
        if not all(
            isinstance(video, LeRobotVideoLocator) for video in self.videos
        ):
            raise TypeError("LeRobot video locators have an unsupported type")
        if not all(
            isinstance(image, LeRobotImageLocator) for image in self.images
        ):
            raise TypeError("LeRobot image locators have an unsupported type")

        feature_names = [video.feature_name for video in self.videos]
        feature_names.extend(image.feature_name for image in self.images)
        if len(feature_names) != len(set(feature_names)):
            raise MediaReferenceError(
                "LeRobot locator feature names must be unique"
            )


class MediaReference(ABC):
    """A logical media value that is independent of physical location."""

    kind: ClassVar[str]

    @property
    @abstractmethod
    def key(self) -> str:
        """The stable logical media key."""

    @property
    @abstractmethod
    def media_type(self) -> str:
        """The FiftyOne media type."""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """A non-identity display label."""

    @abstractmethod
    def describe_assets(self) -> Tuple[MediaAsset, ...]:
        """Purely describes the bounded assets needed to consume the media."""


@dataclass(frozen=True)
class LeRobotEpisode(MediaReference):
    """A picklable logical reference to one LeRobotDataset v3 episode.

    Args:
        source_identity: immutable, versioned identity of the logical source
        source_fingerprint: fingerprint of the source content and layout
        episode_index: the zero-based episode index
        codebase_version: the declared LeRobotDataset version
        locator: a bounded locator snapshot produced by the v3 importer
    """

    kind: ClassVar[str] = LEROBOT_EPISODE_KIND

    source_identity: str
    source_fingerprint: str
    episode_index: int
    codebase_version: str
    locator: LeRobotV3Locator

    def __post_init__(self):
        if not isinstance(self.source_identity, str):
            raise TypeError("LeRobot source_identity must be a string")

        source_identity = self.source_identity.strip()
        if not source_identity:
            raise ValueError("LeRobot source_identity must be non-empty")

        _validate_fingerprint(self.source_fingerprint, "source_fingerprint")
        _validate_nonnegative_int(self.episode_index, "episode_index")

        if not isinstance(self.codebase_version, str):
            raise TypeError("LeRobot codebase_version must be a string")

        codebase_version = self.codebase_version.strip()
        if not codebase_version:
            raise ValueError("LeRobot codebase_version must be non-empty")

        if not isinstance(self.locator, LeRobotV3Locator):
            raise TypeError("LeRobot locator must be a LeRobotV3Locator")

        if self.source_fingerprint != self.locator.source_fingerprint:
            raise StaleMediaReferenceError(
                "LeRobot reference and locator fingerprints do not match"
            )

        object.__setattr__(self, "source_identity", source_identity)
        object.__setattr__(self, "codebase_version", codebase_version)
        _validate_bounded_json(
            _serialize_lerobot_locator(self.locator), "LeRobot locator"
        )

    @property
    def key(self) -> str:
        identity = "%s\0%d" % (self.source_identity, self.episode_index)
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
        return "lerobot:%s" % digest

    @property
    def media_type(self) -> str:
        return fom.MULTIMODAL

    @property
    def display_name(self) -> str:
        return "episode-%06d" % self.episode_index

    def describe_assets(self) -> Tuple[MediaAsset, ...]:
        locator = self.locator
        assets = [
            MediaAsset(
                MediaAssetRole.DATASET_INFO,
                locator.info_location,
                WholeFile(),
                media_type="application/json",
            )
        ]
        if locator.statistics_location is not None:
            assets.append(
                MediaAsset(
                    MediaAssetRole.DATASET_STATISTICS,
                    locator.statistics_location,
                    WholeFile(),
                )
            )

        if locator.tasks_location is not None:
            assets.append(
                MediaAsset(
                    MediaAssetRole.TASKS_METADATA,
                    locator.tasks_location,
                    WholeFile(),
                )
            )

        assets.extend(
            (
                MediaAsset(
                    MediaAssetRole.EPISODE_METADATA,
                    locator.episode_metadata_location,
                    RowInterval(
                        "parquet-file-row",
                        locator.episode_metadata_row,
                        locator.episode_metadata_row + 1,
                    ),
                ),
                MediaAsset(
                    MediaAssetRole.TABULAR_FRAME_DATA,
                    locator.data_location,
                    locator.parquet_file_rows,
                ),
            )
        )
        assets.extend(
            MediaAsset(
                MediaAssetRole.IMAGE_PAYLOAD,
                image.location,
                locator.parquet_file_rows,
                feature_name=image.feature_name,
            )
            for image in locator.images
        )
        assets.extend(
            MediaAsset(
                MediaAssetRole.VIDEO_STREAM,
                video.location,
                video.timestamps,
                media_type="video/mp4",
                feature_name=video.feature_name,
            )
            for video in locator.videos
        )
        return tuple(assets)


@dataclass(frozen=True)
class _ResolvedMediaAsset:
    """A private server-side resolution of one described media asset."""

    description: MediaAsset
    asset_id: str
    path: str
    size_bytes: int
    media_type: str
    shared_resource_key: str


@dataclass(frozen=True)
class _MediaAssetManifest:
    """The private resolved asset manifest for one media reference."""

    media_reference_key: str
    episode_index: int
    declared_codebase_version: str
    detected_codebase_version: str
    fps: Optional[float]
    robot_type: Optional[str]
    task_labels: Sequence[str]
    frame_count: int
    time_range_seconds: Sequence[float]
    source_fingerprint: str
    assets: Sequence[_ResolvedMediaAsset]

    def to_dict(self, include_paths: bool = False) -> Dict[str, Any]:
        """Serializes the manifest.

        Args:
            include_paths (False): whether to include server-only paths

        Returns:
            a JSON-compatible manifest dict
        """
        assets = []
        for asset in self.assets:
            description = asset.description
            serialized_asset = {
                "asset_id": asset.asset_id,
                "role": description.role.value,
                "size_bytes": asset.size_bytes,
                "media_type": asset.media_type,
                "feature_name": description.feature_name,
                "selector": _serialize_selector(description.selector),
            }
            if include_paths:
                serialized_asset["path"] = asset.path

            assets.append(serialized_asset)

        return {
            "media_reference_key": self.media_reference_key,
            "episode_index": self.episode_index,
            "declared_codebase_version": self.declared_codebase_version,
            "detected_codebase_version": self.detected_codebase_version,
            "fps": self.fps,
            "robot_type": self.robot_type,
            "task_labels": list(self.task_labels),
            "frame_count": self.frame_count,
            "time_range_seconds": list(self.time_range_seconds),
            "source_fingerprint": self.source_fingerprint,
            "assets": assets,
        }


class _MediaResolver(ABC):
    """A private resolver for one registered media-reference kind."""

    @abstractmethod
    def resolve_assets(
        self,
        reference: MediaReference,
        assets: Sequence[MediaAsset],
    ) -> _MediaAssetManifest:
        """Resolves typed asset descriptions for the media reference."""


@dataclass(frozen=True)
class _MediaReferenceSerializer:
    kind: str
    domain_type: Type[MediaReference]
    serialize: Callable[[MediaReference], Mapping[str, Any]]
    hydrate: Callable[[Mapping[str, Any]], MediaReference]


_SERIALIZERS_BY_KIND: Dict[str, _MediaReferenceSerializer] = {}
_SERIALIZERS_BY_TYPE: Dict[
    Type[MediaReference], _MediaReferenceSerializer
] = {}
_RESOLVERS_BY_KIND: Dict[str, _MediaResolver] = {}
_EXPORT_PLANNERS_BY_KIND_AND_FORMAT: Dict[Tuple[str, str], Callable] = {}


def _register_media_reference(
    kind: str,
    domain_type: Type[MediaReference],
    serialize: Callable[[MediaReference], Mapping[str, Any]],
    hydrate: Callable[[Mapping[str, Any]], MediaReference],
) -> None:
    """Registers a media-reference serializer/hydrator."""
    if kind in _SERIALIZERS_BY_KIND or domain_type in _SERIALIZERS_BY_TYPE:
        raise ValueError("Media-reference serializer is already registered")

    serializer = _MediaReferenceSerializer(
        kind, domain_type, serialize, hydrate
    )
    _SERIALIZERS_BY_KIND[kind] = serializer
    _SERIALIZERS_BY_TYPE[domain_type] = serializer


def _serialize_media_reference(reference: MediaReference) -> Dict[str, Any]:
    """Serializes a media reference into its public descriptor."""
    serializer = _find_serializer_for_reference(reference)
    descriptor = {
        "kind": serializer.kind,
        "key": reference.key,
    }
    _validate_media_reference_descriptor(descriptor)
    return descriptor


def _persist_media_reference(reference: MediaReference) -> Dict[str, str]:
    """Persists the private binding for a reference and returns its descriptor."""
    descriptor = _serialize_media_reference(reference)
    binding = _serialize_media_reference_binding(reference)

    import fiftyone.core.odm as foo

    collection = foo.get_db_conn()[_MEDIA_REFERENCE_BINDINGS_COLLECTION]
    existing = collection.find_one({"_id": descriptor["key"]})
    if existing is None:
        try:
            collection.insert_one(binding)
            return descriptor
        except DuplicateKeyError:
            existing = collection.find_one({"_id": descriptor["key"]})
            if existing is None:
                raise

    if existing != binding:
        raise StaleMediaReferenceError(
            "Media-reference key '%s' is already bound to different private "
            "resolution data" % descriptor["key"]
        )

    return descriptor


def _hydrate_media_reference(descriptor: Mapping[str, Any]) -> MediaReference:
    """Hydrates a media reference through its private binding."""
    _validate_media_reference_descriptor(descriptor)
    kind = descriptor["kind"]

    _ensure_builtin_media_reference_kind(kind)

    serializer = _SERIALIZERS_BY_KIND.get(kind)
    if serializer is None:
        raise MediaReferenceError(
            "Unsupported media-reference kind '%s'" % kind
        )

    import fiftyone.core.odm as foo

    binding = foo.get_db_conn()[_MEDIA_REFERENCE_BINDINGS_COLLECTION].find_one(
        {"_id": descriptor["key"]}
    )
    if binding is None:
        raise MissingMediaReferenceBindingError(
            "No private media binding exists for reference '%s'"
            % descriptor["key"]
        )

    _validate_media_reference_binding(binding)
    if binding["kind"] != kind:
        raise StaleMediaReferenceError(
            "Persisted media-reference kind does not match its private binding"
        )

    reference = serializer.hydrate(deepcopy(binding["payload"]))
    if not isinstance(reference, serializer.domain_type):
        raise MediaReferenceError(
            "Media-reference hydrator for '%s' returned %s"
            % (kind, type(reference))
        )

    expected = (
        reference.key,
        reference.media_type,
        reference.display_name,
    )
    actual = (
        descriptor["key"],
        binding["media_type"],
        binding["display_name"],
    )
    if expected != actual:
        raise StaleMediaReferenceError(
            "Persisted media-reference identity does not match its payload"
        )

    return reference


def _register_media_resolver(kind: str, resolver: _MediaResolver) -> None:
    """Registers a private resolver for a media-reference kind."""
    if not isinstance(resolver, _MediaResolver):
        raise TypeError("resolver must be a _MediaResolver")

    if kind in _RESOLVERS_BY_KIND:
        raise ValueError(
            "Media resolver for '%s' is already registered" % kind
        )

    _RESOLVERS_BY_KIND[kind] = resolver


def _get_media_resolver(reference_or_kind: Any) -> _MediaResolver:
    """Gets the private resolver for a reference or reference kind."""
    if isinstance(reference_or_kind, str):
        kind = reference_or_kind
    else:
        kind = _find_serializer_for_reference(reference_or_kind).kind

    _ensure_builtin_media_reference_kind(kind)
    resolver = _RESOLVERS_BY_KIND.get(kind)
    if resolver is None:
        raise UnsupportedMediaReferenceOperation(
            "No resolver is registered for media-reference kind '%s'" % kind
        )

    return resolver


def _get_media_reference_kind(reference: MediaReference) -> str:
    """Gets the registered persistence kind for a media reference."""
    return _find_serializer_for_reference(reference).kind


def _register_media_export_planner(kind, destination_format, planner):
    """Registers a private export planner for a reference kind."""
    key = (kind, destination_format)
    if key in _EXPORT_PLANNERS_BY_KIND_AND_FORMAT:
        raise ValueError(
            "Media export planner for %s is already registered" % (key,)
        )

    if not callable(planner):
        raise TypeError("Media export planner must be callable")

    _EXPORT_PLANNERS_BY_KIND_AND_FORMAT[key] = planner


def _get_media_export_planner(kind, destination_format):
    """Gets the private export planner for a kind and destination."""
    _ensure_builtin_media_reference_kind(kind, load_exporters=True)
    key = (kind, destination_format)
    planner = _EXPORT_PLANNERS_BY_KIND_AND_FORMAT.get(key)
    if planner is None:
        raise UnsupportedMediaReferenceOperation(
            "No export planner supports media-reference kind '%s' as '%s'"
            % key
        )

    return planner


def _validate_media_source(
    filepath: Optional[str], reference: Optional[Any]
) -> None:
    """Validates the filepath/media-reference storage XOR invariant."""
    has_filepath = filepath is not None
    has_reference = reference is not None
    if has_filepath == has_reference:
        raise MediaReferenceError(
            "A sample must contain exactly one of 'filepath' and "
            "'media_reference'"
        )

    if has_reference:
        if isinstance(reference, MediaReference):
            _validate_media_reference_descriptor(
                _serialize_media_reference(reference)
            )
        else:
            _validate_media_reference_descriptor(reference)


def get_logical_media_identity(sample_or_dict: Any) -> str:
    """Gets the logical media identity of a sample or stored sample dict."""
    if isinstance(sample_or_dict, Mapping):
        reference = sample_or_dict.get("media_reference")
        filepath = sample_or_dict.get("filepath")
    else:
        reference = sample_or_dict._doc.get_field("media_reference")
        filepath = sample_or_dict._doc.get_field("filepath")

    _validate_media_source(filepath, reference)
    if reference is not None:
        if isinstance(reference, MediaReference):
            return reference.key

        return reference["key"]

    return filepath


def _get_shared_media_asset_key(
    reference: MediaReference, asset: MediaAsset
) -> str:
    """Returns the private stable key for a shared source asset."""
    source_fingerprint = getattr(reference, "source_fingerprint", None)
    if not source_fingerprint:
        raise MediaReferenceError(
            "Media reference does not expose a source fingerprint"
        )

    value = "%s\0%s" % (source_fingerprint, asset.location.path)
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _get_selected_media_asset_key(
    reference: MediaReference, asset: MediaAsset
) -> str:
    """Returns the private key for one selected asset derivative."""
    selection = {
        "role": asset.role.value,
        "feature_name": asset.feature_name,
        "selector": _serialize_selector(asset.selector),
    }
    value = "%s\0%s" % (
        _get_shared_media_asset_key(reference, asset),
        json.dumps(selection, sort_keys=True),
    )
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _build_resolved_media_asset(
    reference: MediaReference,
    asset: MediaAsset,
    path: str,
    size_bytes: int,
    media_type: str,
) -> _ResolvedMediaAsset:
    """Builds a server-only resolution for a typed media asset."""
    selected_key = _get_selected_media_asset_key(reference, asset)
    asset_id = hashlib.sha256(
        (reference.key + "\0" + selected_key).encode("utf-8")
    ).hexdigest()
    return _ResolvedMediaAsset(
        description=asset,
        asset_id=asset_id,
        path=path,
        size_bytes=size_bytes,
        media_type=media_type,
        shared_resource_key=_get_shared_media_asset_key(reference, asset),
    )


def _find_serializer_for_reference(
    reference: MediaReference,
) -> _MediaReferenceSerializer:
    if not isinstance(reference, MediaReference):
        raise TypeError("reference must be a MediaReference")

    for domain_type in type(reference).__mro__:
        serializer = _SERIALIZERS_BY_TYPE.get(domain_type)
        if serializer is not None:
            return serializer

    raise MediaReferenceError(
        "No serializer is registered for media-reference type %s"
        % type(reference)
    )


def _ensure_builtin_media_reference_kind(kind, load_exporters=False):
    if kind != LEROBOT_EPISODE_KIND:
        return

    __import__("fiftyone.utils.lerobot")
    if load_exporters:
        __import__("fiftyone.utils.lerobot_export")


def _validate_media_reference_descriptor(
    descriptor: Mapping[str, Any],
) -> None:
    if not isinstance(descriptor, Mapping):
        raise TypeError("Media-reference descriptor must be a mapping")

    required = {"kind", "key"}
    if set(descriptor) != required:
        raise MediaReferenceError(
            "Media-reference descriptor must contain exactly %s"
            % sorted(required)
        )

    for field_name in required:
        value = descriptor[field_name]
        if not isinstance(value, str) or not value:
            raise MediaReferenceError(
                "Media-reference descriptor field '%s' must be a non-empty "
                "string" % field_name
            )


def _serialize_media_reference_binding(reference):
    serializer = _find_serializer_for_reference(reference)
    payload = deepcopy(dict(serializer.serialize(reference)))
    binding = {
        "_id": reference.key,
        "kind": serializer.kind,
        "media_type": reference.media_type,
        "display_name": reference.display_name,
        "payload": payload,
    }
    _validate_media_reference_binding(binding)
    return binding


def _validate_media_reference_binding(binding):
    if not isinstance(binding, Mapping):
        raise TypeError("Private media-reference binding must be a mapping")

    required = {"_id", "kind", "media_type", "display_name", "payload"}
    if set(binding) != required:
        raise MediaReferenceError(
            "Private media-reference binding must contain exactly %s"
            % sorted(required)
        )

    for field_name in required - {"payload"}:
        value = binding[field_name]
        if not isinstance(value, str) or not value:
            raise MediaReferenceError(
                "Private media-reference binding field '%s' must be a "
                "non-empty string" % field_name
            )

    if binding["media_type"] not in fom.MEDIA_TYPES:
        raise MediaReferenceError(
            "Unsupported media-reference media type '%s'"
            % binding["media_type"]
        )

    if not isinstance(binding["payload"], Mapping):
        raise MediaReferenceError(
            "Private media-reference binding payload must be a mapping"
        )

    _validate_bounded_json(binding, "Private media-reference binding")


def _export_media_reference_bindings(descriptors):
    """Returns private bindings for exactly the given public descriptors."""
    import fiftyone.core.odm as foo

    normalized = []
    seen = set()
    for descriptor in descriptors:
        if isinstance(descriptor, MediaReference):
            descriptor = _serialize_media_reference(descriptor)

        _validate_media_reference_descriptor(descriptor)
        identity = (descriptor["kind"], descriptor["key"])
        if identity not in seen:
            normalized.append(dict(descriptor))
            seen.add(identity)

    collection = foo.get_db_conn()[_MEDIA_REFERENCE_BINDINGS_COLLECTION]
    bindings = []
    for descriptor in normalized:
        binding = collection.find_one({"_id": descriptor["key"]})
        if binding is None:
            raise MissingMediaReferenceBindingError(
                "No private media binding exists for reference '%s'"
                % descriptor["key"]
            )

        _validate_media_reference_binding(binding)
        if binding["kind"] != descriptor["kind"]:
            raise StaleMediaReferenceError(
                "Media-reference descriptor kind does not match its private "
                "binding"
            )

        bindings.append(binding)

    return bindings


def _import_media_reference_bindings(bindings, descriptors):
    """Imports private bindings required by the given public descriptors."""
    by_identity = {}
    for binding in bindings:
        _validate_media_reference_binding(binding)
        identity = (binding["kind"], binding["_id"])
        if identity in by_identity and by_identity[identity] != binding:
            raise StaleMediaReferenceError(
                "Native export contains conflicting private media bindings"
            )

        by_identity[identity] = dict(binding)

    import fiftyone.core.odm as foo

    collection = foo.get_db_conn()[_MEDIA_REFERENCE_BINDINGS_COLLECTION]
    pending = []
    seen = set()
    for descriptor in descriptors:
        _validate_media_reference_descriptor(descriptor)
        identity = (descriptor["kind"], descriptor["key"])
        if identity in seen:
            continue

        seen.add(identity)
        binding = by_identity.get(identity)
        if binding is None:
            raise MissingMediaReferenceBindingError(
                "Native export is missing the private binding for reference "
                "'%s'" % descriptor["key"]
            )

        existing = collection.find_one({"_id": descriptor["key"]})
        if existing is None:
            pending.append(binding)
        elif existing != binding:
            raise StaleMediaReferenceError(
                "Media-reference key '%s' is already bound to different "
                "private resolution data" % descriptor["key"]
            )

    inserted = []
    try:
        for binding in pending:
            try:
                collection.insert_one(binding)
                inserted.append(binding["_id"])
            except DuplicateKeyError:
                existing = collection.find_one({"_id": binding["_id"]})
                if existing != binding:
                    raise StaleMediaReferenceError(
                        "Media-reference key '%s' was concurrently bound to "
                        "different private resolution data" % binding["_id"]
                    )
    except BaseException:
        if inserted:
            collection.delete_many({"_id": {"$in": inserted}})

        raise

    return inserted


def _validate_bounded_json(value: Any, label: str) -> None:
    try:
        encoded = json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise MediaReferenceError(
            "%s must be JSON serializable" % label
        ) from exc

    if len(encoded) > MAX_MEDIA_REFERENCE_BYTES:
        raise MediaReferenceError(
            "%s exceeds the %d-byte limit" % (label, MAX_MEDIA_REFERENCE_BYTES)
        )


def _validate_nonempty_string(value, label):
    if not isinstance(value, str) or not value:
        raise TypeError("LeRobot %s must be a non-empty string" % label)


def _validate_nonnegative_int(value, label):
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError("LeRobot %s must be an int" % label)

    if value < 0:
        raise ValueError("LeRobot %s must be nonnegative" % label)


def _validate_fingerprint(value, label):
    _validate_nonempty_string(value, label)
    if _SHA256_FINGERPRINT_PATTERN.fullmatch(value) is None:
        raise MediaReferenceError(
            "LeRobot %s must be a sha256 fingerprint" % label
        )


def _serialize_selector(selector):
    if isinstance(selector, WholeFile):
        return {"kind": selector.kind}

    if isinstance(selector, RowInterval):
        return {
            "kind": selector.kind,
            "coordinate_system": selector.coordinate_system,
            "start": selector.start,
            "end": selector.end,
        }

    if isinstance(selector, VideoTimestampInterval):
        return {
            "kind": selector.kind,
            "from_timestamp": selector.from_timestamp,
            "to_timestamp": selector.to_timestamp,
        }

    raise TypeError("Unsupported media asset selector %s" % type(selector))


def _serialize_row_interval(interval):
    return {
        "coordinate_system": interval.coordinate_system,
        "start": interval.start,
        "end": interval.end,
    }


def _hydrate_row_interval(value):
    if not isinstance(value, Mapping) or set(value) != {
        "coordinate_system",
        "start",
        "end",
    }:
        raise MediaReferenceError("Malformed persisted row interval")

    return RowInterval(**dict(value))


def _serialize_lerobot_locator(locator):
    return {
        "source_fingerprint": locator.source_fingerprint,
        "locator_fingerprint": locator.locator_fingerprint,
        "info_location": locator.info_location.path,
        "statistics_location": (
            None
            if locator.statistics_location is None
            else locator.statistics_location.path
        ),
        "statistics_content_fingerprint": (
            locator.statistics_content_fingerprint
        ),
        "tasks_location": (
            None
            if locator.tasks_location is None
            else locator.tasks_location.path
        ),
        "tasks_content_fingerprint": locator.tasks_content_fingerprint,
        "episode_metadata": {
            "location": locator.episode_metadata_location.path,
            "row": locator.episode_metadata_row,
        },
        "data": {
            "location": locator.data_location.path,
            "content_fingerprint": locator.data_content_fingerprint,
            "chunk_index": locator.data_chunk_index,
            "file_index": locator.data_file_index,
            "global_rows": _serialize_row_interval(
                locator.global_dataset_rows
            ),
            "file_rows": _serialize_row_interval(locator.parquet_file_rows),
            "row_groups": list(locator.parquet_row_groups),
        },
        "videos": [
            {
                "feature_name": video.feature_name,
                "location": video.location.path,
                "chunk_index": video.chunk_index,
                "file_index": video.file_index,
                "from_timestamp": video.timestamps.from_timestamp,
                "to_timestamp": video.timestamps.to_timestamp,
                "content_fingerprint": video.content_fingerprint,
            }
            for video in locator.videos
        ],
        "images": [
            {
                "feature_name": image.feature_name,
                "location": image.location.path,
            }
            for image in locator.images
        ],
    }


def _hydrate_lerobot_locator(value):
    required = {
        "source_fingerprint",
        "locator_fingerprint",
        "info_location",
        "statistics_location",
        "statistics_content_fingerprint",
        "tasks_location",
        "tasks_content_fingerprint",
        "episode_metadata",
        "data",
        "videos",
        "images",
    }
    if not isinstance(value, Mapping) or set(value) != required:
        raise MediaReferenceError("Malformed persisted LeRobot locator")

    episode_metadata = value["episode_metadata"]
    if not isinstance(episode_metadata, Mapping) or set(episode_metadata) != {
        "location",
        "row",
    }:
        raise MediaReferenceError("Malformed episode metadata locator")

    data = value["data"]
    if not isinstance(data, Mapping) or set(data) != {
        "location",
        "content_fingerprint",
        "chunk_index",
        "file_index",
        "global_rows",
        "file_rows",
        "row_groups",
    }:
        raise MediaReferenceError("Malformed episode data locator")
    if not isinstance(data["row_groups"], list):
        raise MediaReferenceError("Malformed episode data row groups")

    videos = value["videos"]
    images = value["images"]
    if not isinstance(videos, list) or not isinstance(images, list):
        raise MediaReferenceError("Malformed LeRobot stream locators")

    statistics = value["statistics_location"]
    tasks = value["tasks_location"]
    return LeRobotV3Locator(
        source_fingerprint=value["source_fingerprint"],
        locator_fingerprint=value["locator_fingerprint"],
        info_location=DatasetRelativeLocation(value["info_location"]),
        statistics_location=(
            None if statistics is None else DatasetRelativeLocation(statistics)
        ),
        statistics_content_fingerprint=value["statistics_content_fingerprint"],
        tasks_location=(
            None if tasks is None else DatasetRelativeLocation(tasks)
        ),
        tasks_content_fingerprint=value["tasks_content_fingerprint"],
        episode_metadata_location=DatasetRelativeLocation(
            episode_metadata["location"]
        ),
        episode_metadata_row=episode_metadata["row"],
        data_location=DatasetRelativeLocation(data["location"]),
        data_content_fingerprint=data["content_fingerprint"],
        data_chunk_index=data["chunk_index"],
        data_file_index=data["file_index"],
        global_dataset_rows=_hydrate_row_interval(data["global_rows"]),
        parquet_file_rows=_hydrate_row_interval(data["file_rows"]),
        parquet_row_groups=tuple(data["row_groups"]),
        videos=tuple(
            _hydrate_lerobot_video_locator(video) for video in videos
        ),
        images=tuple(
            _hydrate_lerobot_image_locator(image) for image in images
        ),
    )


def _hydrate_lerobot_video_locator(value):
    required = {
        "feature_name",
        "location",
        "chunk_index",
        "file_index",
        "from_timestamp",
        "to_timestamp",
        "content_fingerprint",
    }
    if not isinstance(value, Mapping) or set(value) != required:
        raise MediaReferenceError("Malformed LeRobot video locator")

    return LeRobotVideoLocator(
        feature_name=value["feature_name"],
        location=DatasetRelativeLocation(value["location"]),
        chunk_index=value["chunk_index"],
        file_index=value["file_index"],
        timestamps=VideoTimestampInterval(
            value["from_timestamp"], value["to_timestamp"]
        ),
        content_fingerprint=value["content_fingerprint"],
    )


def _hydrate_lerobot_image_locator(value):
    if not isinstance(value, Mapping) or set(value) != {
        "feature_name",
        "location",
    }:
        raise MediaReferenceError("Malformed LeRobot image locator")

    return LeRobotImageLocator(
        feature_name=value["feature_name"],
        location=DatasetRelativeLocation(value["location"]),
    )


def _serialize_lerobot_episode(reference: LeRobotEpisode) -> Mapping[str, Any]:
    return {
        "source_identity": reference.source_identity,
        "source_fingerprint": reference.source_fingerprint,
        "episode_index": reference.episode_index,
        "codebase_version": reference.codebase_version,
        "locator": _serialize_lerobot_locator(reference.locator),
    }


def _hydrate_lerobot_episode(payload: Mapping[str, Any]) -> LeRobotEpisode:
    required = {
        "source_identity",
        "source_fingerprint",
        "episode_index",
        "codebase_version",
        "locator",
    }
    if set(payload) != required:
        raise MediaReferenceError(
            "LeRobot episode payload must contain exactly %s"
            % sorted(required)
        )

    return LeRobotEpisode(
        source_identity=payload["source_identity"],
        source_fingerprint=payload["source_fingerprint"],
        episode_index=payload["episode_index"],
        codebase_version=payload["codebase_version"],
        locator=_hydrate_lerobot_locator(payload["locator"]),
    )


_register_media_reference(
    LEROBOT_EPISODE_KIND,
    LeRobotEpisode,
    _serialize_lerobot_episode,
    _hydrate_lerobot_episode,
)
