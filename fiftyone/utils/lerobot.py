"""
LeRobotDataset v3 import and asset resolution utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections.abc import Mapping
from contextlib import contextmanager
from dataclasses import dataclass
import json
import logging
import os
import posixpath
import re
import string

import numpy as np

import fiftyone.core.fields as fof
from fiftyone.core.sample import Sample
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
from fiftyone.core.media_reference import MediaReference
from fiftyone.multimodal.media_reference.field_model import (
    InvalidMediaLocationError,
    MalformedMediaSourceError,
    MediaAsset,
    MediaAssetRole,
    MediaReferenceError,
    MediaSourceAuthorizationError,
    MissingMediaRootError,
    RowInterval,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedMediaReferenceOperation,
    VideoTimestampInterval,
    WholeFile,
    _media_source,
    _new_media_source_id,
    _validate_asset_path,
    _MediaResolver,
    _register_media_resolver,
    _ResolvedMediaAsset,
    _ResolvedMediaReference,
)
import fiftyone.utils.data.importers as foud

pa = fou.lazy_import(
    "pyarrow", callback=lambda: fou.ensure_package("pyarrow>=10.0.0")
)
papq = fou.lazy_import(
    "pyarrow.parquet",
    callback=lambda: fou.ensure_package("pyarrow>=10.0.0"),
)
pc = fou.lazy_import(
    "pyarrow.compute",
    callback=lambda: fou.ensure_package("pyarrow>=10.0.0"),
)

logger = logging.getLogger(__name__)

_MEDIA_TYPES = {
    ".json": "application/json",
    ".mp4": "video/mp4",
    ".parquet": "application/vnd.apache.parquet",
}
_STATISTICS_PATH = "meta/stats.json"
_TASKS_PATH = "meta/tasks.parquet"
_EPISODES_DIR = "meta/episodes"

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
_REQUIRED_EPISODE_FIELDS = (
    "episode_index",
    "length",
    "dataset_from_index",
    "dataset_to_index",
    "data/chunk_index",
    "data/file_index",
)
#: The columns the index pass reads: enough to select episodes and to place
#: each data file's rows, and nothing of the per-episode statistics that make
#: metadata rows wide
_INDEX_COLUMNS = ("episode_index",)


class UnsupportedLeRobotVersionError(MediaReferenceError):
    """The referenced LeRobot source declares an unsupported version."""


class UnsupportedLeRobotExportModeError(UnsupportedMediaReferenceOperation):
    """The requested LeRobot export media mode is unsupported."""

    def __init__(self, export_media, suggestion):
        reason = _get_lerobot_export_mode_reason(export_media)
        super().__init__(
            "LeRobotDataset export does not support export_media=%r%s. %s"
            % (export_media, reason, suggestion)
        )
        self.export_media = export_media


def _get_lerobot_export_mode_reason(export_media):
    if export_media is False:
        return " because the export writes new episode metadata files"

    if export_media == "move":
        return " because source episodes may share physical assets"

    if export_media == "symlink":
        return " because the export rewrites episode metadata and statistics"

    return ""


LEROBOT_EPISODE_KIND = "lerobot-episode"
LEROBOT_INFO_PATH = "meta/info.json"


class LeRobotEpisodeReference(MediaReference):
    """One episode of a LeRobotDataset v3 source.

    The coordinates are the episode's own: an episode is a row range of the
    source's data shard and a time window of each of its camera videos, all
    of which it shares with the other episodes recorded alongside it.

    Args:
        key: ``<media source id>/<episode index>``
        data: ``[chunk index, file index, first row, last row]`` of the
            episode's rows in the source's tabular data
        videos: the episode's window in each camera's video, keyed by camera,
            as ``[chunk index, file index, from timestamp, to timestamp]``
        tasks: the tasks the episode demonstrates
    """

    data = fof.ListField(fof.IntField())
    videos = fof.DictField()
    tasks = fof.ListField(fof.StringField())

    @staticmethod
    def key_of(source_id, episode):
        """The key naming one episode of a source.

        Args:
            source_id: the id of the media source on the owning dataset
            episode: the zero-based episode index within the source

        Returns:
            the key
        """
        return "%s/%d" % (source_id, episode)

    @staticmethod
    def episode_of(key):
        """The episode index a reference key names.

        Args:
            key: a LeRobot episode reference key

        Returns:
            the zero-based episode index
        """
        return int(key.rpartition("/")[2])

    @classmethod
    def of(cls, source_id, episode, **coordinates):
        """Builds a reference to one episode of a source.

        Args:
            source_id: the id of the media source on the owning dataset
            episode: the zero-based episode index within the source
            **coordinates: the episode's stored coordinates

        Returns:
            a :class:`LeRobotEpisodeReference`
        """
        return cls(key=cls.key_of(source_id, episode), **coordinates)

    @property
    def episode(self):
        """The zero-based episode index within the source."""
        return self.episode_of(self.key)

    @property
    def display_name(self):
        return "episode-%06d" % self.episode


@dataclass(frozen=True)
class LeRobotSource:
    """One LeRobot source: the id its dataset files it under, where it is
    and what it declares."""

    id: str
    root: str
    info: dict


class LeRobotDatasetImporter(foud.GenericSampleDatasetImporter):
    """Imports logical episodes from a LeRobotDataset v3 source.

    Reads ``meta/info.json`` and the episode-metadata shards, nothing else:
    no data shard, video, or statistics file is opened. Samples are produced
    one shard at a time, each carrying only its episode's key; the dataset
    records the source once.

    An episode's sample names its media by ``media_reference`` rather than
    ``filepath``, and a reference only resolves through a source the dataset
    records. Build these datasets from a directory, not by adding samples::

        import fiftyone as fo
        import fiftyone.types as fot

        # one source, one dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir="/data/lerobot/pick-place",
            dataset_type=fot.LeRobotDataset,
        )

        # more sources into the same dataset; each records itself as it
        # arrives, so every episode stays resolvable
        dataset.add_dir(
            dataset_dir="/data/lerobot/sort-nuts",
            dataset_type=fot.LeRobotDataset,
        )

    ``add_samples`` cannot be used to introduce a new source: a sample whose
    reference names a source the dataset does not record is refused, because
    nothing would say where its bytes are.

    Args:
        dataset_dir: the LeRobot dataset root, local or remote
        episodes (None): optional episode indexes to import
        shuffle (False): whether to randomly shuffle selected episodes
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of episodes to import
    """

    def __init__(
        self,
        dataset_dir,
        episodes=None,
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

        self._source = None
        self._shards = None
        self._selection = None
        self._num_samples = None
        self._iter_samples = None
        self._dataset_info = None
        self._media_sources = None
        self._skipped_episodes = []

    def __iter__(self):
        self._iter_samples = self._make_samples()
        return self

    def __len__(self):
        return self._num_samples

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
        info = dict(self._dataset_info)
        lerobot = dict(info["lerobot"])
        lerobot["imported_episode_count"] -= len(self._skipped_episodes)
        lerobot["skipped_episodes"] = list(self._skipped_episodes)
        info["lerobot"] = lerobot
        return info

    def get_media_sources(self):
        """The media source the importing dataset records before any sample
        is added, so every sample's reference resolves from the start."""
        return list(self._media_sources)

    def setup(self):
        root = _validate_dataset_root(self.dataset_dir)
        info = _load_info(fos.join(root, LEROBOT_INFO_PATH))
        _validate_v3_info(info)
        shards = _list_episode_shards(root)

        source_id = _new_media_source_id()
        self._source = LeRobotSource(source_id, root, info)
        self._shards = shards
        self._selection = _select_episodes(
            shards, root, info, self.episodes, self._preprocess_list
        )
        self._num_samples = len(self._selection.episode_indexes)
        self.dataset_dir = root
        self._media_sources = [
            _lerobot_media_source(
                source_id, root, info, self._selection.episode_shards
            )
        ]
        self._dataset_info = {
            "lerobot": {
                "format": "LeRobotDataset",
                "format_major": 3,
                "episode_count": info["total_episodes"],
                "imported_episode_count": self._num_samples,
            }
        }

    def _make_samples(self):
        source = self._source
        info = source.info
        fps = float(info["fps"])
        robot_type = info.get("robot_type", None)
        video_features = _video_features(info)
        columns = list(_REQUIRED_EPISODE_FIELDS) + ["tasks"]
        for feature_name in video_features:
            columns.extend(_video_columns(feature_name))

        selection = self._selection
        self._skipped_episodes = []

        def make_sample(row):
            episode_index = row["episode_index"]
            length = row["dataset_to_index"] - row["dataset_from_index"]
            tasks = list(row["tasks"] or [])
            return Sample(
                media_reference=_lerobot_episode_reference(
                    source.id, episode_index, row, video_features
                ),
                episode_index=episode_index,
                task=tasks[0] if tasks else None,
                tasks=tasks,
                length=length,
                duration=length / fps,
                robot_type=robot_type,
                fps=fps,
            )

        # Shards are read in order and each once. When the requested order is
        # the source's own, samples leave as soon as their shard is read;
        # only a shuffled or explicit order holds the selected rows until
        # every shard has been read
        buffered = {}
        for shard_index, shard_path in enumerate(self._shards):
            row_indexes = selection.rows_by_shard.get(shard_index)
            if row_indexes is None:
                continue

            relative_path = _relative_to_root(shard_path, source.root)
            table = _read_episode_rows(shard_path, relative_path, columns)
            _validate_episode_schema(
                table.schema, video_features, relative_path
            )
            selected = table.take(pa.array(row_indexes))
            valid, faults = _validate_episode_rows(selected, video_features)
            if faults:
                self._skipped_episodes.extend(
                    _describe_skipped_rows(
                        selected, faults, row_indexes, relative_path
                    )
                )
                selected = selected.filter(pa.array(valid))

            for row in selected.to_pylist():
                if selection.source_order:
                    yield make_sample(row)
                else:
                    buffered[row["episode_index"]] = row

        for episode_index in selection.episode_indexes:
            if episode_index in buffered:
                yield make_sample(buffered.pop(episode_index))

        if self._skipped_episodes:
            logger.warning(
                "Skipped %d malformed LeRobot episode(s), recorded under "
                "dataset.info['lerobot']['skipped_episodes']: %s",
                len(self._skipped_episodes),
                "; ".join(self._skipped_episodes),
            )


