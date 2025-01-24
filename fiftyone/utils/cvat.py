"""
Utilities for working with datasets in
`CVAT format <https://github.com/opencv/cvat>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import copy, deepcopy
from datetime import datetime
import itertools
import logging
import math
import multiprocessing.dummy
import os
from packaging.version import Version
import time
import warnings
import webbrowser

from bson import ObjectId
import jinja2
import numpy as np
import requests
import urllib3

import eta.core.data as etad
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomt
from fiftyone.core.sample import Sample
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
import fiftyone.utils.annotations as foua
import fiftyone.utils.data as foud
import fiftyone.utils.video as fouv


logger = logging.getLogger(__name__)


def import_annotations(
    sample_collection,
    project_name=None,
    project_id=None,
    task_ids=None,
    data_path=None,
    label_types=None,
    insert_new=True,
    download_media=False,
    num_workers=None,
    occluded_attr=None,
    group_id_attr=None,
    backend="cvat",
    **kwargs,
):
    """Imports annotations from the specified CVAT project or task(s) into the
    given sample collection.

    Provide one of ``project_name``, ``project_id``, or ``task_ids`` to perform
    an import.

    This method can be configured in any of the following three ways:

    1.  Pass the ``data_path`` argument to define a mapping between media
        filenames in CVAT and local filepaths to the same media.

    2.  Pass the ``download_media=True`` option to download both the
        annotations and the media files themselves, which are stored in a
        directory you specify via the ``data_path`` argument.

    3.  Don't provide ``data_path`` or ``download_media=True``, in which case
        it is assumed that the CVAT filenames correspond to the base filenames
        of existing sample filepaths in the provided ``sample_collection``.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        project_name (None): the name of a CVAT project to import
        project_id (None): the ID of a CVAT project to import
        task_ids (None): a CVAT task ID or iterable of CVAT task IDs to import
        data_path (None): a parameter that defines the correspondence between
            the filenames in CVAT and the filepaths of ``sample_collection``.
            Can be any of the following:

            -   a directory on disk where the media files reside. In this case,
                the filenames must match those in CVAT
            -   a dict mapping CVAT filenames to absolute filepaths to the
                corresponding media on disk
            -   the path to a JSON manifest on disk containing a mapping
                between CVAT filenames and absolute filepaths to the media on
                disk

            By default, only annotations whose filename matches an existing
            filepath in ``sample_collection`` will be imported
        label_types (None): an optional parameter specifying the label types to
            import. Can be any of the following:

            -   ``None`` (default): all label types will be stored in fields of
                the same name on ``sample_collection``
            -   a list of label types to load. In this case, the labels will be
                stored in fields of the same names in ``sample_collection``
            -   a dict mapping label types to field names of
                ``sample_collection`` in which to store the labels
            -   ``"prompt"``: present an interactive prompt to decide/discard
                field names in which to store each label type
        insert_new (True): whether to create new samples for any media for
            which annotations are found in CVAT but which do not exist in
            ``sample_collection``
        download_media (False): whether to download the images or videos found
            in CVAT to the directory or filepaths in ``data_path`` if not
            already present
        num_workers (None): a suggested number of threads to use when
            downloading media
        occluded_attr (None): an optional attribute name in which to store the
            occlusion information for all spatial labels
        group_id_attr (None): an optional attribute name in which to store the
            group id for labels
        backend ("cvat"): the name of the CVAT backend to use
        **kwargs: CVAT authentication credentials to pass to
            :class:`CVATBackendConfig`
    """
    if sample_collection.media_type == fom.GROUP:
        if insert_new:
            raise ValueError(
                "insert_new=True is not supported for grouped collections"
            )

        sample_collection = sample_collection.select_group_slices(
            _allow_mixed=True
        )

    if bool(project_name) + bool(project_id) + bool(task_ids) != 1:
        raise ValueError(
            "Exactly one of 'project_name', 'project_id', or 'task_ids' must "
            "be provided"
        )

    config = foua._parse_config(
        backend,
        None,
        occluded_attr=occluded_attr,
        group_id_attr=group_id_attr,
        **kwargs,
    )
    anno_backend = config.build()
    api = anno_backend.connect_to_api()

    if project_name is not None:
        project_id = api.get_project_id(project_name)

    if project_id is not None:
        task_ids = api.get_project_tasks(project_id)

    if etau.is_str(task_ids):
        task_ids = [task_ids]
    else:
        task_ids = list(task_ids)

    # Build mapping from CVAT filenames to local filepaths
    data_dir = None
    existing_filepaths = sample_collection.values("filepath")
    if data_path is None:
        data_map = {os.path.basename(f): f for f in existing_filepaths}
    elif etau.is_str(data_path) and data_path.endswith(".json"):
        data_map = etas.read_json(data_path)
    elif etau.is_str(data_path):
        if os.path.isdir(data_path):
            data_map = {
                os.path.basename(f): f
                for f in etau.list_files(
                    data_path, abs_paths=True, recursive=True
                )
            }
        else:
            data_map = {}

        data_dir = data_path
    else:
        data_map = data_path

    # Determine what filepaths we have annotations for
    cvat_id_map = {}
    task_filepaths = []
    ignored_filenames = []
    download_tasks = []
    for task_id in task_ids:
        cvat_id_map[task_id] = _parse_task_metadata(
            api,
            task_id,
            data_map,
            task_filepaths,
            ignored_filenames,
            download_tasks,
            data_dir=data_dir,
            download_media=download_media,
        )

    # Download media from CVAT, if requested
    if download_tasks:
        _download_media(download_tasks, num_workers)

    if ignored_filenames:
        logger.warning(
            "Ignoring annotations for %d files in CVAT (eg %s) that do not "
            "appear in the provided data map",
            len(ignored_filenames),
            ignored_filenames[0],
        )

    if not task_filepaths:
        logger.warning("No applicable annotations found to download")
        return

    dataset = sample_collection._dataset

    new_filepaths = set(task_filepaths) - set(existing_filepaths)

    # Insert samples for new filepaths, if necessary and we're allowed to
    if new_filepaths:
        if insert_new:
            dataset.add_samples([Sample(filepath=fp) for fp in new_filepaths])
        else:
            logger.warning(
                "Ignoring annotations for %d filepaths (eg %s) that do not "
                "appear in the input collection",
                len(new_filepaths),
                next(iter(new_filepaths)),
            )

    if dataset.media_type == fom.VIDEO:
        # The download implementation requires IDs for all possible frames
        dataset.select_by("filepath", task_filepaths).ensure_frames()

    anno_key = "tmp_" + str(ObjectId())
    anno_backend.register_run(dataset, anno_key, overwrite=False)

    # Download annotations
    try:
        if project_id is not None:
            # CVAT projects share a label schema, so we can download all tasks
            # in one batch
            label_schema = api._get_label_schema(
                project_id=project_id,
                occluded_attr=occluded_attr,
                group_id_attr=group_id_attr,
            )

            _download_annotations(
                dataset,
                task_ids,
                cvat_id_map,
                label_schema,
                label_types,
                anno_backend,
                anno_key,
                **kwargs,
            )
        else:
            # Each task may have a different label schema, so we must download
            # each task separately
            for task_id in task_ids:
                label_schema = api._get_label_schema(
                    task_id=task_id,
                    occluded_attr=occluded_attr,
                    group_id_attr=group_id_attr,
                )

                _download_annotations(
                    dataset,
                    [task_id],
                    cvat_id_map,
                    label_schema,
                    label_types,
                    anno_backend,
                    anno_key,
                    **kwargs,
                )
    finally:
        anno_backend.delete_run(dataset, anno_key)
        api.close()


def _parse_task_metadata(
    api,
    task_id,
    data_map,
    task_filepaths,
    ignored_filenames,
    download_tasks,
    data_dir=None,
    download_media=False,
):
    resp = api.get(api.task_data_meta_url(task_id)).json()
    start_frame = resp.get("start_frame", None)
    stop_frame = resp.get("stop_frame", None)
    chunk_size = resp.get("chunk_size", None)

    cvat_id_map = {}
    for frame_id, frame in enumerate(resp["frames"]):
        filename = frame["name"]
        filepath = data_map.get(filename, None)
        if download_media:
            if filepath is None and data_dir:
                filepath = os.path.join(data_dir, filename)

            if filepath and not os.path.exists(filepath):
                download_tasks.append(
                    (
                        api,
                        task_id,
                        frame_id,
                        filepath,
                        start_frame,
                        stop_frame,
                        chunk_size,
                    )
                )

        if filepath is not None:
            cvat_id_map[filepath] = frame_id
            task_filepaths.append(filepath)
        else:
            ignored_filenames.append(filename)

    return cvat_id_map


def _download_media(tasks, num_workers):
    num_workers = fou.recommend_thread_pool_workers(num_workers)

    logger.info("Downloading media...")
    if num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                _do_download_media(task)
    else:
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(total=len(tasks)) as pb:
                for _ in pb(pool.imap_unordered(_do_download_media, tasks)):
                    pass


def _do_download_media(task):
    (
        api,
        task_id,
        frame_id,
        filepath,
        start_frame,
        stop_frame,
        chunk_size,
    ) = task

    if fom.get_media_type(filepath) == fom.VIDEO:
        ext = os.path.splitext(filepath)[1]
        num_chunks = int(np.ceil((stop_frame - start_frame) / chunk_size))

        # CVAT stores videos in chunks, so we must download them individually
        # and then concatenate them...
        with etau.TempDir() as tmp_dir:
            chunk_paths = []
            for chunk_id in range(num_chunks):
                resp = api.get(
                    api.task_data_download_url(
                        task_id, chunk_id, data_type="chunk"
                    )
                )
                chunk_path = os.path.join(tmp_dir, "%d%s" % (chunk_id, ext))
                etau.write_file(resp._content, chunk_path)
                chunk_paths.append(chunk_path)

            fouv.concat_videos(chunk_paths, filepath)
    else:
        resp = api.get(api.task_data_download_url(task_id, frame_id))
        etau.write_file(resp._content, filepath)


def _download_annotations(
    dataset,
    task_ids,
    cvat_id_map,
    label_schema,
    label_types,
    anno_backend,
    anno_key,
    **kwargs,
):
    config = anno_backend.config
    config.label_schema = label_schema
    anno_backend.update_run_config(dataset, anno_key, config)

    id_map = {}
    server_id_map = {}
    project_ids = []
    job_ids = []
    frame_id_map = {
        task_id: _build_sparse_frame_id_map(dataset, cvat_id_map[task_id])
        for task_id in task_ids
    }
    labels_task_map = {None: task_ids}

    results = CVATAnnotationResults(
        dataset,
        config,
        anno_key,
        id_map,
        server_id_map,
        project_ids,
        task_ids,
        job_ids,
        frame_id_map,
        labels_task_map,
        backend=anno_backend,
    )

    anno_backend.save_run_results(dataset, anno_key, results)

    if label_types is None:
        unexpected = "keep"
    else:
        unexpected = label_types

    dataset.load_annotations(
        anno_key, unexpected=unexpected, cleanup=False, **kwargs
    )


def _build_sparse_frame_id_map(dataset, cvat_id_map):
    task_filepaths = list(cvat_id_map.keys())
    samples = dataset.select_by("filepath", task_filepaths)

    frame_id_map = {}

    if samples.media_type == fom.VIDEO:
        # Video tasks have exactly one video, and we download labels for all
        # of its frames
        frame_id = -1
        sample_ids, frame_ids = samples.values(["id", "frames.id"])
        for sample_id, _frame_ids in zip(sample_ids, frame_ids):
            for _frame_id in _frame_ids:
                frame_id += 1
                frame_id_map[frame_id] = {
                    "sample_id": sample_id,
                    "frame_id": _frame_id,
                }
    else:
        # For image tasks, only allow downloads for filepaths in `cvat_id_map`
        sample_ids, filepaths = samples.values(["id", "filepath"])
        for sample_id, filepath in zip(sample_ids, filepaths):
            frame_id = cvat_id_map.get(filepath, None)
            if frame_id is not None:
                frame_id_map[frame_id] = {"sample_id": sample_id}

    return frame_id_map


class CVATImageDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for CVAT image datasets stored on disk.

    See :ref:`this page <CVATImageDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data
            -   a dict mapping filenames to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.xml"`` specifying the location of the
                labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.xml``
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with label entries (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.xml",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.include_all_data = include_all_data

        self._info = None
        self._image_paths_map = None
        self._cvat_images_map = None
        self._filenames = None
        self._iter_filenames = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        filename = next(self._iter_filenames)

        if os.path.isabs(filename):
            image_path = filename
        else:
            image_path = self._image_paths_map[filename]

        cvat_image = self._cvat_images_map.get(filename, None)
        if cvat_image is not None:
            # Labeled image
            image_metadata = cvat_image.get_image_metadata()
            labels = cvat_image.to_labels()
        else:
            # Unlabeled image
            image_metadata = None
            labels = None

        return image_path, image_metadata, labels

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return {
            "classifications": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        image_paths_map = self._load_data_map(self.data_path, recursive=True)

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            info, _, cvat_images = load_cvat_image_annotations(
                self.labels_path
            )
        else:
            info = {}
            cvat_images = []

        self._info = info

        # Use subset/name as the key if it exists, else just name
        cvat_images_map = {}
        for i in cvat_images:
            if i.subset:
                key = os.path.join(i.subset, i.name)
            else:
                key = i.name

            cvat_images_map[fos.normpath(key)] = i

        filenames = set(cvat_images_map.keys())

        if self.include_all_data:
            filenames.update(image_paths_map.keys())

        filenames = self._preprocess_list(sorted(filenames))

        self._image_paths_map = image_paths_map
        self._cvat_images_map = cvat_images_map
        self._filenames = filenames
        self._num_samples = len(filenames)

    def get_dataset_info(self):
        return self._info


class CVATVideoDatasetImporter(
    foud.LabeledVideoDatasetImporter, foud.ImportPathsMixin
):
    """Importer for CVAT video datasets stored on disk.

    See :ref:`this page <CVATVideoDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data
            -   a dict mapping filenames to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location of the labels in ``dataset_dir``
            -   an absolute folder path to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels/``
        include_all_data (False): whether to generate samples for all videos in
            the data directory (True) rather than only creating samples for
            videos with label entries (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels/",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.include_all_data = include_all_data

        self._info = None
        self._cvat_task_labels = None
        self._video_paths_map = None
        self._labels_paths_map = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        video_path = self._video_paths_map[uuid]

        labels_path = self._labels_paths_map.get(uuid, None)
        if labels_path:
            # Labeled video
            info, cvat_task_labels, cvat_tracks = load_cvat_video_annotations(
                labels_path
            )

            if self._info is None:
                self._info = info

            self._cvat_task_labels.merge_task_labels(cvat_task_labels)
            self._info["task_labels"] = self._cvat_task_labels.labels

            frames = _cvat_tracks_to_frames_dict(cvat_tracks)
        else:
            # Unlabeled video
            frames = None

        return video_path, None, None, frames

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_video_metadata(self):
        return False  # has (width, height) but not other important info

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return {
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        video_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        if self.labels_path is not None and os.path.isdir(self.labels_path):
            labels_path = fos.normpath(self.labels_path)
            labels_paths_map = {
                os.path.splitext(p)[0]: os.path.join(labels_path, p)
                for p in etau.list_files(labels_path, recursive=True)
                if etau.has_extension(p, ".xml")
            }
        else:
            labels_paths_map = {}

        uuids = set(labels_paths_map.keys())

        if self.include_all_data:
            uuids.update(video_paths_map.keys())

        uuids = self._preprocess_list(sorted(uuids))

        self._cvat_task_labels = CVATTaskLabels()
        self._video_paths_map = video_paths_map
        self._labels_paths_map = labels_paths_map
        self._uuids = uuids
        self._num_samples = len(uuids)

    def get_dataset_info(self):
        return self._info


class CVATImageDatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes CVAT image datasets to disk.

    See :ref:`this page <CVATImageDataset-export>` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a filename like ``"labels.xml"`` specifying the location in
                ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported image. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        abs_paths (False): whether to store absolute paths to the images in the
            exported labels
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        rel_dir=None,
        abs_paths=False,
        image_format=None,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels.xml",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.rel_dir = rel_dir
        self.abs_paths = abs_paths
        self.image_format = image_format

        self._name = None
        self._task_labels = None
        self._cvat_images = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return {
            "classifications": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._cvat_images = []
        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            rel_dir=self.rel_dir,
            default_ext=self.image_format,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        self._name = sample_collection._dataset.name
        self._task_labels = sample_collection.info.get("task_labels", None)

    def export_sample(self, image_or_path, labels, metadata=None):
        out_image_path, uuid = self._media_exporter.export(image_or_path)

        if labels is None:
            return  # unlabeled

        if not isinstance(labels, dict):
            labels = {"labels": labels}

        if all(v is None for v in labels.values()):
            return  # unlabeled

        if metadata is None:
            metadata = fomt.ImageMetadata.build_for(image_or_path)

        if self.abs_paths:
            name = out_image_path
        else:
            name = uuid

        cvat_image = CVATImage.from_labels(labels, metadata)
        cvat_image.id = len(self._cvat_images)
        cvat_image.name = name

        self._cvat_images.append(cvat_image)

    def close(self, *args):
        # Get task labels
        if self._task_labels is None:
            # Compute task labels from active label schema
            cvat_task_labels = CVATTaskLabels.from_cvat_images(
                self._cvat_images
            )
        else:
            # Use task labels from logged collection info
            cvat_task_labels = CVATTaskLabels(labels=self._task_labels)

        # Write annotations
        writer = CVATImageAnnotationWriter()
        writer.write(
            cvat_task_labels,
            self._cvat_images,
            self.labels_path,
            id=0,
            name=self._name,
        )

        self._media_exporter.close()


class CVATVideoDatasetExporter(
    foud.LabeledVideoDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes CVAT video datasets to disk.

    See :ref:`this page <CVATVideoDataset-export>` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location in ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default folder name
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each video. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported video. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        rel_dir=None,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels/",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.rel_dir = rel_dir

        self._task_labels = None
        self._num_samples = 0
        self._writer = None
        self._media_exporter = None

    @property
    def requires_video_metadata(self):
        return True

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return {
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._writer = CVATVideoAnnotationWriter()
        self._media_exporter = foud.VideoExporter(
            self.export_media,
            export_path=self.data_path,
            rel_dir=self.rel_dir,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        self._task_labels = sample_collection.info.get("task_labels", None)

    def export_sample(self, video_path, _, frames, metadata=None):
        _, uuid = self._media_exporter.export(video_path)

        if frames is None:
            return  # unlabeled

        if metadata is None:
            metadata = fomt.VideoMetadata.build_for(video_path)

        out_anno_path = os.path.join(
            self.labels_path, os.path.splitext(uuid)[0] + ".xml"
        )

        # Generate object tracks
        frame_size = (metadata.frame_width, metadata.frame_height)
        cvat_tracks = _frames_to_cvat_tracks(frames, frame_size)

        if cvat_tracks is None:
            return  # unlabeled

        # Get task labels
        if self._task_labels is None:
            # Compute task labels from active label schema
            cvat_task_labels = CVATTaskLabels.from_cvat_tracks(cvat_tracks)
        else:
            # Use task labels from logged collection info
            cvat_task_labels = CVATTaskLabels(labels=self._task_labels)

        # Write annotations
        self._num_samples += 1
        self._writer.write(
            cvat_task_labels,
            cvat_tracks,
            metadata,
            out_anno_path,
            id=self._num_samples - 1,
            name=uuid,
        )

    def close(self, *args):
        self._media_exporter.close()


class CVATTaskLabels(object):
    """Description of the labels in a CVAT image annotation task.

    Args:
        labels (None): a list of label dicts in the following format::

            [
                {
                    "name": "car",
                    "attributes": [
                        {
                            "name": "type"
                            "categories": ["coupe", "sedan", "truck"]
                        },
                        ...
                    }
                },
                ...
            ]
    """

    def __init__(self, labels=None):
        self.labels = labels or []

    def merge_task_labels(self, task_labels):
        """Merges the given :class:`CVATTaskLabels` into this instance.

        Args:
            task_labels: a :class:`CVATTaskLabels`
        """
        schema = self.to_schema()
        schema.merge_schema(task_labels.to_schema())
        new_task_labels = CVATTaskLabels.from_schema(schema)
        self.labels = new_task_labels.labels

    def to_schema(self):
        """Returns an ``eta.core.image.ImageLabelsSchema`` representation of
        the task labels.

        Note that CVAT's task labels schema does not distinguish between boxes,
        polylines, and keypoints, so the returned schema stores all annotations
        under the ``"objects"`` field.

        Returns:
            an ``eta.core.image.ImageLabelsSchema``
        """
        schema = etai.ImageLabelsSchema()

        for label in self.labels:
            _label = label["name"]
            schema.add_object_label(_label)
            for attribute in label.get("attributes", []):
                _name = attribute["name"]
                _categories = attribute["categories"]
                for _value in _categories:
                    _attr = etad.CategoricalAttribute(_name, _value)
                    schema.add_object_attribute(_label, _attr)

        return schema

    @classmethod
    def from_cvat_images(cls, cvat_images):
        """Creates a :class:`CVATTaskLabels` instance that describes the active
        schema of the given annotations.

        Args:
            cvat_images: a list of :class:`CVATImage` instances

        Returns:
            a :class:`CVATTaskLabels`
        """
        schema = etai.ImageLabelsSchema()
        for cvat_image in cvat_images:
            for anno in cvat_image.iter_annos():
                _label = anno.label
                schema.add_object_label(_label)

                if anno.occluded is not None:
                    _attr = etad.BooleanAttribute("occluded", anno.occluded)
                    schema.add_object_attribute(_label, _attr)

                for attr in anno.attributes:
                    _attr = attr.to_eta_attribute()
                    schema.add_object_attribute(_label, _attr)

        return cls.from_schema(schema)

    @classmethod
    def from_cvat_tracks(cls, cvat_tracks):
        """Creates a :class:`CVATTaskLabels` instance that describes the active
        schema of the given annotations.

        Args:
            cvat_tracks: a list of :class:`CVATTrack` instances

        Returns:
            a :class:`CVATTaskLabels`
        """
        schema = etai.ImageLabelsSchema()
        for cvat_track in cvat_tracks:
            for anno in cvat_track.iter_annos():
                _label = anno.label
                schema.add_object_label(_label)

                if anno.outside is not None:
                    _attr = etad.BooleanAttribute("outside", anno.outside)
                    schema.add_object_attribute(_label, _attr)

                if anno.occluded is not None:
                    _attr = etad.BooleanAttribute("occluded", anno.occluded)
                    schema.add_object_attribute(_label, _attr)

                if anno.keyframe is not None:
                    _attr = etad.BooleanAttribute("keyframe", anno.keyframe)
                    schema.add_object_attribute(_label, _attr)

                for attr in anno.attributes:
                    _attr = attr.to_eta_attribute()
                    schema.add_object_attribute(_label, _attr)

        return cls.from_schema(schema)

    @classmethod
    def from_labels_dict(cls, d):
        """Creates a :class:`CVATTaskLabels` instance from the ``<labels>``
        tag of a CVAT annotation XML file.

        Args:
            d: a dict representation of a ``<labels>`` tag

        Returns:
            a :class:`CVATTaskLabels`
        """
        labels = _ensure_list(d.get("label", []))
        _labels = []
        for label in labels:
            _tmp = label.get("attributes", None) or {}
            attributes = _ensure_list(_tmp.get("attribute", []))
            _attributes = []
            for attribute in attributes:
                _values = attribute.get("values", None)
                _categories = _values.split("\n") if _values else []
                _attributes.append(
                    {"name": attribute["name"], "categories": _categories}
                )

            _labels.append({"name": label["name"], "attributes": _attributes})

        return cls(labels=_labels)

    @classmethod
    def from_schema(cls, schema):
        """Creates a :class:`CVATTaskLabels` instance from an
        ``eta.core.image.ImageLabelsSchema``.

        Args:
            schema: an ``eta.core.image.ImageLabelsSchema``

        Returns:
            a :class:`CVATTaskLabels`
        """
        labels = []
        obj_schemas = schema.objects
        for label in sorted(obj_schemas.schema):
            obj_schema = obj_schemas.schema[label]
            obj_attr_schemas = obj_schema.attrs
            attributes = []
            for name in sorted(obj_attr_schemas.schema):
                attr_schema = obj_attr_schemas.schema[name]
                if isinstance(attr_schema, etad.CategoricalAttributeSchema):
                    attributes.append(
                        {
                            "name": name,
                            "categories": sorted(attr_schema.categories),
                        }
                    )

            labels.append({"name": label, "attributes": attributes})

        return cls(labels=labels)


class CVATImage(object):
    """An annotated image in CVAT image format.

    Args:
        id: the ID of the image
        name: the filename of the image
        width: the width of the image, in pixels
        height: the height of the image, in pixels
        tags (None): a list of :class:`CVATImageTag` instances
        boxes (None): a list of :class:`CVATImageBox` instances
        polygons (None): a list of :class:`CVATImagePolygon` instances
        polylines (None): a list of :class:`CVATImagePolyline` instances
        points (None): a list of :class:`CVATImagePoints` instances
        subset (None): the project subset of the image, if any
    """

    def __init__(
        self,
        id,
        name,
        width,
        height,
        tags=None,
        boxes=None,
        polygons=None,
        polylines=None,
        points=None,
        subset=None,
    ):
        self.id = id
        self.name = name
        self.subset = subset
        self.width = width
        self.height = height
        self.tags = tags or []
        self.boxes = boxes or []
        self.polygons = polygons or []
        self.polylines = polylines or []
        self.points = points or []

    @property
    def has_tags(self):
        """Whether this image has tags."""
        return bool(self.tags)

    @property
    def has_boxes(self):
        """Whether this image has 2D boxes."""
        return bool(self.boxes)

    @property
    def has_polylines(self):
        """Whether this image has polygons or polylines."""
        return bool(self.polygons) or bool(self.polylines)

    @property
    def has_points(self):
        """Whether this image has keypoints."""
        return bool(self.points)

    def iter_annos(self):
        """Returns an iterator over the annotations in the image.

        Returns:
            an iterator that emits :class:`CVATImageAnno` instances
        """
        return itertools.chain(
            self.tags, self.boxes, self.polygons, self.polylines, self.points
        )

    def get_image_metadata(self):
        """Returns a :class:`fiftyone.core.metadata.ImageMetadata` instance for
        the annotations.

        Returns:
            a :class:`fiftyone.core.metadata.ImageMetadata`
        """
        return fomt.ImageMetadata(width=self.width, height=self.height)

    def to_labels(self):
        """Returns :class:`fiftyone.core.labels.Label` representations of the
        annotations.

        Returns:
            a dict mapping field keys to :class:`fiftyone.core.labels.Label`
            instances
        """
        frame_size = (self.width, self.height)

        labels = {}

        if self.tags:
            tags = [t.to_classification() for t in self.tags]
            labels["classifications"] = fol.Classifications(
                classifications=tags
            )

        if self.boxes:
            detections = [b.to_detection(frame_size) for b in self.boxes]
            labels["detections"] = fol.Detections(detections=detections)

        if self.polygons or self.polylines:
            polygons = [p.to_polyline(frame_size) for p in self.polygons]
            polylines = [p.to_polyline(frame_size) for p in self.polylines]
            labels["polylines"] = fol.Polylines(polylines=polygons + polylines)

        if self.points:
            keypoints = [k.to_keypoint(frame_size) for k in self.points]
            labels["keypoints"] = fol.Keypoints(keypoints=keypoints)

        return labels

    @classmethod
    def from_labels(cls, labels, metadata):
        """Creates a :class:`CVATImage` from a dictionary of labels.

        Args:
            labels: a dict mapping keys to :class:`fiftyone.core.labels.Label`
                instances
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATImage`
        """
        width = metadata.width
        height = metadata.height

        _classifications = []
        _detections = []
        _polygons = []
        _polylines = []
        _keypoints = []
        for _labels in labels.values():
            if isinstance(_labels, fol.Classification):
                _classifications.append(_labels)
            elif isinstance(_labels, fol.Classifications):
                _classifications.extend(_labels.classifications)
            elif isinstance(_labels, fol.Detection):
                _detections.append(_labels)
            elif isinstance(_labels, fol.Detections):
                _detections.extend(_labels.detections)
            elif isinstance(_labels, fol.Polyline):
                if _labels.closed:
                    _polygons.append(_labels)
                else:
                    _polylines.append(_labels)
            elif isinstance(_labels, fol.Polylines):
                for poly in _labels.polylines:
                    if poly.closed:
                        _polygons.append(poly)
                    else:
                        _polylines.append(poly)
            elif isinstance(_labels, fol.Keypoint):
                _keypoints.append(_labels)
            elif isinstance(_labels, fol.Keypoints):
                _keypoints.extend(_labels.keypoints)
            elif _labels is not None:
                msg = (
                    "Ignoring unsupported label type '%s'" % _labels.__class__
                )
                warnings.warn(msg)

        tags = [CVATImageTag.from_classification(c) for c in _classifications]

        boxes = [CVATImageBox.from_detection(d, metadata) for d in _detections]

        polygons = []
        for p in _polygons:
            polygons.extend(CVATImagePolygon.from_polyline(p, metadata))

        polylines = []
        for p in _polylines:
            polylines.extend(CVATImagePolyline.from_polyline(p, metadata))

        points = [
            CVATImagePoints.from_keypoint(k, metadata) for k in _keypoints
        ]

        return cls(
            None,
            None,
            width,
            height,
            tags=tags,
            boxes=boxes,
            polygons=polygons,
            polylines=polylines,
            points=points,
        )

    @classmethod
    def from_image_dict(cls, d):
        """Creates a :class:`CVATImage` from an ``<image>`` tag of a CVAT image
        annotations XML file.

        Args:
            d: a dict representation of an ``<image>`` tag

        Returns:
            a :class:`CVATImage`
        """
        id = d["@id"]
        name = d["@name"]
        subset = d.get("@subset", None)
        width = int(d["@width"])
        height = int(d["@height"])

        tags = []
        for td in _ensure_list(d.get("tag", [])):
            tags.append(CVATImageTag.from_tag_dict(td))

        boxes = []
        for bd in _ensure_list(d.get("box", [])):
            boxes.append(CVATImageBox.from_box_dict(bd))

        polygons = []
        for pd in _ensure_list(d.get("polygon", [])):
            polygons.append(CVATImagePolygon.from_polygon_dict(pd))

        polylines = []
        for pd in _ensure_list(d.get("polyline", [])):
            polylines.append(CVATImagePolyline.from_polyline_dict(pd))

        points = []
        for pd in _ensure_list(d.get("points", [])):
            points.append(CVATImagePoints.from_points_dict(pd))

        return cls(
            id,
            name,
            width,
            height,
            tags=tags,
            boxes=boxes,
            polygons=polygons,
            polylines=polylines,
            points=points,
            subset=subset,
        )


class HasCVATBinaryMask(object):
    """Mixin for CVAT annotations that store RLE format instance masks."""

    @staticmethod
    def _rle_to_binary_image_mask(rle, mask_width, mask_height):
        mask = np.zeros(mask_width * mask_height, dtype=np.uint8)
        counter = 0
        for i, val in enumerate(rle):
            if i % 2 == 1:
                mask[counter : counter + val] = 1
            counter += val
        return mask.reshape(mask_height, mask_width)

    @staticmethod
    def _mask_to_cvat_rle(binary_mask):
        counts = []
        for i, (value, elements) in enumerate(
            itertools.groupby(binary_mask.ravel(order="C"))
        ):
            if i == 0 and value == 1:
                counts.append(0)
            counts.append(len(list(elements)))
        return counts


class HasCVATPoints(object):
    """Mixin for CVAT annotations that store a list of ``(x, y)`` pixel
    coordinates.

    Attributes:
        points: a list of ``(x, y)`` pixel coordinates defining points
    """

    def __init__(self, points):
        self.points = points

    @property
    def points_str(self):
        return self._to_cvat_points_str(self.points)

    @staticmethod
    def _to_rel_points(points, frame_size):
        w, h = frame_size
        return [(x / w, y / h) for x, y in points]

    @staticmethod
    def _to_abs_points(points, frame_size):
        w, h = frame_size
        return [(int(round(x * w)), int(round(y * h))) for x, y in points]

    @staticmethod
    def _to_cvat_points_str(points):
        return ";".join("%g,%g" % (x, y) for x, y in points)

    @staticmethod
    def _parse_cvat_points_str(points_str):
        points = []
        for xy_str in points_str.split(";"):
            x, y = xy_str.split(",")
            points.append((int(round(float(x))), int(round(float(y)))))

        return points


class CVATImageAnno(object):
    """Mixin for annotations in CVAT image format.

    Args:
        occluded (None): whether the object is occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, occluded=None, attributes=None):
        self.occluded = occluded
        self.attributes = attributes or []

    def _to_attributes(self):
        attributes = {a.name: a.value for a in self.attributes}

        if self.occluded == 1:
            attributes["occluded"] = True

        return attributes

    @staticmethod
    def _parse_attributes(label):
        attrs = dict(label.iter_attributes())

        occluded = _to_int_bool(attrs.pop("occluded", None))

        attributes = [
            CVATAttribute(k, v)
            for k, v in attrs.items()
            if _is_supported_attribute_type(v)
        ]

        return occluded, attributes

    @staticmethod
    def _parse_anno_dict(d):
        occluded = _from_int_bool(d.get("@occluded", None))

        attributes = []
        for attr in _ensure_list(d.get("attribute", [])):
            if "#text" in attr:
                name = attr["@name"].lstrip("@")
                if name == "label_id":
                    # We assume that this is a `label_id` exported from an
                    # CVAT annotation run created by our annotation API, which
                    # should be ignored since we're not using the API here
                    continue

                value = _parse_value(attr["#text"])
                attributes.append(CVATAttribute(name, value))

        return occluded, attributes


