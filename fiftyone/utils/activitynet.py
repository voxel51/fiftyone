"""
Utilities for working with the
`ActivityNet <http://activity-net.org/index.html>`
dataset.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from itertools import chain
import logging
import os
import random

import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.utils as fou
import fiftyone.utils.data as foud
import fiftyone.utils.youtubedl as fouy

youtube_dl = fou.lazy_import("youtube_dl")


logger = logging.getLogger(__name__)


def ActivityNetDownloadRunConfig(object):
    def __init__(
        self,
        dataset_dir,
        split,
        source_dir=None,
        classes=None,
        max_duration=None,
        copy_files=True,
        num_workers=None,
        shuffle=None,
        seed=None,
        max_samples=None,
        version=None,
    ):
        self.info = self.build_activitynet_info(dataset_dir)
        self.split = split
        self.source_dir = source_dir
        self.max_duration = max_duration
        self.copy_files = copy_files
        self.num_workers = num_workers
        self.shuffle = shuffle
        self.seed = seed
        self.max_samples = max_samples
        self.version = version

        self.classes = self._parse_classes(classes)

        self.validate()

    def build_activitynet_info(self, dataset_dir):
        foz_dir, split, version = ActivityNetDatasetInfo.get_dir_info(
            dataset_dir
        )
        if version == "100":
            return ActivityNet100DatasetInfo(foz_dir)
        else:
            return ActivityNet200DatasetInfo(foz_dir)

    @property
    def load_entire_split(self):
        return bool(
            self.max_duration is None
            and self.max_samples is None
            and self.classes is None
        )

    def validate(self):
        self.validate_split()
        self.validate_version()
        self.validate_max_duration()

    def _parse_classes(self, classes):
        if classes is not None:
            if self.split == "test":
                logger.warning(
                    "Test split is unlabeled; ignoring classes requirement"
                )
                return None
            else:
                non_existant_classes = list(
                    set(classes) - set(self.info.all_classes)
                )
                if non_existant_classes:
                    raise ValueError(
                        "The following classes specified but do not exist in the "
                        "dataset; %s",
                        tuple(non_existant_classes),
                    )
        return classes

    def validate_split(self):
        if self.split not in _SPLIT_MAP.keys():
            raise ValueError(
                "Unsupported split '%s'; supported values are %s"
                % (self.split, tuple(_SPLIT_MAP.keys()))
            )

    def validate_version(self):
        if self.version != self.info.version:
            raise ValueError(
                "Provided dataset version `%s` does not match the dataset "
                "directory version `%s`" % (self.version, self.info.version)
            )

    def validate_max_duration(self):
        if self.max_duration is not None and self.max_duration <= 0:
            raise ValueError(
                "`max_duration` must be a positive integer or float"
            )

    def build(self):
        return self.run_cls(self)

    @property
    def run_cls(self):
        ActivityNetDownloadRun


class ActivityNetDownloadRun(object):
    def __init__(self, config):
        self.config = config


def get_activitynet_info(dataset_dir):
    foz_dir, split, version = ActivityNetDatasetInfo.get_dir_info(dataset_dir)
    if version == "100":
        return ActivityNet100DatasetInfo(foz_dir)
    else:
        return ActivityNet200DatasetInfo(foz_dir)


class ActivityNetDatasetManager(object):
    """Manages the sample ids and labels that need to be downloaded using an
    ActivityNetDatasetDownloader
    """

    def __inif__(self, foz_dir, version):
        self.version = version
        self.a100_info = ActivityNet100DatasetInfo(foz_dir)
        self.a200_info = ActivityNet200DatasetInfo(foz_dir)

    @property
    def info(self):
        if self.version == "100":
            return self.a100_info
        elif self.version == "200":
            return self.a200_info
        else:
            raise ValueError(
                "Dataset version '%s' is not supported" % self.version
            )

    def process_source(self, source_dir, copy_files):
        for item in os.listdir(source_dir):
            if item in _SOURCE_ZIPS:
                self._process_source_zip(item, source_dir, copy_files)
            elif item in _SOURCE_DIR_NAMES:
                self._process_source_dir(item, source_dir, copy_files)

        self.a100_info.update_existing_sample_ids()
        self.a200_info.update_existing_sample_ids()

    def _process_source_zip(self, zip_name, source_dir, copy_files):
        zip_path = os.path.join(source_dir, zip_name)
        must_extract = self._check_zip_requirement(zip_name)

        if must_extract:
            self._extract_and_process_dir(zip_name, source_dir, copy_files)

    def _check_zip_requirement(self, zip_name):
        if zip_name == "missing_files.zip":
            version = "200"
            splits = ["train", "test", "validation"]
        else:
            version = "100" if "v1-2" in zip_name else "200"
            splits = []
            if "test" in zip_name:
                splits.append("test")
            if "train" in zip_name:
                splits.append("train")
            if "val" in zip_name:
                splits.append("validation")

        return self._is_missing_videos(version, splits)

    def _is_missing_videos(self, version, splits):
        missing_splits = []
        for split in splits:
            missing_splits.append(
                self._split_is_missing_videos(version, split)
            )
        return any(missing_splits)

    def _split_is_missing_videos(self, version, split):
        existing_samples, _ = self._get_samples(version, split)
        num_existing_samples = len(existing_samples)
        num_required_samples = _NUM_TOTAL_SAMPLES[version][split]
        if num_existing_samples != num_required_samples:
            return True
        return False

    def _get_samples(self, version, split):
        if version == "100":
            info = self.a100_info
        else:
            info = self.a200_info

        existing_samples = info._splitwise_existing_sample_ids[split]
        all_samples = info._splitwise_sample_ids[split]
        return existing_samples, all_samples

    def _extract_and_process_dir(self, zip_name, source_dir, copy_files):
        zip_path = os.path.join(source_dir, zip_name)
        etau.extract_archive(zip_path, delete_archive=True)
        base_name = zip_name.replace(".zip", "").replace(".tar.gz", "")
        if "missing_files" not in base_name:
            base_name = "v1-2" if "v1-2" in base_name else "v1-3"

        self._process_source_dir(base_name, source_dir, copy_files)

    def _process_source_dir(self, dir_name, source_dir, copy_files):
        dir_list = []
        if dir_name == "missing_files":
            videos_dir = os.path.join(source_dir, dir_name)
            self._process_files(videos_dir, copy_files)
            dir_list.append((videos_dir, None, None))
        else:
            if "v1-2" in dir_name:
                version = "100"
            else:
                version = "200"

            if "missing_files" in dir_name:
                videos_dir = os.path.join(source_dir, dir_name)
                dir_list.append((videos_dir, version, "test"))

            else:
                version_dir = os.path.join(source_dir, dir_name)
                for split_dir in os.listdir(version_dir):
                    if split_dir == "train_val":
                        split = None
                    if split_dir == "val":
                        split = "validation"
                    else:
                        split = split_dir

                    videos_dir = os.path.join(version_dir, split_dir)
                    dir_list.append((videos_dir, version, split))

        for videos_dir, version, split in dir_list:
            self._process_files(
                videos_dir, copy_files, version=version, split=split
            )

    def _process_files(self, videos_dir, copy_files, version=None, split=None):
        existing_videos = self.a200_info.existing_sample_ids
        general_dest_dir = None
        if version is not None and split is not None:
            if version == "100":
                general_dest_dir = self.a100_info.data_dir(split)
            else:
                general_dest_dir = self.a200_info.data_dir(split)

        for video in os.listdir(videos_dir):
            video_id = os.path.splitext(video)[0]
            if video_id in existing_videos:
                continue

            if not general_dest_dir:
                dest_dir = self._get_video_destination(
                    video_id, version=version, split=split
                )
            else:
                dest_dir = general_dest_dir

            video_path = os.path.join(videos_dir, video)
            self._process_source_video(video_path, dest_dir, copy_files)

    def _get_video_destination(self, video_id, version=None, split=None):
        if version is None:
            version = self.a100_info.get_sample_dataset_version(video_id)
        if split is None:
            split = self.a200_info.get_sample_split(video_id)

        if version == "100":
            data_dir = self.a100_info.data_dir(split)
        else:
            data_dir = self.a200_info.data_dir(split)

        return data_dir

    def _process_source_video(self, video_path, dest_dir, copy_files):
        if copy_files:
            etau.copy_file(video_path, dest_dir)
        else:
            etau.move_file(video_path, dest_dir)

    @classmethod
    def from_dataset_dir(cls, dataset_dir, version):
        foz_dir, _, _ = ActivityNetDatasetInfo.get_dir_info(dataset_dir)
        return cls(foz_dir, version)


class ActivityNetDatasetInfo(object):
    """Contains information related to paths, labels, and sample ids"""

    def __init__(self, foz_dir):
        self.foz_dir = foz_dir

        self.raw_annotations = self._get_raw_annotations()
        self.taxonomy = self.raw_annotations["taxonomy"]
        self.all_classes = self.get_all_classes(self.taxonomy)

        self._splitwise_sample_ids = self._parse_sample_ids()
        self.all_sample_ids = _flatten_list(
            self._splitwise_sample_ids.values()
        )

        self.update_existing_sample_ids()

    @property
    def splits(self):
        return ["train", "test", "validation"]

    @property
    def version(self):
        raise NotImplementedError("Subclass must implement version")

    @property
    def dataset_dir(self):
        return os.path.join(self.foz_dir, "activitynet-%s" % self.version)

    @property
    def raw_anno_path(self):
        return os.path.join(self.dataset_dir, "raw_labels.json")

    @property
    def train_sample_ids(self):
        return self._splitwise_sample_ids["train"]

    @property
    def test_sample_ids(self):
        return self._splitwise_sample_ids["test"]

    @property
    def validation_sample_ids(self):
        return self._splitwise_sample_ids["validation"]

    @property
    def existing_train_sample_ids(self):
        return self._splitwise_existing_sample_ids["train"]

    @property
    def existing_test_sample_ids(self):
        return self._splitwise_existing_sample_ids["test"]

    @property
    def existing_validation_sample_ids(self):
        return self._splitwise_existing_sample_ids["validation"]

    def split_dir(self, split):
        return os.path.join(self.dataset_dir, split)

    def data_dir(self, split):
        return os.path.join(self.split_dir(split), "data")

    def labels_path(self, split):
        return os.path.join(self.split_dir(split), "labels.json")

    def error_path(self, split):
        return os.path.join(self.split_dir(split), "download_errors.json")

    def _parse_sample_ids(self):
        ids = {s: [] for s in self.splits}
        for annot_id, annot in self.raw_annotations["database"].items():
            split = _SPLIT_MAP_REV[annot["subset"]]
            ids[split].append(annot_id)
        return ids

    def update_existing_sample_ids(self):
        self._splitwise_existing_sample_ids = None
        self.existing_sample_ids = None
        raise NotImplementedError(
            "Subclass must implement `update_existing_sample_ids()`"
        )

    def _get_existing_sample_ids(self):
        ids = {}
        for split in self.splits:
            ids[split] = self._get_existing_sample_ids_split(split)
        return ids

    def _get_existing_sample_ids_split(self, split):
        videos_dir = self.data_dir(split)
        video_filenames = os.listdir(videos_dir)
        video_ids = []
        for vfn in video_filenames:
            video_id, ext = os.path.splitext(vfn)
            if ext != ".mp4":
                os.remove(os.path.join(videos_dir, vfn))
            else:
                video_ids.append(video_id)

        return video_ids

    def _get_raw_annotations(self):
        if not os.path.isfile(self.raw_anno_path):
            anno_link = _ANNOTATION_DOWNLOAD_LINKS[self.version]
            etaw.download_file(anno_link, path=self.raw_anno_path)

        return etas.load_json(self.raw_anno_path)

    @classmethod
    def get_all_classes(cls, taxonomy):
        classes = set()
        parents = set()
        for node in taxonomy:
            node_name = node["nodeName"]
            parent_name = node["parentName"]
            classes.add(node_name)
            parents.add(parent_name)

        classes = sorted(classes - parents)

        return classes

    @classmethod
    def get_dir_info(cls, dataset_dir):
        if not os.path.basename(dataset_dir):
            dataset_dir = os.path.dirname(dataset_dir)

        split = os.path.basename(dataset_dir)
        an_dir = os.path.dirname(dataset_dir)
        an_dirname = os.path.basename(an_dir)
        an_version = cls._get_version_from_dirname(an_dirname)
        foz_dir = os.path.dirname(an_dir)
        return foz_dir, split, an_version

    @classmethod
    def _get_version_from_dirname(cls, an_dirname):
        _, version = an_dirname.split("-")
        return version

    def get_sample_split(self, sample_id):
        database = self.raw_annotations["database"]
        if sample_id not in database:
            return None

        an_split = database[sample_id]["subset"]
        return _SPLIT_MAP_REV[an_split]

    def get_sample_dataset_version(self, sample_id):
        raise NotImplementedError(
            "Subclass must implement `get_sample_dataset_version()`"
        )


class ActivityNet100DatasetInfo(ActivityNetDatasetInfo):
    @property
    def version(self):
        return "100"

    def get_sample_dataset_version(self, sample_id):
        if sample_id in self.all_sample_ids:
            return "100"
        else:
            return "200"

    def update_existing_sample_ids(self):
        self._splitwise_existing_sample_ids = self._get_existing_sample_ids()
        self.existing_sample_ids = _flatten_list(
            self._splitwise_existing_sample_ids.values()
        )


class ActivityNet200DatasetInfo(ActivityNetDatasetInfo):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.a100_info = ActivityNet100DatasetInfo(self.foz_dir)

    @property
    def version(self):
        return "200"

    def get_sample_dataset_version(self, sample_id):
        if sample_id in self.a100_info.all_sample_ids:
            return "100"
        else:
            return "200"

    def update_existing_sample_ids(self):
        self._splitwise_existing_sample_ids = self._get_existing_sample_ids()
        self._splitwise_existing_sample_ids_a100 = (
            self.a100_info._get_existing_sample_ids()
        )
        for split in self.splits:
            self._splitwise_sample_ids[split].extend(
                self._splitwise_existing_sample_ids_a100[split]
            )

        self.existing_sample_ids = _flatten_list(
            self._splitwise_existing_sample_ids.values()
        )


class ActivityNetDatasetImporter(
    foud.FiftyOneTemporalDetectionDatasetImporter
):
    """Base class for importing datasets in ActivityNet format.

    See :class:`fiftyone.types.dataset_types.ActivityNetDataset` for format
    details.

    Args:
        dataset_dir (None): the dataset directory
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data"/`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.json``
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
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
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            data_path=data_path,
            labels_path=labels_path,
            compute_metadata=compute_metadata,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = self._parse_data_path(
            dataset_dir=dataset_dir, data_path=data_path, default="data.json",
        )
        self._taxonomy = None

    @property
    def has_dataset_info(self):
        return self._classes is not None or self._taxonomy is not None

    def setup(self):
        self._sample_parser = foud.FiftyOneTemporalDetectionSampleParser(
            compute_metadata=self.compute_metadata
        )

        self._video_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            labels = etas.load_json(self.labels_path)
        else:
            labels = {}

        self._taxonomy = labels.get("taxonomy", None)
        self._classes = labels.get("classes", None)
        self._sample_parser.classes = self._classes
        self._labels_map = labels.get("labels", {})
        self._has_labels = any(self._labels_map.values())

        uuids = sorted(self._labels_map.keys())
        self._uuids = self._preprocess_list(uuids)
        self._num_samples = len(self._uuids)

    def get_dataset_info(self):
        info = {}
        if self._classes is not None:
            info["classes"] = self._classes
        if self._taxonomy is not None:
            info["taxonomy"] = self._taxonomy
        return info