def _lerobot_episode_reference(source_id, episode_index, row, video_features):
    """One episode's stored reference, from its metadata row: the data file
    and global row range, and per camera the video file and time window."""
    return LeRobotEpisodeReference.of(
        source_id,
        int(episode_index),
        data=[
            int(row["data/chunk_index"]),
            int(row["data/file_index"]),
            int(row["dataset_from_index"]),
            int(row["dataset_to_index"]),
        ],
        videos={
            feature: [
                int(row["videos/%s/chunk_index" % feature]),
                int(row["videos/%s/file_index" % feature]),
                float(row["videos/%s/from_timestamp" % feature]),
                float(row["videos/%s/to_timestamp" % feature]),
            ]
            for feature in video_features
        },
        tasks=list(row["tasks"] or []),
    )


@dataclass(frozen=True)
class _EpisodeSelection:
    episode_indexes: list
    rows_by_shard: dict
    #: Per shard, the source-relative path and the half-open episode range
    #: it holds, in shard order
    episode_shards: list
    #: Whether ``episode_indexes`` is the order the shards hold them in
    source_order: bool


def _select_episodes(shards, root, info, episodes, preprocess):
    """Reads the episode index of every shard once, records which episodes
    each shard holds, and decides which rows to import, in what order.

    A shard has to hold contiguous, ordered episodes: that is what lets a
    reader find episode ``e`` at row ``e - first`` without an index.
    """
    located = {}
    episode_shards = []
    for shard_index, shard_path in enumerate(shards):
        relative_path = _relative_to_root(shard_path, root)
        table = _read_episode_rows(
            shard_path, relative_path, list(_INDEX_COLUMNS)
        )
        episode_indexes = table["episode_index"].to_numpy()
        if len(episode_indexes) == 0:
            raise MalformedMediaSourceError(
                "LeRobot episode metadata shard '%s' is empty" % relative_path
            )

        first = int(episode_indexes[0])
        expected = np.arange(first, first + len(episode_indexes))
        if not np.array_equal(episode_indexes, expected):
            raise MalformedMediaSourceError(
                "LeRobot episode metadata shard '%s' must hold contiguous, "
                "ordered episode indexes" % relative_path
            )

        for row_index, episode_index in enumerate(expected.tolist()):
            if episode_index in located:
                raise MalformedMediaSourceError(
                    "Duplicate LeRobot episode_index %d" % episode_index
                )

            located[episode_index] = (shard_index, row_index)

        episode_shards.append(
            {
                "path": relative_path,
                "episodes": [first, first + len(episode_indexes)],
            }
        )

    expected_total = info["total_episodes"]
    if expected_total != len(located):
        raise MalformedMediaSourceError(
            "LeRobot info.json declares %d episodes but metadata contains %d"
            % (expected_total, len(located))
        )

    if episodes is None:
        indexes = sorted(located)
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
            if value not in located:
                raise ValueError("LeRobot episode %d was not found" % value)
            seen.add(value)
            indexes.append(value)

    indexes = list(preprocess(indexes))
    source_order = indexes == sorted(indexes)
    rows_by_shard = {}
    for episode_index in indexes:
        shard_index, row_index = located[episode_index]
        rows_by_shard.setdefault(shard_index, []).append(row_index)

    for row_indexes in rows_by_shard.values():
        row_indexes.sort()

    return _EpisodeSelection(
        indexes, rows_by_shard, episode_shards, source_order
    )


