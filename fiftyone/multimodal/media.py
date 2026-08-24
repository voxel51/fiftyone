"""
Logical media references and episode asset resolution contracts.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from copy import deepcopy
from dataclasses import dataclass, field
import json
import os
from typing import Any, Callable, Dict, Mapping, Optional, Sequence, Type

import fiftyone.core.media as fom
import fiftyone.core.storage as fos

LEROBOT_EPISODE_KIND = "lerobot-episode"
MEDIA_REFERENCE_ENVELOPE_VERSION = "1"
MAX_MEDIA_REFERENCE_BYTES = 64 * 1024
# Existing clients accept dataset revisions below 2.0, so reference-backed
# datasets use the first incompatible revision and fail cleanly when opened.
MEDIA_REFERENCE_DATASET_REVISION = "2.0.0"


class MediaReferenceError(ValueError):
    """Base error raised for invalid or unavailable media references."""


class MissingMediaRootError(MediaReferenceError):
    """Raised when a media reference's dataset root is missing."""


class MovedMediaRootError(MediaReferenceError):
    """Raised when a media reference points at the wrong source root."""


class StaleMediaReferenceError(MediaReferenceError):
    """Raised when a stored locator no longer matches its source."""


class UnsupportedMediaReferenceVersionError(MediaReferenceError):
    """Raised when a referenced source version is not supported."""


class MalformedMediaSourceError(MediaReferenceError):
    """Raised when a referenced source is structurally invalid."""


class UnfinalizedMediaSourceError(MalformedMediaSourceError):
    """Raised when a source contains an unfinalized byte asset."""


class UnsupportedMediaReferenceOperation(MediaReferenceError):
    """Raised when a generic filepath operation receives a reference."""


class MediaReference(ABC):
    """A logical media value that is independent of physical location."""

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


class Episode(MediaReference, ABC):
    """A logical episode that spans one or more physical assets."""

    @abstractmethod
    def resolve_filepath(self) -> str:
        """Returns one physical asset that anchors the episode."""


@dataclass(frozen=True)
class LeRobotEpisode(Episode):
    """A picklable logical reference to one LeRobotDataset v3 episode.

    Args:
        source_identity: immutable, versioned identity of the logical source
        dataset_root: current physical root of the LeRobot dataset
        episode_index: the zero-based episode index
        codebase_version: the declared LeRobotDataset version
        locator: a bounded locator snapshot produced by the v3 importer
    """

    source_identity: str
    dataset_root: str
    episode_index: int
    codebase_version: str
    locator: Mapping[str, Any]

    def __post_init__(self):
        source_identity = self.source_identity.strip()
        if not source_identity:
            raise ValueError("LeRobot source_identity must be non-empty")

        if isinstance(self.episode_index, bool) or not isinstance(
            self.episode_index, int
        ):
            raise TypeError("LeRobot episode_index must be an int")

        if self.episode_index < 0:
            raise ValueError("LeRobot episode_index must be nonnegative")

        codebase_version = self.codebase_version.strip()
        if not codebase_version:
            raise ValueError("LeRobot codebase_version must be non-empty")

        if not isinstance(self.locator, Mapping):
            raise TypeError("LeRobot locator must be a mapping")

        dataset_root = fos.normalize_path(self.dataset_root)
        locator = deepcopy(dict(self.locator))
        _validate_bounded_json(locator, "LeRobot locator")

        object.__setattr__(self, "source_identity", source_identity)
        object.__setattr__(self, "dataset_root", dataset_root)
        object.__setattr__(self, "codebase_version", codebase_version)
        object.__setattr__(self, "locator", locator)

    @property
    def key(self) -> str:
        return "lerobot:%s:%d" % (self.source_identity, self.episode_index)

    @property
    def media_type(self) -> str:
        return fom.MULTIMODAL

    @property
    def display_name(self) -> str:
        return "episode-%06d" % self.episode_index

    def resolve_filepath(self) -> str:
        return os.path.join(self.dataset_root, "meta", "info.json")