def download_activitynet_split(
    dataset_dir,
    split,
    source_dir=None,
    classes=None,
    max_duration=None,
    copy_files=True,
    num_workers=None,
    shuffle=None,
    seed=None,
    max_samples=None,
    version="200",
):
    """Utility that downloads full or partial splits of the
    `ActivityNet <http://activity-net.org/index.html>`_. dataset

    See :class:`fiftyone.types.dataset_types.ActivityNetDataset` for the
    format in which ``dataset_dir`` will be arranged.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        source_dir (None): the directory containing the manually downloaded
            ActivityNet files
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
        max_duration (None): only videos with a duration in seconds that is
            less than or equal to the `max_duration` will be downloaded. By
            default, all videos are downloaded
        copy_files (True): whether to move (False) or create copies (True) of
            the source files when populating ``dataset_dir``. This is only
            relevant when a ``source_dir`` is provided
        num_workers (None): the number of processes to use when downloading
            individual video. By default, ``multiprocessing.cpu_count()`` is
            used
        shuffle (False): whether to randomly shuffle the order in which samples
            are chosen for partial downloads
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load per split. If
            ``classes`` are also specified, only up to the number of samples
            that contain at least one specified class will be loaded.
            By default, all matching samples are loaded
        version ("200"): the version of the ActivityNet dataset to download
            ("200", or "100")

    Returns:
        a tuple of:

        -   num_samples: the total number of downloaded videos, or ``None`` if
            everything was already downloaded
        -   classes: the list of all classes, or ``None`` if everything was
            already downloaded
        -   did_download: whether any content was downloaded (True) or if all
            necessary files were already downloaded (False)
    """
    # manager = ActivityNetDatasetManager.from_dataset_dir(dataset_dir, version)

    # if source_dir:
    #    manager.process_source(source_dir, copy_files)
    #
    # config = ActivityNetDownloadRunConfig(
    #    dataset_dir,
    #    split,
    #    source_dir=source_dir,
    #    classes=classes,
    #    max_duration=max_duration,
    #    copy_files=copy_files,
    #    num_workers=num_workers,
    #    shuffle=shuffle,
    #    seed=seed,
    #    max_samples=max_samples,
    #    version=version,
    # )

    # download_run = config.build()

    # taxonomy = info.taxonomy
    # all_classes = info.all_classes

    load_entire_split, classes = _parse_args(
        split, max_duration, max_samples, classes, version
    )

    videos_dir, anno_path, error_path, raw_anno_path = _get_paths(
        dataset_dir, version
    )

    raw_annotations = etas.load_json(raw_anno_path)
    taxonomy = raw_annotations["taxonomy"]
    all_classes = _get_all_classes(taxonomy)

    if classes is not None:
        non_existant_classes = list(set(classes) - set(all_classes))
        if non_existant_classes:
            raise ValueError(
                "The following classes specified but do not exist in the "
                "dataset; %s",
                tuple(non_existant_classes),
            )

    if source_dir is None:
        # Get ids of previously downloaded samples
        prev_downloaded_ids = _get_downloaded_sample_ids(videos_dir)

    else:
        # Copy/move all media if a source dir is provided
        prev_downloaded_ids = _process_source_dir(
            source_dir, videos_dir, split, copy_files,
        )

    if load_entire_split:
        num_downloaded = len(prev_downloaded_ids)
        num_total = _NUM_TOTAL_SAMPLES[version][split]
        if num_downloaded != num_total and source_dir is None:
            raise ValueError(
                "Found %d samples out of %d for split `%s`. When loading a "
                "full split of ActivityNet %s, it is required you "
                "download videos directly from the dataset providers to "
                "account for videos missing from YouTube."
                "\n\nFill out this form to gain access: "
                "https://docs.google.com/forms/d/e/1FAIpQLSeKaFq9ZfcmZ7W0B0PbEhfbTHY41GeEgwsa7WobJgGUhn4DTQ/viewform"
                "\n\nAlternatively, provide `max_samples`, `max_duration`, or "
                "`classes` to download a subset of the dataset from YouTube "
                "instead." % (num_downloaded, num_total, split, version)
            )
        selected_samples = raw_annotations["database"]
        num_samples = num_downloaded
    else:
        # We are loading a subset of the dataset, load only the matching
        # samples for the given parameters

        # Find all samples that match either all classes specified or any
        # classes specified
        any_class_samples, all_class_samples = _get_matching_samples(
            raw_annotations, classes, split, max_duration
        )

        # Check if the downloaded samples are enough, else download more
        (
            selected_samples,
            num_downloaded_samples,
            download_errors,
        ) = _select_and_download_necessary_samples(
            videos_dir,
            all_class_samples,
            any_class_samples,
            prev_downloaded_ids,
            max_samples,
            seed,
            shuffle,
            num_workers,
        )

        _merge_and_write_errors(download_errors, error_path)

        if source_dir is not None:
            num_samples = len(prev_downloaded_ids)
        elif not num_downloaded_samples:
            num_samples = None
        else:
            num_samples = num_downloaded_samples + len(prev_downloaded_ids)

    # Save labels for this run in AcitivityNetDataset format
    _write_annotations(selected_samples, anno_path, all_classes, taxonomy)

    return num_samples, all_classes