def _lerobot_media_source(source_id, root, info, episode_shards):
    """What the dataset records about a LeRobot source: where it is, and what
    every episode of it shares -- the path templates, the cameras and the
    metadata shards."""
    return _media_source(
        LEROBOT_EPISODE_KIND,
        source_id,
        root,
        data_path=info["data_path"],
        video_path=info["video_path"],
        image_features=_image_features(info),
        episode_shards=list(episode_shards),
        # where these sit is this module's own; only whether the source has
        # them is a fact about the source
        statistics=fos.isfile(fos.join(root, _STATISTICS_PATH)),
        tasks=fos.isfile(fos.join(root, _TASKS_PATH)),
    )


class _LeRobotMediaResolver(_MediaResolver):
    """Turns episodes into located assets from their own coordinates and the
    media source's templates. Reads nothing."""

    def resolve(self, media_source, references):
        return {
            key: _describe_episode(media_source, reference)
            for key, reference in references.items()
        }


_register_media_resolver(
    LEROBOT_EPISODE_KIND,
    _LeRobotMediaResolver(),
    source_fields=("episode_shards", "statistics", "tasks"),
)


def _shard_for_episode(media_source, episode_index):
    for shard in media_source.get("episode_shards", ()):
        first, end = shard["episodes"]
        if first <= episode_index < end:
            return shard

    raise StaleMediaReferenceError(
        "Episode %d is not in the source's episode metadata" % episode_index
    )


