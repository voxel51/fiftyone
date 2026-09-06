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
import subprocess
import sys

import numpy as np

import eta.core.serial as etas
import eta.core.utils as etau
import fiftyone.core.utils as fou
from fiftyone.multimodal.media_reference.field_model import (
    MalformedMediaSourceError,
    MediaAssetRole,
    MediaReferenceError,
    StaleMediaReferenceError,
    UnsupportedMediaReferenceOperation,
    _get_media_export_planner,
    _resolve_under_root,
    _register_media_export_planner,
    _resolve_media_references,
)
from fiftyone.utils.lerobot import (
    LEROBOT_EPISODE_KIND,
    LeRobotEpisodeReference,
    UnsupportedLeRobotExportModeError,
)
import fiftyone.core.storage as fos
import fiftyone.utils.data.exporters as foue
from fiftyone.utils.lerobot import (
    _format_source_path,
    _list_episode_shards,
    _load_info,
    _open_parquet,
    _select_episodes,
    _validate_dataset_root,
    _validate_v3_info,
)

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


@dataclass(frozen=True)
class _EpisodeExportSpec:
    reference: LeRobotEpisodeReference
    assets: tuple
    #: The episode's stored fields, read with the assets:
    #: episode_metadata_row, global_rows, length, tasks
    episode: dict


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
            if export_media is False:
                suggestion = "use FiftyOneDataset to preserve thin references"
            else:
                suggestions = {
                    "move": "LeRobot sources are shared and cannot be moved",
                    "symlink": "LeRobot exports must be self-contained",
                    "manifest": (
                        "use FiftyOneDataset for a thin-reference export"
                    ),
                }
                suggestion = suggestions.get(
                    export_media, "set export_media=True"
                )
            raise UnsupportedLeRobotExportModeError(export_media, suggestion)

        super().__init__(export_dir=export_dir)
        self.export_media = True

    def export_samples(self, sample_collection, progress=None):
        references = {
            sample.id: sample.media_reference
            for sample in sample_collection.iter_samples(progress=progress)
        }
        if not references:
            raise MediaReferenceError("Cannot export an empty LeRobot dataset")

        if not all(
            isinstance(reference, LeRobotEpisodeReference)
            for reference in references.values()
        ):
            raise UnsupportedMediaReferenceOperation(
                "LeRobotDataset export requires LeRobot episode references"
            )

        if len({r.source_id for r in references.values()}) != 1:
            raise MediaReferenceError(
                "LeRobotDataset export cannot mix episodes from different "
                "sources"
            )

        planner = _get_media_export_planner(LEROBOT_EPISODE_KIND, "lerobot-v3")
        specs = planner(sample_collection._root_dataset, references)
        self._write_export(specs)

    def _write_export(self, specs):
        _write_lerobot_export(self.export_dir, specs)
        _validate_lerobot_export(self.export_dir, len(specs))


def _plan_lerobot_export(dataset, references):
    """Resolves every episode through the dataset's sources: one read per
    metadata shard touched, in the order the references were given."""
    resolved = _resolve_media_references(
        dataset, {key: r.to_mongo() for key, r in references.items()}
    )
    return [
        _EpisodeExportSpec(
            reference=reference,
            assets=resolved[key].assets,
            episode=dict(resolved[key].episode),
        )
        for key, reference in references.items()
    ]