def _parse_args(split, max_duration, max_samples, classes, version):
    if split not in _SPLIT_MAP.keys():
        raise ValueError(
            "Unsupported split '%s'; supported values are %s"
            % (split, tuple(_SPLIT_MAP.keys()))
        )

    load_entire_split = bool(
        max_duration is None and max_samples is None and classes is None
    )

    if version not in _ANNOTATION_DOWNLOAD_LINKS:
        raise ValueError(
            "Unsupported version '%s'; supported values are %s"
            % (version, tuple(_ANNOTATION_DOWNLOAD_LINKS.keys()))
        )

    if max_duration is not None and max_duration <= 0:
        raise ValueError("`max_duration` must be a positive integer or float")

    if classes is not None and split == "test":
        logger.warning("Test split is unlabeled; ignoring classes requirement")
        classes = None

    return load_entire_split, classes


def _get_paths(dataset_dir, version):
    videos_dir = os.path.join(dataset_dir, "data")
    anno_path = os.path.join(dataset_dir, "labels.json")
    error_path = os.path.join(dataset_dir, "download_errors.json")
    raw_anno_path = os.path.join(dataset_dir, "raw_labels.json")

    etau.ensure_dir(videos_dir)

    if not os.path.isfile(raw_anno_path):
        anno_link = _ANNOTATION_DOWNLOAD_LINKS[version]
        etaw.download_file(anno_link, path=raw_anno_path)

    return videos_dir, anno_path, error_path, raw_anno_path