def _describe_episode(media_source, reference):
    """Every asset one episode selects, from its own coordinates and the
    source's templates; nothing here reads storage."""
    source_id = media_source["id"]
    root = media_source["loc"]
    episode_index = LeRobotEpisodeReference.episode_of(reference["key"])
    data_chunk, data_file, start, end = reference["data"]
    global_rows = RowInterval("lerobot-v3-global-dataset-row", start, end)
    data_path = _format_source_path(
        media_source["data_path"], chunk_index=data_chunk, file_index=data_file
    )
    shard = _shard_for_episode(media_source, episode_index)
    row_index = episode_index - shard["episodes"][0]

    described = [
        MediaAsset(
            MediaAssetRole.DATASET_INFO,
            LEROBOT_INFO_PATH,
            WholeFile(),
            media_type="application/json",
        )
    ]
    if media_source.get("statistics"):
        described.append(
            MediaAsset(
                MediaAssetRole.DATASET_STATISTICS,
                _STATISTICS_PATH,
                WholeFile(),
                media_type="application/json",
            )
        )

    if media_source.get("tasks"):
        described.append(
            MediaAsset(
                MediaAssetRole.TASKS_METADATA,
                _TASKS_PATH,
                WholeFile(),
            )
        )

    described.append(
        MediaAsset(
            MediaAssetRole.EPISODE_METADATA,
            shard["path"],
            RowInterval("parquet-file-row", row_index, row_index + 1),
        )
    )
    described.append(
        MediaAsset(MediaAssetRole.TABULAR_FRAME_DATA, data_path, global_rows)
    )
    described.extend(
        MediaAsset(
            MediaAssetRole.IMAGE_PAYLOAD,
            data_path,
            global_rows,
            feature_name=feature_name,
        )
        for feature_name in media_source.get("image_features", ())
    )
    for feature_name, window in reference.get("videos", {}).items():
        chunk_index, file_index, from_timestamp, to_timestamp = window
        described.append(
            MediaAsset(
                MediaAssetRole.VIDEO_STREAM,
                _format_source_path(
                    media_source["video_path"],
                    video_key=feature_name,
                    chunk_index=chunk_index,
                    file_index=file_index,
                ),
                VideoTimestampInterval(from_timestamp, to_timestamp),
                media_type="video/mp4",
                feature_name=feature_name,
            )
        )

    assets = tuple(
        _ResolvedMediaAsset(
            description=asset,
            asset_id="%s/%s" % (source_id, asset.path),
            path=fos.join(root, *asset.path.split("/")),
            media_type=asset.media_type
            or _MEDIA_TYPES.get(
                posixpath.splitext(asset.path)[1], "application/octet-stream"
            ),
        )
        for asset in described
    )
    episode = {
        "episode_index": episode_index,
        "length": end - start,
        "global_rows": [start, end],
        "tasks": list(reference.get("tasks", [])),
        "episode_metadata_row": row_index,
    }
    return _ResolvedMediaReference(reference, assets, episode)