def _write_lerobot_export(export_dir, specs):
    first_info_asset = _resolved_asset_by_role(
        specs[0].assets, MediaAssetRole.DATASET_INFO
    )
    info = _load_info(first_info_asset.path)
    fps = float(info["fps"])
    source_tasks = _read_source_tasks(specs[0].assets)
    video_exports = _plan_video_exports(info, specs)

    task_indexes = {}
    output_tables = []
    output_episode_rows = []
    source_data_tables = {}
    global_index = 0
    for output_episode_index, spec in enumerate(specs):
        metadata_asset = _resolved_asset_by_role(
            spec.assets, MediaAssetRole.EPISODE_METADATA
        )
        source_episode_row = _read_parquet_row(
            metadata_asset.path, spec.episode["episode_metadata_row"]
        )
        data_asset = _resolved_asset_by_role(
            spec.assets, MediaAssetRole.TABULAR_FRAME_DATA
        )
        source_table = _read_selected_data_table(
            data_asset.path, spec.episode["global_rows"], source_data_tables
        )
        source_rows = source_table.to_pylist()
        tasks = list(source_episode_row.get("tasks") or [])
        for task in tasks:
            task_indexes.setdefault(task, len(task_indexes))

        episode_start = global_index
        mapped_task_indexes = []
        for source_row in source_rows:
            source_task_index = source_row.get("task_index")
            task = source_tasks.get(source_task_index)
            if task is None and len(tasks) == 1:
                task = tasks[0]
            if task is not None:
                task_indexes.setdefault(task, len(task_indexes))
                mapped_task_indexes.append(task_indexes[task])
            elif source_task_index is not None:
                raise MalformedMediaSourceError(
                    "LeRobot export cannot map source task_index %s"
                    % source_task_index
                )
            else:
                raise MalformedMediaSourceError(
                    "LeRobot export requires every frame to resolve to a "
                    "declared task"
                )

            global_index += 1

        source_table = _replace_column(
            source_table, "index", range(episode_start, global_index)
        )
        source_table = _replace_column(
            source_table,
            "episode_index",
            [output_episode_index] * len(source_rows),
        )
        source_table = _replace_column(
            source_table, "frame_index", range(len(source_rows)), pa.int64()
        )
        if "timestamp" not in source_table.column_names:
            source_table = _replace_column(
                source_table,
                "timestamp",
                [index / fps for index in range(len(source_rows))],
                pa.float32(),
            )

        source_table = _replace_column(
            source_table, "task_index", mapped_task_indexes, pa.int64()
        )
        output_tables.append(source_table)
        episode_output_rows = source_table.to_pylist()

        episode_row = dict(source_episode_row)
        episode_row["episode_index"] = output_episode_index
        episode_row["length"] = len(source_rows)
        episode_row["dataset_from_index"] = episode_start
        episode_row["dataset_to_index"] = global_index
        episode_row["data/chunk_index"] = 0
        episode_row["data/file_index"] = 0
        episode_row["meta/episodes/chunk_index"] = 0
        episode_row["meta/episodes/file_index"] = 0
        _set_episode_statistics(episode_row, episode_output_rows)

        for asset in spec.assets:
            if asset.description.role is not MediaAssetRole.VIDEO_STREAM:
                continue

            video_export = video_exports[asset.asset_id]
            prefix = "videos/%s/" % asset.description.feature_name
            episode_row[prefix + "chunk_index"] = video_export.chunk_index
            episode_row[prefix + "file_index"] = video_export.file_index

        output_episode_rows.append(episode_row)

    output_table = pa.concat_tables(output_tables)
    output_rows = output_table.to_pylist()
    output_info = deepcopy(info)
    output_info["total_episodes"] = len(specs)
    output_info["total_frames"] = len(output_rows)
    output_info["total_tasks"] = len(task_indexes)
    output_info.pop("total_videos", None)
    output_info["splits"] = {"train": "0:%d" % len(specs)}

    data_relative_path = _format_source_path(
        output_info["data_path"], chunk_index=0, file_index=0
    )
    data_path = _resolve_under_root(export_dir, data_relative_path)
    etau.ensure_basedir(data_path)
    papq.write_table(output_table, data_path)

    episodes_relative_path = "meta/episodes/chunk-000/file-000.parquet"

    episodes_path = _resolve_under_root(export_dir, episodes_relative_path)
    etau.ensure_basedir(episodes_path)
    papq.write_table(pa.Table.from_pylist(output_episode_rows), episodes_path)

    tasks_path = _resolve_under_root(export_dir, "meta/tasks.parquet")
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

    stats_path = _resolve_under_root(export_dir, "meta/stats.json")
    statistics = _compute_statistics(output_rows)
    statistics.update(
        _aggregate_stream_statistics(output_episode_rows, output_info)
    )
    etas.write_json(statistics, stats_path)
    info_path = _resolve_under_root(export_dir, "meta/info.json")
    etas.write_json(output_info, info_path)

    for video_export in video_exports.values():
        output_path = _resolve_under_root(
            export_dir, video_export.destination_location
        )
        etau.ensure_basedir(output_path)
        fos.copy_file(video_export.source_asset.path, output_path)


def _plan_video_exports(info, specs):
    exports = {}
    next_file_index = {}
    for spec in specs:
        for asset in spec.assets:
            if asset.description.role is not MediaAssetRole.VIDEO_STREAM:
                continue

            key = asset.asset_id
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


def _replace_column(table, name, values, missing_type=None):
    if name in table.column_names:
        index = table.schema.get_field_index(name)
        field = table.schema.field(index)
        array = pa.array(values, type=field.type)
        return table.set_column(index, field, array)

    array = pa.array(values, type=missing_type)
    return table.append_column(name, array)


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
    return result