class CVATImageTag(CVATImageAnno):
    """A tag in CVAT image format.

    Args:
        label: the tag string
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, label, attributes=None):
        self.label = label
        CVATImageAnno.__init__(self, attributes=attributes)

    def to_classification(self):
        """Returns a :class:`fiftyone.core.labels.Classification`
        representation of the tag.

        Returns:
            a :class:`fiftyone.core.labels.Classification`
        """
        attributes = self._to_attributes()
        return fol.Classification(label=self.label, **attributes)

    @classmethod
    def from_classification(cls, classification):
        """Creates a :class:`CVATImageTag` from a
        :class:`fiftyone.core.labels.Classification`.

        Args:
            classification: a :class:`fiftyone.core.labels.Classification`

        Returns:
            a :class:`CVATImageTag`
        """
        label = classification.label

        _, attributes = cls._parse_attributes(classification)
        return cls(label, attributes=attributes)

    @classmethod
    def from_tag_dict(cls, d):
        """Creates a :class:`CVATImageTag` from a ``<tag>`` tag of a
        CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<tag>`` tag

        Returns:
            a :class:`CVATImageTag`
        """
        label = d["@label"]

        _, attributes = cls._parse_anno_dict(d)
        return cls(label, attributes=attributes)


class CVATImageBox(CVATImageAnno):
    """An object bounding box in CVAT image format.

    Args:
        label: the object label string
        xtl: the top-left x-coordinate of the box, in pixels
        ytl: the top-left y-coordinate of the box, in pixels
        xbr: the bottom-right x-coordinate of the box, in pixels
        ybr: the bottom-right y-coordinate of the box, in pixels
        occluded (None): whether the object is occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self, label, xtl, ytl, xbr, ybr, occluded=None, attributes=None
    ):
        self.label = label
        self.xtl = xtl
        self.ytl = ytl
        self.xbr = xbr
        self.ybr = ybr
        CVATImageAnno.__init__(self, occluded=occluded, attributes=attributes)

    def to_detection(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the box.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label = self.label

        width, height = frame_size
        bounding_box = [
            self.xtl / width,
            self.ytl / height,
            (self.xbr - self.xtl) / width,
            (self.ybr - self.ytl) / height,
        ]

        attributes = self._to_attributes()

        return fol.Detection(
            label=label, bounding_box=bounding_box, **attributes
        )

    @classmethod
    def from_detection(cls, detection, metadata):
        """Creates a :class:`CVATImageBox` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            detection: a :class:`fiftyone.core.labels.Detection`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATImageBox`
        """
        label = detection.label

        width = metadata.width
        height = metadata.height
        x, y, w, h = detection.bounding_box
        xtl = int(round(x * width))
        ytl = int(round(y * height))
        xbr = int(round((x + w) * width))
        ybr = int(round((y + h) * height))

        occluded, attributes = cls._parse_attributes(detection)

        return cls(
            label, xtl, ytl, xbr, ybr, occluded=occluded, attributes=attributes
        )

    @classmethod
    def from_box_dict(cls, d):
        """Creates a :class:`CVATImageBox` from a ``<box>`` tag of a CVAT image
        annotation XML file.

        Args:
            d: a dict representation of a ``<box>`` tag

        Returns:
            a :class:`CVATImageBox`
        """
        label = d["@label"]

        xtl = int(round(float(d["@xtl"])))
        ytl = int(round(float(d["@ytl"])))
        xbr = int(round(float(d["@xbr"])))
        ybr = int(round(float(d["@ybr"])))

        occluded, attributes = cls._parse_anno_dict(d)

        return cls(
            label, xtl, ytl, xbr, ybr, occluded=occluded, attributes=attributes
        )


class CVATImagePolygon(CVATImageAnno, HasCVATPoints):
    """A polygon in CVAT image format.

    Args:
        label: the polygon label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the polygon
        occluded (None): whether the polygon is occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, label, points, occluded=None, attributes=None):
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATImageAnno.__init__(self, occluded=occluded, attributes=attributes)

    def to_polyline(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the polygon.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Polyline(
            label=label,
            points=[points],
            closed=True,
            filled=True,
            **attributes,
        )

    @classmethod
    def from_polyline(cls, polyline, metadata):
        """Creates a :class:`CVATImagePolygon` from a
        :class:`fiftyone.core.labels.Polyline`.

        If the :class:`fiftyone.core.labels.Polyline` is composed of multiple
        shapes, one :class:`CVATImagePolygon` per shape will be generated.

        Args:
            polyline: a :class:`fiftyone.core.labels.Polyline`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a list of :class:`CVATImagePolygon` instances
        """
        label = polyline.label

        if len(polyline.points) > 1:
            msg = (
                "Found polyline with more than one shape; generating separate "
                "annotations for each shape"
            )
            warnings.warn(msg)

        frame_size = (metadata.width, metadata.height)
        occluded, attributes = cls._parse_attributes(polyline)

        polylines = []
        for points in polyline.points:
            abs_points = cls._to_abs_points(points, frame_size)
            polylines.append(
                cls(
                    label, abs_points, occluded=occluded, attributes=attributes
                )
            )

        return polylines

    @classmethod
    def from_polygon_dict(cls, d):
        """Creates a :class:`CVATImagePolygon` from a ``<polygon>`` tag of a
        CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<polygon>`` tag

        Returns:
            a :class:`CVATImagePolygon`
        """
        label = d["@label"]
        points = cls._parse_cvat_points_str(d["@points"])
        occluded, attributes = cls._parse_anno_dict(d)

        return cls(label, points, occluded=occluded, attributes=attributes)


class CVATImagePolyline(CVATImageAnno, HasCVATPoints):
    """A polyline in CVAT image format.

    Args:
        label: the polyline label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the polyline
        occluded (None): whether the polyline is occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, label, points, occluded=None, attributes=None):
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATImageAnno.__init__(self, occluded=occluded, attributes=attributes)

    def to_polyline(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the polyline.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Polyline(
            label=label,
            points=[points],
            closed=False,
            filled=False,
            **attributes,
        )

    @classmethod
    def from_polyline(cls, polyline, metadata):
        """Creates a :class:`CVATImagePolyline` from a
        :class:`fiftyone.core.labels.Polyline`.

        If the :class:`fiftyone.core.labels.Polyline` is composed of multiple
        shapes, one :class:`CVATImagePolyline` per shape will be generated.

        Args:
            polyline: a :class:`fiftyone.core.labels.Polyline`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a list of :class:`CVATImagePolyline` instances
        """
        label = polyline.label

        if len(polyline.points) > 1:
            msg = (
                "Found polyline with more than one shape; generating separate "
                "annotations for each shape"
            )
            warnings.warn(msg)

        frame_size = (metadata.width, metadata.height)
        occluded, attributes = cls._parse_attributes(polyline)

        polylines = []
        for points in polyline.points:
            abs_points = cls._to_abs_points(points, frame_size)
            if abs_points and polyline.closed:
                abs_points.append(copy(abs_points[0]))

            polylines.append(
                cls(
                    label, abs_points, occluded=occluded, attributes=attributes
                )
            )

        return polylines

    @classmethod
    def from_polyline_dict(cls, d):
        """Creates a :class:`CVATImagePolyline` from a ``<polyline>`` tag of a
        CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<polyline>`` tag

        Returns:
            a :class:`CVATImagePolyline`
        """
        label = d["@label"]
        points = cls._parse_cvat_points_str(d["@points"])
        occluded, attributes = cls._parse_anno_dict(d)

        return cls(label, points, occluded=occluded, attributes=attributes)


class CVATImagePoints(CVATImageAnno, HasCVATPoints):
    """A set of keypoints in CVAT image format.

    Args:
        label: the keypoints label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the keypoints
        occluded (None): whether the keypoints are occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, label, points, occluded=None, attributes=None):
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATImageAnno.__init__(self, occluded=occluded, attributes=attributes)

    def to_keypoint(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Keypoint` representation of
        the points.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Keypoint`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Keypoint(label=label, points=points, **attributes)

    @classmethod
    def from_keypoint(cls, keypoint, metadata):
        """Creates a :class:`CVATImagePoints` from a
        :class:`fiftyone.core.labels.Keypoint`.

        Args:
            keypoint: a :class:`fiftyone.core.labels.Keypoint`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATImagePoints`
        """
        label = keypoint.label

        frame_size = (metadata.width, metadata.height)
        points = cls._to_abs_points(keypoint.points, frame_size)

        occluded, attributes = cls._parse_attributes(keypoint)

        return cls(label, points, occluded=occluded, attributes=attributes)

    @classmethod
    def from_points_dict(cls, d):
        """Creates a :class:`CVATImagePoints` from a ``<points>`` tag of a
        CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<points>`` tag

        Returns:
            a :class:`CVATImagePoints`
        """
        label = d["@label"]
        points = cls._parse_cvat_points_str(d["@points"])
        occluded, attributes = cls._parse_anno_dict(d)
        return cls(label, points, occluded=occluded, attributes=attributes)


class CVATTrack(object):
    """An annotation track in CVAT video format.

    Args:
        id: the ID of the track
        label: the label for the track
        width: the width of the video frames, in pixels
        height: the height of the video frames, in pixels
        boxes (None): a dict mapping frame numbers to :class:`CVATVideoBox`
            instances
        polygons (None): a dict mapping frame numbers to
            :class:`CVATVideoPolygon` instances
        polylines (None): a dict mapping frame numbers to
            :class:`CVATVideoPolyline` instances
        points (None): a dict mapping frame numbers to :class:`CVATVideoPoints`
            instances
    """

    def __init__(
        self,
        id,
        label,
        width,
        height,
        boxes=None,
        polygons=None,
        polylines=None,
        points=None,
    ):
        self.id = id
        self.label = label
        self.width = width
        self.height = height
        self.boxes = boxes or {}
        self.polygons = polygons or {}
        self.polylines = polylines or {}
        self.points = points or {}

    @property
    def has_boxes(self):
        """Whether this track has 2D boxes."""
        return bool(self.boxes)

    @property
    def has_polylines(self):
        """Whether this track has polygons or polylines."""
        return bool(self.polygons) or bool(self.polylines)

    @property
    def has_points(self):
        """Whether this track has keypoints."""
        return bool(self.points)

    def iter_annos(self):
        """Returns an iterator over the annotations in the track.

        Returns:
            an iterator that emits :class:`CVATVideoAnno` instances
        """
        return itertools.chain(
            self.boxes.values(),
            self.polygons.values(),
            self.polylines.values(),
            self.points.values(),
        )

    def to_labels(self):
        """Returns :class:`fiftyone.core.labels.Label` representations of the
        annotations.

        Returns:
            a dict mapping frame numbers to
            :class:`fiftyone.core.labels.Label` instances
        """
        frame_size = (self.width, self.height)

        labels = {}

        # Only one of these will actually contain labels

        for frame_number, box in self.boxes.items():
            if box.outside != 1:
                detection = box.to_detection(frame_size)
                detection.index = self.id
                labels[frame_number + 1] = detection

        for frame_number, polygon in self.polygons.items():
            if polygon.outside != 1:
                polyline = polygon.to_polyline(frame_size)
                polyline.index = self.id
                labels[frame_number + 1] = polyline

        for frame_number, polyline in self.polylines.items():
            if polyline.outside != 1:
                polyline = polyline.to_polyline(frame_size)
                polyline.index = self.id
                labels[frame_number + 1] = polyline

        for frame_number, points in self.points.items():
            if points.outside != 1:
                keypoint = points.to_keypoint(frame_size)
                keypoint.index = self.id
                labels[frame_number + 1] = keypoint

        return labels

    @classmethod
    def from_labels(cls, id, labels, frame_size):
        """Creates a :class:`CVATTrack` from a dictionary of labels.

        Args:
            id: the ID of the track
            labels: a dict mapping frame numbers to
                :class:`fiftyone.core.labels.Label` instances
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATTrack`
        """
        width, height = frame_size

        boxes = {}
        polygons = {}
        polylines = {}
        points = {}
        label = None
        for fn, _label in labels.items():
            label = _label.label

            if isinstance(_label, fol.Detection):
                boxes[fn - 1] = CVATVideoBox.from_detection(
                    fn, _label, frame_size
                )
            elif isinstance(_label, fol.Polyline):
                if _label.filled:
                    polygons[fn - 1] = CVATVideoPolygon.from_polyline(
                        fn, _label, frame_size
                    )
                else:
                    polylines[fn - 1] = CVATVideoPolyline.from_polyline(
                        fn, _label, frame_size
                    )
            elif isinstance(_label, fol.Keypoint):
                points[fn - 1] = CVATVideoPoints.from_keypoint(
                    fn, _label, frame_size
                )
            elif _label is not None:
                msg = "Ignoring unsupported label type '%s'" % _label.__class__
                warnings.warn(msg)

        # CVAT uses `outside=1` to mark the end of track segments, while
        # FiftyOne implicitly represents this by missing labels. So, we need to
        # convert to CVAT format here
        cls._add_outside_shapes(boxes)
        cls._add_outside_shapes(polygons)
        cls._add_outside_shapes(polylines)
        cls._add_outside_shapes(points)

        return cls(
            id,
            label,
            width,
            height,
            boxes=boxes,
            polygons=polygons,
            polylines=polylines,
            points=points,
        )

    @classmethod
    def from_track_dict(cls, d, frame_size):
        """Creates a :class:`CVATTrack` from a ``<track>`` tag of a CVAT video
        annotation XML file.

        Args:
            d: a dict representation of an ``<track>`` tag
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATTrack`
        """
        id = d["@id"]
        label = d["@label"]

        width, height = frame_size

        boxes = {}
        for bd in _ensure_list(d.get("box", [])):
            box = CVATVideoBox.from_box_dict(label, bd)
            boxes[box.frame] = box

        polygons = {}
        for pd in _ensure_list(d.get("polygon", [])):
            polygon = CVATVideoPolygon.from_polygon_dict(label, pd)
            polygons[polygon.frame] = polygon

        polylines = {}
        for pd in _ensure_list(d.get("polyline", [])):
            polyline = CVATVideoPolyline.from_polyline_dict(label, pd)
            polylines[polyline.frame] = polyline

        points = {}
        for pd in _ensure_list(d.get("points", [])):
            point = CVATVideoPoints.from_points_dict(label, pd)
            points[point.frame] = point

        return cls(
            id,
            label,
            width,
            height,
            boxes=boxes,
            polygons=polygons,
            polylines=polylines,
            points=points,
        )

    @staticmethod
    def _add_outside_shapes(shapes):
        if not shapes:
            return

        use_keyframes = any(s.keyframe for s in shapes.values())

        def _make_outside_shape(shape):
            shape = deepcopy(shape)
            shape.outside = 1
            if use_keyframes:
                shape.keyframe = 1

            return shape

        # Add "outside" shapes to represent gaps of >= 1 frame in tracks
        fns = sorted(shapes.keys())
        last_fn = fns[0]
        for fn in fns:
            if fn > last_fn + 1:
                shapes[last_fn + 1] = _make_outside_shape(shapes[last_fn])

            last_fn = fn

        # Always add an "outside" shape to the end of each track
        shapes[last_fn + 1] = _make_outside_shape(shapes[last_fn])


class CVATVideoAnno(object):
    """Mixin for annotations in CVAT video format.

    Args:
        outside (None): whether the object is outside (invisible)
        occluded (None): whether the object is occluded
        keyframe (None): whether the frame is a keyframe
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self, outside=None, occluded=None, keyframe=None, attributes=None
    ):
        self.outside = outside
        self.occluded = occluded
        self.keyframe = keyframe
        self.attributes = attributes or []

    def _to_attributes(self):
        attributes = {a.name: a.value for a in self.attributes}

        # We don't include `outside` here because shapes marked as `outside`
        # are completely omitted

        if self.occluded == 1:
            attributes["occluded"] = True

        if self.keyframe == 1:
            attributes["keyframe"] = True

        return attributes

    @staticmethod
    def _parse_attributes(label):
        attrs = dict(label.iter_attributes())

        outside = 0  # any FiftyOne label is implicitly not `outside`
        occluded = _to_int_bool(attrs.pop("occluded", None))
        keyframe = _to_int_bool(attrs.pop("keyframe", None))

        attributes = [
            CVATAttribute(k, v)
            for k, v in attrs.items()
            if _is_supported_attribute_type(v)
        ]

        return outside, occluded, keyframe, attributes

    @staticmethod
    def _parse_anno_dict(d):
        outside = _from_int_bool(d.get("@outside", None))
        occluded = _from_int_bool(d.get("@occluded", None))
        keyframe = _from_int_bool(d.get("@keyframe", None))

        attributes = []
        for attr in _ensure_list(d.get("attribute", [])):
            if "#text" in attr:
                name = attr["@name"].lstrip("@")
                if name == "label_id":
                    # We assume that this is a `label_id` exported from an
                    # CVAT annotation run created by our annotation API, which
                    # should be ignored since we're not using the API here
                    continue

                value = _parse_value(attr["#text"])
                attributes.append(CVATAttribute(name, value))

        return outside, occluded, keyframe, attributes


class CVATVideoBox(CVATVideoAnno):
    """An object bounding box in CVAT video format.

    Args:
        frame: the 0-based frame number
        label: the object label string
        xtl: the top-left x-coordinate of the box, in pixels
        ytl: the top-left y-coordinate of the box, in pixels
        xbr: the bottom-right x-coordinate of the box, in pixels
        ybr: the bottom-right y-coordinate of the box, in pixels
        outside (None): whether the object is outside (invisible)
        occluded (None): whether the object is occluded
        keyframe (None): whether the frame is a keyframe
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self,
        frame,
        label,
        xtl,
        ytl,
        xbr,
        ybr,
        outside=None,
        occluded=None,
        keyframe=None,
        attributes=None,
    ):
        self.frame = frame
        self.label = label
        self.xtl = xtl
        self.ytl = ytl
        self.xbr = xbr
        self.ybr = ybr
        CVATVideoAnno.__init__(
            self,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    def to_detection(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the box.

        Args:
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label = self.label

        width, height = frame_size
        bounding_box = [
            self.xtl / width,
            self.ytl / height,
            (self.xbr - self.xtl) / width,
            (self.ybr - self.ytl) / height,
        ]

        attributes = self._to_attributes()

        return fol.Detection(
            label=label, bounding_box=bounding_box, **attributes
        )

    @classmethod
    def from_detection(cls, frame_number, detection, frame_size):
        """Creates a :class:`CVATVideoBox` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            frame_number: the frame number
            detection: a :class:`fiftyone.core.labels.Detection`
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATVideoBox`
        """
        frame = frame_number - 1
        label = detection.label

        width, height = frame_size
        x, y, w, h = detection.bounding_box
        xtl = int(round(x * width))
        ytl = int(round(y * height))
        xbr = int(round((x + w) * width))
        ybr = int(round((y + h) * height))

        outside, occluded, keyframe, attributes = cls._parse_attributes(
            detection
        )

        return cls(
            frame,
            label,
            xtl,
            ytl,
            xbr,
            ybr,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    @classmethod
    def from_box_dict(cls, label, d):
        """Creates a :class:`CVATVideoBox` from a ``<box>`` tag of a CVAT video
        annotation XML file.

        Args:
            label: the object label
            d: a dict representation of a ``<box>`` tag

        Returns:
            a :class:`CVATVideoBox`
        """
        frame = int(d["@frame"])

        xtl = int(round(float(d["@xtl"])))
        ytl = int(round(float(d["@ytl"])))
        xbr = int(round(float(d["@xbr"])))
        ybr = int(round(float(d["@ybr"])))

        outside, occluded, keyframe, attributes = cls._parse_anno_dict(d)

        return cls(
            frame,
            label,
            xtl,
            ytl,
            xbr,
            ybr,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )


class CVATVideoPolygon(CVATVideoAnno, HasCVATPoints):
    """A polygon in CVAT video format.

    Args:
        frame: the 0-based frame number
        label: the polygon label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the polygon
        outside (None): whether the polygon is outside (invisible)
        occluded (None): whether the polygon is occluded
        keyframe (None): whether the frame is a keyframe
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self,
        frame,
        label,
        points,
        outside=None,
        occluded=None,
        keyframe=None,
        attributes=None,
    ):
        self.frame = frame
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATVideoAnno.__init__(
            self,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    def to_polyline(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the polygon.

        Args:
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Polyline(
            label=label,
            points=[points],
            closed=True,
            filled=True,
            **attributes,
        )

    @classmethod
    def from_polyline(cls, frame_number, polyline, frame_size):
        """Creates a :class:`CVATVideoPolygon` from a
        :class:`fiftyone.core.labels.Polyline`.

        Args:
            frame_number: the frame number
            polyline: a :class:`fiftyone.core.labels.Polyline`
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATVideoPolygon`
        """
        frame = frame_number - 1
        label = polyline.label

        points = _get_single_polyline_points(polyline)
        points = cls._to_abs_points(points, frame_size)

        outside, occluded, keyframe, attributes = cls._parse_attributes(
            polyline
        )

        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    @classmethod
    def from_polygon_dict(cls, label, d):
        """Creates a :class:`CVATVideoPolygon` from a ``<polygon>`` tag of a
        CVAT video annotation XML file.

        Args:
            label: the object label
            d: a dict representation of a ``<polygon>`` tag

        Returns:
            a :class:`CVATVideoPolygon`
        """
        frame = int(d["@frame"])
        points = cls._parse_cvat_points_str(d["@points"])
        outside, occluded, keyframe, attributes = cls._parse_anno_dict(d)
        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )


class CVATVideoPolyline(CVATVideoAnno, HasCVATPoints):
    """A polyline in CVAT video format.

    Args:
        frame: the 0-based frame number
        label: the polyline label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the polyline
        outside (None): whether the polyline is outside (invisible)
        occluded (None): whether the polyline is occluded
        keyframe (None): whether the frame is a keyframe
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self,
        frame,
        label,
        points,
        outside=None,
        occluded=None,
        keyframe=None,
        attributes=None,
    ):
        self.frame = frame
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATVideoAnno.__init__(
            self,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    def to_polyline(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the polyline.

        Args:
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Polyline(
            label=label,
            points=[points],
            closed=False,
            filled=False,
            **attributes,
        )

    @classmethod
    def from_polyline(cls, frame_number, polyline, frame_size):
        """Creates a :class:`CVATVideoPolyline` from a
        :class:`fiftyone.core.labels.Polyline`.

        Args:
            frame_number: the frame number
            polyline: a :class:`fiftyone.core.labels.Polyline`
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATVideoPolyline`
        """
        frame = frame_number - 1
        label = polyline.label

        points = _get_single_polyline_points(polyline)
        points = cls._to_abs_points(points, frame_size)
        if points and polyline.closed:
            points.append(copy(points[0]))

        outside, occluded, keyframe, attributes = cls._parse_attributes(
            polyline
        )

        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    @classmethod
    def from_polyline_dict(cls, label, d):
        """Creates a :class:`CVATVideoPolyline` from a ``<polyline>`` tag of a
        CVAT video annotation XML file.

        Args:
            label: the object label
            d: a dict representation of a ``<polyline>`` tag

        Returns:
            a :class:`CVATVideoPolyline`
        """
        frame = int(d["@frame"])
        points = cls._parse_cvat_points_str(d["@points"])
        outside, occluded, keyframe, attributes = cls._parse_anno_dict(d)
        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )


class CVATVideoPoints(CVATVideoAnno, HasCVATPoints):
    """A set of keypoints in CVAT video format.

    Args:
        frame: the 0-based frame number
        label: the keypoints label string
        points: a list of ``(x, y)`` pixel coordinates defining the keypoints
        outside (None): whether the keypoints is outside (invisible)
        occluded (None): whether the keypoints are occluded
        keyframe (None): whether the frame is a keyframe
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self,
        frame,
        label,
        points,
        outside=None,
        occluded=None,
        keyframe=None,
        attributes=None,
    ):
        self.frame = frame
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATVideoAnno.__init__(
            self,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    def to_keypoint(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Keypoint` representation of
        the points.

        Args:
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`fiftyone.core.labels.Keypoint`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Keypoint(label=label, points=points, **attributes)

    @classmethod
    def from_keypoint(cls, frame_number, keypoint, frame_size):
        """Creates a :class:`CVATVideoPoints` from a
        :class:`fiftyone.core.labels.Keypoint`.

        Args:
            frame_number: the frame number
            keypoint: a :class:`fiftyone.core.labels.Keypoint`
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATVideoPoints`
        """
        frame = frame_number - 1
        label = keypoint.label
        points = cls._to_abs_points(keypoint.points, frame_size)
        outside, occluded, keyframe, attributes = cls._parse_attributes(
            keypoint
        )
        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    @classmethod
    def from_points_dict(cls, label, d):
        """Creates a :class:`CVATVideoPoints` from a ``<points>`` tag of a
        CVAT video annotation XML file.

        Args:
            label: the object label
            d: a dict representation of a ``<points>`` tag

        Returns:
            a :class:`CVATVideoPoints`
        """
        frame = int(d["@frame"])
        points = cls._parse_cvat_points_str(d["@points"])
        outside, occluded, keyframe, attributes = cls._parse_anno_dict(d)
        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )


class CVATAttribute(object):
    """An attribute in CVAT image format.

    Args:
        name: the attribute name
        value: the attribute value
    """

    def __init__(self, name, value):
        self.name = name
        self.value = value

    def to_eta_attribute(self):
        """Returns an ``eta.core.data.Attribute`` representation of the
        attribute.

        Returns:
            an ``eta.core.data.Attribute``
        """
        if isinstance(self.value, bool):
            return etad.BooleanAttribute(self.name, self.value)

        if etau.is_numeric(self.value):
            return etad.NumericAttribute(self.name, self.value)

        return etad.CategoricalAttribute(self.name, self.value)

    def to_attribute(self):
        """Returns a :class:`fiftyone.core.labels.Attribute` representation of
        the attribute.
        Returns:
            a :class:`fiftyone.core.labels.Attribute`
        """
        if isinstance(self.value, bool):
            return fol.BooleanAttribute(value=self.value)

        if etau.is_numeric(self.value):
            return fol.NumericAttribute(value=self.value)

        return fol.CategoricalAttribute(value=self.value)


class CVATImageAnnotationWriter(object):
    """Class for writing annotations in CVAT image format.

    See :ref:`this page <CVATImageDataset-export>` for format details.
    """

    def __init__(self):
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(foc.RESOURCES_DIR),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.template = environment.get_template(
            "cvat_image_annotation_template.xml"
        )

    def write(
        self, cvat_task_labels, cvat_images, xml_path, id=None, name=None
    ):
        """Writes the annotations to disk.

        Args:
            cvat_task_labels: a :class:`CVATTaskLabels` instance
            cvat_images: a list of :class:`CVATImage` instances
            xml_path: the path to write the annotations XML file
            id (None): an ID for the task
            name (None): a name for the task
        """
        now = datetime.now().isoformat()
        xml_str = self.template.render(
            {
                "id": id,
                "name": name,
                "size": len(cvat_images),
                "created": now,
                "updated": now,
                "labels": cvat_task_labels.labels,
                "dumped": now,
                "images": cvat_images,
            }
        )
        etau.write_file(xml_str, xml_path)


class CVATVideoAnnotationWriter(object):
    """Class for writing annotations in CVAT video format.

    See :ref:`this page <CVATVideoDataset-export>` for format details.
    """

    def __init__(self):
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(foc.RESOURCES_DIR),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.template = environment.get_template(
            "cvat_video_interpolation_template.xml"
        )

    def write(
        self,
        cvat_task_labels,
        cvat_tracks,
        metadata,
        xml_path,
        id=None,
        name=None,
    ):
        """Writes the annotations to disk.

        Args:
            cvat_task_labels: a :class:`CVATTaskLabels` instance
            cvat_tracks: a list of :class:`CVATTrack` instances
            metadata: the :class:`fiftyone.core.metadata.VideoMetadata`
                instance for the video
            xml_path: the path to write the annotations XML file
            id (None): an ID for the task
            name (None): a name for the task
        """
        now = datetime.now().isoformat()
        xml_str = self.template.render(
            {
                "id": id,
                "name": name,
                "size": metadata.total_frame_count,
                "created": now,
                "updated": now,
                "width": metadata.frame_width,
                "height": metadata.frame_height,
                "labels": cvat_task_labels.labels,
                "dumped": now,
                "tracks": cvat_tracks,
            }
        )
        etau.write_file(xml_str, xml_path)


class CVATBackendConfig(foua.AnnotationBackendConfig):
    """Class for configuring :class:`CVATBackend` instances.

    Args:
        name: the name of the backend
        label_schema: a dictionary containing the description of label fields,
            classes and attribute to annotate
        media_field ("filepath"): string field name containing the paths to
            media files on disk to upload
        url (None): the url of the CVAT server
        username (None): the CVAT username
        email (None): the CVAT email
        password (None): the CVAT password
        headers (None): an optional dict of headers to add to all CVAT API
            requests
        task_size (None): an optional maximum number of images to upload per
            task. Videos are always uploaded one per task
        segment_size (None): maximum number of images per job. Not applicable
            to videos
        image_quality (75): an int in ``[0, 100]`` determining the image
            quality to upload to CVAT
        use_cache (True): whether to use a cache when uploading data. Using a
            cache reduces task creation time as data will be processed
            on-the-fly and stored in the cache when requested
        use_zip_chunks (True): when annotating videos, whether to upload video
            frames in smaller chunks. Setting this option to ``False`` may
            result in reduced video quality in CVAT due to size limitations on
            ZIP files that can be uploaded to CVAT
        chunk_size (None): the number of frames to upload per ZIP chunk
        task_assignee (None): the username(s) to which the task(s) were
            assigned. This argument can be a list of usernames when annotating
            videos as each video is uploaded to a separate task
        job_assignees (None): a list of usernames to which jobs were assigned
        job_reviewers (None): a list of usernames to which job reviews were
            assigned. Only available in CVAT v1 servers
        project_name (None): an optional project name to which to upload the
            created CVAT task. If a project with this name is found, it will be
            used, otherwise a new project with this name is created. By
            default, no project is used
        project_id (None): an optional ID of an existing CVAT project to which
            to upload the annotation tasks. By default, no project is used
        task_name (None): an optional task name to use for the created CVAT
            task
        occluded_attr (None): an optional attribute name containing existing
            occluded values and/or in which to store downloaded occluded values
            for all objects in the annotation run
        group_id_attr (None): an optional attribute name containing existing
            group ids and/or in which to store downloaded group ids
            for all objects in the annotation run
        issue_tracker (None): URL(s) of an issue tracker to link to the created
            task(s). This argument can be a list of URLs when annotating videos
            or when using ``task_size`` and generating multiple tasks
        organization (None): the name of the organization to use when sending
            requests to CVAT
        frame_start (None): nonnegative integer(s) defining the first frame of
            videos to upload when creating video tasks. Supported values are:

                -   ``integer``: the first frame to upload for each video
                -   ``list``: a list of first frame integers corresponding to
                    videos in the given samples
                -   ``dict``: a dictionary mapping sample filepaths to first
                    frame integers to use for the corresponding videos

        frame_stop (None): nonnegative integer(s) defining the last frame of
            videos to upload when creating video tasks. Supported values are:

                -   ``integer``: the last frame to upload for each video
                -   ``list``: a list of last frame integers corresponding to
                    videos in the given samples
                -   ``dict``: a dictionary mapping sample filepaths to last
                    frame integers to use for the corresponding videos

        frame_step (None): positive integer(s) defining which frames to sample
            when creating video tasks. Supported values are:

                -   ``integer``: the frame step to apply to each video task
                -   ``list``: a list of frame step integers corresponding to
                    videos in the given samples
                -   ``dict``: a dictionary mapping sample filepaths to frame
                    step integers to use for the corresponding videos

            Note that this argument cannot be provided when uploading existing
            tracks
    """

    def __init__(
        self,
        name,
        label_schema,
        media_field="filepath",
        url=None,
        username=None,
        email=None,
        password=None,
        headers=None,
        task_size=None,
        segment_size=None,
        image_quality=75,
        use_cache=True,
        use_zip_chunks=True,
        chunk_size=None,
        task_assignee=None,
        job_assignees=None,
        job_reviewers=None,
        project_name=None,
        project_id=None,
        task_name=None,
        occluded_attr=None,
        group_id_attr=None,
        issue_tracker=None,
        organization=None,
        frame_start=None,
        frame_stop=None,
        frame_step=None,
        **kwargs,
    ):
        super().__init__(name, label_schema, media_field=media_field, **kwargs)
        self.url = url
        self.task_size = task_size
        self.segment_size = segment_size
        self.image_quality = image_quality
        self.use_cache = use_cache
        self.use_zip_chunks = use_zip_chunks
        self.chunk_size = chunk_size
        self.task_assignee = task_assignee
        self.job_assignees = job_assignees
        self.job_reviewers = job_reviewers
        self.project_name = project_name
        self.project_id = project_id
        self.task_name = task_name
        self.occluded_attr = occluded_attr
        self.group_id_attr = group_id_attr
        self.issue_tracker = issue_tracker
        self.organization = organization
        self.frame_start = _validate_frame_arg(frame_start, "frame_start")
        self.frame_stop = _validate_frame_arg(frame_stop, "frame_stop")
        self.frame_step = _validate_frame_arg(frame_step, "frame_step")

        # store privately so these aren't serialized
        self._username = username
        self._email = email
        self._password = password
        self._headers = headers

    @property
    def username(self):
        return self._username

    @username.setter
    def username(self, value):
        self._username = value

    @property
    def email(self):
        return self._email

    @email.setter
    def email(self, value):
        self._email = value

    @property
    def password(self):
        return self._password

    @password.setter
    def password(self, value):
        self._password = value

    @property
    def headers(self):
        return self._headers

    @headers.setter
    def headers(self, value):
        self._headers = value

    def load_credentials(
        self, url=None, username=None, password=None, email=None, headers=None
    ):
        self._load_parameters(
            url=url,
            username=username,
            password=password,
            email=email,
            headers=headers,
        )


class CVATBackend(foua.AnnotationBackend):
    """Class for interacting with the CVAT annotation backend."""

    @property
    def supported_media_types(self):
        return [fom.IMAGE, fom.VIDEO]

    @property
    def supported_label_types(self):
        return [
            "classification",
            "classifications",
            "detection",
            "detections",
            "instance",
            "instances",
            "polyline",
            "polylines",
            "polygon",
            "polygons",
            "keypoint",
            "keypoints",
            "segmentation",
            "scalar",
        ]

    @property
    def supported_scalar_types(self):
        return [
            fof.IntField,
            fof.FloatField,
            fof.StringField,
            fof.BooleanField,
        ]

    @property
    def supported_attr_types(self):
        return [
            "text",
            "select",
            "radio",
            "checkbox",
            "occluded",
            "group_id",
        ]

    @property
    def supports_clips_views(self):
        return True

    @property
    def supports_keyframes(self):
        return True

    @property
    def supports_video_sample_fields(self):
        return False

    @property
    def requires_label_schema(self):
        return False  # schemas can be inferred from existing CVAT projects

    def recommend_attr_tool(self, name, value):
        if isinstance(value, bool):
            if name == "occluded":
                return {"type": "occluded"}

            return {"type": "checkbox", "values": [True, False]}

        if isinstance(value, int):
            if name == "group_id":
                return {"type": "group_id"}

        return {"type": "text", "values": []}

    def requires_attr_values(self, attr_type):
        attrs = ("select", "radio")
        api = self.connect_to_api()
        if api.server_version >= Version("2.5") and attr_type in (
            "text",
            "checkbox",
        ):
            logger.warning(
                "As of CVAT v2.5, text attributes now require an empty list of"
                " values and checkbox require a [True, False] list of values "
                "to be provided"
            )
            attrs = ("select", "radio", "text", "checkbox")

        return attr_type in attrs

    def _connect_to_api(self):
        return CVATAnnotationAPI(
            self.config.name,
            self.config.url,
            username=self.config.username,
            email=self.config.email,
            password=self.config.password,
            headers=self.config.headers,
            organization=self.config.organization,
        )

    def upload_annotations(self, samples, anno_key, launch_editor=False):
        api = self.connect_to_api()
        results = api.upload_samples(samples, anno_key, self)

        if launch_editor:
            results.launch_editor()

        return results

    def download_annotations(self, results):
        api = self.connect_to_api()

        logger.info("Downloading labels from CVAT...")
        annotations = api.download_annotations(results)
        logger.info("Download complete")

        return annotations