@dataclass(frozen=True)
class EpisodeAsset:
    """One role-tagged byte asset in an episode manifest."""

    asset_id: str
    role: str
    path: str
    size_bytes: int
    media_type: str
    feature_name: Optional[str] = None
    url: Optional[str] = None
    coordinates: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EpisodeAssetManifest:
    """The complete server-side asset description for one episode."""

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
    assets: Sequence[EpisodeAsset]

    def to_dict(self, include_paths: bool = False) -> Dict[str, Any]:
        """Serializes the manifest.

        Args:
            include_paths (False): whether to include server-only paths

        Returns:
            a JSON-compatible manifest dict
        """
        assets = []
        for asset in self.assets:
            serialized_asset = {
                "asset_id": asset.asset_id,
                "role": asset.role,
                "size_bytes": asset.size_bytes,
                "media_type": asset.media_type,
                "feature_name": asset.feature_name,
                "url": asset.url,
                "coordinates": _to_plain_json(asset.coordinates),
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


class EpisodeResolver(ABC):
    """An external resolver for an episode domain value."""

    @abstractmethod
    def resolve_assets(self, episode: Episode) -> EpisodeAssetManifest:
        """Resolves the physical assets required by the episode."""


@dataclass(frozen=True)
class _MediaReferenceSerializer:
    kind: str
    domain_type: Type[MediaReference]
    version: str
    serialize: Callable[[MediaReference], Mapping[str, Any]]
    hydrate: Callable[[Mapping[str, Any]], MediaReference]


_SERIALIZERS_BY_KIND: Dict[str, _MediaReferenceSerializer] = {}
_SERIALIZERS_BY_TYPE: Dict[
    Type[MediaReference], _MediaReferenceSerializer
] = {}
_RESOLVERS_BY_KIND: Dict[str, EpisodeResolver] = {}


def register_media_reference(
    kind: str,
    domain_type: Type[MediaReference],
    version: str,
    serialize: Callable[[MediaReference], Mapping[str, Any]],
    hydrate: Callable[[Mapping[str, Any]], MediaReference],
) -> None:
    """Registers a media-reference serializer/hydrator."""
    if kind in _SERIALIZERS_BY_KIND or domain_type in _SERIALIZERS_BY_TYPE:
        raise ValueError("Media-reference serializer is already registered")

    serializer = _MediaReferenceSerializer(
        kind, domain_type, str(version), serialize, hydrate
    )
    _SERIALIZERS_BY_KIND[kind] = serializer
    _SERIALIZERS_BY_TYPE[domain_type] = serializer


def serialize_media_reference(reference: MediaReference) -> Dict[str, Any]:
    """Serializes a media reference into its private persistence envelope."""
    serializer = _find_serializer_for_reference(reference)
    payload = deepcopy(dict(serializer.serialize(reference)))
    envelope = {
        "kind": serializer.kind,
        "version": serializer.version,
        "media_type": reference.media_type,
        "key": reference.key,
        "display_name": reference.display_name,
        "payload": payload,
    }
    _validate_media_reference_envelope(envelope)
    return envelope


def hydrate_media_reference(envelope: Mapping[str, Any]) -> MediaReference:
    """Hydrates a domain value from a private persistence envelope."""
    _validate_media_reference_envelope(envelope)
    kind = envelope["kind"]
    serializer = _SERIALIZERS_BY_KIND.get(kind)
    if serializer is None:
        raise MediaReferenceError(
            "Unsupported media-reference kind '%s'" % kind
        )

    if envelope["version"] != serializer.version:
        raise UnsupportedMediaReferenceVersionError(
            "Unsupported media-reference envelope version '%s' for kind '%s'"
            % (envelope["version"], kind)
        )

    reference = serializer.hydrate(deepcopy(envelope["payload"]))
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
        envelope["key"],
        envelope["media_type"],
        envelope["display_name"],
    )
    if expected != actual:
        raise StaleMediaReferenceError(
            "Persisted media-reference identity does not match its payload"
        )

    return reference


def register_episode_resolver(kind: str, resolver: EpisodeResolver) -> None:
    """Registers an external episode resolver for a reference kind."""
    if not isinstance(resolver, EpisodeResolver):
        raise TypeError("resolver must be an EpisodeResolver")

    if kind in _RESOLVERS_BY_KIND:
        raise ValueError(
            "Episode resolver for '%s' is already registered" % kind
        )

    _RESOLVERS_BY_KIND[kind] = resolver


