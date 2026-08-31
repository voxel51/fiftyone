"""
LeRobotDataset v3 import and asset resolution utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import defaultdict
from collections.abc import Mapping
from contextlib import contextmanager
import contextvars
from copy import deepcopy
from dataclasses import dataclass
from functools import wraps
import hashlib
import json
import logging
import math
import mimetypes
import os
import posixpath
import re
import string
import threading
import uuid

import cachetools
from pymongo.errors import DuplicateKeyError

import eta.core.utils as etau
import fiftyone.core.fields as fof
from fiftyone.core.media_assets import (
    _MediaSourceDescriptor,
    _ReferenceAssetMaterializer,
    _register_reference_asset_materializer,
)
import fiftyone.core.odm as foo
from fiftyone.core.sample import Sample
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
from fiftyone.multimodal.media import (
    LEROBOT_EPISODE_KIND,
    DatasetRelativeLocation,
    InvalidMediaLocationError,
    LeRobotEpisode,
    LeRobotImageLocator,
    LeRobotV3Locator,
    LeRobotVideoLocator,
    MalformedMediaSourceError,
    MediaReferenceError,
    MediaSourceAuthorizationError,
    MissingMediaRootError,
    MovedMediaRootError,
    RowInterval,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedLeRobotVersionError,
    VideoTimestampInterval,
    _build_resolved_media_asset,
    _get_media_resolver,
    _get_selected_media_asset_key,
    _MediaAssetManifest,
    _MediaResolver,
    _register_media_resolver,
    _serialize_media_reference_binding,
)
import fiftyone.utils.data.importers as foud

pa = fou.lazy_import(
    "pyarrow", callback=lambda: fou.ensure_package("pyarrow>=10.0.0")
)
papq = fou.lazy_import(
    "pyarrow.parquet",
    callback=lambda: fou.ensure_package("pyarrow>=10.0.0"),
)

logger = logging.getLogger(__name__)

_VERSION_PATTERN = re.compile(r"^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$")
_PATH_FORMAT_SPEC_PATTERN = re.compile(r"^0([1-9]|1[0-6])d$")
_MAX_SOURCE_PATH_LENGTH = 4096
_REQUIRED_INFO_FIELDS = {
    "codebase_version",
    "data_path",
    "features",
    "fps",
    "total_episodes",
    "video_path",
}
_REQUIRED_EPISODE_FIELDS = {
    "data/chunk_index",
    "data/file_index",
    "dataset_from_index",
    "dataset_to_index",
    "episode_index",
    "length",
    "tasks",
}

_RESOLUTION_SOURCE_CACHE = contextvars.ContextVar(
    "lerobot_resolution_source_cache", default=None
)


@dataclass(frozen=True)
class _LocalLeRobotSourceBinding:
    root: str
    source_fingerprint: str
    revision: str


@dataclass(frozen=True)
class _ManifestCacheEntry:
    binding_revision: str
    manifest: _MediaAssetManifest
    file_signatures: tuple


@dataclass
class _ResolutionLockEntry:
    lock: threading.Lock
    references: int = 0


@dataclass(frozen=True)
class _InspectedLeRobotSource:
    root: str
    info: dict
    codebase_version: str
    rows: tuple
    data_shard_bases: dict
    asset_fingerprints: dict
    source_fingerprint: str


_SOURCE_BINDINGS_COLLECTION = "media_source_bindings"
_SOURCE_BINDING_MAX_ATTEMPTS = 16
_MANIFEST_CACHE = cachetools.LRUCache(maxsize=512)
_ASSET_FINGERPRINT_CACHE = cachetools.LRUCache(maxsize=4096)
_RESOLUTION_LOCKS = {}
_CACHE_LOCK = threading.RLock()


def _deduplicate_resolutions(method):
    @wraps(method)
    def wrapper(self, reference, assets):
        if not isinstance(reference, LeRobotEpisode):
            return method(self, reference, assets)

        cache_key = _resolution_cache_key(reference, assets)
        with _CACHE_LOCK:
            entry = _RESOLUTION_LOCKS.get(cache_key)
            if entry is None:
                entry = _ResolutionLockEntry(threading.Lock())
                _RESOLUTION_LOCKS[cache_key] = entry

            entry.references += 1

        try:
            with entry.lock:
                return method(self, reference, assets)
        finally:
            with _CACHE_LOCK:
                entry.references -= 1
                if entry.references == 0:
                    _RESOLUTION_LOCKS.pop(cache_key, None)

    return wrapper


class LeRobotDatasetImporter(foud.GenericSampleDatasetImporter):
    """Imports logical episodes from a local LeRobotDataset v3 source.

    Args:
        dataset_dir: the local LeRobot dataset root
        episodes (None): optional episode indexes to import
        source_identity (None): an explicit immutable source identity. By
            default, a deterministic metadata fingerprint is used
        shuffle (False): whether to randomly shuffle selected episodes
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of episodes to import
    """

    def __init__(
        self,
        dataset_dir,
        episodes=None,
        source_identity=None,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self.episodes = None if episodes is None else list(episodes)
        self.source_identity = source_identity

        self._samples = None
        self._iter_samples = None
        self._dataset_info = None

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return len(self._samples)

    def __next__(self):
        return next(self._iter_samples)

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_sample_field_schema(self):
        return True

    def get_sample_field_schema(self):
        return {
            "episode_index": fof.IntField(),
            "task": fof.StringField(),
            "tasks": fof.ListField(fof.StringField()),
            "length": fof.IntField(),
            "duration": fof.FloatField(),
            "robot_type": fof.StringField(),
            "fps": fof.FloatField(),
        }

    def get_dataset_info(self):
        return deepcopy(self._dataset_info)

    def setup(self):
        resolver = _get_media_resolver(LEROBOT_EPISODE_KIND)
        if not isinstance(resolver, _LeRobotMediaResolver):
            raise TypeError("Registered LeRobot resolver has the wrong type")

        source = resolver.inspect_local_source(self.dataset_dir)
        root = source.root
        info = source.info
        rows = source.rows
        codebase_version = source.codebase_version
        source_fingerprint = source.source_fingerprint
        source_identity = self.source_identity
        if source_identity is None:
            source_identity = "local:%s" % source_fingerprint
        elif (
            not isinstance(source_identity, str) or not source_identity.strip()
        ):
            raise ValueError("source_identity must be a non-empty string")
        else:
            source_identity = source_identity.strip()

        rows_by_index = {}
        for row in rows:
            episode_index = row["episode_index"]
            if episode_index in rows_by_index:
                raise MalformedMediaSourceError(
                    "Duplicate LeRobot episode_index %d" % episode_index
                )

            rows_by_index[episode_index] = row

        expected_total = info["total_episodes"]
        if expected_total != len(rows_by_index):
            raise MalformedMediaSourceError(
                "LeRobot info.json declares %d episodes but metadata contains %d"
                % (expected_total, len(rows_by_index))
            )

        selected_indexes = _select_episode_indexes(
            rows_by_index,
            self.episodes,
            self._preprocess_list,
        )
        selected_rows = [rows_by_index[index] for index in selected_indexes]
        source = resolver.prepare_source_assets(source, selected_rows)
        fps = float(info["fps"])
        robot_type = info.get("robot_type", None)
        samples = []
        for episode_index in selected_indexes:
            row = rows_by_index[episode_index]
            locator = resolver.build_locator(source, row)
            reference = LeRobotEpisode(
                source_identity=source_identity,
                source_fingerprint=source_fingerprint,
                episode_index=episode_index,
                codebase_version=codebase_version,
                locator=locator,
            )
            tasks = list(row["tasks"] or [])
            frame_count = row["length"]
            sample = Sample(
                media_reference=reference,
                episode_index=episode_index,
                task=tasks[0] if tasks else None,
                tasks=tasks,
                length=frame_count,
                duration=frame_count / fps,
                robot_type=robot_type,
                fps=fps,
            )
            samples.append(sample)

        self.dataset_dir = root
        self._samples = samples
        bind_lerobot_source(source_identity, root, source_fingerprint)
        self._dataset_info = {
            "lerobot": {
                "format": "LeRobotDataset",
                "format_major": 3,
                "codebase_version": codebase_version,
                "episode_count": len(rows_by_index),
                "imported_episode_count": len(samples),
            }
        }


def bind_lerobot_source(source_identity, dataset_root, source_fingerprint):
    """Binds a LeRobot source identity to an authorized local root."""
    if not isinstance(source_identity, str) or not source_identity.strip():
        raise ValueError("source_identity must be a non-empty string")

    if not dataset_root:
        raise MissingMediaRootError("A local LeRobot dataset root is required")

    root = os.path.realpath(fos.normalize_path(dataset_root))
    if not isinstance(source_fingerprint, str) or not source_fingerprint:
        raise ValueError("source_fingerprint must be a non-empty string")
    source_identity = source_identity.strip()
    collection = foo.get_db_conn()[_SOURCE_BINDINGS_COLLECTION]
    for _ in range(_SOURCE_BINDING_MAX_ATTEMPTS):
        existing = collection.find_one({"_id": source_identity})
        revision = uuid.uuid4().hex
        if existing is None:
            try:
                collection.insert_one(
                    {
                        "_id": source_identity,
                        "kind": LEROBOT_EPISODE_KIND,
                        "root": root,
                        "source_fingerprint": source_fingerprint,
                        "revision": revision,
                    }
                )
                break
            except DuplicateKeyError:
                continue

        if (
            existing.get("kind") != LEROBOT_EPISODE_KIND
            or existing.get("source_fingerprint") != source_fingerprint
        ):
            raise StaleMediaReferenceError(
                "The source identity is already bound to different content; "
                "use a new identity for the changed source"
            )

        result = collection.update_one(
            {"_id": source_identity, "revision": existing.get("revision")},
            {"$set": {"root": root, "revision": revision}},
        )
        if result.matched_count:
            break
    else:
        raise StaleMediaReferenceError(
            "The source binding changed repeatedly; retry the operation"
        )

    _clear_resolution_caches()


def unbind_lerobot_source(source_identity):
    """Removes the local binding for a LeRobot source identity."""
    foo.get_db_conn()[_SOURCE_BINDINGS_COLLECTION].delete_one(
        {"_id": source_identity}
    )
    _clear_resolution_caches()


def relocate_lerobot_source(source_identity, dataset_root):
    """Relocates an existing LeRobot binding without changing its identity."""
    root = os.path.realpath(fos.normalize_path(dataset_root))
    collection = foo.get_db_conn()[_SOURCE_BINDINGS_COLLECTION]
    for _ in range(_SOURCE_BINDING_MAX_ATTEMPTS):
        binding = _get_source_binding(source_identity)
        if binding is None:
            raise MissingMediaRootError(
                "No authorized source binding exists for this LeRobot dataset"
            )

        result = collection.update_one(
            {"_id": source_identity, "revision": binding.revision},
            {"$set": {"root": root, "revision": uuid.uuid4().hex}},
        )
        if result.matched_count:
            break
    else:
        raise StaleMediaReferenceError(
            "The source binding changed repeatedly; retry the relocation"
        )

    _clear_resolution_caches()


class _LeRobotMediaResolver(_MediaResolver):
    """Resolves LeRobot v3 assets through server-side source bindings."""

    def inspect_local_source(self, dataset_root):
        """Reads and validates one local v3 source for the importer."""
        root = _validate_dataset_root(dataset_root)
        info_path = _resolve_under_root(root, "meta/info.json")
        info, info_bytes = _load_info(info_path)
        codebase_version = _validate_v3_info(info)

        metadata_paths = sorted(
            etau.list_files(
                os.path.join(root, "meta", "episodes"),
                recursive=True,
                abs_paths=True,
            )
        )
        metadata_paths = [
            path for path in metadata_paths if path.endswith(".parquet")
        ]
        if not metadata_paths:
            raise MalformedMediaSourceError(
                "LeRobot source has no episode metadata Parquet shards under "
                "meta/episodes"
            )

        rows, shard_bytes = _read_episode_metadata(root, metadata_paths)
        for relative_path in ("meta/stats.json", "meta/tasks.parquet"):
            path = _resolve_under_root(root, relative_path)
            if not os.path.isfile(path):
                continue

            raw = _read_bytes(path)
            if relative_path.endswith(".parquet"):
                with _open_parquet(path, "shared metadata"):
                    pass
            shard_bytes.append((relative_path, raw))

        asset_sizes = _collect_source_asset_sizes(root, info, rows)
        data_shard_bases = _get_data_shard_bases(root, info, rows)
        source_fingerprint = "sha256:" + _compute_source_fingerprint(
            info, info_bytes, shard_bytes, asset_sizes
        )
        return _InspectedLeRobotSource(
            root=root,
            info=info,
            codebase_version=codebase_version,
            rows=tuple(rows),
            data_shard_bases=data_shard_bases,
            asset_fingerprints={},
            source_fingerprint=source_fingerprint,
        )

    def prepare_source_assets(self, source, rows):
        """Validates and fingerprints only the selected physical assets."""
        if not isinstance(source, _InspectedLeRobotSource):
            raise TypeError("source must be an inspected LeRobot source")

        asset_fingerprints, data_shard_bases = _validate_source_assets(
            source.root,
            source.info,
            rows,
            data_shard_bases=source.data_shard_bases,
        )
        return _InspectedLeRobotSource(
            root=source.root,
            info=source.info,
            codebase_version=source.codebase_version,
            rows=source.rows,
            data_shard_bases=data_shard_bases,
            asset_fingerprints=asset_fingerprints,
            source_fingerprint=source.source_fingerprint,
        )

    def build_locator(self, source, row):
        """Builds one typed locator from an inspected source snapshot."""
        if not isinstance(source, _InspectedLeRobotSource):
            raise TypeError("source must be an inspected LeRobot source")

        return _build_locator(
            source.root,
            source.info,
            row,
            source.data_shard_bases,
            source.source_fingerprint,
            source.asset_fingerprints,
        )

    def resolve_assets(self, reference, assets):
        if not isinstance(reference, LeRobotEpisode):
            raise TypeError("_LeRobotMediaResolver requires a LeRobotEpisode")

        described_assets = reference.describe_assets()
        if tuple(assets) != described_assets:
            raise InvalidMediaLocationError(
                "LeRobot assets must come from MediaReference.describe_assets()"
            )

        return self.resolve_described_assets(reference, assets)

    @contextmanager
    def operation_context(self):
        token = _RESOLUTION_SOURCE_CACHE.set({})
        try:
            yield
        finally:
            _RESOLUTION_SOURCE_CACHE.reset(token)

    @_deduplicate_resolutions
    def resolve_described_assets(self, reference, assets):
        root, binding = _validate_resolver_root(reference)
        return _resolve_lerobot_assets_at_root(
            reference,
            assets,
            root,
            cache_revision=binding.revision,
        )


def _resolve_lerobot_assets_at_root(
    reference, assets, root, cache_revision=None
):
    if not isinstance(reference, LeRobotEpisode):
        raise TypeError("_LeRobotMediaResolver requires a LeRobotEpisode")

    _validate_declared_v3_version(reference.codebase_version)
    root = _validate_dataset_root(root)
    cache_key = _resolution_cache_key(reference, assets)
    if cache_revision is not None:
        cached = _get_cached_manifest(cache_key, cache_revision)
        if cached is not None:
            return cached

    locator = reference.locator
    info_path = _resolve_under_root(root, locator.info_location.path)
    info, info_bytes = _load_info(info_path)
    detected_version = _validate_v3_info(info)

    metadata_path = _resolve_under_root(
        root, locator.episode_metadata_location.path
    )
    row = _read_episode_metadata_row(
        root, metadata_path, locator.episode_metadata_row
    )
    metadata_bytes = _read_bytes(metadata_path)
    if row["episode_index"] != reference.episode_index:
        raise StaleMediaReferenceError(
            "LeRobot episode metadata row now identifies another episode"
        )

    current_fingerprint = "sha256:" + _compute_locator_fingerprint(
        info,
        info_bytes,
        locator.episode_metadata_location.path,
        metadata_bytes,
    )
    if current_fingerprint != locator.locator_fingerprint:
        raise StaleMediaReferenceError(
            "LeRobot source layout changed since import; re-import the "
            "dataset to refresh its episode locators"
        )

    _validate_asset_fingerprint(
        root,
        locator.data_location.path,
        locator.data_content_fingerprint,
        reference.source_fingerprint,
    )
    for location, fingerprint in (
        (
            locator.statistics_location,
            locator.statistics_content_fingerprint,
        ),
        (locator.tasks_location, locator.tasks_content_fingerprint),
    ):
        if location is not None:
            _validate_asset_fingerprint(
                root,
                location.path,
                fingerprint,
                reference.source_fingerprint,
            )

    _validate_resolved_data_slice(root, reference, locator)
    for video in locator.videos:
        _validate_asset_fingerprint(
            root,
            video.location.path,
            video.content_fingerprint,
            reference.source_fingerprint,
        )

    resolved_assets = tuple(
        _resolve_media_asset(reference, root, asset) for asset in assets
    )
    tasks = tuple(row["tasks"] or [])
    fps = float(info["fps"])
    frame_count = int(row["length"])
    time_range = _episode_time_range(row, locator.videos, fps)
    manifest = _MediaAssetManifest(
        media_reference_key=reference.key,
        episode_index=reference.episode_index,
        declared_codebase_version=reference.codebase_version,
        detected_codebase_version=detected_version,
        fps=fps,
        robot_type=info.get("robot_type", None),
        task_labels=tasks,
        frame_count=frame_count,
        time_range_seconds=time_range,
        source_fingerprint=reference.source_fingerprint,
        assets=resolved_assets,
    )
    if cache_revision is not None:
        _cache_manifest(cache_key, cache_revision, manifest)

    return manifest


class _LeRobotAssetMaterializer(_ReferenceAssetMaterializer):
    """Materializes and rebinds portable LeRobot source assets."""

    def describe_source(self, reference):
        if not isinstance(reference, LeRobotEpisode):
            raise TypeError(
                "_LeRobotAssetMaterializer requires a LeRobotEpisode"
            )

        return _MediaSourceDescriptor(
            kind=LEROBOT_EPISODE_KIND,
            source_identity=reference.source_identity,
            source_fingerprint=reference.source_fingerprint,
        )

    def is_source_bound(self, source):
        try:
            binding = _get_source_binding(source.source_identity)
        except MissingMediaRootError:
            return False

        return (
            binding is not None
            and binding.source_fingerprint == source.source_fingerprint
            and os.path.isdir(binding.root)
        )

    def bind_source(self, source, root):
        bind_lerobot_source(
            source.source_identity,
            root,
            source.source_fingerprint,
        )

    @contextmanager
    def source_binding_context(self, source, root):
        collection = foo.get_db_conn()[_SOURCE_BINDINGS_COLLECTION]
        previous = collection.find_one({"_id": source.source_identity})
        bind_lerobot_source(
            source.source_identity,
            root,
            source.source_fingerprint,
        )
        current = collection.find_one({"_id": source.source_identity})
        revision = current["revision"]
        try:
            yield
        except BaseException:
            query = {
                "_id": source.source_identity,
                "revision": revision,
            }
            if previous is None:
                result = collection.delete_one(query)
                restored = result.deleted_count > 0
            else:
                result = collection.replace_one(query, previous)
                restored = result.matched_count > 0

            if not restored:
                logger.warning(
                    "Could not restore the LeRobot source binding for '%s'; "
                    "it was modified concurrently",
                    source.source_identity,
                )

            _clear_resolution_caches()
            raise

    def get_destination_location(self, reference, asset):
        return asset.location.path

    def validate_materialized_reference(self, reference, assets, root):
        _resolve_lerobot_assets_at_root(reference, assets, root)


def _validate_dataset_root(dataset_root):
    if not dataset_root:
        raise MissingMediaRootError("A local LeRobot dataset root is required")

    root = fos.normalize_path(dataset_root)
    if not os.path.exists(root):
        raise MissingMediaRootError(
            "LeRobot dataset root '%s' does not exist" % root
        )

    if not os.path.isdir(root):
        raise MissingMediaRootError(
            "LeRobot dataset root '%s' is not a directory" % root
        )

    return os.path.realpath(root)


def _validate_resolver_root(reference):
    cache = _RESOLUTION_SOURCE_CACHE.get()
    cache_key = (reference.source_identity, reference.source_fingerprint)
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    binding = _get_source_binding(reference.source_identity)
    if binding is None:
        raise MissingMediaRootError(
            "No authorized source binding exists for this LeRobot dataset"
        )

    if binding.source_fingerprint != reference.source_fingerprint:
        raise StaleMediaReferenceError(
            "The LeRobot source binding fingerprint does not match the reference"
        )

    try:
        resolved = (_validate_dataset_root(binding.root), binding)
        if cache is not None:
            cache[cache_key] = resolved

        return resolved
    except MissingMediaRootError as exc:
        parent = os.path.dirname(binding.root)
        if os.path.isdir(parent):
            raise MovedMediaRootError(
                "LeRobot source root moved or was renamed; relocate the "
                "server-side source binding before resolving assets"
            ) from exc

        raise


def _get_source_binding(source_identity):
    document = foo.get_db_conn()[_SOURCE_BINDINGS_COLLECTION].find_one(
        {"_id": source_identity, "kind": LEROBOT_EPISODE_KIND}
    )
    if document is None:
        return None

    try:
        return _LocalLeRobotSourceBinding(
            root=document["root"],
            source_fingerprint=document["source_fingerprint"],
            revision=document["revision"],
        )
    except (KeyError, TypeError) as exc:
        raise MissingMediaRootError(
            "The authorized LeRobot source binding is malformed"
        ) from exc


def _load_info(info_path):
    if not os.path.isfile(info_path):
        raise MalformedMediaSourceError(
            "LeRobot source is missing meta/info.json"
        )

    try:
        with open(info_path, "rb") as file:
            raw = file.read()
        info = json.loads(raw)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MalformedMediaSourceError(
            "LeRobot meta/info.json is unreadable or malformed"
        ) from exc

    if not isinstance(info, dict):
        raise MalformedMediaSourceError(
            "LeRobot meta/info.json must contain a JSON object"
        )

    return info, raw


def _validate_v3_info(info):
    missing = _REQUIRED_INFO_FIELDS - set(info)
    if missing:
        raise MalformedMediaSourceError(
            "LeRobot meta/info.json is missing required fields: %s"
            % sorted(missing)
        )

    version = info["codebase_version"]
    if not isinstance(version, str):
        raise MalformedMediaSourceError(
            "LeRobot codebase_version must be a string such as 'v3.0'"
        )

    match = _VERSION_PATTERN.fullmatch(version.strip())
    if match is None:
        raise MalformedMediaSourceError(
            "Malformed LeRobot codebase_version '%s'" % version
        )

    major = int(match.group(1))
    if major != 3:
        raise UnsupportedLeRobotVersionError(
            "Unsupported LeRobotDataset format major %d; this importer "
            "supports only v3.x" % major
        )

    if not isinstance(info["features"], dict) or not info["features"]:
        raise MalformedMediaSourceError(
            "LeRobot info.json must declare a non-empty features object"
        )
    if not all(
        isinstance(feature, Mapping) for feature in info["features"].values()
    ):
        raise MalformedMediaSourceError(
            "LeRobot info.json features must contain objects"
        )

    if isinstance(info["total_episodes"], bool) or not isinstance(
        info["total_episodes"], int
    ):
        raise MalformedMediaSourceError(
            "LeRobot total_episodes must be an integer"
        )

    try:
        fps = float(info["fps"])
    except (TypeError, ValueError) as exc:
        raise MalformedMediaSourceError(
            "LeRobot fps must be a positive number"
        ) from exc

    if fps <= 0:
        raise MalformedMediaSourceError(
            "LeRobot fps must be a positive number"
        )

    for path_field in ("data_path", "video_path"):
        if not isinstance(info[path_field], str) or not info[path_field]:
            raise MalformedMediaSourceError(
                "LeRobot %s must be a non-empty path template" % path_field
            )

    return version.strip()


def _read_episode_metadata(root, paths):
    rows = []
    shard_bytes = []
    for path in paths:
        relative_path = _get_dataset_relative_path(path, root)
        _resolve_under_root(root, relative_path)
        raw = _read_bytes(path)
        shard_bytes.append((relative_path, raw))
        with _open_parquet(path, "episode metadata") as parquet_file:
            table = parquet_file.read()
        missing = _REQUIRED_EPISODE_FIELDS - set(table.column_names)
        if missing:
            raise MalformedMediaSourceError(
                "LeRobot episode metadata shard '%s' is missing fields: %s"
                % (relative_path, sorted(missing))
            )

        for row_index, row in enumerate(table.to_pylist()):
            _validate_episode_row(row, relative_path)
            row = dict(row)
            row["_metadata_relative_path"] = relative_path
            row["_metadata_row_index"] = row_index
            rows.append(row)

    return rows, shard_bytes


def _read_episode_metadata_row(root, path, row_index):
    relative_path = _get_dataset_relative_path(path, root)
    _resolve_under_root(root, relative_path)
    with _open_parquet(path, "episode metadata") as parquet_file:
        offset = 0
        for group_index in range(parquet_file.metadata.num_row_groups):
            row_count = parquet_file.metadata.row_group(group_index).num_rows
            if offset <= row_index < offset + row_count:
                table = parquet_file.read_row_group(group_index)
                missing = _REQUIRED_EPISODE_FIELDS - set(table.column_names)
                if missing:
                    raise MalformedMediaSourceError(
                        "LeRobot episode metadata shard '%s' is missing "
                        "fields: %s" % (relative_path, sorted(missing))
                    )

                row = table.slice(row_index - offset, 1).to_pylist()[0]
                _validate_episode_row(row, relative_path)
                return row

            offset += row_count

    raise StaleMediaReferenceError(
        "LeRobot episode metadata row is no longer present"
    )


def _validate_episode_row(row, relative_path):
    for field_name in (
        "episode_index",
        "length",
        "data/chunk_index",
        "data/file_index",
        "dataset_from_index",
        "dataset_to_index",
    ):
        value = row.get(field_name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise MalformedMediaSourceError(
                "LeRobot metadata field '%s' in '%s' must be a "
                "nonnegative integer" % (field_name, relative_path)
            )

    start = row["dataset_from_index"]
    end = row["dataset_to_index"]
    if end <= start or end - start != row["length"]:
        raise MalformedMediaSourceError(
            "LeRobot episode %d has inconsistent half-open dataset row bounds"
            % row["episode_index"]
        )

    tasks = row.get("tasks")
    if tasks is None:
        row["tasks"] = []
    elif not isinstance(tasks, list) or not all(
        isinstance(task, str) for task in tasks
    ):
        raise MalformedMediaSourceError(
            "LeRobot episode tasks must be a list of strings"
        )


def _select_episode_indexes(rows_by_index, episodes, preprocess):
    if episodes is None:
        indexes = sorted(rows_by_index)
    else:
        indexes = []
        seen = set()
        for value in episodes:
            if (
                isinstance(value, bool)
                or not isinstance(value, int)
                or value < 0
            ):
                raise ValueError("Episode selections must be nonnegative ints")
            if value in seen:
                raise ValueError("Duplicate selected episode %d" % value)
            if value not in rows_by_index:
                raise ValueError("LeRobot episode %d was not found" % value)
            seen.add(value)
            indexes.append(value)

    return list(preprocess(indexes))


def _collect_source_asset_paths(root, info, rows):
    by_data_file = defaultdict(list)
    byte_asset_paths = set()
    video_features = _video_features(info)
    for row in rows:
        relative_path = _format_source_path(
            info["data_path"],
            chunk_index=row["data/chunk_index"],
            file_index=row["data/file_index"],
        )
        path = _resolve_under_root(root, relative_path)
        by_data_file[path].append(row)
        byte_asset_paths.add(relative_path)

        for feature_name in video_features:
            chunk_field = "videos/%s/chunk_index" % feature_name
            file_field = "videos/%s/file_index" % feature_name
            from_field = "videos/%s/from_timestamp" % feature_name
            to_field = "videos/%s/to_timestamp" % feature_name
            for field_name in (
                chunk_field,
                file_field,
                from_field,
                to_field,
            ):
                if field_name not in row:
                    raise MalformedMediaSourceError(
                        "LeRobot episode %d is missing '%s'"
                        % (row["episode_index"], field_name)
                    )

            video_relative_path = _format_source_path(
                info["video_path"],
                video_key=feature_name,
                chunk_index=row[chunk_field],
                file_index=row[file_field],
            )
            video_path = _resolve_under_root(root, video_relative_path)
            byte_asset_paths.add(video_relative_path)
            if not os.path.isfile(video_path):
                raise MalformedMediaSourceError(
                    "LeRobot video asset '%s' does not exist"
                    % video_relative_path
                )

            try:
                from_timestamp = float(row[from_field])
                to_timestamp = float(row[to_field])
            except (TypeError, ValueError) as exc:
                raise MalformedMediaSourceError(
                    "LeRobot episode %d has invalid video timestamp bounds"
                    % row["episode_index"]
                ) from exc

            if (
                not math.isfinite(from_timestamp)
                or not math.isfinite(to_timestamp)
                or from_timestamp < 0
                or to_timestamp <= from_timestamp
            ):
                raise MalformedMediaSourceError(
                    "LeRobot episode %d has invalid video timestamp bounds"
                    % row["episode_index"]
                )

    return by_data_file, byte_asset_paths


def _collect_source_asset_sizes(root, info, rows):
    _, byte_asset_paths = _collect_source_asset_paths(root, info, rows)
    return {
        relative_path: _file_signature(
            _resolve_under_root(root, relative_path)
        )[2]
        for relative_path in sorted(byte_asset_paths)
    }


def _get_data_shard_bases(root, info, rows):
    by_data_file, _ = _collect_source_asset_paths(root, info, rows)
    data_shard_bases = {}
    for shard_rows in by_data_file.values():
        base = min(row["dataset_from_index"] for row in shard_rows)
        for row in shard_rows:
            coordinates = (
                row["data/chunk_index"],
                row["data/file_index"],
            )
            data_shard_bases[coordinates] = base

    return data_shard_bases


def _validate_source_assets(root, info, rows, data_shard_bases=None):
    by_data_file, byte_asset_paths = _collect_source_asset_paths(
        root, info, rows
    )

    if data_shard_bases is None:
        data_shard_bases = _get_data_shard_bases(root, info, rows)
    else:
        data_shard_bases = dict(data_shard_bases)

    for path, shard_rows in by_data_file.items():
        if not os.path.isfile(path):
            raise MalformedMediaSourceError(
                "LeRobot data asset '%s' does not exist"
                % os.path.relpath(path, root)
            )

        with _open_parquet(path, "episode data") as parquet_file:
            coordinates = (
                shard_rows[0]["data/chunk_index"],
                shard_rows[0]["data/file_index"],
            )
            base = data_shard_bases[coordinates]

            for row in shard_rows:
                local_end = row["dataset_to_index"] - base
                if local_end > parquet_file.metadata.num_rows:
                    raise MalformedMediaSourceError(
                        "LeRobot episode %d row bounds exceed data shard '%s'"
                        % (row["episode_index"], os.path.relpath(path, root))
                    )

            columns = set(parquet_file.schema_arrow.names)
            if "episode_index" not in columns or "index" not in columns:
                raise MalformedMediaSourceError(
                    "LeRobot data shard '%s' must contain episode_index and "
                    "index" % os.path.relpath(path, root)
                )

            table = parquet_file.read(columns=["episode_index", "index"])
        episode_indexes = table["episode_index"].to_pylist()
        global_indexes = table["index"].to_pylist()
        for row in shard_rows:
            local_start = row["dataset_from_index"] - base
            local_end = row["dataset_to_index"] - base
            if any(
                value != row["episode_index"]
                for value in episode_indexes[local_start:local_end]
            ) or global_indexes[local_start:local_end] != list(
                range(row["dataset_from_index"], row["dataset_to_index"])
            ):
                raise MalformedMediaSourceError(
                    "LeRobot episode %d does not match its declared data "
                    "slice" % row["episode_index"]
                )

    asset_fingerprints = {
        relative_path: _sha256_file(_resolve_under_root(root, relative_path))
        for relative_path in sorted(byte_asset_paths)
    }
    return asset_fingerprints, data_shard_bases


def _build_locator(
    root,
    info,
    row,
    data_shard_bases,
    source_fingerprint,
    asset_fingerprints,
):
    chunk_index = row["data/chunk_index"]
    file_index = row["data/file_index"]
    data_relative_path = _format_source_path(
        info["data_path"],
        chunk_index=chunk_index,
        file_index=file_index,
    )
    data_path = _resolve_under_root(root, data_relative_path)
    shard_base = data_shard_bases[(chunk_index, file_index)]
    shard_start = row["dataset_from_index"] - shard_base
    shard_end = row["dataset_to_index"] - shard_base
    with _open_parquet(data_path, "episode data") as parquet_file:
        row_groups = _overlapping_row_groups(
            parquet_file, shard_start, shard_end
        )

    videos = []
    for feature_name in _video_features(info):
        prefix = "videos/%s/" % feature_name
        video_chunk_index = row[prefix + "chunk_index"]
        video_file_index = row[prefix + "file_index"]
        video_relative_path = _format_source_path(
            info["video_path"],
            video_key=feature_name,
            chunk_index=video_chunk_index,
            file_index=video_file_index,
        )
        _resolve_under_root(root, video_relative_path)
        videos.append(
            LeRobotVideoLocator(
                feature_name=feature_name,
                location=DatasetRelativeLocation(video_relative_path),
                chunk_index=video_chunk_index,
                file_index=video_file_index,
                timestamps=VideoTimestampInterval(
                    row[prefix + "from_timestamp"],
                    row[prefix + "to_timestamp"],
                ),
                content_fingerprint=asset_fingerprints[video_relative_path],
            )
        )

    images = []
    for feature_name, feature in info["features"].items():
        if feature.get("dtype") == "image":
            images.append(
                LeRobotImageLocator(
                    feature_name=feature_name,
                    location=DatasetRelativeLocation(data_relative_path),
                )
            )

    metadata_relative_path = row["_metadata_relative_path"]
    metadata_path = _resolve_under_root(root, metadata_relative_path)
    metadata_bytes = _read_bytes(metadata_path)
    info_path = _resolve_under_root(root, "meta/info.json")
    info_bytes = _read_bytes(info_path)
    locator_fingerprint = "sha256:" + _compute_locator_fingerprint(
        info, info_bytes, metadata_relative_path, metadata_bytes
    )
    stats_path = "meta/stats.json"
    tasks_path = "meta/tasks.parquet"
    has_stats = os.path.isfile(_resolve_under_root(root, stats_path))
    has_tasks = os.path.isfile(_resolve_under_root(root, tasks_path))
    return LeRobotV3Locator(
        source_fingerprint=source_fingerprint,
        locator_fingerprint=locator_fingerprint,
        info_location=DatasetRelativeLocation("meta/info.json"),
        statistics_location=(
            DatasetRelativeLocation(stats_path) if has_stats else None
        ),
        statistics_content_fingerprint=(
            _sha256_file(_resolve_under_root(root, stats_path))
            if has_stats
            else None
        ),
        tasks_location=(
            DatasetRelativeLocation(tasks_path) if has_tasks else None
        ),
        tasks_content_fingerprint=(
            _sha256_file(_resolve_under_root(root, tasks_path))
            if has_tasks
            else None
        ),
        episode_metadata_location=DatasetRelativeLocation(
            metadata_relative_path
        ),
        episode_metadata_row=row["_metadata_row_index"],
        data_location=DatasetRelativeLocation(data_relative_path),
        data_content_fingerprint=asset_fingerprints[data_relative_path],
        data_chunk_index=chunk_index,
        data_file_index=file_index,
        global_dataset_rows=RowInterval(
            "lerobot-v3-global-dataset-row",
            row["dataset_from_index"],
            row["dataset_to_index"],
        ),
        parquet_file_rows=RowInterval(
            "parquet-file-row", shard_start, shard_end
        ),
        parquet_row_groups=tuple(row_groups),
        videos=tuple(videos),
        images=tuple(images),
    )


def _resolve_media_asset(reference, root, asset):
    path = _resolve_under_root(root, asset.location.path)
    if not os.path.isfile(path):
        raise StaleMediaReferenceError(
            "LeRobot %s asset '%s' is missing"
            % (asset.role.value, asset.location.path)
        )

    media_type = asset.media_type
    if media_type is None:
        media_type = (
            mimetypes.guess_type(path)[0] or "application/octet-stream"
        )

    try:
        size_bytes = os.path.getsize(path)
    except (FileNotFoundError, NotADirectoryError) as exc:
        raise StaleMediaReferenceError(
            "The resolved LeRobot asset disappeared during resolution"
        ) from exc
    except PermissionError as exc:
        raise MediaSourceAuthorizationError(
            "The resolved LeRobot asset is not readable"
        ) from exc
    except OSError as exc:
        raise MalformedMediaSourceError(
            "Unable to inspect the resolved LeRobot asset"
        ) from exc

    return _build_resolved_media_asset(
        reference,
        asset,
        path=path,
        size_bytes=size_bytes,
        media_type=media_type,
    )


def _open_parquet(path, role):
    try:
        return papq.ParquetFile(path)
    except PermissionError as exc:
        raise MediaSourceAuthorizationError(
            "LeRobot %s Parquet file is not readable" % role
        ) from exc
    except (FileNotFoundError, NotADirectoryError) as exc:
        raise StaleMediaReferenceError(
            "LeRobot %s Parquet file is missing" % role
        ) from exc
    except OSError as exc:
        raise MalformedMediaSourceError(
            "Unable to read the LeRobot %s Parquet file" % role
        ) from exc
    except pa.ArrowInvalid as exc:
        raise UnfinalizedMediaSourceError(
            "LeRobot %s Parquet file '%s' has no readable footer; finalize "
            "or repair the recording before import" % (role, path)
        ) from exc


def _overlapping_row_groups(parquet_file, start, end):
    groups = []
    offset = 0
    for index in range(parquet_file.metadata.num_row_groups):
        row_count = parquet_file.metadata.row_group(index).num_rows
        group_end = offset + row_count
        if offset < end and group_end > start:
            groups.append(index)
        offset = group_end

    return groups


def _video_features(info):
    return [
        name
        for name, feature in info["features"].items()
        if feature.get("dtype") == "video"
    ]


def _episode_time_range(row, videos, fps):
    if videos:
        starts = [video.timestamps.from_timestamp for video in videos]
        ends = [video.timestamps.to_timestamp for video in videos]
        return (min(starts), max(ends))

    return (0.0, row["length"] / fps)


def _format_source_path(template, **coordinates):
    if (
        not isinstance(template, str)
        or not template
        or len(template) > _MAX_SOURCE_PATH_LENGTH
    ):
        raise MalformedMediaSourceError("Invalid LeRobot source path template")

    try:
        fields = string.Formatter().parse(template)
        for _, field_name, format_spec, conversion in fields:
            if field_name is None:
                continue

            format_match = (
                None
                if not format_spec
                else _PATH_FORMAT_SPEC_PATTERN.fullmatch(format_spec)
            )
            if (
                field_name not in coordinates
                or "." in field_name
                or "[" in field_name
                or "]" in field_name
                or conversion is not None
                or (format_spec and format_match is None)
            ):
                raise ValueError("unsupported coordinate expression")

        path = template.format(**coordinates)
    except (KeyError, ValueError, IndexError) as exc:
        raise MalformedMediaSourceError(
            "Invalid LeRobot source path template '%s'" % template
        ) from exc

    if (
        not isinstance(path, str)
        or not path
        or len(path) > _MAX_SOURCE_PATH_LENGTH
    ):
        raise MalformedMediaSourceError(
            "LeRobot source path template produced an invalid path"
        )

    path = posixpath.normpath(path)
    try:
        return DatasetRelativeLocation(path).path
    except InvalidMediaLocationError as exc:
        raise MalformedMediaSourceError(
            "LeRobot source path template produced a non-canonical path"
        ) from exc


def _get_dataset_relative_path(path, root):
    relative_path = os.path.relpath(path, root)
    if os.sep != "/":
        relative_path = relative_path.replace(os.sep, "/")

    try:
        return DatasetRelativeLocation(relative_path).path
    except InvalidMediaLocationError as exc:
        raise MalformedMediaSourceError(
            "LeRobot source path is not a canonical dataset-relative path"
        ) from exc


def _resolve_under_root(root, relative_path):
    try:
        location = DatasetRelativeLocation(relative_path)
    except InvalidMediaLocationError as exc:
        raise MalformedMediaSourceError(
            "LeRobot asset paths must be canonical POSIX paths relative to "
            "the dataset root"
        ) from exc

    root = os.path.realpath(root)
    path = os.path.realpath(os.path.join(root, *location.path.split("/")))
    if os.path.commonpath((root, path)) != root:
        raise MalformedMediaSourceError(
            "LeRobot asset path escapes the dataset root: '%s'" % relative_path
        )

    return path


def _compute_source_fingerprint(info, info_bytes, shard_bytes, asset_sizes):
    digest = hashlib.sha256()
    digest.update(_canonical_info(info, info_bytes))
    for relative_path, raw in shard_bytes:
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(raw).digest())

    for relative_path, size_bytes in sorted(asset_sizes.items()):
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(size_bytes).encode("ascii"))

    return digest.hexdigest()


def _compute_locator_fingerprint(
    info, info_bytes, metadata_relative_path, metadata_bytes
):
    digest = hashlib.sha256()
    digest.update(_canonical_info(info, info_bytes))
    digest.update(metadata_relative_path.encode("utf-8"))
    digest.update(b"\0")
    digest.update(hashlib.sha256(metadata_bytes).digest())
    return digest.hexdigest()


def _canonical_info(info, info_bytes):
    try:
        return json.dumps(
            info, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
    except (TypeError, ValueError):
        return info_bytes


def _read_bytes(path):
    try:
        with open(path, "rb") as file:
            return file.read()
    except PermissionError as exc:
        raise MediaSourceAuthorizationError(
            "The LeRobot source asset is not readable"
        ) from exc
    except OSError as exc:
        raise MalformedMediaSourceError(
            "Unable to read LeRobot source asset '%s'" % path
        ) from exc


def _sha256_file(path):
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as file:
            while True:
                chunk = file.read(1024 * 1024)
                if not chunk:
                    break

                digest.update(chunk)
    except PermissionError as exc:
        raise MediaSourceAuthorizationError(
            "The LeRobot source asset cannot be fingerprinted"
        ) from exc
    except OSError as exc:
        raise MalformedMediaSourceError(
            "Unable to fingerprint LeRobot source asset '%s'" % path
        ) from exc

    return "sha256:" + digest.hexdigest()


def _validate_asset_fingerprint(
    root, relative_path, expected, source_fingerprint
):
    path = _resolve_under_root(root, relative_path)
    if not os.path.isfile(path):
        raise StaleMediaReferenceError(
            "LeRobot asset '%s' is missing; re-import or repair the source"
            % relative_path
        )

    signature = _file_signature(path)
    cache_key = (source_fingerprint, relative_path)
    with _CACHE_LOCK:
        cached = _ASSET_FINGERPRINT_CACHE.get(cache_key)
    if cached == (expected, signature):
        return

    actual = _sha256_file(path)
    if _file_signature(path) != signature:
        raise StaleMediaReferenceError(
            "LeRobot asset '%s' changed while it was being validated; retry "
            "or re-import the dataset" % relative_path
        )

    if actual != expected:
        raise StaleMediaReferenceError(
            "LeRobot asset '%s' changed since import; re-import the dataset"
            % relative_path
        )

    with _CACHE_LOCK:
        _ASSET_FINGERPRINT_CACHE[cache_key] = (expected, signature)


def _get_cached_manifest(cache_key, binding_revision):
    with _CACHE_LOCK:
        entry = _MANIFEST_CACHE.get(cache_key)

    if entry is None or entry.binding_revision != binding_revision:
        return None

    try:
        signatures = _manifest_file_signatures(entry.manifest)
    except MediaReferenceError:
        signatures = None

    if signatures == entry.file_signatures:
        return entry.manifest

    with _CACHE_LOCK:
        _MANIFEST_CACHE.pop(cache_key, None)

    return None


def _resolution_cache_key(reference, assets):
    serialized_reference = json.dumps(
        _serialize_media_reference_binding(reference),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    reference_fingerprint = hashlib.sha256(serialized_reference).hexdigest()
    return (
        reference.key,
        reference_fingerprint,
        tuple(
            _get_selected_media_asset_key(reference, asset) for asset in assets
        ),
    )


def _cache_manifest(cache_key, binding_revision, manifest):
    entry = _ManifestCacheEntry(
        binding_revision=binding_revision,
        manifest=manifest,
        file_signatures=_manifest_file_signatures(manifest),
    )
    with _CACHE_LOCK:
        _MANIFEST_CACHE[cache_key] = entry


def _manifest_file_signatures(manifest):
    return tuple(
        (path, _file_signature(path))
        for path in sorted({asset.path for asset in manifest.assets})
    )


def _file_signature(path):
    try:
        result = os.stat(path)
    except PermissionError as exc:
        raise MediaSourceAuthorizationError(
            "The LeRobot source asset cannot be inspected"
        ) from exc
    except (FileNotFoundError, NotADirectoryError) as exc:
        raise StaleMediaReferenceError(
            "The LeRobot source asset is no longer available"
        ) from exc
    except OSError as exc:
        raise MalformedMediaSourceError(
            "Unable to inspect the LeRobot source asset"
        ) from exc
    return (
        result.st_dev,
        result.st_ino,
        result.st_size,
        result.st_mtime_ns,
    )


def _clear_resolution_caches():
    with _CACHE_LOCK:
        _MANIFEST_CACHE.clear()
        _ASSET_FINGERPRINT_CACHE.clear()


def _validate_resolved_data_slice(root, episode, locator):
    path = _resolve_under_root(root, locator.data_location.path)
    row_groups = locator.parquet_row_groups
    if not row_groups:
        raise StaleMediaReferenceError(
            "LeRobot episode data locator has no Parquet row groups"
        )

    with _open_parquet(path, "episode data") as parquet_file:
        try:
            group_start = sum(
                parquet_file.metadata.row_group(index).num_rows
                for index in range(row_groups[0])
            )
            table = parquet_file.read_row_groups(
                row_groups, columns=["episode_index", "index"]
            )
        except Exception as exc:
            raise StaleMediaReferenceError(
                "LeRobot episode data row groups no longer match the source"
            ) from exc

    bounds = locator.parquet_file_rows
    local_start = bounds.start - group_start
    length = bounds.end - bounds.start
    selected = table.slice(local_start, length)
    if selected.num_rows != length or any(
        value != episode.episode_index
        for value in selected["episode_index"].to_pylist()
    ):
        raise StaleMediaReferenceError(
            "LeRobot episode data rows no longer match the stored locator"
        )


def _validate_declared_v3_version(version):
    match = _VERSION_PATTERN.fullmatch(version.strip())
    if match is None or int(match.group(1)) != 3:
        raise UnsupportedLeRobotVersionError(
            "Stored LeRobot episode declares unsupported version '%s'; "
            "re-import it with the v3 importer" % version
        )


_register_media_resolver(
    LEROBOT_EPISODE_KIND,
    _LeRobotMediaResolver(),
)
_register_reference_asset_materializer(
    LEROBOT_EPISODE_KIND,
    _LeRobotAssetMaterializer(),
)