def _get_all_classes(taxonomy):
    classes = set()
    parents = set()
    for node in taxonomy:
        node_name = node["nodeName"]
        parent_name = node["parentName"]
        classes.add(node_name)
        parents.add(parent_name)

    classes = sorted(classes - parents)

    return classes


def _get_downloaded_sample_ids(videos_dir):
    video_filenames = os.listdir(videos_dir)
    video_ids = []
    for vfn in video_filenames:
        video_id, ext = os.path.splitext(vfn)
        if ext != ".mp4":
            os.remove(os.path.join(videos_dir, vfn))
        else:
            video_ids.append(video_id)

    return video_ids


def _process_source_dir(source_dir, videos_dir, split, copy_files):
    raise NotImplementedError(
        "Loading videos from source is not yet implemented"
    )


def _get_matching_samples(raw_annotations, classes, split, max_duration):
    # sample contains all specified classes
    all_class_match = {}

    # sample contains any specified calsses
    any_class_match = {}

    activitynet_split = _SPLIT_MAP[split]

    if classes is not None:
        class_set = set(classes)
    for sample_id, annot_info in raw_annotations["database"].items():
        is_correct_split = activitynet_split == annot_info["subset"]
        if max_duration is None:
            is_correct_dur = True
        else:
            is_correct_dur = max_duration >= annot_info["duration"]
        if not is_correct_split or not is_correct_dur:
            continue

        if classes is None:
            any_class_match[sample_id] = annot_info
        else:
            annot_labels = set([a["label"] for a in annot_info["annotations"]])
            if class_set.issubset(annot_labels):
                all_class_match[sample_id] = annot_info
            elif class_set & annot_labels:
                any_class_match[sample_id] = annot_info

    return any_class_match, all_class_match


