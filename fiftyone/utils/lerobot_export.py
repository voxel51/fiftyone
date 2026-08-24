"""
LeRobotDataset v3 export utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from copy import deepcopy
from dataclasses import dataclass
import importlib.util
import os
import shutil
import tempfile

import eta.core.serial as etas
import eta.core.utils as etau
import numpy as np

import fiftyone.core.utils as fou
from fiftyone.multimodal.media import (
    LEROBOT_EPISODE_KIND,
    LeRobotEpisode,
    MalformedMediaSourceError,
    MediaAssetManifest,
    MediaAssetRole,
    MediaReferenceError,
    StaleMediaReferenceError,
    UnsupportedLeRobotExportModeError,
    UnsupportedMediaReferenceOperation,
    get_media_export_planner,
    get_media_resolver,
    register_media_export_planner,
)
import fiftyone.utils.data.exporters as foue
from fiftyone.utils.lerobot import (
    _format_source_path,
    _load_info,
    _open_parquet,
    _resolve_under_root,
)

pa = fou.lazy_import("pyarrow", callback=lambda: fou.ensure_package("pyarrow"))
papq = fou.lazy_import(
    "pyarrow.parquet", callback=lambda: fou.ensure_package("pyarrow")
)


@dataclass(frozen=True)
class _EpisodeExportSpec:
    reference: LeRobotEpisode
    manifest: MediaAssetManifest


@dataclass(frozen=True)
class _VideoExportSpec:
    source_asset: object
    destination_location: str
    chunk_index: int
    file_index: int


class LeRobotDatasetExporter(foue.BatchDatasetExporter):
    """Exports selected logical episodes as a self-contained v3 dataset.

    Args:
        export_dir: the destination dataset root
        export_media (None): must be ``True``; this is the only mode that
            creates a valid LeRobot dataset
    """

    supports_media_references = True

    def __init__(self, export_dir, export_media=None):
        if export_media is None:
            export_media = True

        if export_media is not True:
            suggestions = {
                False: "use FiftyOneDataset to preserve thin references",
                "move": "LeRobot sources are shared and cannot be moved",
                "symlink": "LeRobot exports must be self-contained",
                "manifest": "use FiftyOneDataset for a thin-reference export",
            }
            suggestion = suggestions.get(export_media, "set export_media=True")
            raise UnsupportedLeRobotExportModeError(export_media, suggestion)

        super().__init__(export_dir=export_dir)
        self.export_media = True

    def export_samples(self, sample_collection, progress=None):
        references = [
            sample.media_reference
            for sample in sample_collection.iter_samples(progress=progress)
        ]
        if not references:
            raise ValueError("Cannot export an empty LeRobot dataset")

        if not all(
            isinstance(reference, LeRobotEpisode) for reference in references
        ):
            raise UnsupportedMediaReferenceOperation(
                "LeRobotDataset export requires LeRobotEpisode references"
            )

        source_identities = {
            reference.source_identity for reference in references
        }
        if len(source_identities) != 1:
            raise MediaReferenceError(
                "LeRobotDataset export cannot mix source_identity values"
            )

        source_fingerprints = {
            reference.source_fingerprint for reference in references
        }
        if len(source_fingerprints) != 1:
            raise StaleMediaReferenceError(
                "LeRobotDataset export cannot mix source fingerprints"
            )

        planner = get_media_export_planner(LEROBOT_EPISODE_KIND, "lerobot-v3")
        specs = [planner(reference) for reference in references]
        self._publish_export(specs)

    def _publish_export(self, specs):
        if os.path.exists(self.export_dir):
            raise FileExistsError(
                "Atomic LeRobot export requires an empty destination: '%s'"
                % self.export_dir
            )

        parent = os.path.dirname(self.export_dir)
        etau.ensure_dir(parent)
        staging_dir = tempfile.mkdtemp(prefix=".fiftyone-lerobot-", dir=parent)
        published = False
        try:
            _write_lerobot_export(staging_dir, specs)
            _validate_lerobot_export(staging_dir, len(specs))

            # Revalidate the original sources immediately before publication.
            for spec in specs:
                reference = spec.reference
                get_media_resolver(reference).resolve_assets(
                    reference, reference.describe_assets()
                )

            os.replace(staging_dir, self.export_dir)
            published = True
        finally:
            if not published and os.path.isdir(staging_dir):
                shutil.rmtree(staging_dir)


def _plan_lerobot_export(reference):
    resolver = get_media_resolver(reference)
    manifest = resolver.resolve_assets(reference, reference.describe_assets())
    return _EpisodeExportSpec(reference=reference, manifest=manifest)


def _write_lerobot_export(staging_dir, specs):
    first_info_asset = _resolved_asset_by_role(
        specs[0].manifest, MediaAssetRole.DATASET_INFO
    )
    info, _ = _load_info(first_info_asset.path)
    fps = float(info["fps"])
    source_tasks = _read_source_tasks(specs[0].manifest)
    video_exports = _plan_video_exports(info, specs)

    task_indexes = {}
    output_rows = []
    output_episode_rows = []
    global_index = 0
    for output_episode_index, spec in enumerate(specs):
        reference = spec.reference
        locator = reference.locator
        metadata_asset = _resolved_asset_by_role(
            spec.manifest, MediaAssetRole.EPISODE_METADATA
        )
        source_episode_row = _read_parquet_row(
            metadata_asset.path, locator.episode_metadata_row
        )
        data_asset = _resolved_asset_by_role(
            spec.manifest, MediaAssetRole.TABULAR_FRAME_DATA
        )
        source_rows = _read_selected_data_rows(data_asset.path, locator)
        tasks = list(source_episode_row.get("tasks") or [])
        for task in tasks:
            task_indexes.setdefault(task, len(task_indexes))

        episode_start = global_index
        for frame_index, source_row in enumerate(source_rows):
            row = dict(source_row)
            row["index"] = global_index
            row["episode_index"] = output_episode_index
            row["frame_index"] = frame_index
            row["timestamp"] = frame_index / fps
            source_task_index = source_row.get("task_index")
            task = source_tasks.get(source_task_index)
            if task is None and len(tasks) == 1:
                task = tasks[0]
            if task is not None:
                task_indexes.setdefault(task, len(task_indexes))
                row["task_index"] = task_indexes[task]
            elif source_task_index is not None:
                raise MalformedMediaSourceError(
                    "LeRobot export cannot map source task_index %s"
                    % source_task_index
                )
            output_rows.append(row)
            global_index += 1

        episode_row = dict(source_episode_row)
        episode_row["episode_index"] = output_episode_index
        episode_row["length"] = len(source_rows)
        episode_row["dataset_from_index"] = episode_start
        episode_row["dataset_to_index"] = global_index
        episode_row["data/chunk_index"] = 0
        episode_row["data/file_index"] = 0
        episode_row["meta/episodes/chunk_index"] = 0
        episode_row["meta/episodes/file_index"] = 0
        _set_episode_statistics(
            episode_row, output_rows[episode_start:global_index]
        )

        for asset in spec.manifest.assets:
            if asset.description.role is not MediaAssetRole.VIDEO_STREAM:
                continue

            video_export = video_exports[asset.shared_resource_key]
            prefix = "videos/%s/" % asset.description.feature_name
            episode_row[prefix + "chunk_index"] = video_export.chunk_index
            episode_row[prefix + "file_index"] = video_export.file_index

        output_episode_rows.append(episode_row)

    output_info = deepcopy(info)
    output_info["total_episodes"] = len(specs)
    output_info["total_frames"] = len(output_rows)
    output_info["total_tasks"] = len(task_indexes)
    output_info.pop("total_videos", None)
    output_info["splits"] = {"train": "0:%d" % len(specs)}

    data_relative_path = _format_source_path(
        output_info["data_path"], chunk_index=0, file_index=0
    )
    data_path = _resolve_under_root(staging_dir, data_relative_path)
    etau.ensure_basedir(data_path)
    papq.write_table(pa.Table.from_pylist(output_rows), data_path)

    episodes_relative_path = "meta/episodes/chunk-000/file-000.parquet"

    episodes_path = _resolve_under_root(staging_dir, episodes_relative_path)
    etau.ensure_basedir(episodes_path)
    papq.write_table(pa.Table.from_pylist(output_episode_rows), episodes_path)

    tasks_path = _resolve_under_root(staging_dir, "meta/tasks.parquet")
    etau.ensure_basedir(tasks_path)
    task_rows = [
        {"task_index": index, "task": task}
        for task, index in sorted(
            task_indexes.items(), key=lambda item: item[1]
        )
    ]
    if task_rows:
        tasks_table = pa.Table.from_pylist(task_rows)
    else:
        tasks_table = pa.table(
            {
                "task_index": pa.array([], type=pa.int64()),
                "task": pa.array([], type=pa.string()),
            }
        )
    papq.write_table(tasks_table, tasks_path)

    stats_path = _resolve_under_root(staging_dir, "meta/stats.json")
    statistics = _compute_statistics(output_rows)
    statistics.update(
        _aggregate_stream_statistics(output_episode_rows, output_info)
    )
    etas.write_json(statistics, stats_path)
    info_path = _resolve_under_root(staging_dir, "meta/info.json")
    etas.write_json(output_info, info_path)

    for video_export in video_exports.values():
        output_path = _resolve_under_root(
            staging_dir, video_export.destination_location
        )
        etau.ensure_basedir(output_path)
        shutil.copy2(video_export.source_asset.path, output_path)


def _plan_video_exports(info, specs):
    exports = {}
    next_file_index = {}
    for spec in specs:
        for asset in spec.manifest.assets:
            if asset.description.role is not MediaAssetRole.VIDEO_STREAM:
                continue

            key = asset.shared_resource_key
            if key in exports:
                continue

            feature_name = asset.description.feature_name
            file_index = next_file_index.get(feature_name, 0)
            next_file_index[feature_name] = file_index + 1
            destination_location = _format_source_path(
                info["video_path"],
                video_key=feature_name,
                chunk_index=0,
                file_index=file_index,
            )
            exports[key] = _VideoExportSpec(
                source_asset=asset,
                destination_location=destination_location,
                chunk_index=0,
                file_index=file_index,
            )

    return exports


def _set_episode_statistics(episode_row, rows):
    statistics = _compute_statistics(rows)
    for field_name, field_statistics in statistics.items():
        prefix = "stats/%s/" % field_name
        for statistic, value in field_statistics.items():
            episode_row[prefix + statistic] = value


def _compute_statistics(rows):
    if not rows:
        return {}

    statistics = {}
    common_fields = set.intersection(*(set(row) for row in rows))
    for field_name in sorted(common_fields):
        values = [row[field_name] for row in rows]
        if any(value is None for value in values):
            continue

        try:
            array = np.asarray(values)
        except (TypeError, ValueError):
            continue

        if array.dtype.kind not in "iuf" or array.ndim == 0:
            continue

        if array.ndim == 1:
            array = array[:, np.newaxis]

        statistics[field_name] = {
            "min": np.min(array, axis=0).tolist(),
            "max": np.max(array, axis=0).tolist(),
            "mean": np.mean(array, axis=0).tolist(),
            "std": np.std(array, axis=0).tolist(),
            "count": [len(array)],
            "q01": np.quantile(array, 0.01, axis=0).tolist(),
            "q10": np.quantile(array, 0.10, axis=0).tolist(),
            "q50": np.quantile(array, 0.50, axis=0).tolist(),
            "q90": np.quantile(array, 0.90, axis=0).tolist(),
            "q99": np.quantile(array, 0.99, axis=0).tolist(),
        }

    return statistics


def _aggregate_stream_statistics(episode_rows, info):
    statistics = {}
    for feature_name, feature in info["features"].items():
        if feature.get("dtype") not in ("image", "video"):
            continue

        feature_statistics = _aggregate_episode_statistics(
            episode_rows, feature_name
        )
        if feature_statistics is not None:
            statistics[feature_name] = feature_statistics

    return statistics


def _aggregate_episode_statistics(episode_rows, field_name):
    prefix = "stats/%s/" % field_name
    required = ("min", "max", "mean", "std", "count")
    if any(
        prefix + statistic not in row
        for row in episode_rows
        for statistic in required
    ):
        return None

    counts = np.asarray(
        [row[prefix + "count"][0] for row in episode_rows], dtype=float
    )
    total_count = float(np.sum(counts))
    if total_count <= 0:
        return None

    means = np.asarray([row[prefix + "mean"] for row in episode_rows])
    stds = np.asarray([row[prefix + "std"] for row in episode_rows])
    count_shape = (len(counts),) + (1,) * (means.ndim - 1)
    weights = counts.reshape(count_shape)
    mean = np.sum(means * weights, axis=0) / total_count
    variance = (
        np.sum(weights * (np.square(stds) + np.square(means - mean)), axis=0)
        / total_count
    )
    result = {
        "min": np.min(
            np.asarray([row[prefix + "min"] for row in episode_rows]), axis=0
        ).tolist(),
        "max": np.max(
            np.asarray([row[prefix + "max"] for row in episode_rows]), axis=0
        ).tolist(),
        "mean": mean.tolist(),
        "std": np.sqrt(variance).tolist(),
        "count": [int(total_count)],
    }
    for quantile in ("q01", "q10", "q50", "q90", "q99"):
        key = prefix + quantile
        if all(key in row for row in episode_rows):
            values = np.asarray([row[key] for row in episode_rows])
            result[quantile] = (
                np.sum(values * weights, axis=0) / total_count
            ).tolist()

    return result


def _resolved_asset_by_role(manifest, role):
    assets = [
        asset for asset in manifest.assets if asset.description.role is role
    ]
    if len(assets) != 1:
        raise MalformedMediaSourceError(
            "LeRobot export expected exactly one '%s' asset" % role.value
        )

    return assets[0]


def _read_source_tasks(manifest):
    assets = [
        asset
        for asset in manifest.assets
        if asset.description.role is MediaAssetRole.TASKS_METADATA
    ]
    if not assets:
        return {}

    if len(assets) != 1:
        raise MalformedMediaSourceError(
            "LeRobot export expected at most one tasks metadata asset"
        )

    table = papq.read_table(assets[0].path)
    if not {"task_index", "task"}.issubset(table.column_names):
        raise MalformedMediaSourceError(
            "LeRobot tasks metadata must contain task_index and task"
        )

    return {
        row["task_index"]: row["task"]
        for row in table.select(["task_index", "task"]).to_pylist()
    }


def _read_parquet_row(path, row_index):
    parquet_file = _open_parquet(path, "episode metadata")
    offset = 0
    for group_index in range(parquet_file.metadata.num_row_groups):
        row_count = parquet_file.metadata.row_group(group_index).num_rows
        if offset <= row_index < offset + row_count:
            table = parquet_file.read_row_group(group_index)
            return table.slice(row_index - offset, 1).to_pylist()[0]

        offset += row_count

    raise StaleMediaReferenceError(
        "LeRobot export episode metadata row is no longer present"
    )


def _read_selected_data_rows(path, locator):
    parquet_file = _open_parquet(path, "episode data")
    row_groups = locator.parquet_row_groups
    group_start = sum(
        parquet_file.metadata.row_group(index).num_rows
        for index in range(row_groups[0])
    )
    table = parquet_file.read_row_groups(row_groups)
    start = locator.parquet_file_rows.start - group_start
    length = locator.parquet_file_rows.end - locator.parquet_file_rows.start
    selected = table.slice(start, length)
    if selected.num_rows != length:
        raise StaleMediaReferenceError(
            "LeRobot export data rows no longer match the stored locator"
        )

    return selected.to_pylist()


def _validate_lerobot_export(staging_dir, expected_episodes):
    resolver = get_media_resolver(LEROBOT_EPISODE_KIND)
    source = resolver.inspect_local_source(staging_dir)
    if len(source.rows) != expected_episodes:
        raise MalformedMediaSourceError(
            "Completed LeRobot export did not preserve the selected episodes"
        )

    for row in source.rows:
        resolver.build_locator(source, row)

    _validate_with_official_lerobot(staging_dir, expected_episodes)


def _validate_with_official_lerobot(staging_dir, expected_episodes):
    if importlib.util.find_spec("lerobot") is None:
        return

    try:
        from lerobot.datasets.lerobot_dataset import (
            LeRobotDataset,
            LeRobotDatasetMetadata,
        )
    except ImportError:
        return

    try:
        metadata = LeRobotDatasetMetadata(
            repo_id="fiftyone/local-export",
            root=staging_dir,
            token=False,
        )
        dataset = LeRobotDataset(
            repo_id="fiftyone/local-export",
            root=staging_dir,
            episodes=list(range(expected_episodes)),
            download_videos=False,
            token=False,
        )
        first_frame = dataset.hf_dataset[0]
    except Exception as exc:
        raise MalformedMediaSourceError(
            "Completed LeRobot export is not readable by the official v3 "
            "reader"
        ) from exc

    if metadata.total_episodes != expected_episodes or len(dataset) != (
        metadata.total_frames
    ):
        raise MalformedMediaSourceError(
            "Completed LeRobot export has inconsistent official-reader totals"
        )

    if first_frame["episode_index"] != 0:
        raise MalformedMediaSourceError(
            "Completed LeRobot export has inconsistent episode coordinates"
        )


register_media_export_planner(
    LEROBOT_EPISODE_KIND,
    "lerobot-v3",
    _plan_lerobot_export,
)