def get_episode_resolver(reference_or_kind: Any) -> EpisodeResolver:
    """Gets the registered resolver for a reference or reference kind."""
    if isinstance(reference_or_kind, str):
        kind = reference_or_kind
    else:
        kind = _find_serializer_for_reference(reference_or_kind).kind

    resolver = _RESOLVERS_BY_KIND.get(kind)
    if resolver is None:
        raise UnsupportedMediaReferenceOperation(
            "No episode resolver is registered for media-reference kind '%s'"
            % kind
        )

    return resolver


def get_media_reference_kind(reference: MediaReference) -> str:
    """Gets the registered persistence kind for a media reference."""
    return _find_serializer_for_reference(reference).kind


def sanitize_media_reference(
    envelope: Optional[Mapping[str, Any]],
) -> Optional[Dict[str, str]]:
    """Returns the browser-safe descriptor for a persisted envelope."""
    if envelope is None:
        return None

    _validate_media_reference_envelope(envelope)
    return {
        "kind": envelope["kind"],
        "key": envelope["key"],
        "version": envelope["version"],
    }


def validate_media_source(
    filepath: Optional[str], envelope: Optional[Mapping[str, Any]]
) -> None:
    """Validates the filepath/media-reference storage XOR invariant."""
    has_filepath = filepath is not None
    has_reference = envelope is not None
    if has_filepath == has_reference:
        raise MediaReferenceError(
            "A sample must contain exactly one of 'filepath' and "
            "'_media_reference'"
        )

    if has_reference:
        _validate_media_reference_envelope(envelope)


def get_logical_media_identity(sample_or_dict: Any) -> str:
    """Gets the logical media identity of a sample or stored sample dict."""
    if isinstance(sample_or_dict, Mapping):
        envelope = sample_or_dict.get("_media_reference")
        filepath = sample_or_dict.get("filepath")
    else:
        envelope = sample_or_dict._doc.get_field("_media_reference")
        filepath = sample_or_dict._doc.get_field("filepath")

    validate_media_source(filepath, envelope)
    if envelope is not None:
        return envelope["key"]

    return filepath


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


def _validate_media_reference_envelope(envelope: Mapping[str, Any]) -> None:
    if not isinstance(envelope, Mapping):
        raise TypeError("Media-reference envelope must be a mapping")

    required = {
        "kind",
        "version",
        "media_type",
        "key",
        "display_name",
        "payload",
    }
    if set(envelope) != required:
        raise MediaReferenceError(
            "Media-reference envelope must contain exactly %s"
            % sorted(required)
        )

    for field_name in required - {"payload"}:
        value = envelope[field_name]
        if not isinstance(value, str) or not value:
            raise MediaReferenceError(
                "Media-reference envelope field '%s' must be a non-empty string"
                % field_name
            )

    if envelope["media_type"] not in fom.MEDIA_TYPES:
        raise MediaReferenceError(
            "Unsupported media-reference media type '%s'"
            % envelope["media_type"]
        )

    if not isinstance(envelope["payload"], Mapping):
        raise MediaReferenceError(
            "Media-reference envelope payload must be a mapping"
        )

    _validate_bounded_json(envelope, "Media-reference envelope")


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


def _to_plain_json(value: Any) -> Any:
    return json.loads(json.dumps(value))


def _serialize_lerobot_episode(reference: LeRobotEpisode) -> Mapping[str, Any]:
    return {
        "source_identity": reference.source_identity,
        "dataset_root": reference.dataset_root,
        "episode_index": reference.episode_index,
        "codebase_version": reference.codebase_version,
        "locator": deepcopy(dict(reference.locator)),
    }


def _hydrate_lerobot_episode(payload: Mapping[str, Any]) -> LeRobotEpisode:
    required = {
        "source_identity",
        "dataset_root",
        "episode_index",
        "codebase_version",
        "locator",
    }
    if set(payload) != required:
        raise MediaReferenceError(
            "LeRobot episode payload must contain exactly %s"
            % sorted(required)
        )

    return LeRobotEpisode(**dict(payload))


register_media_reference(
    LEROBOT_EPISODE_KIND,
    LeRobotEpisode,
    MEDIA_REFERENCE_ENVELOPE_VERSION,
    _serialize_lerobot_episode,
    _hydrate_lerobot_episode,
)