def _select_and_download_necessary_samples(
    videos_dir,
    all_class_samples,
    any_class_samples,
    prev_downloaded_ids,
    max_samples,
    seed,
    shuffle,
    num_workers,
):
    all_class_ids = list(all_class_samples.keys())
    set_all_ids = set(all_class_ids)
    any_class_ids = list(any_class_samples.keys())
    set_any_ids = set(any_class_ids)

    requested_samples = {}
    requested_num = max_samples
    num_downloaded_samples = 0
    set_downloaded_ids = set(prev_downloaded_ids)

    if shuffle:
        if seed is not None:
            random.seed(seed)

    # 1) Take the all class ids that are downloaded up to max_samples
    dl_all_class_ids = list(set_all_ids.intersection(set_downloaded_ids))
    if shuffle:
        random.shuffle(dl_all_class_ids)

    add_ids = dl_all_class_ids[:requested_num]
    requested_samples.update({i: all_class_samples[i] for i in add_ids})

    if requested_num:
        requested_num -= len(add_ids)

    # 2) Take the any class ids that are downloaded up to max_samples
    if requested_num is None or requested_num:
        dl_any_class_ids = list(set_any_ids.intersection(set_downloaded_ids))
        if shuffle:
            random.shuffle(dl_any_class_ids)

        add_ids = dl_any_class_ids[:requested_num]
        requested_samples.update({i: any_class_samples[i] for i in add_ids})

        if requested_num:
            requested_num -= len(add_ids)

    download_errors = {}

    # 3) Download all class ids up to max_samples
    if requested_num is None or requested_num:
        not_dl_all_class_ids = list(set_all_ids - set(dl_all_class_ids))

        if shuffle:
            random.shuffle(not_dl_all_class_ids)

        downloaded_ids, errors = _attempt_to_download(
            videos_dir,
            not_dl_all_class_ids,
            all_class_samples,
            requested_num,
            num_workers,
        )
        num_downloaded_samples += len(downloaded_ids)
        requested_samples.update(
            {i: all_class_samples[i] for i in downloaded_ids}
        )

        if requested_num:
            requested_num -= len(downloaded_ids)

        download_errors = _merge_errors(download_errors, errors)

    # 4) Download any class ids up to max_samples
    if requested_num is None or requested_num:
        not_dl_any_class_ids = list(set_any_ids - set(dl_any_class_ids))

        if shuffle:
            random.shuffle(not_dl_any_class_ids)

        downloaded_ids, errors = _attempt_to_download(
            videos_dir,
            not_dl_any_class_ids,
            any_class_samples,
            requested_num,
            num_workers,
        )
        num_downloaded_samples += len(downloaded_ids)
        requested_samples.update(
            {i: any_class_samples[i] for i in downloaded_ids}
        )

        download_errors = _merge_errors(download_errors, errors)

    _cleanup_partial_downloads(videos_dir)

    return requested_samples, num_downloaded_samples, download_errors