class CVATAnnotationResults(foua.AnnotationResults):
    """Class that stores all relevant information needed to monitor the
    progress of an annotation run sent to CVAT and download the results.
    """

    def __init__(
        self,
        samples,
        config,
        anno_key,
        id_map,
        server_id_map,
        project_ids,
        task_ids,
        job_ids,
        frame_id_map,
        labels_task_map,
        backend=None,
    ):
        super().__init__(samples, config, anno_key, id_map, backend=backend)

        self.server_id_map = server_id_map
        self.project_ids = project_ids
        self.task_ids = task_ids
        self.job_ids = job_ids
        self.frame_id_map = frame_id_map
        self.labels_task_map = labels_task_map

    def launch_editor(self):
        """Launches the CVAT editor and loads the first task for this
        annotation run.
        """
        api = self.connect_to_api()
        task_id = self.task_ids[0]
        job_ids = self.job_ids

        if job_ids and job_ids[task_id]:
            editor_url = api.base_job_url(task_id, job_ids[task_id][0])
        else:
            editor_url = api.base_task_url(task_id)

        logger.info("Launching editor at '%s'...", editor_url)
        api.launch_editor(url=editor_url)

    def get_status(self):
        """Gets the status of the assigned tasks and jobs.

        Returns:
            a dict of status information
        """
        return self._get_status()

    def print_status(self):
        """Prints the status of the assigned tasks and jobs."""
        self._get_status(log=True)

    def delete_tasks(self, task_ids):
        """Deletes the given tasks from both the CVAT server and this run.

        Args:
            task_ids: an iterable of task IDs
        """
        api = self.connect_to_api()

        api.delete_tasks(task_ids)
        self._forget_tasks(task_ids)

    def cleanup(self):
        """Deletes all tasks and created projects associated with this run."""
        api = self.connect_to_api()

        if self.task_ids:
            logger.info("Deleting tasks...")
            api.delete_tasks(self.task_ids)

        if self.project_ids:
            projects_to_delete = api.get_empty_projects(self.project_ids)
            if projects_to_delete:
                logger.info("Deleting projects...")
                api.delete_projects(self.project_ids)

        self.project_ids = []
        self.task_ids = []
        self.job_ids = {}
        self.id_map = {}
        self.frame_id_map = {}

    def _forget_tasks(self, task_ids):
        for task_id in task_ids:
            self.job_ids.pop(task_id, None)
            _frame_id_map = self.frame_id_map.pop(task_id, {})
            sample_ids = set(fd["sample_id"] for fd in _frame_id_map.values())
            for _id_map in self.id_map.values():
                for sample_id in sample_ids:
                    _id_map.pop(sample_id, None)

        task_ids = set(task_ids)
        self.task_ids = [_id for _id in self.task_ids if _id not in task_ids]

    def _get_status(self, log=False):
        api = self.connect_to_api()
        status = {}
        for label_field, task_ids in self.labels_task_map.items():
            if log:
                logger.info("\nStatus for label field '%s':\n", label_field)

            status[label_field] = {}

            for task_id in task_ids:
                task_url = api.task_url(task_id)

                try:
                    response = api.get(task_url, print_error_info=False)
                    task_json = response.json()
                except:
                    logger.warning(
                        "\tFailed to get info for task '%d' at %s",
                        task_id,
                        task_url,
                    )
                    continue

                task_name = task_json["name"]
                task_status = task_json["status"]
                task_assignee = task_json["assignee"]
                task_updated = task_json["updated_date"]

                if log:
                    logger.info(
                        "\tTask %d (%s):\n"
                        "\t\tStatus: %s\n"
                        "\t\tAssignee: %s\n"
                        "\t\tLast updated: %s\n"
                        "\t\tURL: %s\n",
                        task_id,
                        task_name,
                        task_status,
                        task_assignee,
                        task_updated,
                        api.base_task_url(task_id),
                    )

                jobs_info = {}
                for job_id in self.job_ids[task_id]:
                    job_url = api.taskless_job_url(job_id)

                    try:
                        response = api.get(job_url, print_error_info=False)
                        job_json = response.json()
                    except:
                        logger.warning(
                            "\t\tFailed to get info for job '%d' at %s",
                            job_id,
                            job_url,
                        )
                        continue

                    jobs_info[job_id] = job_json

                    if log:
                        logger.info(
                            "\t\tJob %d:\n"
                            "\t\t\tStatus: %s\n"
                            "\t\t\tAssignee: %s\n"
                            "\t\t\tReviewer: %s\n",
                            job_id,
                            job_json["status"],
                            job_json["assignee"],
                            job_json.get("reviewer", None),
                        )

                status[label_field][task_id] = {
                    "name": task_name,
                    "status": task_status,
                    "assignee": task_assignee,
                    "last_updated": task_updated,
                    "jobs": jobs_info,
                }

        return status

    @classmethod
    def _from_dict(cls, d, samples, config, anno_key):
        # int keys were serialized as strings...
        job_ids = {int(task_id): ids for task_id, ids in d["job_ids"].items()}
        frame_id_map = {
            int(task_id): {
                int(frame_id): frame_data
                for frame_id, frame_data in frame_map.items()
            }
            for task_id, frame_map in d["frame_id_map"].items()
        }

        return cls(
            samples,
            config,
            anno_key,
            d["id_map"],
            d.get("server_id_map", {}),
            d.get("project_ids", []),
            d["task_ids"],
            job_ids,
            frame_id_map,
            d["labels_task_map"],
        )