def _resolved_asset_by_role(resolved, role):
    assets = [asset for asset in resolved if asset.description.role is role]
    if len(assets) != 1:
        raise MalformedMediaSourceError(
            "LeRobot export expected exactly one '%s' asset" % role.value
        )

    return assets[0]


def _read_source_tasks(resolved):
    assets = [
        asset
        for asset in resolved
        if asset.description.role is MediaAssetRole.TASKS_METADATA
    ]
    if not assets:
        return {}

    if len(assets) != 1:
        raise MalformedMediaSourceError(
            "LeRobot export expected at most one tasks metadata asset"
        )

    with _open_parquet(assets[0].path, "tasks metadata") as parquet_file:
        table = parquet_file.read()
    if not {"task_index", "task"}.issubset(table.column_names):
        raise MalformedMediaSourceError(
            "LeRobot tasks metadata must contain task_index and task"
        )

    return {
        row["task_index"]: row["task"]
        for row in table.select(["task_index", "task"]).to_pylist()
    }


def _read_parquet_row(path, row_index):
    with _open_parquet(path, "episode metadata") as parquet_file:
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


def _read_selected_data_table(path, global_rows, source_tables=None):
    """The episode's frames, selected by the data file's own global ``index``
    column rather than by a stored file offset."""
    if source_tables is None:
        source_tables = {}

    table = source_tables.get(path)
    if table is None:
        with _open_parquet(path, "episode data") as parquet_file:
            table = parquet_file.read()
        source_tables[path] = table

    if "index" not in table.column_names:
        raise MalformedMediaSourceError(
            "LeRobot data file '%s' has no 'index' column" % path
        )

    start, end = global_rows
    selected = table.filter(
        pc.and_(
            pc.greater_equal(table["index"], start),
            pc.less(table["index"], end),
        )
    )
    if selected.num_rows != end - start:
        raise StaleMediaReferenceError(
            "LeRobot export data rows no longer match the episode's row range"
        )

    return selected


def _validate_lerobot_export(export_dir, expected_episodes):
    root = _validate_dataset_root(export_dir)
    info = _load_info(fos.join(root, "meta/info.json"))
    _validate_v3_info(info)
    selection = _select_episodes(
        _list_episode_shards(root), root, info, None, list
    )
    if len(selection.episode_indexes) != expected_episodes:
        raise MalformedMediaSourceError(
            "Completed LeRobot export did not preserve the selected episodes"
        )

    _validate_with_official_lerobot(export_dir, expected_episodes)


def _validate_with_official_lerobot(export_dir, expected_episodes):
    if importlib.util.find_spec("lerobot") is None:
        return

    script = """
import sys
from lerobot.datasets.lerobot_dataset import (
    LeRobotDataset,
    LeRobotDatasetMetadata,
)

root = sys.argv[1]
expected_episodes = int(sys.argv[2])
metadata = LeRobotDatasetMetadata(
    repo_id="fiftyone/local-export",
    root=root,
)
dataset = LeRobotDataset(
    repo_id="fiftyone/local-export",
    root=root,
    episodes=list(range(expected_episodes)),
    download_videos=False,
)
if metadata.total_episodes != expected_episodes:
    raise RuntimeError("unexpected episode count")
if len(dataset) != metadata.total_frames:
    raise RuntimeError("unexpected frame count")
if dataset.hf_dataset[0]["episode_index"] != 0:
    raise RuntimeError("unexpected episode coordinates")
"""
    env = os.environ.copy()
    env["HF_HUB_OFFLINE"] = "1"
    env["HF_DATASETS_OFFLINE"] = "1"
    try:
        subprocess.run(
            [
                sys.executable,
                "-c",
                script,
                export_dir,
                str(expected_episodes),
            ],
            check=True,
            capture_output=True,
            env=env,
            text=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or "").strip()[-2000:]
        message = (
            "Completed LeRobot export is not readable by the official v3 "
            "reader"
        )
        if details:
            message += ": %s" % details

        raise MalformedMediaSourceError(message) from exc
    except (subprocess.SubprocessError, OSError) as exc:
        raise MalformedMediaSourceError(
            "Completed LeRobot export is not readable by the official v3 "
            "reader"
        ) from exc


_register_media_export_planner(
    LEROBOT_EPISODE_KIND,
    "lerobot-v3",
    _plan_lerobot_export,
)