def _merge_errors(download_errors, errors):
    for e, videos in errors.items():
        if e in download_errors:
            download_errors[e].extend(videos)
        else:
            download_errors[e] = videos
    return download_errors


def _attempt_to_download(
    videos_dir, ids, samples_info, num_samples, num_workers
):
    download_ids = []
    download_urls = []
    url_id_map = {}
    for sample_id in ids:
        sample_info = samples_info[sample_id]
        url = sample_info["url"]
        url_id_map[url] = sample_id
        download_urls.append(url)
        download_ids.append(sample_id)

    downloaded_urls, errors = fouy.download_from_youtube(
        videos_dir=videos_dir,
        urls=download_urls,
        ids=download_ids,
        max_videos=num_samples,
        num_workers=num_workers,
        ext=".mp4",
    )
    downloaded_ids = [url_id_map[url] for url in downloaded_urls]

    return downloaded_ids, errors


def _cleanup_partial_downloads(videos_dir):
    video_filenames = os.listdir(videos_dir)
    for vfn in video_filenames:
        video_id, ext = os.path.splitext(vfn)
        if ext != ".mp4":
            os.remove(os.path.join(videos_dir, vfn))


def _write_annotations(matching_samples, anno_path, all_classes, taxonomy):
    target_map = {c: i for i, c in enumerate(all_classes)}
    fo_matching_labels = _convert_label_format(
        matching_samples, target_map, taxonomy
    )
    etas.write_json(fo_matching_labels, anno_path)