class CVATAnnotationAPI(foua.AnnotationAPI):
    """A class to facilitate connection to and management of tasks in CVAT.

    On initialization, this class constructs a session based on the provided
    server url and credentials.

    This API provides methods to easily get, put, post, patch, and delete tasks
    and jobs through the formatted urls specified by the CVAT REST API.

    Additionally, samples and label schemas can be uploaded and annotations
    downloaded through this class.

    Args:
        name: the name of the backend
        url: url of the CVAT server
        username (None): the CVAT username
        email (None): the CVAT email
        password (None): the CVAT password
        headers (None): an optional dict of headers to add to all requests
        organization (None): the name of the organization to use when sending
            requests to CVAT
    """

    def __init__(
        self,
        name,
        url,
        username=None,
        email=None,
        password=None,
        headers=None,
        organization=None,
    ):
        self._name = name
        self._url = url.rstrip("/")
        self._username = username
        self._email = email
        self._password = password
        self._headers = headers
        self._organization = organization

        self._server_version = None
        self._session = None
        self._user_id_map = {}
        self._project_id_map = {}

        self._setup()

    @property
    def server_version(self):
        return self._server_version

    @property
    def base_url(self):
        return self._url

    @property
    def base_api_url(self):
        if self._server_version.major == 1:
            return "%s/api/v1" % self.base_url

        return "%s/api" % self.base_url

    @property
    def login_url(self):
        return "%s/auth/login" % self.base_api_url

    @property
    def about_url(self):
        return "%s/server/about" % self.base_api_url

    @property
    def users_url(self):
        return "%s/users" % self.base_api_url

    @property
    def projects_url(self):
        return "%s/projects" % self.base_api_url

    def projects_page_url(self, page_number):
        return "%s/projects?page=%d" % (self.base_api_url, page_number)

    def project_url(self, project_id):
        return "%s/%d" % (self.projects_url, project_id)

    @property
    def tasks_url(self):
        return "%s/tasks" % self.base_api_url

    def tasks_page_url(self, page_number):
        return "%s/tasks?page=%d" % (self.base_api_url, page_number)

    def task_url(self, task_id):
        return "%s/%d" % (self.tasks_url, task_id)

    def task_status_url(self, task_id):
        return "%s/status" % self.task_url(task_id)

    def task_data_url(self, task_id):
        return "%s/data" % self.task_url(task_id)

    def task_data_download_url(
        self, task_id, frame_id, data_type="frame", quality="original"
    ):
        return "%s/data?type=%s&quality=%s&number=%d" % (
            self.task_url(task_id),
            data_type,
            quality,
            frame_id,
        )

    def task_data_meta_url(self, task_id):
        return "%s/data/meta" % self.task_url(task_id)

    def task_annotation_url(self, task_id):
        return "%s/annotations" % self.task_url(task_id)

    def task_annotation_formatted_url(
        self,
        task_id,
        anno_filepath,
        anno_format="CVAT 1.1",
    ):
        return "%s/annotations?format=%s&filename=%s" % (
            self.task_url(task_id),
            anno_format,
            anno_filepath,
        )

    def labels_url(self, task_id):
        # server_version >= 2.4 only
        return "%s/labels?task_id=%d" % (self.base_api_url, task_id)

    def jobs_url(self, task_id):
        if self._server_version >= Version("2.4"):
            return "%s/jobs?task_id=%d" % (self.base_api_url, task_id)
        else:
            return "%s/jobs" % self.task_url(task_id)

    def job_url(self, task_id, job_id):
        if self._server_version >= Version("2.4"):
            return self.taskless_job_url(job_id)
        else:
            return "%s/%d" % (self.jobs_url(task_id), job_id)

    def job_annotation_url(self, job_id):
        return "%s/annotations" % self.taskless_job_url(job_id)

    def taskless_job_url(self, job_id):
        return "%s/jobs/%d" % (self.base_api_url, job_id)

    def base_task_url(self, task_id):
        return "%s/tasks/%d" % (self.base_url, task_id)

    def base_job_url(self, task_id, job_id):
        return "%s/tasks/%d/jobs/%d" % (self.base_url, task_id, job_id)

    def task_id_search_url(self, task_id):
        return "%s/tasks?id=%d" % (self.base_api_url, task_id)

    def user_search_url(self, username):
        return "%s/users?search=%s" % (self.base_api_url, username)

    def project_search_url(self, project_name):
        return "%s/projects?search=%s" % (self.base_api_url, project_name)

    def project_id_search_url(self, project_id):
        return "%s/projects?id=%d" % (self.base_api_url, project_id)

    @property
    def assignee_key(self):
        if self._server_version.major == 1:
            return "assignee_id"

        return "assignee"

    def _parse_reviewers(self, job_reviewers):
        if self._server_version.major > 1 and job_reviewers is not None:
            logger.warning("CVAT v2 servers do not support `job_reviewers`")
            return None

        return job_reviewers

    def _setup(self):
        if not self._url:
            raise ValueError(
                "You must provide/configure the `url` of the CVAT server"
            )

        username = self._username
        password = self._password
        email = self._email

        if username is None or password is None:
            username, password = self._prompt_username_password(
                self._name, username=username, password=password
            )

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        self._session = requests.Session()

        if self._headers:
            # pylint: disable=too-many-function-args
            self._session.headers.update(self._headers)

        self._server_version = Version("2")

        try:
            self._login(username, password, email=email)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code != 404:
                raise e

            self._server_version = Version("1")
            self._login(username, password, email=email)

        self._add_referer()
        self._add_organization()

        try:
            response = self.get(self.about_url).json()
            ver = Version(response["version"])
            if ver.major != self._server_version.major:
                logger.warning(
                    "CVAT server major versions don't match: %s vs %s",
                    ver.major,
                    self._server_version.major,
                )

            self._server_version = ver
        except Exception as e:
            logger.debug(
                "Failed to access or parse CVAT server version: %s", e
            )

        logger.debug("CVAT server version: %s", self._server_version)

    def _add_referer(self):
        if "Referer" not in self._session.headers:
            self._session.headers["Referer"] = self.login_url

    def _add_organization(self):
        if (
            "X-Organization" not in self._session.headers
            and self._organization
        ):
            self._session.headers["X-Organization"] = self._organization

    def close(self):
        self._session.close()

    def _login(self, username, password, email=None):
        payload = {
            "username": username,
            "password": password,
        }
        if email is not None:
            payload["email"] = email

        response = self._make_request(
            self._session.post,
            self.login_url,
            print_error_info=False,
            json=payload,
        )

        if "csrftoken" in response.cookies:
            self._session.headers["X-CSRFToken"] = response.cookies[
                "csrftoken"
            ]

    def _make_request(
        self, request_method, url, print_error_info=True, **kwargs
    ):
        response = request_method(url, verify=False, **kwargs)
        if print_error_info:
            self._validate(response, kwargs)
        else:
            response.raise_for_status()

        return response

    def get(self, url, **kwargs):
        """Sends a GET request to the given CVAT API URL.

        Args:
            url: the url
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        return self._make_request(self._session.get, url, **kwargs)

    def patch(self, url, **kwargs):
        """Sends a PATCH request to the given CVAT API URL.

        Args:
            url: the url
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        return self._make_request(self._session.patch, url, **kwargs)

    def post(self, url, **kwargs):
        """Sends a POST request to the given CVAT API URL.

        Args:
            url: the url
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        return self._make_request(self._session.post, url, **kwargs)

    def put(self, url, **kwargs):
        """Sends a PUT request to the given CVAT API URL.

        Args:
            url: the url
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        return self._make_request(self._session.put, url, **kwargs)

    def delete(self, url, **kwargs):
        """Sends a DELETE request to the given CVAT API URL.

        Args:
            url: the url to send the request to
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        return self._make_request(self._session.delete, url, **kwargs)

    def get_user_id(self, username):
        """Retrieves the CVAT user ID for the given username.

        Args:
            username: the username

        Returns:
            the user ID, or None if the user was not found
        """
        user_id = self._get_value_update_map(
            username,
            self._user_id_map,
            "username",
            self.user_search_url,
        )

        if username is not None and user_id is None:
            logger.warning("User '%s' not found", username)

        return user_id

    def get_project_id(self, project_name):
        """Retrieves the CVAT project ID for the first instance of the given
        project name.

        Args:
            project_name: the name of the project

        Returns:
            the project ID, or None if no project with the given name was found
        """
        return self._get_value_update_map(
            project_name,
            self._project_id_map,
            "name",
            self.project_search_url,
        )

    def get_project_name(self, project_id):
        """Retrieves the CVAT project name for the given project ID.

        Args:
            project_id: the ID of the project

        Returns:
            the project name, or None if no project with the given ID was found
        """
        id_map = {i: n for n, i in self._project_id_map.items()}
        project_name = id_map.get(project_id)
        if project_name:
            return project_name

        return self._get_value_from_search(
            self.project_id_search_url,
            project_id,
            "id",
            "name",
        )

    def get_empty_projects(self, project_ids):
        """Check all given project ids to determine if they are empty or if
        they contain at least one task.

        Args:
            project_ids: a list of project ids to check

        Returns:
            a list of empty project ids
        """
        return [pid for pid in project_ids if self._is_empty_project(pid)]

    def _is_empty_project(self, project_id):
        if not self.project_exists(project_id):
            return True

        resp = self.get(self.project_url(project_id)).json()
        return not resp["tasks"]

    def create_project(self, name, schema=None):
        """Creates a project on the CVAT server using the given label schema.

        Args:
            name: a name for the project
            schema (None): the label schema to use for the created project

        Returns:
            the ID of the created project in CVAT
        """
        if schema is None:
            schema = {}

        labels = [
            {"name": name, "attributes": list(attributes.values())}
            for name, attributes in schema.items()
        ]

        project_json = {
            "name": name,
            "labels": labels,
        }

        project_resp = self.post(self.projects_url, json=project_json).json()
        return project_resp["id"]

    def list_projects(self):
        """Returns the list of project IDs.

        Returns:
            the list of project IDs
        """
        return self._get_paginated_results(
            self.projects_url, get_page_url=self.projects_page_url, value="id"
        )

    def project_exists(self, project_id):
        """Checks if the given project exists.

        Args:
            project_id: the project ID

        Returns:
            True/False
        """
        try:
            response = self.get(
                self.project_url(project_id), print_error_info=False
            )
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return False
            else:
                raise e

        return True

    def delete_project(self, project_id):
        """Deletes the given project from the CVAT server.

        Args:
            project_id: the project ID
        """
        if self.project_exists(project_id):
            self.delete(self.project_url(project_id))
            project_name = self.get_project_name(project_id)
            if project_name is not None:
                self._project_id_map.pop(project_name, None)

    def delete_projects(self, project_ids, progress=None):
        """Deletes the given projects from the CVAT server.

        Args:
            project_ids: an iterable of project IDs
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
        """
        with fou.ProgressBar(progress=progress) as pb:
            for project_id in pb(list(project_ids)):
                self.delete_project(project_id)

    def get_project_tasks(self, project_id):
        """Returns the IDs of the tasks in the given project.

        Args:
            project_id: a project ID

        Returns:
            the list of task IDs
        """
        resp = self.get(self.project_url(project_id)).json()
        val = resp.get("tasks", [])

        if self._server_version >= Version("2.4"):
            tasks = self._get_paginated_results(val["url"])
            tasks = [x["id"] for x in tasks]
        else:
            tasks = []
            for task in val:
                if isinstance(task, int):
                    # For v2 servers, task ids are stored directly as an array
                    # of integers
                    tasks.append(task)
                else:
                    # For v1 servers, project tasks are dictionaries we need to
                    # extract "id" from
                    tasks.append(task["id"])

        return tasks

    def create_task(
        self,
        name,
        schema=None,
        segment_size=None,
        image_quality=75,
        task_assignee=None,
        project_id=None,
        issue_tracker=None,
    ):
        """Creates a task on the CVAT server using the given label schema.

        Args:
            name: a name for the task
            schema (None): the label schema to use for the created task
            segment_size (None): maximum number of images to load into a job.
                Not applicable to videos
            image_quality (75): an int in ``[0, 100]`` determining the image
                quality to upload to CVAT
            task_assignee (None): the username to assign the created task(s)
            project_id (None): the ID of a project to which upload the task
            issue_tracker (None): the URL of an issue tracker to link the task

        Returns:
            a tuple of

            -   **task_id**: the ID of the created task in CVAT
            -   **class_id_map**: a dictionary mapping the IDs assigned to
                classes by CVAT
            -   **attr_id_map**: a dictionary mapping the IDs assigned to
                attributes by CVAT for every class
        """
        task_json = {
            "name": name,
            "image_quality": image_quality,
        }

        if project_id is not None:
            task_json.update({"labels": [], "project_id": project_id})
        else:
            if schema is None:
                schema = {}

            labels = [
                {"name": name, "attributes": list(attributes.values())}
                for name, attributes in schema.items()
            ]

            task_json.update({"labels": labels})

        if segment_size is not None:
            task_json["segment_size"] = segment_size

        if issue_tracker is not None:
            task_json["bug_tracker"] = issue_tracker

        task_id, labels = self._get_task_id_labels_json(task_json)

        # @todo: see _get_attr_class_maps
        class_id_map = {}
        attr_id_map = {}
        for label in labels:
            class_id = label["id"]
            class_id_map[label["name"]] = class_id
            attr_id_map[class_id] = {}
            for attr in label["attributes"]:
                attr_name = attr["name"]
                attr_id = attr["id"]
                attr_id_map[class_id][attr_name] = attr_id

        if task_assignee is not None:
            user_id = self.get_user_id(task_assignee)
            if user_id is not None:
                task_patch = {"assignee_id": self.get_user_id(task_assignee)}
                self.patch(self.task_url(task_id), json=task_patch)

        return task_id, class_id_map, attr_id_map

    def list_tasks(self):
        """Returns the list of task IDs.

        Returns:
            the list of task IDs
        """
        return self._get_paginated_results(
            self.tasks_url, get_page_url=self.tasks_page_url, value="id"
        )

    def task_exists(self, task_id):
        """Checks if the given task exists.

        Args:
            task_id: the task ID

        Returns:
            True/False
        """
        try:
            response = self.get(
                self.task_status_url(task_id), print_error_info=False
            )
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return False
            else:
                raise e

        return True

    def delete_task(self, task_id):
        """Deletes the given task from the CVAT server.

        Args:
            task_id: the task ID
        """
        if self.task_exists(task_id):
            self.delete(self.task_url(task_id))

    def delete_tasks(self, task_ids, progress=None):
        """Deletes the given tasks from the CVAT server.

        Args:
            task_ids: an iterable of task IDs
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
        """
        with fou.ProgressBar(progress=progress) as pb:
            for task_id in pb(list(task_ids)):
                self.delete_task(task_id)

    def launch_editor(self, url=None):
        """Launches the CVAT editor in your default web browser.

        Args:
            url (None): an optional URL to open. By default, the base URL of
                the server is opened
        """
        if url is None:
            url = self.base_url

        webbrowser.open(url, new=2)

    def upload_data(
        self,
        task_id,
        paths,
        image_quality=75,
        use_cache=True,
        use_zip_chunks=True,
        chunk_size=None,
        job_assignees=None,
        job_reviewers=None,
        frame_start=None,
        frame_stop=None,
        frame_step=None,
    ):
        """Uploads a list of media to the task with the given ID.

        Args:
            task_id: the task ID
            paths: a list of media paths to upload
            image_quality (75): an int in ``[0, 100]`` determining the image
                quality to upload to CVAT
            use_cache (True): whether to use a cache when uploading data. Using
                a cache reduces task creation time as data will be processed
                on-the-fly and stored in the cache when requested
            use_zip_chunks (True): when annotating videos, whether to upload
                video frames in smaller chunks. Setting this option to
                ``False`` may result in reduced video quality in CVAT due to
                size limitations on ZIP files that can be uploaded to CVAT
            chunk_size (None): the number of frames to upload per ZIP chunk
            job_assignees (None): a list of usernames to assign jobs
            job_reviewers (None): a list of usernames to assign job reviews
            frame_start (None): an optional first frame to start uploading from
            frame_stop (None): an optional last frame to upload
            frame_step (None): an optional positive integer specifying the
                spacing between frames to upload

        Returns:
            a list of the job IDs created for the task
        """
        data = {
            "image_quality": image_quality,
            "use_cache": use_cache,
            "use_zip_chunks": use_zip_chunks,
        }

        if chunk_size:
            data["chunk_size"] = chunk_size

        if frame_start is not None:
            data["start_frame"] = frame_start

        if frame_stop is not None:
            data["stop_frame"] = frame_stop

        if frame_step is not None:
            data["frame_filter"] = "step=%d" % frame_step

        files, open_files = self._parse_local_files(paths)

        if self._server_version >= Version("2.4.6"):
            data["sorting_method"] = "predefined"

        try:
            self.post(self.task_data_url(task_id), data=data, files=files)
        except Exception as e:
            raise e
        finally:
            for f in open_files:
                f.close()

        # It can take a bit for jobs to show up, so we poll
        job_ids = []
        while not job_ids:
            job_ids = self._get_job_ids(task_id)
            if not job_ids:
                time.sleep(1)

        if job_assignees is not None:
            num_assignees = len(job_assignees)
            for idx, job_id in enumerate(job_ids):
                # Round robin strategy
                assignee = job_assignees[idx % num_assignees]

                user_id = self.get_user_id(assignee)
                if assignee is not None and user_id is not None:
                    job_patch = {self.assignee_key: user_id}
                    self.patch(self.taskless_job_url(job_id), json=job_patch)

        if self._server_version.major == 1 and job_reviewers is not None:
            num_reviewers = len(job_reviewers)
            for idx, job_id in enumerate(job_ids):
                # Round robin strategy
                reviewer = job_reviewers[idx % num_reviewers]

                user_id = self.get_user_id(reviewer)
                if reviewer is not None and user_id is not None:
                    job_patch = {"reviewer_id": user_id}
                    self.patch(self.taskless_job_url(job_id), json=job_patch)

        return job_ids

    def _parse_local_files(self, paths):
        files = {}
        open_files = []

        if len(paths) == 1 and fom.get_media_type(paths[0]) == fom.VIDEO:
            # Video task
            filename = os.path.basename(paths[0])
            f = open(paths[0], "rb")
            files["client_files[0]"] = (filename, f)
            open_files.append(f)
        else:
            # Image task
            for idx, path in enumerate(paths):
                filename = os.path.basename(path)
                if self._server_version < Version("2.4.6"):
                    # IMPORTANT: older versions of CVAT organizes media within
                    # a task alphabetically by filename, so we must give CVAT
                    # filenames whose alphabetical order matches the order of
                    # `paths`
                    filename = "%06d_%s" % (idx, os.path.basename(path))

                if self._server_version >= Version("2.3"):
                    with open(path, "rb") as f:
                        files["client_files[%d]" % idx] = (filename, f.read())
                else:
                    f = open(path, "rb")
                    files["client_files[%d]" % idx] = (filename, f)
                    open_files.append(f)

        return files, open_files

    def upload_samples(self, samples, anno_key, backend):
        """Uploads the given samples to CVAT according to the given backend's
        annotation and server configuration.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            anno_key: the annotation key
            backend: a :class:`CVATBackend` to use to perform the upload

        Returns:
            a :class:`CVATAnnotationResults`
        """
        config = backend.config
        label_schema = config.label_schema
        occluded_attr = config.occluded_attr
        group_id_attr = config.group_id_attr
        task_size = config.task_size
        config.job_reviewers = self._parse_reviewers(config.job_reviewers)
        project_name, project_id = self._parse_project_details(
            config.project_name, config.project_id
        )
        has_ignored_attributes = False
        save_config = False

        # When using an existing project, we cannot support multiple label
        # fields of the same type, since it would not be clear which field
        # labels should be downloaded into
        if project_id is not None:
            self._ensure_one_field_per_type(label_schema)
            has_ignored_attributes = self._has_ignored_attributes(label_schema)

        id_map = {}
        project_ids = []
        task_ids = []
        job_ids = {}
        frame_id_map = {}
        labels_task_map = {}

        (
            cvat_schema,
            assign_scalar_attrs,
            occluded_attrs,
            group_id_attrs,
            _,
        ) = self._get_cvat_schema(
            label_schema,
            project_id=project_id,
            occluded_attr=occluded_attr,
            group_id_attr=group_id_attr,
        )

        # When adding to an existing project, its label schema is inherited, so
        # we need to store the updated one
        if (
            project_id is not None
            or occluded_attr is not None
            or group_id_attr is not None
        ):
            if project_id is not None and has_ignored_attributes:
                raise ValueError(
                    "A project was specified so the 'label_schema', "
                    "'classes', and 'attributes' arguments are ignored, but "
                    "they contained either occluded or group id "
                    "attributes. To use occluded or group id attributes "
                    "with existing projects, provide the 'occluded_attr' "
                    "and 'group_id_attr' arguments."
                )

            config.label_schema = label_schema
            save_config = True

        samples.compute_metadata()

        num_samples = len(samples)
        batch_size = self._get_batch_size(samples, task_size)
        num_batches = math.ceil(num_samples / batch_size)
        is_video = samples.media_type == fom.VIDEO
        is_clips = samples._is_clips

        if is_video:
            # The current implementation requires frame IDs for all frames that
            # might get labels
            samples.ensure_frames()

        logger.info("Uploading samples to CVAT...")

        pb_kwargs = {"total": num_samples, "iters_str": "samples"}
        if num_samples <= batch_size:
            pb_kwargs["quiet"] = True

        with fou.ProgressBar(**pb_kwargs) as pb:
            for idx, offset in enumerate(range(0, num_samples, batch_size)):
                samples_batch = samples[offset : (offset + batch_size)]
                anno_tags = []
                anno_shapes = []
                anno_tracks = []

                if is_video:
                    _frame_start = _render_frame_arg(
                        config.frame_start, idx, samples_batch
                    )
                    _frame_stop = _render_frame_arg(
                        config.frame_stop, idx, samples_batch
                    )
                    _frame_step = _render_frame_arg(
                        config.frame_step, idx, samples_batch
                    )
                else:
                    _frame_start = None
                    _frame_stop = None
                    _frame_step = None

                for label_field, label_info in label_schema.items():
                    _tags = []
                    _shapes = []
                    _tracks = []

                    if label_field not in id_map:
                        id_map[label_field] = {}

                    if label_field not in labels_task_map:
                        labels_task_map[label_field] = []

                    if label_info.get("existing_field", False):
                        label_type = label_info["type"]
                        only_keyframes = label_info.get(
                            "only_keyframes", False
                        )

                        self._update_shapes_tags_tracks(
                            _tags,
                            _shapes,
                            _tracks,
                            id_map,
                            label_type,
                            samples_batch,
                            label_field,
                            label_info,
                            cvat_schema,
                            _frame_start,
                            _frame_stop,
                            _frame_step,
                            assign_scalar_attrs,
                            only_keyframes,
                            occluded_attrs,
                            group_id_attrs,
                        )

                        if _tracks and _frame_step is not None:
                            #
                            # @todo fully support working with existing
                            # annotation tracks. This will require additional
                            # logic to handle mutations of objects outside of
                            # the uploaded frames.
                            #
                            # Example: A detection track is deleted with
                            # frame_step 5, then the detections for that track
                            # between frames 1-5 need to be deleted when the
                            # annotations are loaded again.
                            #
                            raise ValueError(
                                "Cannot upload existing annotation tracks for "
                                "field '%s' when a 'frame_step' is provided"
                                % label_field
                            )

                    anno_tags.extend(_tags)
                    anno_shapes.extend(_shapes)
                    anno_tracks.extend(_tracks)

                # We must do this here because `cvat_schema` may be altered the
                # first time shapes are created
                if project_id is None and project_name is not None:
                    project_id = self.create_project(project_name, cvat_schema)
                    project_ids.append(project_id)

                if config.task_name is None:
                    _dataset_name = samples_batch._dataset.name.replace(
                        " ", "_"
                    )
                    task_name = f"FiftyOne_{_dataset_name}"
                else:
                    task_name = config.task_name

                # Append task number when multiple tasks are created
                if num_batches > 1:
                    task_name += f"_{idx + 1}"

                (
                    task_id,
                    class_id_map,
                    attr_id_map,
                ) = self._create_task_upload_data(
                    config,
                    idx,
                    task_name,
                    cvat_schema,
                    project_id,
                    samples_batch,
                    task_ids,
                    job_ids,
                    frame_id_map,
                    _frame_start,
                    _frame_stop,
                    _frame_step,
                )

                for label_field in label_schema.keys():
                    labels_task_map[label_field].append(task_id)

                server_id_map = self._upload_annotations(
                    anno_shapes,
                    anno_tags,
                    anno_tracks,
                    class_id_map,
                    attr_id_map,
                    task_id,
                )

                pb.update(batch_size)

        results = CVATAnnotationResults(
            samples,
            config,
            anno_key,
            id_map,
            server_id_map,
            project_ids,
            task_ids,
            job_ids,
            frame_id_map,
            labels_task_map,
            backend=backend,
        )

        if is_clips:
            # We must store clip start frame numbers because this information
            # is required when downloading annotations to map the CVAT frame
            # IDs back to the correct frame numbers
            frame_starts = [s[0] for s in samples.values("support")]
            results.id_map["_clips_frame_start"] = dict(
                zip(task_ids, frame_starts)
            )

        if save_config:
            results.save_config()

        return results

    def download_annotations(self, results):
        """Download the annotations from the CVAT server for the given results
        instance and parses them into the appropriate FiftyOne types.

        Args:
            results: a :class:`CVATAnnotationResults`

        Returns:
            the annotations dict
        """
        label_schema = results.config.label_schema
        occluded_attr = results.config.occluded_attr
        group_id_attr = results.config.group_id_attr
        id_map = results.id_map
        server_id_map = results.server_id_map
        task_ids = results.task_ids
        frame_id_map = results.frame_id_map
        labels_task_map = results.labels_task_map
        is_clips = results._is_clips

        _, project_id = self._parse_project_details(
            results.config.project_name, results.config.project_id
        )

        if results.project_ids:
            # This task created the project, so we know that `label_schema` is
            # already complete and we don't need `project_id` to help us here
            project_id = None

        (
            _,
            assigned_scalar_attrs,
            occluded_attrs,
            group_id_attrs,
            label_field_classes,
        ) = self._get_cvat_schema(
            label_schema,
            project_id=project_id,
            occluded_attr=occluded_attr,
            group_id_attr=group_id_attr,
        )

        labels_task_map_rev = defaultdict(list)
        for lf, tasks in labels_task_map.items():
            for task in tasks:
                labels_task_map_rev[task].append(lf)

        annotations = {}
        deleted_tasks = []

        pb_kwargs = {"total": len(task_ids), "iters_str": "tasks"}
        if len(task_ids) == 1:
            pb_kwargs["quiet"] = True

        with fou.ProgressBar(**pb_kwargs) as pb:
            for task_id in pb(task_ids):
                if not self.task_exists(task_id):
                    deleted_tasks.append(task_id)
                    logger.warning(
                        "Skipping task %d, which no longer exists", task_id
                    )
                    continue

                data_resp = self.get(self.task_data_meta_url(task_id)).json()
                frames = data_resp["frames"]
                frame_start = data_resp["start_frame"]
                frame_stop = data_resp["stop_frame"]
                frame_step = _parse_frame_step(data_resp)

                if is_clips:
                    offset = results.id_map["_clips_frame_start"][task_id]
                    frame_start -= offset
                    frame_stop -= offset

                # Download task data
                attr_id_map, _class_map_rev = self._get_attr_class_maps(
                    task_id
                )

                job_ids = self._get_job_ids(task_id)
                for job_id in job_ids:
                    job_resp = self.get(self.job_annotation_url(job_id)).json()
                    all_shapes = job_resp["shapes"]
                    all_tags = job_resp["tags"]
                    all_tracks = job_resp["tracks"]

                    # For videos that were subsampled, remap the frame numbers
                    # to those on the original video
                    all_shapes = _remap_annotation_frames(
                        all_shapes, frame_start, frame_stop, frame_step
                    )
                    all_tags = _remap_annotation_frames(
                        all_tags, frame_start, frame_stop, frame_step
                    )
                    all_tracks = _remap_annotation_frames(
                        all_tracks, frame_start, frame_stop, frame_step
                    )

                    label_fields = labels_task_map_rev[task_id]
                    label_types = self._get_return_label_types(
                        label_schema, label_fields
                    )

                    for lf_ind, label_field in enumerate(label_fields):
                        label_info = label_schema[label_field]
                        label_type = label_info.get("type", None)
                        scalar_attrs = assigned_scalar_attrs.get(
                            label_field, False
                        )
                        _occluded_attrs = occluded_attrs.get(label_field, {})
                        _group_id_attrs = group_id_attrs.get(label_field, {})
                        _id_map = id_map.get(label_field, {})

                        label_field_results = {}

                        # Dict mapping class labels to the classes used in
                        # CVAT. These are equal unless a class appears in
                        # multiple fields
                        _classes = label_field_classes[label_field]

                        # Maps CVAT IDs to FiftyOne labels
                        class_map = {
                            _class_map_rev[name_lf]: name
                            for name, name_lf in _classes.items()
                        }

                        _cvat_classes = class_map.keys()
                        tags, shapes, tracks = self._filter_field_classes(
                            all_tags,
                            all_shapes,
                            all_tracks,
                            _cvat_classes,
                        )

                        is_last_field = lf_ind == len(label_fields) - 1
                        ignore_types = self._get_ignored_types(
                            project_id, label_types, label_type, is_last_field
                        )

                        tag_results = self._parse_shapes_tags(
                            "tags",
                            tags,
                            frame_id_map[task_id],
                            label_type,
                            _id_map,
                            server_id_map.get("tags", {}),
                            class_map,
                            attr_id_map,
                            frames,
                            ignore_types,
                            frame_stop,
                            frame_step,
                            assigned_scalar_attrs=scalar_attrs,
                        )
                        label_field_results = self._merge_results(
                            label_field_results, tag_results
                        )

                        shape_results = self._parse_shapes_tags(
                            "shapes",
                            shapes,
                            frame_id_map[task_id],
                            label_type,
                            _id_map,
                            server_id_map.get("shapes", {}),
                            class_map,
                            attr_id_map,
                            frames,
                            ignore_types,
                            frame_stop,
                            frame_step,
                            assigned_scalar_attrs=scalar_attrs,
                            occluded_attrs=_occluded_attrs,
                            group_id_attrs=_group_id_attrs,
                        )
                        label_field_results = self._merge_results(
                            label_field_results, shape_results
                        )

                        for track_index, track in enumerate(tracks, 1):
                            label_id = track["label_id"]
                            shapes = track["shapes"]
                            track_group_id = track.get("group", None)
                            for shape in shapes:
                                shape["label_id"] = label_id

                            immutable_attrs = track["attributes"]

                            track_shape_results = self._parse_shapes_tags(
                                "track",
                                shapes,
                                frame_id_map[task_id],
                                label_type,
                                _id_map,
                                server_id_map.get("tracks", {}),
                                class_map,
                                attr_id_map,
                                frames,
                                ignore_types,
                                frame_stop,
                                frame_step,
                                assigned_scalar_attrs=scalar_attrs,
                                track_index=track_index,
                                track_group_id=track_group_id,
                                immutable_attrs=immutable_attrs,
                                occluded_attrs=_occluded_attrs,
                                group_id_attrs=_group_id_attrs,
                            )
                            label_field_results = self._merge_results(
                                label_field_results, track_shape_results
                            )

                        frames_metadata = {}
                        for cvat_frame_id, frame_data in frame_id_map[
                            task_id
                        ].items():
                            sample_id = frame_data["sample_id"]
                            if "frame_id" in frame_data and len(frames) == 1:
                                frames_metadata[sample_id] = frames[0]
                                break

                            if len(frames) > cvat_frame_id:
                                frame_metadata = frames[cvat_frame_id]
                            else:
                                frame_metadata = None

                            frames_metadata[sample_id] = frame_metadata

                        # Polyline(s) corresponding to instance/semantic masks
                        # need to be converted to their final format
                        self._convert_polylines_to_masks(
                            label_field_results, label_info, frames_metadata
                        )

                        annotations = self._merge_results(
                            annotations, {label_field: label_field_results}
                        )

        if deleted_tasks:
            results._forget_tasks(deleted_tasks)

        return annotations

    def _get_attr_class_maps(self, task_id):
        labels = self._get_task_labels(task_id)
        _class_map = {}
        attr_id_map = {}
        for label in labels:
            _class_map[label["id"]] = label["name"]
            attr_id_map[label["id"]] = {
                i["name"]: i["id"] for i in label["attributes"]
            }

        # AL: not sure why we didn't just reverse keys/vals initially
        class_map_rev = {n: i for i, n in _class_map.items()}

        return attr_id_map, class_map_rev

    def _get_paginated_results(self, base_url, get_page_url=None, value=None):
        results = []
        page_number = 1
        page = base_url
        while True:
            response = self.get(page).json()
            if "results" not in response:
                break

            for result in response["results"]:
                if value is not None:
                    results.append(result[value])
                else:
                    results.append(result)

            page = response.get("next", None)

            if not page:
                break

            if get_page_url is not None:
                page_number += 1
                page = get_page_url(page_number)

        return results

    def _get_value_from_search(
        self, search_url_fcn, target, target_key, value_key
    ):
        search_url = search_url_fcn(target)
        resp = self.get(search_url).json()
        for info in resp["results"]:
            if info[target_key] == target:
                return info[value_key]

        return None

    def _get_value_update_map(self, name, id_map, result_name, search_url_fcn):
        if name is None:
            return None

        if name in id_map:
            return id_map[name]

        _id = self._get_value_from_search(
            search_url_fcn, name, result_name, "id"
        )

        if _id is not None:
            id_map[name] = _id

        return _id

    def _get_project_labels(self, project_id):
        if not self.project_exists(project_id):
            raise ValueError("Project '%s' not found" % project_id)

        resp = self.get(self.project_url(project_id)).json()
        labels = resp["labels"]

        if self._server_version >= Version("2.4"):
            labels = self._get_paginated_results(labels["url"])

        return labels

    def _get_task_labels(self, task_id):
        resp = self.get(self.task_url(task_id)).json()
        if "labels" not in resp:
            raise ValueError("Task '%s' not found" % task_id)

        labels = resp["labels"]
        if self._server_version >= Version("2.4"):
            labels = self._get_paginated_results(labels["url"])

        return labels

    def _get_task_id_labels_json(self, task_json):
        resp = self.post(self.tasks_url, json=task_json).json()
        task_id = resp["id"]

        labels = resp["labels"]
        if self._server_version >= Version("2.4"):
            labels = self._get_paginated_results(labels["url"])

        return task_id, labels

    def _get_job_ids(self, task_id):
        url = self.jobs_url(task_id)
        if self._server_version >= Version("2.4"):
            job_resp_json = self._get_paginated_results(url)
        else:
            job_resp = self.get(url)
            job_resp_json = job_resp.json()
            if "results" in job_resp_json:
                job_resp_json = job_resp_json["results"]

        job_ids = [j["id"] for j in job_resp_json]
        return job_ids

    def _parse_project_details(self, project_name, project_id):
        if project_id is not None:
            project_name = self.get_project_name(project_id)
            if not project_name:
                raise ValueError("Project '%d' not found" % project_id)

        elif project_name is not None:
            project_id = self.get_project_id(project_name)

        return project_name, project_id

    def _get_label_schema(
        self,
        project_id=None,
        task_id=None,
        occluded_attr=None,
        group_id_attr=None,
    ):
        label_schema = {None: {"type": "tmp"}}
        self._convert_cvat_schema(
            label_schema,
            project_id=project_id,
            task_id=task_id,
            occluded_attr=occluded_attr,
            group_id_attr=group_id_attr,
        )
        label_schema[None].pop("type")
        return label_schema

    def _get_cvat_schema(
        self,
        label_schema,
        project_id=None,
        occluded_attr=None,
        group_id_attr=None,
    ):
        if project_id is not None:
            return self._convert_cvat_schema(
                label_schema,
                project_id=project_id,
                occluded_attr=occluded_attr,
                group_id_attr=group_id_attr,
            )

        return self._build_cvat_schema(
            label_schema,
            occluded_attr=occluded_attr,
            group_id_attr=group_id_attr,
        )

    def _convert_cvat_schema(
        self,
        label_schema,
        project_id=None,
        task_id=None,
        occluded_attr=None,
        group_id_attr=None,
        update_server=True,
    ):
        if project_id is None and task_id is None:
            raise ValueError(
                "Either `project_id` or `task_id` must be provided"
            )

        if project_id is not None:
            labels = self._get_project_labels(project_id)
        else:
            labels = self._get_task_labels(task_id)

        cvat_schema = {}
        labels_to_update = []
        occluded_attrs = {}
        group_id_attrs = {}
        assign_scalar_attrs = {}
        classes_and_attrs = []
        for label in labels:
            name = label["name"]
            attrs = label["attributes"]
            cvat_schema[name] = {a["name"]: a for a in attrs}

            if "label_id" not in cvat_schema[name]:
                labels_to_update.append(label)
                cvat_schema[name]["label_id"] = {
                    "name": "label_id",
                    "input_type": "text",
                    "mutable": True,
                    "values": [],
                }

            label_attrs = {}
            for attr_name, attr in cvat_schema[name].items():
                if attr_name != "label_id":
                    input_type = attr["input_type"]
                    label_attrs[attr_name] = {"type": input_type}
                    default_value = attr["default_value"]
                    values = attr["values"]
                    if default_value:
                        label_attrs[attr_name]["default"] = default_value

                    if values and values[0] != "":
                        label_attrs[attr_name]["values"] = values

            if occluded_attr is not None:
                label_attrs[occluded_attr] = {}

            if group_id_attr is not None:
                label_attrs[group_id_attr] = {}

            classes_and_attrs.append(
                {
                    "classes": [name],
                    "attributes": label_attrs,
                }
            )

        label_field_classes = {}
        class_names = {n: n for n in cvat_schema.keys()}
        for label_field, label_info in label_schema.items():
            label_type = label_info.get("type", None)
            classes = label_info.get("classes", [])

            if label_type == "scalar":
                # True: scalars are annotated as tag attributes
                # False: scalars are annotated as tag labels
                assign_scalar_attrs[label_field] = not bool(classes)
            else:
                if label_type is not None:
                    label_schema[label_field]["attributes"] = {}
                    label_schema[label_field]["classes"] = classes_and_attrs

                assign_scalar_attrs[label_field] = None

            label_field_classes[label_field] = deepcopy(class_names)
            if occluded_attr is not None:
                occluded_attrs[label_field] = {
                    c: occluded_attr for c in class_names.keys()
                }

            if group_id_attr is not None:
                group_id_attrs[label_field] = {
                    c: group_id_attr for c in class_names.keys()
                }

        if project_id is not None and labels_to_update and update_server:
            self._add_project_label_ids(project_id, list(labels_to_update))

        return (
            cvat_schema,
            assign_scalar_attrs,
            occluded_attrs,
            group_id_attrs,
            label_field_classes,
        )

    def _has_ignored_attributes(self, label_schema):
        for label_field, label_info in label_schema.items():
            (
                _,
                occluded_attr_name,
                group_id_attr_name,
            ) = self._to_cvat_attributes(label_info.get("attributes", {}))

            if occluded_attr_name or group_id_attr_name:
                return True

        return False

    def _build_cvat_schema(
        self, label_schema, occluded_attr=None, group_id_attr=None
    ):
        cvat_schema = {}
        assign_scalar_attrs = {}
        occluded_attrs = defaultdict(dict)
        group_id_attrs = defaultdict(dict)
        label_field_classes = defaultdict(dict)

        _class_label_fields = {}
        _duplicate_classes = set()
        _prev_field_classes = set()

        for label_field, label_info in label_schema.items():
            _field_classes = set()
            label_type = label_info.get("type", None)
            is_existing_field = label_info.get("existing_field", False)
            classes = label_info["classes"]
            (
                attributes,
                occluded_attr_name,
                group_id_attr_name,
            ) = self._to_cvat_attributes(label_info["attributes"])
            if occluded_attr_name is None and occluded_attr is not None:
                occluded_attr_name = occluded_attr
                label_schema[label_field]["attributes"][occluded_attr] = {}

            if group_id_attr_name is None and group_id_attr is not None:
                group_id_attr_name = group_id_attr
                label_schema[label_field]["attributes"][group_id_attr] = {}

            # Must track label IDs for existing label fields
            if is_existing_field and label_type != "scalar":
                if "label_id" in attributes:
                    raise ValueError(
                        "Label field '%s' attribute schema cannot use "
                        "reserved name 'label_id'" % label_field
                    )

                attributes["label_id"] = {
                    "name": "label_id",
                    "input_type": "text",
                    "mutable": True,
                    "values": [],
                }

            if label_type == "scalar":
                # True: scalars are annotated as tag attributes
                # False: scalars are annotated as tag labels
                assign_scalar_attrs[label_field] = not bool(classes)
            else:
                assign_scalar_attrs[label_field] = None

            if not classes:
                classes = [label_field]

                if not attributes:
                    attributes["value"] = {
                        "name": "value",
                        "input_type": "text",
                        "mutable": True,
                        "values": [],
                    }

            # Handle class name clashes and global attributes
            for _class in classes:
                if etau.is_str(_class):
                    _classes = [_class]
                else:
                    _classes = _class["classes"]

                for name in _classes:
                    # If two label fields share a class name, we must append
                    # `label_field` to all instances of `name` to disambiguate
                    if (
                        name in _prev_field_classes
                        and name not in _duplicate_classes
                    ):
                        _duplicate_classes.add(name)

                        prev_field = _class_label_fields[name]

                        new_name = "%s_%s" % (name, prev_field)
                        cvat_schema[new_name] = cvat_schema.pop(name)

                        label_field_classes[prev_field][name] = new_name

                        if name in occluded_attrs[label_field]:
                            attr_name = occluded_attrs[label_field].pop(name)
                            occluded_attrs[label_field][new_name] = attr_name

                        if name in group_id_attrs[label_field]:
                            attr_name = group_id_attrs[label_field].pop(name)
                            group_id_attrs[label_field][new_name] = attr_name

                    _field_classes.add(name)

                    if name in _duplicate_classes:
                        new_name = "%s_%s" % (name, label_field)
                        label_field_classes[label_field][name] = new_name
                        name = new_name
                    else:
                        _class_label_fields[name] = label_field
                        label_field_classes[label_field][name] = name

                    if len(name) > 64:
                        raise ValueError(
                            "Class name '%s' exceeds 64 character limit" % name
                        )

                    cvat_schema[name] = deepcopy(attributes)
                    if occluded_attr_name is not None:
                        occluded_attrs[label_field][name] = occluded_attr_name

                    if group_id_attr_name is not None:
                        group_id_attrs[label_field][name] = group_id_attr_name

            _prev_field_classes |= _field_classes

            # Class-specific attributes
            for _class in classes:
                if etau.is_str(_class):
                    continue

                _classes = _class["classes"]
                (
                    _attrs,
                    _occluded_attr_name,
                    _group_id_attr_name,
                ) = self._to_cvat_attributes(_class["attributes"])
                if _occluded_attr_name is None and occluded_attr is not None:
                    _occluded_attr_name = occluded_attr

                if _group_id_attr_name is None and group_id_attr is not None:
                    _group_id_attr_name = group_id_attr

                if "label_id" in _attrs:
                    raise ValueError(
                        "Label field '%s' attribute schema cannot use "
                        "reserved name 'label_id'" % label_field
                    )

                for name in _classes:
                    if name in _duplicate_classes:
                        name = "%s_%s" % (name, label_field)

                    if len(name) > 64:
                        raise ValueError(
                            "Class name '%s' exceeds 64 character limit" % name
                        )

                    cvat_schema[name].update(_attrs)
                    if _occluded_attr_name is not None:
                        occluded_attrs[label_field][name] = _occluded_attr_name

                    if _group_id_attr_name is not None:
                        group_id_attrs[label_field][name] = _group_id_attr_name

        return (
            cvat_schema,
            assign_scalar_attrs,
            dict(occluded_attrs),
            dict(group_id_attrs),
            dict(label_field_classes),
        )

    def _add_project_label_ids(self, project_id, labels):
        labels_patch = {"labels": []}
        for label in labels:
            label["attributes"].append(
                {
                    "name": "label_id",
                    "input_type": "text",
                    "mutable": True,
                    "values": [],
                }
            )
            labels_patch["labels"].append(label)

        self.patch(self.project_url(project_id), json=labels_patch)

    def _ensure_one_field_per_type(self, label_schema, verbose=True):
        _seen_label_types = []
        for label_field in list(label_schema.keys()):  # list b/c we may edit
            if label_field is None:
                continue

            label_type = label_schema[label_field]["type"]
            if label_type == "scalar":
                _label_type = "classifications"
            else:
                _label_type = foua._RETURN_TYPES_MAP[label_type]

            if _label_type not in _seen_label_types:
                _seen_label_types.append(_label_type)
            elif verbose:
                label_schema.pop(label_field)
                logger.warning(
                    "A field with label type '%s' is already being annotated. "
                    "Ignoring field '%s'...",
                    _label_type,
                    label_field,
                )

    def _get_batch_size(self, samples, task_size):
        if samples.media_type == fom.VIDEO:
            # CVAT only allows for one video per task
            return 1

        num_samples = len(samples)

        if task_size is None:
            required_bytes = samples.sum("metadata.size_bytes")
            if required_bytes > 2 * 1024**3:
                logger.warning(
                    "By default, all images are uploaded to CVAT in a single "
                    "task, but this requires loading all images "
                    "simultaneously into RAM, which will take at least %s. "
                    "Consider specifying a `task_size` to break the data into "
                    "smaller chunks, or upgrade to FiftyOne Teams so that you "
                    "can provide a cloud manifest",
                    etau.to_human_bytes_str(required_bytes),
                )

            # Put all image samples in one task
            return num_samples

        return min(task_size, num_samples)

    def _create_task_upload_data(
        self,
        config,
        idx,
        task_name,
        cvat_schema,
        project_id,
        samples_batch,
        task_ids,
        job_ids,
        frame_id_map,
        frame_start,
        frame_stop,
        frame_step,
    ):
        media_field = config.media_field
        segment_size = config.segment_size
        image_quality = config.image_quality
        use_cache = config.use_cache
        use_zip_chunks = config.use_zip_chunks
        chunk_size = config.chunk_size
        task_assignee = config.task_assignee
        job_assignees = config.job_assignees
        job_reviewers = config.job_reviewers
        issue_tracker = config.issue_tracker

        _task_assignee = task_assignee
        _job_assignees = job_assignees
        _job_reviewers = job_reviewers
        _issue_tracker = issue_tracker

        is_video = samples_batch.media_type == fom.VIDEO
        is_clips = samples_batch._is_clips

        if is_clips:
            _frame_start, _frame_stop = samples_batch.values("support")[0]

            if frame_start is not None:
                frame_start = _frame_start + frame_start
            else:
                frame_start = _frame_start

            if frame_stop is not None:
                frame_stop = min(_frame_start + frame_stop, _frame_stop)
            else:
                frame_stop = _frame_stop

        if is_video:
            # Videos are uploaded in multiple tasks with 1 job per task
            # Assign the correct users for the current task
            if job_assignees is not None:
                _job_assignees = [job_assignees[idx % len(job_assignees)]]

            if job_reviewers is not None:
                _job_reviewers = [job_reviewers[idx % len(job_reviewers)]]

        if task_assignee is not None:
            if isinstance(task_assignee, str):
                _task_assignee = task_assignee
            else:
                _task_assignee = task_assignee[idx % len(task_assignee)]

        if issue_tracker is not None:
            if isinstance(issue_tracker, str):
                _issue_tracker = issue_tracker
            else:
                _issue_tracker = issue_tracker[idx % len(issue_tracker)]

        # Create task
        task_id, class_id_map, attr_id_map = self.create_task(
            task_name,
            schema=cvat_schema,
            segment_size=segment_size,
            image_quality=image_quality,
            task_assignee=_task_assignee,
            project_id=project_id,
            issue_tracker=_issue_tracker,
        )
        task_ids.append(task_id)

        # Upload media
        job_ids[task_id] = self.upload_data(
            task_id,
            samples_batch.values(media_field),
            image_quality=image_quality,
            use_cache=use_cache,
            use_zip_chunks=use_zip_chunks,
            chunk_size=chunk_size,
            job_assignees=_job_assignees,
            job_reviewers=_job_reviewers,
            frame_start=frame_start,
            frame_stop=frame_stop,
            frame_step=frame_step,
        )

        self._verify_uploaded_frames(
            task_id, samples_batch, frame_start, frame_stop, frame_step
        )

        frame_id_map[task_id] = self._build_frame_id_map(samples_batch)

        return task_id, class_id_map, attr_id_map

    def _verify_uploaded_frames(
        self, task_id, samples, frame_start, frame_stop, frame_step
    ):
        task_meta = self.get(self.task_data_meta_url(task_id)).json()
        num_uploaded = task_meta.get("size", 0)
        if samples.media_type == fom.VIDEO:
            num_frames = self._compute_expected_frames(
                samples, frame_start, frame_stop, frame_step
            )
            ftype = "frames"
        else:
            num_frames = len(samples)
            ftype = "images"

        if num_uploaded < num_frames:
            logger.warning(
                "Failed to upload %d/%d %s",
                num_frames - num_uploaded,
                num_frames,
                ftype,
            )

    def _compute_expected_frames(
        self, samples, frame_start, frame_stop, frame_step
    ):
        n = samples.count("frames")
        _frame_start = 0 if frame_start is None else frame_start
        _frame_stop = n if frame_stop is None else min(frame_stop, n)
        _frame_step = 1 if frame_step is None else frame_step

        return int((_frame_stop - _frame_start) / _frame_step)

    def _upload_annotations(
        self,
        anno_shapes,
        anno_tags,
        anno_tracks,
        class_id_map,
        attr_id_map,
        task_id,
    ):
        # Remap annotations to use the CVAT class/attribute IDs
        anno_shapes = self._remap_ids(anno_shapes, class_id_map, attr_id_map)
        anno_tags = self._remap_ids(anno_tags, class_id_map, attr_id_map)
        anno_tracks = self._remap_track_ids(
            anno_tracks, class_id_map, attr_id_map
        )

        anno_json = {
            "version": 0,
            "shapes": anno_shapes,
            "tags": anno_tags,
            "tracks": anno_tracks,
        }
        num_shapes = len(anno_shapes)
        num_tags = len(anno_tags)
        num_tracks = len(anno_tracks)

        # @todo is this loop really needed?
        num_uploaded_shapes = 0
        num_uploaded_tags = 0
        num_uploaded_tracks = 0
        anno_resp = {}
        while (
            num_uploaded_shapes != num_shapes
            or num_uploaded_tags != num_tags
            or num_uploaded_tracks != num_tracks
        ):
            anno_resp = self.put(
                self.task_annotation_url(task_id), json=anno_json
            ).json()
            num_uploaded_shapes = len(anno_resp["shapes"])
            num_uploaded_tags = len(anno_resp["tags"])
            num_uploaded_tracks = len(anno_resp["tracks"])

        return self._create_server_id_map(anno_resp, attr_id_map)

    def _create_server_id_map(self, anno_resp, attr_id_map):
        label_id_map = {}
        for class_id, class_attr_map in attr_id_map.items():
            for attr_name, attr_id in class_attr_map.items():
                if attr_name == "label_id":
                    label_id_map[class_id] = attr_id

        server_id_map = {}
        for anno_type, anno_list in anno_resp.items():
            if anno_type not in ("tags", "shapes", "tracks"):
                continue

            id_map = {}
            for anno in anno_list:
                server_id = anno["id"]
                label_id = anno["label_id"]
                if label_id in label_id_map:
                    label_attr_id = label_id_map[label_id]
                    for attr in anno["attributes"]:
                        if attr["spec_id"] == label_attr_id:
                            id_map[server_id] = attr["value"]

            server_id_map[anno_type] = id_map

        return server_id_map

    def _update_shapes_tags_tracks(
        self,
        tags,
        shapes,
        tracks,
        id_map,
        label_type,
        samples_batch,
        label_field,
        label_info,
        cvat_schema,
        frame_start,
        frame_stop,
        frame_step,
        assign_scalar_attrs,
        only_keyframes,
        occluded_attrs,
        group_id_attrs,
    ):
        is_video = samples_batch.media_type == fom.VIDEO

        anno_tags = []
        anno_shapes = []
        anno_tracks = []

        if label_type in ("classification", "classifications", "scalar"):
            # Tag annotations
            _id_map, anno_tags = self._create_shapes_tags_tracks(
                samples_batch,
                label_field,
                label_info,
                cvat_schema,
                frame_start,
                frame_stop,
                frame_step,
                assign_scalar_attrs=assign_scalar_attrs,
            )
        elif is_video and label_type != "segmentation":
            # Video track annotations
            (
                _id_map,
                anno_shapes,
                anno_tracks,
            ) = self._create_shapes_tags_tracks(
                samples_batch,
                label_field,
                label_info,
                cvat_schema,
                frame_start,
                frame_stop,
                frame_step,
                load_tracks=True,
                only_keyframes=only_keyframes,
                occluded_attrs=occluded_attrs,
                group_id_attrs=group_id_attrs,
            )
        else:
            # Shape annotations
            _id_map, anno_shapes = self._create_shapes_tags_tracks(
                samples_batch,
                label_field,
                label_info,
                cvat_schema,
                frame_start,
                frame_stop,
                frame_step,
                occluded_attrs=occluded_attrs,
                group_id_attrs=group_id_attrs,
            )

        id_map[label_field].update(_id_map)
        tags.extend(anno_tags)
        shapes.extend(anno_shapes)
        tracks.extend(anno_tracks)

    def _filter_field_classes(self, tags, shapes, tracks, _cvat_classes):
        _tags = [t for t in tags if t["label_id"] in _cvat_classes]
        _shapes = [s for s in shapes if s["label_id"] in _cvat_classes]
        _tracks = [t for t in tracks if t["label_id"] in _cvat_classes]
        return _tags, _shapes, _tracks

    def _get_return_label_types(self, label_schema, label_fields):
        label_types = []
        for label_field in label_fields:
            label_type = label_schema[label_field].get("type", None)
            if label_type:
                label_types.append(foua._RETURN_TYPES_MAP[label_type])

        return label_types

    def _get_ignored_types(
        self, project_id, label_types, label_type, is_last_field
    ):
        """When uploading multiple fields to an existing project, each field
        must have a different type but can have overlapping class names.
        Therefore, when loading annotations, if a field exists for a found
        label type, that label will not be loaded with any other fields.
        """
        if not project_id or len(label_types) < 2:
            # Not relevant unless uploading to a project and there are multiple
            # types of labels
            return []

        # The last label field being loaded stores all unexpected label types
        # Ignore only the other label types that have been loaded
        label_type = foua._RETURN_TYPES_MAP[label_type]
        if is_last_field:
            ignored_types = set(label_types) - {label_type}
        else:
            # Other fields only load the expected type
            # Ignore all other types
            all_label_types = foua._RETURN_TYPES_MAP.values()
            ignored_types = set(all_label_types) - {label_type}

        return ignored_types

    def _convert_polylines_to_masks(
        self, results, label_info, frames_metadata
    ):
        for label_type, type_results in results.items():
            if label_type not in (
                "detection",
                "detections",
                "instance",
                "instances",
                "segmentation",
            ):
                continue

            for sample_id, sample_results in type_results.items():
                sample_metadata = frames_metadata[sample_id]
                if sample_metadata is None:
                    continue

                frame_size = (
                    sample_metadata["width"],
                    sample_metadata["height"],
                )
                for _id, _content in sample_results.items():
                    if isinstance(_content, dict):
                        frame_id = _id
                        frame_results = _content
                        for label_id, label in frame_results.items():
                            label = self._convert_polylines(
                                label_id, label, label_info, frame_size
                            )
                            results[label_type][sample_id][frame_id][
                                label_id
                            ] = label
                    else:
                        label_id = _id
                        label = self._convert_polylines(
                            label_id, _content, label_info, frame_size
                        )
                        results[label_type][sample_id][label_id] = label

    def _convert_polylines(self, label_id, label, label_info, frame_size):
        # Convert Polyline to instance segmentation
        if isinstance(label, fol.Polyline):
            detection = CVATShape.polyline_to_detection(label, frame_size)
            detection.id = label_id
            return detection

        # Convert Polylines to semantic segmentation
        if isinstance(label, fol.Polylines):
            mask_targets = label_info.get("mask_targets", None)
            segmentation = CVATShape.polylines_to_segmentation(
                label, frame_size, mask_targets
            )
            segmentation.id = label_id
            return segmentation

        return label

    def _merge_results(self, results, new_results):
        if isinstance(new_results, dict):
            for key, val in new_results.items():
                if key not in results:
                    results[key] = val
                else:
                    results[key] = self._merge_results(results[key], val)

        return results

    def _parse_shapes_tags(
        self,
        anno_type,
        annos,
        frame_id_map,
        label_type,
        id_map,
        server_id_map,
        class_map,
        attr_id_map,
        frames,
        ignore_types,
        frame_stop,
        frame_step,
        assigned_scalar_attrs=False,
        track_index=None,
        track_group_id=None,
        immutable_attrs=None,
        occluded_attrs=None,
        group_id_attrs=None,
    ):
        results = {}
        prev_type = None

        # For filling in tracked objects
        prev_frame = None
        prev_outside = True

        if anno_type == "track":
            annos = _get_interpolated_shapes(annos)

        for anno in annos:
            frame = anno["frame"]
            prev_anno = anno
            prev_frame = frame
            prev_outside = anno.get("outside", True)

            if anno.get("outside", False):
                # If a tracked object is not in the frame
                continue

            prev_type = self._parse_annotation(
                anno,
                results,
                anno_type,
                prev_type,
                frame_id_map,
                label_type,
                id_map,
                server_id_map,
                class_map,
                attr_id_map,
                frames,
                ignore_types,
                assigned_scalar_attrs=assigned_scalar_attrs,
                track_index=track_index,
                track_group_id=track_group_id,
                immutable_attrs=immutable_attrs,
                occluded_attrs=occluded_attrs,
                group_id_attrs=group_id_attrs,
            )

        # For non-outside tracked objects, the last track goes to the end of
        # the video, so fill remaining frames with copies of the last instance
        if (
            anno_type == "track"
            and prev_frame is not None
            and not prev_outside
        ):
            for frame in range(
                prev_frame + 1, min(max(frame_id_map), frame_stop) + 1
            ):
                anno = deepcopy(prev_anno)
                anno["frame"] = frame
                anno["keyframe"] = False

                prev_type = self._parse_annotation(
                    anno,
                    results,
                    anno_type,
                    prev_type,
                    frame_id_map,
                    label_type,
                    id_map,
                    server_id_map,
                    class_map,
                    attr_id_map,
                    frames,
                    ignore_types,
                    assigned_scalar_attrs=assigned_scalar_attrs,
                    track_index=track_index,
                    track_group_id=track_group_id,
                    immutable_attrs=immutable_attrs,
                    occluded_attrs=occluded_attrs,
                    group_id_attrs=group_id_attrs,
                )

        return results

    def _parse_annotation(
        self,
        anno,
        results,
        anno_type,
        prev_type,
        frame_id_map,
        expected_label_type,
        id_map,
        server_id_map,
        class_map,
        attr_id_map,
        frames,
        ignore_types,
        assigned_scalar_attrs=False,
        track_index=None,
        track_group_id=None,
        immutable_attrs=None,
        occluded_attrs=None,
        group_id_attrs=None,
    ):
        frame = anno["frame"]

        if frame not in frame_id_map:
            return prev_type

        try:
            metadata = frames[frame]
        except IndexError:
            metadata = frames[0]

        frame_data = frame_id_map[frame]
        sample_id = frame_data["sample_id"]
        frame_id = frame_data.get("frame_id", None)

        label = None

        if anno_type in ("shapes", "track"):
            shape_type = anno["type"]
            keyframe = anno.get("keyframe", False)

            if expected_label_type == "scalar" and assigned_scalar_attrs:
                # Shapes created with values, set class to value
                anno_attrs = anno["attributes"]
                if anno_attrs and "value" in anno_attrs[0]:
                    class_val = anno_attrs[0]["value"]
                    anno["attributes"] = []
                else:
                    class_val = False

            cvat_shape = CVATShape(
                anno,
                class_map,
                attr_id_map,
                server_id_map,
                metadata,
                index=track_index,
                immutable_attrs=immutable_attrs,
                occluded_attrs=occluded_attrs,
                group_id_attrs=group_id_attrs,
                group_id=track_group_id,
            )

            # Non-keyframe annotations were interpolated from keyframes but
            # should not inherit their label IDs
            if anno_type == "track" and not keyframe:
                cvat_shape.id = None

            if shape_type == "rectangle":
                label_type = "detections"
                label = cvat_shape.to_detection()
            elif shape_type == "mask":
                label_type = "detections"
                label = cvat_shape.to_instance()
            elif shape_type == "polygon":
                if expected_label_type == "segmentation":
                    # A piece of a segmentation mask
                    label_type = "segmentation"
                    label = cvat_shape.to_polyline(closed=True, filled=True)
                elif expected_label_type in (
                    "detection",
                    "detections",
                    "instance",
                    "instances",
                ):
                    # A piece of an instance mask
                    label_type = "detections"
                    label = cvat_shape.to_polyline(closed=True, filled=True)
                else:
                    # A regular polyline or polygon
                    if expected_label_type in ("polyline", "polylines"):
                        filled = False
                    else:
                        filled = True

                    label_type = "polylines"
                    label = cvat_shape.to_polyline(closed=True, filled=filled)
            elif shape_type == "polyline":
                label_type = "polylines"
                label = cvat_shape.to_polyline()
            elif shape_type == "points":
                label_type = "keypoints"
                label = cvat_shape.to_keypoint()

            if keyframe and label is not None:
                label["keyframe"] = True

            if expected_label_type == "scalar" and assigned_scalar_attrs:
                if class_val and label is not None:
                    label.label = class_val

        if anno_type == "tags":
            if expected_label_type == "scalar":
                label_type = "scalar"
                if assigned_scalar_attrs:
                    num_attrs = len(anno["attributes"])
                    attr_ind = 0
                    while label is None and attr_ind < num_attrs:
                        label = _parse_value(
                            anno["attributes"][attr_ind]["value"]
                        )
                        attr_ind += 1
                        if label is not None:
                            if prev_type is str:
                                label = str(label)

                            if prev_type is None:
                                prev_type = type(label)
                            elif not isinstance(label, prev_type):
                                msg = (
                                    "Ignoring scalar of type %s that does not "
                                    "match previously inferred scalar type %s"
                                ) % (type(label), prev_type)
                                warnings.warn(msg)
                                label = None
                else:
                    label = class_map[anno["label_id"]]
            else:
                label_type = "classifications"
                cvat_tag = CVATTag(anno, class_map, attr_id_map, server_id_map)
                label = cvat_tag.to_classification()

        if label is None or label_type in ignore_types:
            return prev_type

        if label_type not in results:
            results[label_type] = {}

        if sample_id not in results[label_type]:
            results[label_type][sample_id] = {}

        if (
            frame_id is not None
            and frame_id not in results[label_type][sample_id]
        ):
            results[label_type][sample_id][frame_id] = {}

        if label_type == "segmentation":
            seg_id = self._get_segmentation_id(id_map, sample_id, frame_id)
        else:
            seg_id = None

        if frame_id is not None:
            if label_type == "scalar":
                results[label_type][sample_id][frame_id] = label
            else:
                _results = results[label_type][sample_id][frame_id]

                self._add_label_to_results(
                    _results, label_type, label, seg_id=seg_id
                )
        else:
            if label_type == "scalar":
                results[label_type][sample_id] = label
            else:
                _results = results[label_type][sample_id]

                self._add_label_to_results(
                    _results, label_type, label, seg_id=seg_id
                )

        return prev_type

    def _get_segmentation_id(self, id_map, sample_id, frame_id):
        _id = id_map.get(sample_id, None)

        if frame_id is not None and isinstance(_id, dict):
            _id = _id.get(frame_id, None)

        if etau.is_str(_id):
            return _id

        if isinstance(_id, list) and len(_id) == 1:
            return _id[0]

        return None

    def _add_label_to_results(self, results, label_type, label, seg_id=None):
        # Merge polylines representing a semantic segmentation
        if label_type == "segmentation":
            if seg_id is None:
                seg_id = str(ObjectId())

            if results:
                polylines = next(iter(results.values()))
            else:
                polylines = fol.Polylines()
                results[seg_id] = polylines

            found_existing_class = False
            for polyline in polylines.polylines:
                if label.label == polyline.label:
                    found_existing_class = True
                    polyline.points.extend(label.points)

            if not found_existing_class:
                polylines.polylines.append(label)

            return

        # Merge polylines representing an instance segmentation
        if label_type == "detections" and isinstance(label, fol.Polyline):
            if label.id in results:
                results[label.id].points.extend(label.points)
            else:
                results[label.id] = label

            return

        results[label.id] = label

    def _parse_arg(self, arg, config_arg):
        if arg is None:
            return config_arg

        return arg

    def _to_cvat_attributes(self, attributes):
        cvat_attrs = {}
        occluded_attr_name = None
        group_id_attr_name = None
        for attr_name, info in attributes.items():
            if len(attr_name) > 64:
                raise ValueError(
                    "Attribute name '%s' exceeds 64 character limit"
                    % attr_name
                )

            cvat_attr = {"name": attr_name, "mutable": True}
            is_occluded = False
            is_group_id = False
            for attr_key, val in info.items():
                if attr_key == "type":
                    # Parse the FiftyOne annotation schema attribute names that
                    # map to the occluded and is group attributes
                    if val == "occluded":
                        occluded_attr_name = attr_name
                        is_occluded = True
                    elif val == "group_id":
                        group_id_attr_name = attr_name
                        is_group_id = True
                    else:
                        cvat_attr["input_type"] = val
                elif attr_key == "values":
                    cvat_attr["values"] = [_stringify_value(v) for v in val]
                elif attr_key == "default":
                    cvat_attr["default_value"] = _stringify_value(val)
                elif attr_key == "mutable":
                    cvat_attr["mutable"] = bool(val)

            if not is_occluded and not is_group_id:
                cvat_attrs[attr_name] = cvat_attr

        return cvat_attrs, occluded_attr_name, group_id_attr_name

    def _create_shapes_tags_tracks(
        self,
        samples,
        label_field,
        label_info,
        cvat_schema,
        frame_start,
        frame_stop,
        frame_step,
        assign_scalar_attrs=False,
        load_tracks=False,
        only_keyframes=False,
        occluded_attrs=None,
        group_id_attrs=None,
    ):
        label_type = label_info["type"]
        classes = label_info["classes"]
        mask_targets = label_info.get("mask_targets", None)

        if occluded_attrs is not None:
            occluded_attrs = occluded_attrs.get(label_field, None)

        if group_id_attrs is not None:
            group_id_attrs = group_id_attrs.get(label_field, None)

        id_map = {}
        tags_or_shapes = []
        tracks = {}

        # Tracks any "attribute:" prefixes that need to be prepended to
        # attributes in `cvat_schema` because the corresponding data is found
        # to be in the attributes dict of the FiftyOne labels
        remapped_attrs = {}

        is_video = samples.media_type == fom.VIDEO
        samples = samples.select_fields(label_field)

        if is_video:
            field, _ = samples._handle_frame_field(label_field)
        else:
            field = label_field

        frame_id = -1
        for sample in samples:
            next_frame_idx = 0 if frame_start is None else frame_start
            metadata = sample.metadata

            if is_video:
                images = sample.frames.values()
                frame_size = (metadata.frame_width, metadata.frame_height)
            else:
                images = [sample]
                frame_size = (metadata.width, metadata.height)

            for idx, image in enumerate(images):
                if idx != next_frame_idx:
                    # This is a video being subsampled, only load annotations
                    # for frames that are being rendered
                    continue

                frame_id += 1

                label = image[field]

                if label is None:
                    continue

                kwargs = {}

                if label_type not in (
                    "scalar",
                    "classification",
                    "classifications",
                    "segmentation",
                ):
                    kwargs["load_tracks"] = load_tracks
                    kwargs["occluded_attrs"] = occluded_attrs
                    kwargs["group_id_attrs"] = group_id_attrs

                if label_type == "scalar":
                    labels = label
                    kwargs["assign_scalar_attrs"] = assign_scalar_attrs
                    func = self._create_scalar_tags
                elif label_type == "classification":
                    labels = [label]
                    func = self._create_classification_tags
                elif label_type == "classifications":
                    labels = label.classifications
                    func = self._create_classification_tags
                elif label_type in ("detection", "instance"):
                    labels = [label]
                    func = self._create_detection_shapes
                elif label_type in ("detections", "instances"):
                    labels = label.detections
                    func = self._create_detection_shapes
                elif label_type in ("polyline", "polygon"):
                    labels = [label]
                    func = self._create_polyline_shapes
                elif label_type in ("polylines", "polygons"):
                    labels = label.polylines
                    func = self._create_polyline_shapes
                elif label_type == "keypoint":
                    labels = [label]
                    func = self._create_keypoint_shapes
                elif label_type == "keypoints":
                    labels = label.keypoints
                    func = self._create_keypoint_shapes
                elif label_type == "segmentation":
                    labels = label
                    func = self._create_segmentation_shapes
                    kwargs["mask_targets"] = mask_targets
                else:
                    raise ValueError(
                        "Label type '%s' of field '%s' is not supported"
                        % (label_type, label_field)
                    )

                ids, _tags_or_shapes, _tracks, _remapped_attrs = func(
                    labels,
                    cvat_schema,
                    label_field,
                    frame_id,
                    frame_size,
                    label_type=label_type,
                    **kwargs,
                )

                tags_or_shapes.extend(_tags_or_shapes)
                self._merge_tracks(tracks, _tracks)
                remapped_attrs.update(_remapped_attrs)

                if ids is not None:
                    if is_video:
                        if sample.id not in id_map:
                            id_map[sample.id] = {}

                        id_map[sample.id][image.id] = ids
                    else:
                        id_map[sample.id] = ids

                next_frame_idx = _get_next_frame(next_frame_idx, frame_step)
                if frame_stop is not None and next_frame_idx > frame_stop:
                    break

        # Record any attribute name changes due to label attributes being
        # stored in attributes dicts rather than as dynamic fields
        for attr_schema in cvat_schema.values():
            for name, attr in attr_schema.items():
                if name in remapped_attrs:
                    attr["name"] = remapped_attrs[name]

        if load_tracks:
            tracks = self._finalize_tracks(tracks, frame_id, only_keyframes)
            return id_map, tags_or_shapes, tracks

        return id_map, tags_or_shapes

    def _create_scalar_tags(
        self,
        label,
        cvat_schema,
        label_field,
        frame_id,
        frame_size,
        label_type=None,
        assign_scalar_attrs=False,
    ):
        if label is None:
            label = ""

        if assign_scalar_attrs[label_field]:
            if label_field not in cvat_schema:
                return False, [], {}, {}

            scalar_attr_name = next(iter(cvat_schema[label_field].keys()))

            class_name = label_field
            attributes = [
                {
                    "spec_id": scalar_attr_name,
                    "value": _stringify_value(label),
                }
            ]
        else:
            class_name = _stringify_value(label)
            if class_name not in cvat_schema:
                return False, [], {}, {}

            attributes = []

        tags = [
            {
                "label_id": class_name,
                "group": 0,
                "frame": frame_id,
                "source": "manual",
                "attributes": attributes,
            }
        ]

        return True, tags, {}, {}

    def _create_classification_tags(
        self,
        classifications,
        cvat_schema,
        label_field,
        frame_id,
        frame_size,
        label_type=None,
    ):
        ids = []
        tags = []
        remapped_attrs = {}

        for cn in classifications:
            (
                class_name,
                attributes,
                _,
                _remapped_attrs,
                _,
                group_id,
            ) = self._parse_label(cn, cvat_schema, label_field)

            if class_name is None:
                continue

            ids.append(cn.id)
            remapped_attrs.update(_remapped_attrs)
            tags.append(
                {
                    "label_id": class_name,
                    "group": group_id,
                    "frame": frame_id,
                    "source": "manual",
                    "attributes": attributes,
                }
            )

        if label_type == "classification":
            ids = ids[0] if ids else None

        return ids, tags, {}, remapped_attrs

    def _create_detection_shapes(
        self,
        detections,
        cvat_schema,
        label_field,
        frame_id,
        frame_size,
        label_type=None,
        label_id=None,
        load_tracks=False,
        occluded_attrs=None,
        group_id_attrs=None,
    ):
        ids = []
        shapes = []
        tracks = {}
        remapped_attrs = {}

        for det in detections:
            (
                class_name,
                attributes,
                immutable_attrs,
                _remapped_attrs,
                is_occluded,
                group_id,
            ) = self._parse_label(
                det,
                cvat_schema,
                label_field,
                label_id=label_id,
                occluded_attrs=occluded_attrs,
                group_id_attrs=group_id_attrs,
            )

            if class_name is None:
                continue

            curr_shapes = []

            if label_type in ("detection", "detections"):
                x, y, w, h = det.bounding_box
                width, height = frame_size
                xtl = float(round(x * width))
                ytl = float(round(y * height))
                xbr = float(round((x + w) * width))
                ybr = float(round((y + h) * height))
                bbox = [xtl, ytl, xbr, ybr]

                curr_shapes.append(
                    {
                        "type": "rectangle",
                        "occluded": is_occluded,
                        "points": bbox,
                        "label_id": class_name,
                        "group": group_id,
                        "frame": frame_id,
                        "source": "manual",
                        "attributes": attributes,
                    }
                )
            elif label_type in ("instance", "instances"):
                if det.has_mask is None:
                    continue

                if self._server_version >= Version("2.3"):
                    x, y, _, _ = det.bounding_box
                    frame_width, frame_height = frame_size
                    mask_height, mask_width = det.mask.shape
                    xtl, ytl = round(x * frame_width), round(y * frame_height)
                    xbr, ybr = xtl + mask_width, ytl + mask_height

                    # -1 to convert from CVAT indexing
                    rle = HasCVATBinaryMask._mask_to_cvat_rle(det.mask)
                    rle.extend([xtl, ytl, xbr - 1, ybr - 1])

                    curr_shapes.append(
                        {
                            "type": "mask",
                            "occluded": is_occluded,
                            "z_order": 0,
                            "points": rle,
                            "label_id": class_name,
                            "group": group_id,
                            "frame": frame_id,
                            "source": "manual",
                            "attributes": deepcopy(attributes),
                        }
                    )
                else:
                    polygon = det.to_polyline()
                    for points in polygon.points:
                        if len(points) < 3:
                            continue  # CVAT polygons must contain >= 3 points

                        abs_points = HasCVATPoints._to_abs_points(
                            points, frame_size
                        )
                        flattened_points = list(
                            itertools.chain.from_iterable(abs_points)
                        )

                        curr_shapes.append(
                            {
                                "type": "polygon",
                                "occluded": is_occluded,
                                "z_order": 0,
                                "points": flattened_points,
                                "label_id": class_name,
                                "group": group_id,
                                "frame": frame_id,
                                "source": "manual",
                                "attributes": deepcopy(attributes),
                            }
                        )

            if not curr_shapes:
                continue

            ids.append(det.id)
            remapped_attrs.update(_remapped_attrs)

            if load_tracks and det.index is not None:
                keyframe = det.get_attribute_value("keyframe", False)
                self._add_shapes_to_tracks(
                    tracks,
                    curr_shapes,
                    class_name,
                    det.index,
                    frame_id,
                    immutable_attrs,
                    keyframe,
                    group_id=group_id,
                )
            else:
                shapes.extend(curr_shapes)

        return ids, shapes, tracks, remapped_attrs

    def _create_keypoint_shapes(
        self,
        keypoints,
        cvat_schema,
        label_field,
        frame_id,
        frame_size,
        label_type=None,
        load_tracks=False,
        occluded_attrs=None,
        group_id_attrs=None,
    ):
        ids = []
        shapes = []
        tracks = {}
        remapped_attrs = {}

        for kp in keypoints:
            (
                class_name,
                attributes,
                immutable_attrs,
                _remapped_attrs,
                is_occluded,
                group_id,
            ) = self._parse_label(
                kp,
                cvat_schema,
                label_field,
                occluded_attrs=occluded_attrs,
                group_id_attrs=group_id_attrs,
            )

            if class_name is None:
                continue

            abs_points = HasCVATPoints._to_abs_points(kp.points, frame_size)
            flattened_points = list(itertools.chain.from_iterable(abs_points))

            shape = {
                "type": "points",
                "occluded": is_occluded,
                "z_order": 0,
                "points": flattened_points,
                "label_id": class_name,
                "group": group_id,
                "frame": frame_id,
                "source": "manual",
                "attributes": attributes,
            }

            ids.append(kp.id)
            remapped_attrs.update(_remapped_attrs)

            if load_tracks and kp.index is not None:
                keyframe = kp.get_attribute_value("keyframe", False)
                self._add_shapes_to_tracks(
                    tracks,
                    [shape],
                    class_name,
                    kp.index,
                    frame_id,
                    immutable_attrs,
                    keyframe,
                    group_id=group_id,
                )
            else:
                shapes.append(shape)

        return ids, shapes, tracks, remapped_attrs

    def _create_polyline_shapes(
        self,
        polylines,
        cvat_schema,
        label_field,
        frame_id,
        frame_size,
        label_type=None,
        load_tracks=False,
        occluded_attrs=None,
        group_id_attrs=None,
    ):
        ids = []
        shapes = []
        tracks = {}
        remapped_attrs = {}

        for poly in polylines:
            (
                class_name,
                attributes,
                immutable_attrs,
                _remapped_attrs,
                is_occluded,
                group_id,
            ) = self._parse_label(
                poly,
                cvat_schema,
                label_field,
                occluded_attrs=occluded_attrs,
                group_id_attrs=group_id_attrs,
            )

            if class_name is None:
                continue

            curr_shapes = []

            for points in poly.points:
                if poly.filled and len(points) < 3:
                    continue  # CVAT polygons must contain >= 3 points

                abs_points = HasCVATPoints._to_abs_points(points, frame_size)
                flattened_points = list(
                    itertools.chain.from_iterable(abs_points)
                )

                shape = {
                    "type": "polygon" if poly.filled else "polyline",
                    "occluded": is_occluded,
                    "z_order": 0,
                    "points": flattened_points,
                    "label_id": class_name,
                    "group": group_id,
                    "frame": frame_id,
                    "source": "manual",
                    "attributes": deepcopy(attributes),
                }
                curr_shapes.append(shape)

            if not curr_shapes:
                continue

            ids.append(poly.id)
            remapped_attrs.update(_remapped_attrs)

            if load_tracks and poly.index is not None:
                keyframe = poly.get_attribute_value("keyframe", False)
                self._add_shapes_to_tracks(
                    tracks,
                    curr_shapes,
                    class_name,
                    poly.index,
                    frame_id,
                    immutable_attrs,
                    keyframe,
                    group_id=group_id,
                )
            else:
                shapes.extend(curr_shapes)

        return ids, shapes, tracks, remapped_attrs

    def _create_segmentation_shapes(
        self,
        segmentation,
        cvat_schema,
        label_field,
        frame_id,
        frame_size,
        label_type=None,
        mask_targets=None,
    ):
        label_id = segmentation.id
        detections = segmentation.to_detections(mask_targets=mask_targets)

        _, shapes, tracks, remapped_attrs = self._create_detection_shapes(
            detections.detections,
            cvat_schema,
            label_field,
            frame_id,
            frame_size,
            label_type="instances",
            label_id=label_id,
        )

        return label_id, shapes, tracks, remapped_attrs

    def _parse_label(
        self,
        label,
        cvat_schema,
        label_field,
        label_id=None,
        occluded_attrs=None,
        group_id_attrs=None,
    ):
        # If the class is a duplicate, it will have this name
        dup_class_name = "%s_%s" % (label.label, label_field)

        if label.label in cvat_schema:
            class_name = label.label
        elif dup_class_name in cvat_schema:
            class_name = dup_class_name
        else:
            return None, None, None, None, None, None

        attr_schema = cvat_schema[class_name]

        if label_id is None:
            label_id = label.id

        label_attrs = [{"spec_id": "label_id", "value": label_id}]
        immutable_attrs = []
        remapped_attrs = {}

        for name, attr in attr_schema.items():
            if name.startswith("attribute:"):
                name = name[len("attribute:") :]

            value = label.get_attribute_value(name, None)
            if value is None:
                continue

            if name not in label:
                # Found attribute stored in the label's attributes dict
                new_name = "attribute:" + name
                remapped_attrs[name] = new_name
                name = new_name

            attr_dict = {"spec_id": name, "value": _stringify_value(value)}

            if attr["mutable"]:
                label_attrs.append(attr_dict)
            else:
                immutable_attrs.append(attr_dict)

        is_occluded = False
        if occluded_attrs is not None:
            attr_name = occluded_attrs.get(class_name, None)
            if attr_name is not None:
                is_occluded = _parse_occlusion_value(
                    label.get_attribute_value(attr_name, False)
                )

        group_id = 0
        if group_id_attrs is not None:
            attr_name = group_id_attrs.get(class_name, None)
            if attr_name is not None:
                group_id = _parse_value(
                    label.get_attribute_value(attr_name, 0)
                )

        return (
            class_name,
            label_attrs,
            immutable_attrs,
            remapped_attrs,
            is_occluded,
            group_id,
        )

    def _add_shapes_to_tracks(
        self,
        tracks,
        shapes,
        class_name,
        index,
        frame_id,
        immutable_attrs,
        keyframe,
        group_id=0,
    ):
        if class_name not in tracks:
            tracks[class_name] = {}

        if index not in tracks[class_name]:
            tracks[class_name][index] = {
                "label_id": class_name,
                "shapes": [],
                "frame": frame_id,
                "group": group_id,
                "attributes": immutable_attrs,
            }

        _shapes = tracks[class_name][index]["shapes"]

        for shape in shapes:
            shape["outside"] = False
            shape["keyframe"] = keyframe
            del shape["label_id"]
            _shapes.append(shape)

    def _merge_tracks(self, tracks, new_tracks):
        for class_name, class_tracks in new_tracks.items():
            if class_name not in tracks:
                tracks[class_name] = class_tracks
                continue

            for index, track in class_tracks.items():
                if index not in tracks[class_name]:
                    tracks[class_name][index] = track
                else:
                    _track = tracks[class_name][index]
                    _track["shapes"].extend(track["shapes"])
                    _track["frame"] = max(track["frame"], _track["frame"])

    def _finalize_tracks(self, tracks, frame_count, only_keyframes):
        formatted_tracks = []
        for class_tracks in tracks.values():
            for track in class_tracks.values():
                formatted_track = self._finalize_track(
                    track, frame_count, only_keyframes
                )
                formatted_tracks.append(track)

        return formatted_tracks

    def _finalize_track(self, track, frame_count, only_keyframes):
        shapes = track["shapes"]
        new_shapes = []
        prev_frame_shape_inds = []
        prev_frame = None
        next_is_keyframe = True

        for ind, shape in enumerate(shapes):
            frame = shape["frame"]
            if prev_frame is None:
                prev_frame = frame

            if frame != prev_frame:
                if only_keyframes and next_is_keyframe:
                    # The first frame of a new segment is always a keyframe
                    next_is_keyframe = False
                    for ind in prev_frame_shape_inds:
                        shapes[ind]["keyframe"] = True

                # If there is a gap between shapes, we must mark the end of the
                # previous segment as "outside"
                if frame > prev_frame + 1:
                    for prev_ind in prev_frame_shape_inds:
                        last_shape = shapes[prev_ind]
                        new_shape = deepcopy(last_shape)
                        new_shape["frame"] += 1
                        new_shape["outside"] = True
                        if only_keyframes:
                            new_shape["keyframe"] = True

                        new_shapes.append(
                            (max(prev_frame_shape_inds), new_shape)
                        )
                        next_is_keyframe = True

                prev_frame_shape_inds = []
                prev_frame = frame

            prev_frame_shape_inds.append(ind)

        # The shapes in the last frame in the track must be set to "outside"
        last_shape = shapes[-1]
        if last_shape["frame"] < frame_count:
            new_shape = deepcopy(last_shape)
            new_shape["frame"] += 1
            new_shape["outside"] = True
            if only_keyframes:
                new_shape["keyframe"] = True

            new_shapes.append((len(shapes), new_shape))

        # Insert new shapes into track
        for ind, shape in new_shapes[::-1]:
            shapes.insert(ind + 1, shape)

        # Remove non-keyframes if necessary
        if only_keyframes:
            track["shapes"] = [s for s in shapes if s["keyframe"]]

        return track

    def _build_frame_id_map(self, samples):
        frame_id_map = {}
        frame_id = -1

        if samples.media_type == fom.VIDEO:
            sample_ids, frame_ids = samples.values(["id", "frames.id"])
            for _sample_id, _frame_ids in zip(sample_ids, frame_ids):
                for _frame_id in _frame_ids:
                    frame_id += 1
                    frame_id_map[frame_id] = {
                        "sample_id": _sample_id,
                        "frame_id": _frame_id,
                    }
        else:
            sample_ids = samples.values("id")
            for _sample_id in sample_ids:
                frame_id += 1
                frame_id_map[frame_id] = {"sample_id": _sample_id}

        return frame_id_map

    def _remap_ids(self, shapes_or_tags, class_id_map, attr_id_map):
        for obj in shapes_or_tags:
            label_name = obj["label_id"]
            class_id = class_id_map[label_name]
            obj["label_id"] = class_id
            attr_map = attr_id_map[class_id]
            attrs = []
            for attr in obj["attributes"]:
                attr_name = attr["spec_id"]
                if attr_name in attr_map:
                    attr["spec_id"] = attr_map[attr_name]
                    attrs.append(attr)

            obj["attributes"] = attrs

        return shapes_or_tags

    def _remap_track_ids(self, tracks, class_id_map, attr_id_map):
        for track in tracks:
            label_name = track["label_id"]
            class_id = class_id_map[label_name]
            track["label_id"] = class_id
            attr_map = attr_id_map[class_id]
            for shape in track["shapes"]:
                attrs = []
                for attr in shape["attributes"]:
                    attr_name = attr["spec_id"]
                    if attr_name in attr_map:
                        attr["spec_id"] = attr_map[attr_name]
                        attrs.append(attr)

                shape["attributes"] = attrs

            attrs = []
            for attr in track["attributes"]:
                attr_name = attr["spec_id"]
                if attr_name in attr_map:
                    attr["spec_id"] = attr_map[attr_name]
                    attrs.append(attr)

            track["attributes"] = attrs

        return tracks

    def _validate(self, response, kwargs):
        try:
            response.raise_for_status()
        except:
            d = response.__dict__
            logger.info("Arguments the caused this error were:")
            logger.info(kwargs)
            raise Exception(
                "%d error for request %s to url %s with the reason %s. Error "
                "content: %s"
                % (
                    d["status_code"],
                    d["request"],
                    d["url"],
                    d["reason"],
                    d["_content"],
                )
            )


class CVATLabel(object):
    """A label returned by the CVAT API.

    Args:
        label_dict: the dictionary containing the label information loaded from
            the CVAT API
        class_map: a dictionary mapping label IDs to class strings
        attr_id_map: a dictionary mapping attribute IDs attribute names for
            every label
        server_id_map: a dictionary mapping server IDs to FiftyOne label IDs
        attributes (None): an optional list of additional attributes
    """

    def __init__(
        self,
        label_dict,
        class_map,
        attr_id_map,
        server_id_map,
        attributes=None,
    ):
        cvat_id = label_dict["label_id"]
        server_id = label_dict["id"]
        attrs = label_dict["attributes"]

        if attributes is not None:
            attrs.extend(attributes)

        self.id = None
        self.label = class_map[cvat_id]
        self.attributes = {}
        self.fo_attributes = {}

        # Parse attributes
        attr_id_map_rev = {v: k for k, v in attr_id_map[cvat_id].items()}
        for attr in attrs:
            name = attr_id_map_rev[attr["spec_id"]]
            value = _parse_value(attr["value"])
            if value is not None:
                if name.startswith("attribute:"):
                    name = name[len("attribute:") :]
                    fo_attr = CVATAttribute(name, value).to_attribute()
                    self.fo_attributes[name] = fo_attr
                else:
                    self.attributes[name] = value

        # Parse label ID
        label_id = self.attributes.pop("label_id", None)
        if label_id is not None:
            self._set_id(label_id)

        if self.id is None:
            label_id = server_id_map.get(server_id, None)
            if label_id is not None:
                self._set_id(label_id)

    def _set_id(self, label_id):
        try:
            ObjectId(label_id)  # verify that ID is valid
            self.id = label_id
        except:
            pass

    def _set_attributes(self, label):
        if self.id is not None:
            label.id = self.id

        for name, value in self.attributes.items():
            label[name] = value

        if self.fo_attributes:
            label.attributes = self.fo_attributes


class CVATShape(CVATLabel):
    """A shape returned by the CVAT API.

    Args:
        label_dict: the dictionary containing the label information loaded from
            the CVAT API
        class_map: a dictionary mapping label IDs to class strings
        attr_id_map: a dictionary mapping attribute IDs attribute names for
            every label
        server_id_map: a dictionary mapping server IDs to FiftyOne label IDs
        metadata: a dictionary containing the width and height of the frame
        index (None): the tracking index of the shape
        immutable_attrs (None): immutable attributes inherited by this shape
            from its track
        occluded_attrs (None): a dictionary mapping class names to the
            corresponding attribute linked to the CVAT occlusion widget, if any
        group_id_attrs (None): a dictionary mapping class names to the
            corresponding attribute linked to the CVAT group id, if any
        group_id (None): an optional group id value for this shape when it
            cannot be parsed from the label dict
    """

    def __init__(
        self,
        label_dict,
        class_map,
        attr_id_map,
        server_id_map,
        metadata,
        index=None,
        immutable_attrs=None,
        occluded_attrs=None,
        group_id_attrs=None,
        group_id=None,
    ):
        super().__init__(
            label_dict,
            class_map,
            attr_id_map,
            server_id_map,
            attributes=immutable_attrs,
        )

        self.frame_size = (metadata["width"], metadata["height"])
        self.points = label_dict["points"]
        self.index = index

        if "rotation" in label_dict and int(label_dict["rotation"]) != 0:
            self.attributes["rotation"] = label_dict["rotation"]

        # Parse occluded attribute, if necessary
        self._parse_named_attribute(label_dict, "occluded", occluded_attrs)

        # Parse group id attribute, if necessary
        self._parse_named_attribute(
            label_dict, "group", group_id_attrs, default=group_id
        )

    def _parse_named_attribute(
        self, label_dict, attr_key, attrs, default=None
    ):
        if attrs is not None:
            attr_name = attrs.get(self.label, None)
            if attr_name is not None:
                if attr_key in label_dict:
                    attr_value = label_dict[attr_key]
                else:
                    attr_value = default

                self.attributes[attr_name] = attr_value

    def _to_pairs_of_points(self, points):
        reshaped_points = np.reshape(points, (-1, 2))
        return reshaped_points.tolist()

    def to_detection(self):
        """Converts this shape to a :class:`fiftyone.core.labels.Detection`.

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        xtl, ytl, xbr, ybr = self.points
        width, height = self.frame_size
        bbox = [
            xtl / width,
            ytl / height,
            (xbr - xtl) / width,
            (ybr - ytl) / height,
        ]
        label = fol.Detection(
            label=self.label, bounding_box=bbox, index=self.index
        )
        self._set_attributes(label)
        return label

    def to_instance(self):
        """Converts this shape to a :class:`fiftyone.core.labels.Detection`
        with instance mask.

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        xtl, ytl, xbr, ybr = self.points[-4:]
        rel = np.array(self.points[:-4], dtype=int)
        frame_width, frame_height = self.frame_size

        # +1 to convert from CVAT indexing
        mask_w, mask_h = round(xbr - xtl) + 1, round(ybr - ytl) + 1
        mask = HasCVATBinaryMask._rle_to_binary_image_mask(
            rel, mask_height=mask_h, mask_width=mask_w
        )

        bbox = [
            xtl / frame_width,
            ytl / frame_height,
            (xbr - xtl) / frame_width,
            (ybr - ytl) / frame_height,
        ]
        label = fol.Detection(
            label=self.label,
            bounding_box=bbox,
            index=self.index,
            mask=mask,
        )
        self._set_attributes(label)
        return label

    def to_polyline(self, closed=False, filled=False):
        """Converts this shape to a :class:`fiftyone.core.labels.Polyline`.

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        points = self._to_pairs_of_points(self.points)
        rel_points = HasCVATPoints._to_rel_points(points, self.frame_size)
        label = fol.Polyline(
            label=self.label,
            points=[rel_points],
            index=self.index,
            closed=closed,
            filled=filled,
        )
        self._set_attributes(label)
        return label

    def to_polylines(self, closed=False, filled=False):
        """Converts this shape to a :class:`fiftyone.core.labels.Polylines`.

        Returns:
            a :class:`fiftyone.core.labels.Polylines`
        """
        points = self._to_pairs_of_points(self.points)
        rel_points = HasCVATPoints._to_rel_points(points, self.frame_size)
        polyline = fol.Polyline(
            label=self.label,
            points=[rel_points],
            closed=closed,
            filled=filled,
        )
        label = fol.Polylines(polylines=[polyline])
        self._set_attributes(label)
        return label

    def to_keypoint(self):
        """Converts this shape to a :class:`fiftyone.core.labels.Keypoint`.

        Returns:
            a :class:`fiftyone.core.labels.Keypoint`
        """
        points = self._to_pairs_of_points(self.points)
        rel_points = HasCVATPoints._to_rel_points(points, self.frame_size)
        label = fol.Keypoint(
            label=self.label, points=rel_points, index=self.index
        )
        self._set_attributes(label)
        return label

    @classmethod
    def polyline_to_detection(cls, polyline, frame_size):
        """Converts a :class:`fiftyone.core.labels.Polyline` to a
        :class:`fiftyone.core.labels.Detection` with a segmentation mask.

        Args:
            polyline: a :class:`fiftyone.core.labels.Polyline`
            frame_size: the ``(width, height)`` of the frame

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        detection = polyline.to_detection(frame_size=frame_size)
        detection.id = polyline.id
        return detection

    @classmethod
    def polylines_to_segmentation(cls, polylines, frame_size, mask_targets):
        """Converts a :class:`fiftyone.core.labels.Polylines` to a
        :class:`fiftyone.core.labels.Segmentation`.

        Args:
            polylines: a :class:`fiftyone.core.labels.Polylines`
            mask_targets: a dict mapping integer pixel values to label strings
            frame_size: the ``(width, height)`` of the frame

        Returns:
            a :class:`fiftyone.core.labels.Segmentation`
        """
        return polylines.to_segmentation(
            frame_size=frame_size, mask_targets=mask_targets
        )


class CVATTag(CVATLabel):
    """A tag returned by the CVAT API.

    Args:
        label_dict: the dictionary containing the label information loaded from
            the CVAT API
        class_map: a dictionary mapping label IDs to class strings
        attr_id_map: a dictionary mapping attribute IDs attribute names for
            every label
        server_id_map: a dictionary mapping server IDs to FiftyOne label IDs
        attributes (None): an optional list of additional attributes
    """

    def to_classification(self):
        """Converts the tag to a :class:`fiftyone.core.labels.Classification`.

        Returns:
            a :class:`fiftyone.core.labels.Classification`
        """
        label = fol.Classification(label=self.label)
        self._set_attributes(label)
        return label


def load_cvat_image_annotations(xml_path):
    """Loads the CVAT image annotations from the given XML file.

    See :ref:`this page <CVATImageDataset-import>` for format details.

    Args:
        xml_path: the path to the annotations XML file

    Returns:
        a tuple of

        -   **info**: a dict of dataset info
        -   **cvat_task_labels**: a :class:`CVATTaskLabels` instance
        -   **cvat_images**: a list of :class:`CVATImage` instances
    """
    d = fou.load_xml_as_json_dict(xml_path)
    annotations = d.get("annotations", {})

    # Verify version
    version = annotations.get("version", None)
    if version is None:
        logger.warning("No version tag found; assuming version 1.1")
    elif version != "1.1":
        logger.warning(
            "Only version 1.1 is explicitly supported; found %s. Trying to "
            "load assuming version 1.1 format",
            version,
        )

    # Load meta
    meta = annotations.get("meta", {})

    # Load task labels
    task = meta.get("task", {})
    labels_dict = task.get("labels", {})
    cvat_task_labels = CVATTaskLabels.from_labels_dict(labels_dict)

    # Load annotations
    image_dicts = _ensure_list(annotations.get("image", []))
    cvat_images = [CVATImage.from_image_dict(id) for id in image_dicts]

    # Load dataset info
    info = {"task_labels": cvat_task_labels.labels}
    if "created" in task:
        info["created"] = task["created"]

    if "updated" in task:
        info["updated"] = task["updated"]

    if "dumped" in meta:
        info["dumped"] = meta["dumped"]

    return info, cvat_task_labels, cvat_images


def load_cvat_video_annotations(xml_path):
    """Loads the CVAT video annotations from the given XML file.

    See :ref:`this page <CVATVideoDataset-import>` for format details.

    Args:
        xml_path: the path to the annotations XML file

    Returns:
        a tuple of

        -   **info**: a dict of dataset info
        -   **cvat_task_labels**: a :class:`CVATTaskLabels` instance
        -   **cvat_tracks**: a list of :class:`CVATTrack` instances
    """
    d = fou.load_xml_as_json_dict(xml_path)
    annotations = d.get("annotations", {})

    # Verify version
    version = annotations.get("version", None)
    if version is None:
        logger.warning("No version tag found; assuming version 1.1")
    elif version != "1.1":
        logger.warning(
            "Only version 1.1 is explicitly supported; found %s. Trying to "
            "load assuming version 1.1 format",
            version,
        )

    # Load meta
    meta = annotations.get("meta", {})

    # Load task labels
    task = meta.get("task", {})
    labels_dict = task.get("labels", {})
    cvat_task_labels = CVATTaskLabels.from_labels_dict(labels_dict)

    # Load annotations
    track_dicts = _ensure_list(annotations.get("track", []))
    if track_dicts:
        original_size = task["original_size"]
        frame_size = (
            int(original_size["width"]),
            int(original_size["height"]),
        )
        cvat_tracks = [
            CVATTrack.from_track_dict(td, frame_size) for td in track_dicts
        ]
    else:
        cvat_tracks = []

    # Load dataset info
    info = {"task_labels": cvat_task_labels.labels}
    if "created" in task:
        info["created"] = task["created"]

    if "updated" in task:
        info["updated"] = task["updated"]

    if "dumped" in meta:
        info["dumped"] = meta["dumped"]

    return info, cvat_task_labels, cvat_tracks


def _is_supported_attribute_type(value):
    return (
        isinstance(value, bool) or etau.is_str(value) or etau.is_numeric(value)
    )


def _cvat_tracks_to_frames_dict(cvat_tracks):
    frames = defaultdict(dict)
    for cvat_track in cvat_tracks:
        labels = cvat_track.to_labels()
        for frame_number, label in labels.items():
            frame = frames[frame_number]

            if isinstance(label, fol.Detection):
                if "detections" not in frame:
                    frame["detections"] = fol.Detections()

                frame["detections"].detections.append(label)
            elif isinstance(label, fol.Polyline):
                if "polylines" not in frame:
                    frame["polylines"] = fol.Polylines()

                frame["polylines"].polylines.append(label)
            elif isinstance(label, fol.Keypoint):
                if "keypoints" not in frame:
                    frame["keypoints"] = fol.Keypoints()

                frame["keypoints"].keypoints.append(label)

    return frames


def _frames_to_cvat_tracks(frames, frame_size):
    labels_map = defaultdict(lambda: defaultdict(dict))
    no_index_map = defaultdict(list)
    found_label = False

    def process_label(label, frame_number):
        if label.index is not None:
            labels_map[label.index][type(label)][frame_number] = label
        else:
            no_index_map[frame_number].append(label)

    # Convert from per-frame to per-object tracks
    for frame_number, frame_dict in frames.items():
        for _, value in frame_dict.items():
            if isinstance(value, (fol.Detection, fol.Polyline, fol.Keypoint)):
                found_label = True
                process_label(value, frame_number)
            elif isinstance(value, fol.Detections):
                found_label = True
                for detection in value.detections:
                    process_label(detection, frame_number)
            elif isinstance(value, fol.Polylines):
                found_label = True
                for polyline in value.polylines:
                    process_label(polyline, frame_number)
            elif isinstance(value, fol.Keypoints):
                found_label = True
                for keypoint in value.keypoints:
                    process_label(keypoint, frame_number)
            elif value is not None:
                msg = "Ignoring unsupported label type '%s'" % value.__class__
                warnings.warn(msg)

    if not found_label:
        return None  # unlabeled

    cvat_tracks = []

    # Generate object tracks
    max_index = -1
    used_indices = set()
    for index in sorted(labels_map):
        for label_type, labels in labels_map[index].items():
            _index = index if index not in used_indices else max_index + 1
            used_indices.add(_index)
            max_index = max(_index, max_index)
            cvat_track = CVATTrack.from_labels(_index, labels, frame_size)
            cvat_tracks.append(cvat_track)

    # Generate single tracks for detections with no `index`
    index = max_index
    for frame_number, labels in no_index_map.items():
        for label in labels:
            index += 1
            cvat_track = CVATTrack.from_labels(
                index, {frame_number: label}, frame_size
            )
            cvat_tracks.append(cvat_track)

    return cvat_tracks


def _get_single_polyline_points(polyline):
    num_polylines = len(polyline.points)
    if num_polylines == 0:
        return []

    if num_polylines > 1:
        msg = (
            "Found polyline with more than one shape; only the first shape "
            "will be stored in CVAT format"
        )
        warnings.warn(msg)

    return polyline.points[0]


def _ensure_list(value):
    if value is None:
        return []

    if isinstance(value, list):
        return value

    return [value]


def _stringify_value(value):
    if value is None:
        return ""

    if value is True:
        return "true"

    if value is False:
        return "false"

    return str(value)


def _to_int_bool(value):
    return int(bool(value))


def _from_int_bool(value):
    try:
        return bool(int(value))
    except:
        pass

    return None


def _parse_value(value):
    try:
        return int(value)
    except:
        pass

    try:
        return float(value)
    except:
        pass

    if etau.is_str(value):
        if value in ("True", "true"):
            return True

        if value in ("False", "false"):
            return False

        if value in ("None", ""):
            return None

    return value


def _parse_occlusion_value(value):
    if isinstance(value, bool):
        return value

    if etau.is_str(value):
        str_value = "'%s'" % value
        bool_value = False if value.lower() == "false" else bool(value)
    else:
        str_value = str(value)
        bool_value = bool(value)

    msg = "Casting occlusion value %s of type %s to boolean %s" % (
        str_value,
        type(value),
        bool_value,
    )
    warnings.warn(msg)

    return bool_value


# Track interpolation code sourced from CVAT:
# https://github.com/opencv/cvat/blob/31f6234b0cdc656c9dde4294c1008560611c6978/cvat/apps/dataset_manager/annotation.py#L431-L730
def _get_interpolated_shapes(track_shapes):
    def copy_shape(source, frame, points=None):
        copied = deepcopy(source)
        copied["keyframe"] = False
        copied["frame"] = frame
        if points is not None:
            copied["points"] = points
        return copied

    def simple_interpolation(shape0, shape1):
        shapes = []
        distance = shape1["frame"] - shape0["frame"]
        diff = np.subtract(shape1["points"], shape0["points"])

        for frame in range(shape0["frame"] + 1, shape1["frame"]):
            offset = (frame - shape0["frame"]) / distance
            points = shape0["points"] + diff * offset

            shapes.append(copy_shape(shape0, frame, points.tolist()))

        return shapes

    def points_interpolation(shape0, shape1):
        if len(shape0["points"]) == 2 and len(shape1["points"]) == 2:
            return simple_interpolation(shape0, shape1)
        else:
            shapes = []
            for frame in range(shape0["frame"] + 1, shape1["frame"]):
                shapes.append(copy_shape(shape0, frame))

        return shapes

    def interpolate_position(left_position, right_position, offset):
        def to_array(points):
            return np.asarray(
                list(map(lambda point: [point["x"], point["y"]], points))
            ).flatten()

        def to_points(array):
            return list(
                map(
                    lambda point: {"x": point[0], "y": point[1]},
                    np.asarray(array).reshape(-1, 2),
                )
            )

        def curve_length(points):
            length = 0
            for i in range(1, len(points)):
                dx = points[i]["x"] - points[i - 1]["x"]
                dy = points[i]["y"] - points[i - 1]["y"]
                length += np.sqrt(dx**2 + dy**2)
            return length

        def curve_to_offset_vec(points, length):
            offset_vector = [0]
            accumulated_length = 0
            for i in range(1, len(points)):
                dx = points[i]["x"] - points[i - 1]["x"]
                dy = points[i]["y"] - points[i - 1]["y"]
                accumulated_length += np.sqrt(dx**2 + dy**2)
                offset_vector.append(accumulated_length / length)

            return offset_vector

        def find_nearest_pair(value, curve):
            minimum = [0, abs(value - curve[0])]
            for i in range(1, len(curve)):
                distance = abs(value - curve[i])
                if distance < minimum[1]:
                    minimum = [i, distance]

            return minimum[0]

        def match_left_right(left_curve, right_curve):
            matching = {}
            for i, left_curve_item in enumerate(left_curve):
                matching[i] = [find_nearest_pair(left_curve_item, right_curve)]
            return matching

        def match_right_left(left_curve, right_curve, left_right_matching):
            matched_right_points = list(
                itertools.chain.from_iterable(left_right_matching.values())
            )
            unmatched_right_points = filter(
                lambda x: x not in matched_right_points,
                range(len(right_curve)),
            )
            updated_matching = deepcopy(left_right_matching)

            for right_point in unmatched_right_points:
                left_point = find_nearest_pair(
                    right_curve[right_point], left_curve
                )
                updated_matching[left_point].append(right_point)

            for key, value in updated_matching.items():
                updated_matching[key] = sorted(value)

            return updated_matching

        def reduce_interpolation(
            interpolated_points, matching, left_points, right_points
        ):
            def average_point(points):
                sumX = 0
                sumY = 0
                for point in points:
                    sumX += point["x"]
                    sumY += point["y"]

                return {"x": sumX / len(points), "y": sumY / len(points)}

            def compute_distance(point1, point2):
                return np.sqrt(
                    ((point1["x"] - point2["x"])) ** 2
                    + ((point1["y"] - point2["y"]) ** 2)
                )

            def minimize_segment(
                base_length, N, start_interpolated, stop_interpolated
            ):
                threshold = base_length / (2 * N)
                minimized = [interpolated_points[start_interpolated]]
                latest_pushed = start_interpolated
                for i in range(start_interpolated + 1, stop_interpolated):
                    distance = compute_distance(
                        interpolated_points[latest_pushed],
                        interpolated_points[i],
                    )

                    if distance >= threshold:
                        minimized.append(interpolated_points[i])
                        latest_pushed = i

                minimized.append(interpolated_points[stop_interpolated])

                if len(minimized) == 2:
                    distance = compute_distance(
                        interpolated_points[start_interpolated],
                        interpolated_points[stop_interpolated],
                    )

                    if distance < threshold:
                        return [average_point(minimized)]

                return minimized

            reduced = []
            interpolated_indexes = {}
            accumulated = 0
            for i in range(len(left_points)):
                interpolated_indexes[i] = []
                for _ in range(len(matching[i])):
                    interpolated_indexes[i].append(accumulated)
                    accumulated += 1

            def left_segment(start, stop):
                start_interpolated = interpolated_indexes[start][0]
                stop_interpolated = interpolated_indexes[stop][0]

                if start_interpolated == stop_interpolated:
                    reduced.append(interpolated_points[start_interpolated])
                    return

                base_length = curve_length(left_points[start : stop + 1])
                N = stop - start + 1

                reduced.extend(
                    minimize_segment(
                        base_length, N, start_interpolated, stop_interpolated
                    )
                )

            def right_segment(left_point):
                start = matching[left_point][0]
                stop = matching[left_point][-1]
                start_interpolated = interpolated_indexes[left_point][0]
                stop_interpolated = interpolated_indexes[left_point][-1]
                base_length = curve_length(right_points[start : stop + 1])
                N = stop - start + 1

                reduced.extend(
                    minimize_segment(
                        base_length, N, start_interpolated, stop_interpolated
                    )
                )

            previous_opened = None
            for i in range(len(left_points)):
                if len(matching[i]) == 1:
                    if previous_opened is not None:
                        if matching[i][0] == matching[previous_opened][0]:
                            continue
                        else:
                            start = previous_opened
                            stop = i - 1
                            left_segment(start, stop)
                            previous_opened = i
                    else:
                        previous_opened = i
                else:
                    if previous_opened is not None:
                        start = previous_opened
                        stop = i - 1
                        left_segment(start, stop)
                        previous_opened = None

                    right_segment(i)

            if previous_opened is not None:
                left_segment(previous_opened, len(left_points) - 1)

            return reduced

        left_points = to_points(left_position["points"])
        right_points = to_points(right_position["points"])
        left_offset_vec = curve_to_offset_vec(
            left_points, curve_length(left_points)
        )
        right_offset_vec = curve_to_offset_vec(
            right_points, curve_length(right_points)
        )

        matching = match_left_right(left_offset_vec, right_offset_vec)
        completed_matching = match_right_left(
            left_offset_vec, right_offset_vec, matching
        )

        interpolated_points = []
        for left_point_index, left_point in enumerate(left_points):
            for right_point_index in completed_matching[left_point_index]:
                right_point = right_points[right_point_index]
                interpolated_points.append(
                    {
                        "x": left_point["x"]
                        + (right_point["x"] - left_point["x"]) * offset,
                        "y": left_point["y"]
                        + (right_point["y"] - left_point["y"]) * offset,
                    }
                )

        reducedPoints = reduce_interpolation(
            interpolated_points, completed_matching, left_points, right_points
        )

        return to_array(reducedPoints).tolist()

    def polyshape_interpolation(shape0, shape1):
        shapes = []
        is_polygon = shape0["type"] == "polygon"
        if is_polygon:
            shape0["points"].extend(shape0["points"][:2])
            shape1["points"].extend(shape1["points"][:2])

        distance = shape1["frame"] - shape0["frame"]
        for frame in range(shape0["frame"] + 1, shape1["frame"]):
            offset = (frame - shape0["frame"]) / distance
            points = interpolate_position(shape0, shape1, offset)

            shapes.append(copy_shape(shape0, frame, points))

        if is_polygon:
            shape0["points"] = shape0["points"][:-2]
            shape1["points"] = shape1["points"][:-2]
            for shape in shapes:
                shape["points"] = shape["points"][:-2]

        return shapes

    def interpolate(shape0, shape1):
        is_same_type = shape0["type"] == shape1["type"]
        is_rectangle = shape0["type"] == "rectangle"
        is_cuboid = shape0["type"] == "cuboid"
        is_polygon = shape0["type"] == "polygon"
        is_polyline = shape0["type"] == "polyline"
        is_points = shape0["type"] == "points"

        if not is_same_type:
            raise NotImplementedError()

        shapes = []
        if is_rectangle or is_cuboid:
            shapes = simple_interpolation(shape0, shape1)
        elif is_points:
            shapes = points_interpolation(shape0, shape1)
        elif is_polygon or is_polyline:
            shapes = polyshape_interpolation(shape0, shape1)
        else:
            raise NotImplementedError()

        return shapes

    if not track_shapes:
        return []

    if len(track_shapes) == 1:
        track_shapes[0]["keyframe"] = True
        return track_shapes

    shapes = []
    curr_frame = track_shapes[0]["frame"]
    end_frame = track_shapes[-1]["frame"]
    prev_shape = {}
    for shape in track_shapes:
        if prev_shape:
            if shape["frame"] <= curr_frame:
                continue

            for attr in prev_shape["attributes"]:
                if attr["spec_id"] not in map(
                    lambda el: el["spec_id"], shape["attributes"]
                ):
                    shape["attributes"].append(deepcopy(attr))

            if not prev_shape["outside"]:
                shapes.extend(interpolate(prev_shape, shape))

        shape["keyframe"] = True
        shapes.append(shape)

        curr_frame = shape["frame"]
        prev_shape = shape

        if end_frame <= curr_frame:
            break

    if not prev_shape["outside"]:
        shape = deepcopy(prev_shape)
        shape["frame"] = end_frame
        shapes.extend(interpolate(prev_shape, shape))

    return shapes


def _validate_frame_arg(arg, arg_name):
    if arg is None:
        return arg

    if not isinstance(arg, (int, list, dict)):
        raise ValueError(
            "Unsupported type %s for argument '%s'. Expected an int, list, or "
            "dict" % (type(arg), arg_name)
        )

    if arg_name == "frame_step":
        if isinstance(arg, int):
            args = [arg]
        elif isinstance(arg, dict):
            args = arg.values()
        else:
            args = arg

        for a in args:
            if a < 1:
                raise ValueError("'frame_step' must be >= 1; found %d" % a)

    return arg


def _render_frame_arg(arg, idx, samples_batch):
    if isinstance(arg, list):
        return arg[idx % len(arg)]

    if isinstance(arg, dict):
        try:
            return arg[samples_batch.values("filepath")[0]]
        except:
            return None

    return arg


def _parse_frame_step(data_resp):
    # Parse frame step from a frame filter like ``{"frame_filter": "step=5"}``
    filt = data_resp.get("frame_filter", None)
    if not filt:
        return None

    steps = [
        int(s.split("=")[1])
        for s in filt.split(",")
        if "step" == s.split("=")[0]
    ]

    if len(steps) < 1:
        return None

    return steps[0]


def _remap_annotation_frame(frame_value, frame_start, frame_step):
    if frame_step is None:
        frame_step = 1

    return int(frame_value * frame_step) + frame_start


def _remap_annotation_frames(annos, frame_start, frame_stop, frame_step):
    if frame_start == 0 and frame_step is None:
        return annos

    # If a video was subsampled
    if isinstance(annos, list):
        return [
            _remap_annotation_frames(a, frame_start, frame_stop, frame_step)
            for a in annos
        ]

    if isinstance(annos, dict):
        for k, v in annos.items():
            if k == "frame":
                annos[k] = _remap_annotation_frame(v, frame_start, frame_step)
            elif isinstance(v, list) or isinstance(v, dict):
                annos[k] = _remap_annotation_frames(
                    v, frame_start, frame_stop, frame_step
                )

    return annos


def _get_next_frame(next_frame_idx, frame_step):
    if frame_step is None:
        frame_step = 1

    return next_frame_idx + frame_step