def _validate_dataset_root(dataset_root):
    if not dataset_root:
        raise MissingMediaRootError("A LeRobot dataset root is required")

    root = fos.normalize_path(dataset_root)
    if not fos.isdir(root):
        raise MissingMediaRootError(
            "LeRobot dataset root '%s' does not exist" % root
        )

    return fos.realpath(root) if fos.is_local(root) else root


def _load_info(info_path):
    if not fos.isfile(info_path):
        raise MalformedMediaSourceError(
            "LeRobot source is missing meta/info.json"
        )

    try:
        info = json.loads(_read_bytes(info_path))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MalformedMediaSourceError(
            "LeRobot meta/info.json is unreadable or malformed"
        ) from exc

    if not isinstance(info, dict):
        raise MalformedMediaSourceError(
            "LeRobot meta/info.json must contain a JSON object"
        )

    return info


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

    if int(match.group(1)) != 3:
        raise UnsupportedLeRobotVersionError(
            "Unsupported LeRobotDataset format major %s; this importer "
            "supports only v3.x" % match.group(1)
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


def _list_episode_shards(root):
    episodes_dir = fos.join(root, _EPISODES_DIR)
    if not fos.isdir(episodes_dir):
        raise MalformedMediaSourceError(
            "LeRobot source has no episode metadata Parquet shards under "
            "meta/episodes"
        )

    shards = sorted(
        path
        for path in fos.list_files(
            episodes_dir, abs_paths=True, recursive=True
        )
        if path.endswith(".parquet")
    )
    if not shards:
        raise MalformedMediaSourceError(
            "LeRobot source has no episode metadata Parquet shards under "
            "meta/episodes"
        )

    return shards


def _read_episode_rows(shard_path, relative_path, columns):
    with _open_parquet(shard_path, "episode metadata") as parquet_file:
        missing = set(columns) - set(parquet_file.schema_arrow.names)
        if missing:
            raise MalformedMediaSourceError(
                "LeRobot episode metadata shard '%s' is missing fields: %s"
                % (relative_path, sorted(missing))
            )

        return parquet_file.read(columns=columns)


def _validate_episode_schema(schema, video_features, relative_path):
    """Checks the column types once per shard; a wrong type is a fault of
    the whole shard, not of one episode."""
    for field_name in _integer_episode_columns(video_features):
        if not pa.types.is_integer(schema.field(field_name).type):
            raise MalformedMediaSourceError(
                "LeRobot metadata field '%s' in '%s' must be an integer "
                "column" % (field_name, relative_path)
            )

    for feature_name in video_features:
        for field_name in _video_columns(feature_name)[2:]:
            if not pa.types.is_floating(schema.field(field_name).type):
                raise MalformedMediaSourceError(
                    "LeRobot metadata field '%s' in '%s' must be a float "
                    "column" % (field_name, relative_path)
                )

    # A shard whose every episode has no tasks holds a null or list<null>
    # column, since nothing fixes the element type
    tasks_type = schema.field("tasks").type
    if not pa.types.is_null(tasks_type) and not (
        (pa.types.is_list(tasks_type) or pa.types.is_large_list(tasks_type))
        and (
            pa.types.is_string(tasks_type.value_type)
            or pa.types.is_null(tasks_type.value_type)
        )
    ):
        raise MalformedMediaSourceError(
            "LeRobot metadata field 'tasks' in '%s' must be a list of "
            "strings" % relative_path
        )


def _integer_episode_columns(video_features):
    columns = list(_REQUIRED_EPISODE_FIELDS)
    for feature_name in video_features:
        columns.extend(_video_columns(feature_name)[:2])

    return columns


def _validate_episode_rows(table, video_features):
    """Validates every selected row of a shard in a few column kernels.

    Returns the per-row keep flags and, per fault label, the flags of the
    rows that failed it. A null cell fails its check.
    """
    faults = {}

    def check(label, condition):
        condition = pc.fill_null(condition, False)
        if not pc.all(condition).as_py():
            faults[label] = condition

    for field_name in _integer_episode_columns(video_features):
        check(field_name, pc.greater_equal(table[field_name], 0))

    start = table["dataset_from_index"]
    end = table["dataset_to_index"]
    check(
        "dataset row bounds",
        pc.and_(
            pc.greater(end, start),
            pc.equal(pc.subtract(end, start), table["length"]),
        ),
    )

    for feature_name in video_features:
        prefix = "videos/%s/" % feature_name
        from_timestamp = table[prefix + "from_timestamp"]
        to_timestamp = table[prefix + "to_timestamp"]
        check(
            "video '%s' timestamps" % feature_name,
            pc.and_(
                pc.and_(
                    pc.is_finite(from_timestamp),
                    pc.greater_equal(from_timestamp, 0),
                ),
                pc.and_(
                    pc.is_finite(to_timestamp),
                    pc.greater(to_timestamp, from_timestamp),
                ),
            ),
        )

    valid = [True] * table.num_rows
    for condition in faults.values():
        valid = [
            keep and passed
            for keep, passed in zip(valid, condition.to_pylist())
        ]

    return valid, faults


def _describe_skipped_rows(table, faults, row_indexes, relative_path):
    """Names each rejected row by its episode, or by its shard row when the
    episode index itself is what failed, with the checks it failed."""
    failed_by_row = {}
    for label, condition in faults.items():
        for position, passed in enumerate(condition.to_pylist()):
            if not passed:
                failed_by_row.setdefault(position, []).append(label)

    episode_indexes = table["episode_index"].to_pylist()
    described = []
    for position in sorted(failed_by_row):
        episode_index = episode_indexes[position]
        if "episode_index" in failed_by_row[position] or episode_index is None:
            name = "row %d" % row_indexes[position]
        else:
            name = "episode %d" % episode_index

        described.append(
            "%s in '%s' (%s)"
            % (name, relative_path, ", ".join(failed_by_row[position]))
        )

    return described


def _video_features(info):
    return [
        name
        for name, feature in info["features"].items()
        if feature.get("dtype") == "video"
    ]


def _image_features(info):
    return [
        name
        for name, feature in info["features"].items()
        if feature.get("dtype") == "image"
    ]


def _video_columns(feature_name):
    prefix = "videos/%s/" % feature_name
    return [
        prefix + "chunk_index",
        prefix + "file_index",
        prefix + "from_timestamp",
        prefix + "to_timestamp",
    ]


@contextmanager
def _open_parquet(path, role):
    """Opens a Parquet file for footer and row-group reads over byte ranges."""
    try:
        reader = fos.open_ranged(path)
    except Exception as exc:  # pylint: disable=broad-except
        _raise_storage_error(exc, role, path)

    try:
        try:
            parquet_file = papq.ParquetFile(reader)
        except pa.ArrowInvalid as exc:
            raise UnfinalizedMediaSourceError(
                "LeRobot %s Parquet file '%s' has no readable footer; "
                "finalize or repair the recording" % (role, path)
            ) from exc
        except Exception as exc:  # pylint: disable=broad-except
            _raise_storage_error(exc, role, path)

        # outside the translator: what the caller raises is the caller's
        yield parquet_file
    finally:
        reader.release()


def _read_bytes(path):
    try:
        return fos.read_file(path, binary=True)
    except Exception as exc:  # pylint: disable=broad-except
        _raise_storage_error(exc, "source", path)


def _raise_storage_error(exc, role, path):
    if isinstance(exc, MalformedMediaSourceError):
        raise exc

    status = getattr(getattr(exc, "response", None), "status_code", None)
    if isinstance(exc, PermissionError) or status in (401, 403):
        raise MediaSourceAuthorizationError(
            "LeRobot %s file '%s' is not readable" % (role, path)
        ) from exc

    if isinstance(exc, (FileNotFoundError, NotADirectoryError)) or (
        status == 404
    ):
        raise StaleMediaReferenceError(
            "LeRobot %s file '%s' is missing" % (role, path)
        ) from exc

    raise MalformedMediaSourceError(
        "Unable to read the LeRobot %s file '%s'" % (role, path)
    ) from exc


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
        return _validate_asset_path(path)
    except InvalidMediaLocationError as exc:
        raise MalformedMediaSourceError(
            "LeRobot source path template produced a non-canonical path"
        ) from exc


def _relative_to_root(path, root):
    if not path.startswith(root):
        raise MalformedMediaSourceError(
            "LeRobot source path '%s' is not under its root" % path
        )

    relative_path = path[len(root) :].lstrip("/\\")
    if os.sep != "/":
        relative_path = relative_path.replace(os.sep, "/")

    try:
        return _validate_asset_path(relative_path)
    except InvalidMediaLocationError as exc:
        raise MalformedMediaSourceError(
            "LeRobot source path is not a canonical dataset-relative path"
        ) from exc