def _merge_and_write_errors(download_errors, error_path):
    if os.path.isfile(error_path):
        prev_errors = etas.load_json(error_path)
    else:
        prev_errors = {}
    download_errors = _merge_errors(prev_errors, download_errors)
    etas.write_json(download_errors, error_path, pretty_print=True)


def _convert_label_format(activitynet_labels, target_map, taxonomy):
    labels = {}
    for annot_id, annot_info in activitynet_labels.items():
        fo_annot_labels = []
        for an_annot_label in annot_info["annotations"]:
            target = target_map[an_annot_label["label"]]
            timestamps = an_annot_label["segment"]
            fo_annot_labels.append({"label": target, "timestamps": timestamps})

        labels[annot_id] = fo_annot_labels

    fo_annots = {
        "classes": list(target_map.keys()),
        "labels": labels,
        "taxonomy": taxonomy,
    }
    return fo_annots


def _flatten_list(l):
    l = [list(i) for i in l]
    return list(chain(*l))


_ANNOTATION_DOWNLOAD_LINKS = {
    "200": "http://ec2-52-25-205-214.us-west-2.compute.amazonaws.com/files/activity_net.v1-3.min.json",
    "100": "http://ec2-52-25-205-214.us-west-2.compute.amazonaws.com/files/activity_net.v1-2.min.json",
}

_SPLIT_MAP = {
    "train": "training",
    "test": "testing",
    "validation": "validation",
}

_SPLIT_MAP_REV = {v: k for k, v in _SPLIT_MAP.items()}

_NUM_TOTAL_SAMPLES = {
    "100": {"train": 4819, "test": 2480, "validation": 2383,},
    "200": {"train": 10024, "test": 5044, "validation": 4926,},
}

_SOURCE_ZIPS = [
    "missing_files.zip",
    "missing_files_v1-2_test.zip",
    "missing_files_v1-3_test.zip",
    "v1-2_test.tar.gz",
    "v1-2_train.tar.gz",
    "v1-2_val.tar.gz",
    "v1-3_test.tar.gz",
    "v1-3_train_val.tar.gz",
]

_SOURCE_DIR_NAMES = {
    "v1-2": ["test", "train", "val"],
    "v1-3": ["test", "train_val"],
    "missing_files": [],
    "missing_files_v1-2_test": [],
    "missing_files_v1-3_test": [],
}
