"""
LeRobotDataset v3 import and asset resolution utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass
import hashlib
import json
import mimetypes
import os
import re

import eta.core.utils as etau

import fiftyone.core.fields as fof
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
    MediaAssetManifest,
    MediaResolver,
    MissingMediaRootError,
    MovedMediaRootError,
    RowInterval,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedMediaReferenceVersionError,
    VideoTimestampInterval,
    build_resolved_media_asset,
    get_media_resolver,
    register_media_resolver,
)
import fiftyone.utils.data.importers as foud

papq = fou.lazy_import(
    "pyarrow.parquet", callback=lambda: fou.ensure_package("pyarrow")
)

_VERSION_PATTERN = re.compile(r"^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$")
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


@dataclass(frozen=True)
class _LocalLeRobotSourceBinding:
    root: str
    source_fingerprint: str


@dataclass(frozen=True)
class _InspectedLeRobotSource:
    root: str
    info: dict
    codebase_version: str
    rows: tuple
    asset_fingerprints: dict
    source_fingerprint: str


_SOURCE_BINDINGS = {}


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
        resolver = get_media_resolver(LEROBOT_EPISODE_KIND)
        if not isinstance(resolver, LeRobotMediaResolver):
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
            sample = Sample.from_media_reference(
                reference,
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
                "source_identity": source_identity,
                "format": "LeRobotDataset",
                "format_major": 3,
                "codebase_version": codebase_version,
                "source_fingerprint": source_fingerprint,
                "source_binding_required": True,
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

    _SOURCE_BINDINGS[source_identity.strip()] = _LocalLeRobotSourceBinding(
        root=root,
        source_fingerprint=source_fingerprint,
    )


def unbind_lerobot_source(source_identity):
    """Removes the local binding for a LeRobot source identity."""
    _SOURCE_BINDINGS.pop(source_identity, None)


class LeRobotMediaResolver(MediaResolver):
    """Resolves typed LeRobot v3 assets through server-side source bindings."""

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
                _open_parquet(path, "shared metadata")
            shard_bytes.append((relative_path, raw))

        asset_fingerprints = _validate_source_assets(root, info, rows)
        source_fingerprint = "sha256:" + _compute_source_fingerprint(
            info, info_bytes, shard_bytes, asset_fingerprints
        )
        return _InspectedLeRobotSource(
            root=root,
            info=info,
            codebase_version=codebase_version,
            rows=tuple(rows),
            asset_fingerprints=asset_fingerprints,
            source_fingerprint=source_fingerprint,
        )

    def build_locator(self, source, row):
        """Builds one typed locator from an inspected source snapshot."""
        if not isinstance(source, _InspectedLeRobotSource):
            raise TypeError("source must be an inspected LeRobot source")

        return _build_locator(
            source.root,
            source.info,
            row,
            source.rows,
            source.source_fingerprint,
            source.asset_fingerprints,
        )

    def resolve_assets(self, reference, assets):
        if not isinstance(reference, LeRobotEpisode):
            raise TypeError("LeRobotMediaResolver requires a LeRobotEpisode")

        described_assets = reference.describe_assets()
        if tuple(assets) != described_assets:
            raise InvalidMediaLocationError(
                "LeRobot assets must come from MediaReference.describe_assets()"
            )

        _validate_declared_v3_version(reference.codebase_version)
        root = _validate_resolver_root(reference)
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
        )
        for location, fingerprint in (
            (
                locator.statistics_location,
                locator.statistics_content_fingerprint,
            ),
            (locator.tasks_location, locator.tasks_content_fingerprint),
        ):
            if location is not None:
                _validate_asset_fingerprint(root, location.path, fingerprint)

        _validate_resolved_data_slice(root, reference, locator)
        for video in locator.videos:
            _validate_asset_fingerprint(
                root, video.location.path, video.content_fingerprint
            )

        resolved_assets = tuple(
            _resolve_media_asset(reference, root, asset) for asset in assets
        )
        tasks = tuple(row["tasks"] or [])
        fps = float(info["fps"])
        frame_count = int(row["length"])
        time_range = _episode_time_range(row, locator.videos, fps)
        return MediaAssetManifest(
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
    binding = _SOURCE_BINDINGS.get(reference.source_identity)
    if binding is None:
        raise MissingMediaRootError(
            "No authorized source binding exists for this LeRobot dataset"
        )

    if binding.source_fingerprint != reference.source_fingerprint:
        raise StaleMediaReferenceError(
            "The LeRobot source binding fingerprint does not match the reference"
        )

    try:
        return _validate_dataset_root(binding.root)
    except MissingMediaRootError as exc:
        parent = os.path.dirname(binding.root)
        if os.path.isdir(parent):
            raise MovedMediaRootError(
                "LeRobot source root moved or was renamed; relocate the "
                "server-side source binding before resolving assets"
            ) from exc

        raise


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
        raise UnsupportedMediaReferenceVersionError(
            "Unsupported LeRobotDataset format major %d; this importer "
            "supports only v3.x" % major
        )

    if not isinstance(info["features"], dict) or not info["features"]:
        raise MalformedMediaSourceError(
            "LeRobot info.json must declare a non-empty features object"
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
        relative_path = os.path.relpath(path, root)
        _resolve_under_root(root, relative_path)
        raw = _read_bytes(path)
        shard_bytes.append((relative_path, raw))
        parquet_file = _open_parquet(path, "episode metadata")
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
    relative_path = os.path.relpath(path, root)
    _resolve_under_root(root, relative_path)
    parquet_file = _open_parquet(path, "episode metadata")
    offset = 0
    for group_index in range(parquet_file.metadata.num_row_groups):
        row_count = parquet_file.metadata.row_group(group_index).num_rows
        if offset <= row_index < offset + row_count:
            table = parquet_file.read_row_group(group_index)
            missing = _REQUIRED_EPISODE_FIELDS - set(table.column_names)
            if missing:
                raise MalformedMediaSourceError(
                    "LeRobot episode metadata shard '%s' is missing fields: %s"
                    % (relative_path, sorted(missing))
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


def _validate_source_assets(root, info, rows):
    by_data_file = defaultdict(list)
    byte_asset_paths = set()
    for row in rows:
        relative_path = _format_source_path(
            info["data_path"],
            chunk_index=row["data/chunk_index"],
            file_index=row["data/file_index"],
        )
        path = _resolve_under_root(root, relative_path)
        by_data_file[path].append(row)
        byte_asset_paths.add(relative_path)

        for feature_name in _video_features(info):
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

            if float(row[to_field]) <= float(row[from_field]):
                raise MalformedMediaSourceError(
                    "LeRobot episode %d has invalid video timestamp bounds"
                    % row["episode_index"]
                )

    for path, shard_rows in by_data_file.items():
        if not os.path.isfile(path):
            raise MalformedMediaSourceError(
                "LeRobot data asset '%s' does not exist"
                % os.path.relpath(path, root)
            )

        parquet_file = _open_parquet(path, "episode data")
        base = min(row["dataset_from_index"] for row in shard_rows)
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
                "LeRobot data shard '%s' must contain episode_index and index"
                % os.path.relpath(path, root)
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
                raise StaleMediaReferenceError(
                    "LeRobot episode %d does not match its declared data slice"
                    % row["episode_index"]
                )

    return {
        relative_path: _sha256_file(_resolve_under_root(root, relative_path))
        for relative_path in sorted(byte_asset_paths)
    }


def _build_locator(
    root,
    info,
    row,
    all_rows,
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
    shard_rows = [
        other
        for other in all_rows
        if other["data/chunk_index"] == chunk_index
        and other["data/file_index"] == file_index
    ]
    shard_base = min(other["dataset_from_index"] for other in shard_rows)
    shard_start = row["dataset_from_index"] - shard_base
    shard_end = row["dataset_to_index"] - shard_base
    parquet_file = _open_parquet(data_path, "episode data")
    row_groups = _overlapping_row_groups(parquet_file, shard_start, shard_end)

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
        schema_version=1,
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

    return build_resolved_media_asset(
        reference,
        asset,
        path=path,
        size_bytes=os.path.getsize(path),
        media_type=media_type,
    )


def _open_parquet(path, role):
    try:
        return papq.ParquetFile(path)
    except Exception as exc:
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
    try:
        path = template.format(**coordinates)
    except (KeyError, ValueError, IndexError) as exc:
        raise MalformedMediaSourceError(
            "Invalid LeRobot source path template '%s'" % template
        ) from exc

    if not isinstance(path, str) or not path:
        raise MalformedMediaSourceError(
            "LeRobot source path template produced an invalid path"
        )

    return fos.normpath(path)


def _resolve_under_root(root, relative_path):
    if not isinstance(relative_path, str) or not relative_path:
        raise MalformedMediaSourceError("LeRobot asset path must be non-empty")

    if os.path.isabs(relative_path):
        raise MalformedMediaSourceError(
            "LeRobot asset paths must be relative to the dataset root"
        )

    root = os.path.realpath(root)
    path = os.path.realpath(os.path.join(root, relative_path))
    if os.path.commonpath((root, path)) != root:
        raise MalformedMediaSourceError(
            "LeRobot asset path escapes the dataset root: '%s'" % relative_path
        )

    return path


def _compute_source_fingerprint(
    info, info_bytes, shard_bytes, asset_fingerprints
):
    digest = hashlib.sha256()
    digest.update(_canonical_info(info, info_bytes))
    for relative_path, raw in shard_bytes:
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(raw).digest())

    for relative_path, fingerprint in sorted(asset_fingerprints.items()):
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(fingerprint.encode("ascii"))

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
    except OSError as exc:
        raise MalformedMediaSourceError(
            "Unable to fingerprint LeRobot source asset '%s'" % path
        ) from exc

    return "sha256:" + digest.hexdigest()


def _validate_asset_fingerprint(root, relative_path, expected):
    path = _resolve_under_root(root, relative_path)
    if not os.path.isfile(path):
        raise StaleMediaReferenceError(
            "LeRobot asset '%s' is missing; re-import or repair the source"
            % relative_path
        )

    if _sha256_file(path) != expected:
        raise StaleMediaReferenceError(
            "LeRobot asset '%s' changed since import; re-import the dataset"
            % relative_path
        )


def _validate_resolved_data_slice(root, episode, locator):
    path = _resolve_under_root(root, locator.data_location.path)
    parquet_file = _open_parquet(path, "episode data")
    row_groups = locator.parquet_row_groups
    if not row_groups:
        raise StaleMediaReferenceError(
            "LeRobot episode data locator has no Parquet row groups"
        )

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
        raise UnsupportedMediaReferenceVersionError(
            "Stored LeRobot episode declares unsupported version '%s'; "
            "re-import it with the v3 importer" % version
        )


register_media_resolver(
    LEROBOT_EPISODE_KIND,
    LeRobotMediaResolver(),
)
