"""
Utilities for working with the
`ActivityNet dataset <http://activity-net.org/index.html>`.

| Copyright 2017-2022, Voxel51, Inc.
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
import fiftyone.utils.youtube as fouy


logger = logging.getLogger(__name__)


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
    `ActivityNet dataset <http://activity-net.org/index.html>`_.

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
            less than or equal to the ``max_duration`` will be downloaded. By
            default, all videos are downloaded
        copy_files (True): whether to move (False) or create copies (True) of
            the source files when populating ``dataset_dir``. This is only
            relevant when a ``source_dir`` is provided
        num_workers (None): the number of threads to use when downloading
            individual video. By default, ``multiprocessing.cpu_count()`` is
            used
        shuffle (False): whether to randomly shuffle the order in which samples
            are chosen for partial downloads
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load per split. If
            ``classes`` are also specified, only up to the number of samples
            that contain at least one specified class will be loaded. By
            default, all matching samples are loaded
        version ("200"): the ActivityNet dataset version to download. The
            supported values are ``("100", "200")``

    Returns:
        a tuple of:

        -   **num_samples**: the total number of downloaded videos, or ``None``
            if everything was already downloaded
        -   **classes**: the list of all classes, or ``None`` if everything was
            already downloaded
        -   **did_download**: whether any content was downloaded (True) or if
            all necessary files were already downloaded (False)
    """
    manager = ActivityNetDatasetManager.from_dataset_dir(dataset_dir, version)

    if source_dir:
        manager.process_source(source_dir, copy_files)

    download_config = ActivityNetDownloadConfig(
        split,
        source_dir=source_dir,
        classes=classes,
        max_duration=max_duration,
        copy_files=copy_files,
        num_workers=num_workers,
        shuffle=shuffle,
        seed=seed,
        max_samples=max_samples,
    )

    all_classes = manager.all_classes
    num_existing = len(manager.existing_split_sample_ids(split))

    if download_config.load_entire_split:
        num_total = _NUM_TOTAL_SAMPLES[version][split]
        if num_existing != num_total:
            raise ValueError(
                "Found %d samples out of %d for split `%s`. In order to load "
                "a full ActivityNet split, you must download the source files "
                "from the ActivityNet maintainers. See "
                "https://voxel51.com/docs/fiftyone/integrations/activitynet.html#lactivitynet-full-split-downloads "
                "for more information."
                "\n\n"
                "Alternatively, provide the `max_samples`, `max_duration`, "
                "and/or `classes` parameters to download a subset of the "
                "dataset from YouTube." % (num_existing, num_total, split)
            )

        num_samples = num_existing
    else:
        (
            _,
            num_downloaded_samples,
        ) = manager.download_necessary_samples(download_config)
        num_samples = num_existing + num_downloaded_samples

    manager.write_data_json(split)

    return num_samples, all_classes


class ActivityNetDatasetImporter(
    foud.FiftyOneTemporalDetectionDatasetImporter
):
    """Class for importing AcitivityNet dataset splits downloaded via
    :meth:`download_activitynet_split`.

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
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
        max_duration (None): only videos with a duration in seconds that is
            less than or equal to the `max_duration` will be loaded. By
            default, all videos are loaded
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
        classes=None,
        max_duration=None,
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
        self.classes = classes
        self.max_duration = max_duration

        self.data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data.json",
        )
        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.json",
        )
        self._taxonomy = None

    @property
    def has_dataset_info(self):
        return self._classes is not None or self._taxonomy is not None

    def setup(self):
        self._video_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        self._sample_parser = foud.FiftyOneTemporalDetectionSampleParser(
            compute_metadata=self.compute_metadata
        )

        process_uuids = True
        if self.labels_path is not None and os.path.isfile(self.labels_path):
            labels = etas.read_json(self.labels_path)
            info = ActivityNetInfo(labels)
            sample_ids = self._video_paths_map.keys()

            if self.classes or self.max_duration:
                # Load a subset of data
                any_sample_ids, all_sample_ids = info.get_matching_samples(
                    max_duration=self.max_duration,
                    classes=self.classes,
                    ids=[i[2:] for i in sample_ids],
                )
                any_sample_ids = list(any_sample_ids.keys())
                all_sample_ids = list(all_sample_ids.keys())

                process_uuids = False
                if not self.max_samples:
                    uuids = list(set(any_sample_ids + all_sample_ids))
                    self._uuids = self._preprocess_list(uuids)
                elif self.max_samples > len(all_sample_ids):
                    uuids = all_sample_ids
                    self.max_samples -= len(all_sample_ids)
                    any_sample_ids = self._preprocess_list(any_sample_ids)
                    uuids += any_sample_ids
                    self._uuids = uuids
                else:
                    self._uuids = self._preprocess_list(all_sample_ids)

                self._uuids = ["v_" + i for i in self._uuids]
                sample_ids = self._uuids

            labels = info.format_annotations([i[2:] for i in sample_ids])
        else:
            labels = {}

        self._taxonomy = labels.get("taxonomy", None)
        self._classes = labels.get("classes", None)
        self._labels_map = labels.get("labels", {})
        self._has_labels = any(self._labels_map.values())

        if process_uuids:
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


class ActivityNetDownloadConfig(object):
    """Configuration class for downloading full or partial splits from the
    ActivityNet dataset.
    """

    def __init__(
        self,
        split,
        source_dir=None,
        classes=None,
        max_duration=None,
        copy_files=True,
        num_workers=None,
        shuffle=None,
        seed=None,
        max_samples=None,
    ):
        self.split = split
        self.source_dir = source_dir
        self.classes = classes
        self.max_duration = max_duration
        self.copy_files = copy_files
        self.num_workers = num_workers
        self.shuffle = shuffle
        self.seed = seed
        self.max_samples = max_samples

        self.validate()

    @property
    def load_entire_split(self):
        if self.split != "test":
            classes = self.classes
        else:
            classes = None

        return bool(
            self.max_duration is None
            and self.max_samples is None
            and classes is None
        )

    def validate(self):
        self.validate_split()
        self.validate_max_duration()

    def validate_split(self):
        if self.split not in _SPLIT_MAP.keys():
            raise ValueError(
                "Unsupported split '%s'; supported values are %s"
                % (self.split, tuple(_SPLIT_MAP.keys()))
            )

    def validate_max_duration(self):
        if self.max_duration is not None and self.max_duration <= 0:
            raise ValueError(
                "`max_duration` must be a positive integer or float"
            )


class ActivityNetDatasetManager(object):
    """Class that manages the sample IDs and labels that need to be downloaded
    to load the specified subset of an ActivityNet dataset.
    """

    def __init__(self, foz_dir, version):
        self.version = version
        self.a100_info = ActivityNet100DatasetInfo(foz_dir)
        self.a200_info = ActivityNet200DatasetInfo(foz_dir)

    @property
    def info(self):
        if self.version == "100":
            return self.a100_info

        if self.version == "200":
            return self.a200_info

        raise ValueError(
            "Dataset version '%s' is not supported" % self.version
        )

    @property
    def all_classes(self):
        return self.info.all_classes

    def existing_split_sample_ids(self, split):
        return self.info.existing_split_sample_ids(split)

    def split_sample_ids(self, split):
        return self.info.split_sample_ids[split]

    def process_source(self, source_dir, copy_files):
        source_dir = os.path.expanduser(source_dir)
        for item in os.listdir(source_dir):
            if item in _SOURCE_ZIPS:
                logger.info("Processing source zip '%s'...", item)
                self._process_source_zip(item, source_dir, copy_files)
            elif item in _SOURCE_DIR_NAMES:
                logger.info("Processing source directory '%s'...", item)
                self._process_source_dir(item, source_dir, copy_files)

        self.a100_info.update_existing_sample_ids()
        self.a200_info.update_existing_sample_ids()

    def _process_source_zip(self, zip_name, source_dir, copy_files):
        zip_path = os.path.join(source_dir, zip_name)
        must_extract = self._check_zip_requirement(zip_name)

        if must_extract:
            zip_path = os.path.join(source_dir, zip_name)
            etau.extract_archive(zip_path, delete_archive=True)
            base_name = zip_name.replace(".zip", "").replace(".tar.gz", "")
            if "missing_files" not in base_name:
                base_name = "v1-2" if "v1-2" in base_name else "v1-3"

            self._process_source_dir(base_name, source_dir, copy_files)

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

        missing_splits = []
        for split in splits:
            missing_splits.append(
                self._split_is_missing_videos(version, split)
            )

        return any(missing_splits)

    def _split_is_missing_videos(self, version, split):
        if version == "100":
            info = self.a100_info
        else:
            info = self.a200_info

        existing_samples = info.existing_split_sample_ids(split)
        num_existing_samples = len(existing_samples)
        num_required_samples = _NUM_TOTAL_SAMPLES[version][split]
        return num_existing_samples != num_required_samples

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

        videos = os.listdir(videos_dir)
        if videos:
            with fou.ProgressBar() as pb:
                for video in pb(videos):
                    video_fn = os.path.splitext(video)[0]

                    # strip "v_" from video filename
                    video_id = video_fn[2:]
                    if video_id in existing_videos:
                        continue

                    if not general_dest_dir:
                        dest_dir = self._get_video_destination(
                            video_id, version=version, split=split
                        )
                    else:
                        dest_dir = general_dest_dir

                    if os.path.exists(os.path.join(dest_dir, video)):
                        continue

                    video_path = os.path.join(videos_dir, video)

                    if copy_files:
                        etau.copy_file(video_path, dest_dir)
                    else:
                        etau.move_file(video_path, dest_dir)

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

    def download_necessary_samples(self, config):
        prev_downloaded_ids = self.info.existing_sample_ids
        max_samples = config.max_samples
        seed = config.seed
        shuffle = config.shuffle
        num_workers = config.num_workers
        classes = config.classes
        max_duration = config.max_duration
        split = config.split

        self.info.cleanup_split(split)

        any_class_samples, all_class_samples = self.info.get_matching_samples(
            split=split,
            max_duration=max_duration,
            classes=classes,
        )

        all_class_ids = list(all_class_samples.keys())
        set_all_ids = set(all_class_ids)
        any_class_ids = list(any_class_samples.keys())
        set_any_ids = set(any_class_ids)

        requested_sample_ids = []
        requested_num = max_samples
        num_downloaded_samples = 0
        set_downloaded_ids = set(prev_downloaded_ids)

        if shuffle and seed is not None:
            random.seed(seed)

        # 1) Take the all class IDs that are downloaded up to max_samples
        dl_all_class_ids = list(set_all_ids.intersection(set_downloaded_ids))
        loaded_samples = self._load_requested_samples(
            dl_all_class_ids,
            shuffle,
            requested_num,
        )
        requested_sample_ids.extend(loaded_samples)
        num_loaded = len(loaded_samples)
        if requested_num is not None:
            requested_num -= num_loaded

        # 2) Take the any class IDs that are downloaded up to max_samples
        dl_any_class_ids = list(set_any_ids.intersection(set_downloaded_ids))
        loaded_samples = self._load_requested_samples(
            dl_any_class_ids,
            shuffle,
            requested_num,
        )
        requested_sample_ids.extend(loaded_samples)
        num_loaded = len(loaded_samples)
        if requested_num is not None:
            requested_num -= num_loaded

        # 3) Download all class IDs up to max_samples
        not_dl_all_class_ids = list(set_all_ids - set(dl_all_class_ids))
        downloaded_samples = self._download_requested_samples(
            not_dl_all_class_ids,
            all_class_samples,
            shuffle,
            requested_num,
            num_workers,
            split,
        )
        requested_sample_ids.extend(downloaded_samples)
        num_downloaded = len(downloaded_samples)
        num_downloaded_samples += num_downloaded
        if requested_num is not None:
            requested_num -= num_downloaded

        # 4) Download any class IDs up to max_samples
        not_dl_any_class_ids = list(set_any_ids - set(dl_any_class_ids))
        downloaded_samples = self._download_requested_samples(
            not_dl_any_class_ids,
            any_class_samples,
            shuffle,
            requested_num,
            num_workers,
            split,
        )
        requested_sample_ids.extend(downloaded_samples)
        num_downloaded = len(downloaded_samples)
        num_downloaded_samples += num_downloaded
        if requested_num is not None:
            requested_num -= num_downloaded

        self.a200_info.update_existing_sample_ids()

        return requested_sample_ids, num_downloaded_samples

    def _load_requested_samples(self, ids, shuffle, requested_num):
        if (requested_num is None or requested_num) and ids:
            ids = sorted(ids)
            if shuffle:
                random.shuffle(ids)

            if requested_num is not None:
                requested_sample_ids = ids[:requested_num]
            else:
                requested_sample_ids = ids

            return requested_sample_ids

        return []

    def _download_requested_samples(
        self, ids, class_samples, shuffle, requested_num, num_workers, split
    ):
        if (requested_num is None or requested_num) and ids:
            ids = sorted(ids)
            if shuffle:
                random.shuffle(ids)

            downloaded_ids = self._separate_versions_and_attempt_to_download(
                ids,
                class_samples,
                requested_num,
                num_workers,
                split,
            )

            return downloaded_ids

        return []

    def _separate_versions_and_attempt_to_download(
        self,
        ids,
        samples_info,
        num_samples,
        num_workers,
        split,
    ):
        all_a100_ids = self.a100_info.all_sample_ids
        a100_ids = [i for i in ids if i in all_a100_ids]
        a200_ids = list(set(ids) - set(a100_ids))

        downloaded_ids = []
        num_a100_ids = len(a100_ids)
        remaining_samples = num_samples

        if num_a100_ids:
            if num_samples is None:
                num_to_download = num_a100_ids
            else:
                num_to_download = min(num_a100_ids, num_samples)

            downloaded_ids, a100_errors = self._attempt_to_download(
                self.a100_info.data_dir(split),
                a100_ids,
                samples_info,
                num_to_download,
                num_workers,
            )
            if remaining_samples is not None:
                remaining_samples -= len(downloaded_ids)

            self._merge_and_write_errors(
                a100_errors, self.a100_info.error_path(split)
            )

        if remaining_samples:
            a200_downloaded_ids, a200_errors = self._attempt_to_download(
                self.a200_info.data_dir(split),
                a200_ids,
                samples_info,
                remaining_samples,
                num_workers,
            )
            downloaded_ids.extend(a200_downloaded_ids)
            self._merge_and_write_errors(
                a200_errors, self.a200_info.error_path(split)
            )

        return downloaded_ids

    def _attempt_to_download(
        self, videos_dir, ids, samples_info, num_samples, num_workers
    ):
        download_urls = []
        download_paths = []
        for sample_id in ids:
            sample_info = samples_info[sample_id]
            download_path = os.path.join(videos_dir, "v_%s.mp4" % sample_id)
            download_urls.append(sample_info["url"])
            download_paths.append(download_path)

        logger.info("Downloading videos from YouTube...")
        downloaded, errors = fouy.download_youtube_videos(
            urls=download_urls,
            video_paths=download_paths,
            max_videos=num_samples,
            num_workers=num_workers,
        )
        downloaded_ids = [ids[ind] for ind in downloaded.keys()]
        errors_dict = {}
        for ind, error in errors.items():
            errors_dict[download_urls[ind]] = error

        return downloaded_ids, errors_dict

    def _merge_and_write_errors(self, download_errors, error_path):
        if os.path.isfile(error_path):
            prev_errors = etas.read_json(error_path)
        else:
            prev_errors = {}

        for video, e in download_errors.items():
            if e in prev_errors:
                prev_errors[e].append(video)
            else:
                prev_errors[e] = [video]

        for e, videos in prev_errors.items():
            prev_errors[e] = sorted(set(videos))

        etas.write_json(prev_errors, error_path, pretty_print=True)

    def write_data_json(self, split):
        a100_start_dir = os.path.dirname(self.a100_info.data_json_path(split))
        a100_data_map = self._data_map(self.a100_info, split, a100_start_dir)
        if a100_data_map:
            etas.write_json(
                a100_data_map,
                self.a100_info.data_json_path(split),
                pretty_print=True,
            )

        start_dir = os.path.dirname(self.info.data_json_path(split))
        a100_data_map = self._data_map(self.a100_info, split, start_dir)
        a200_data_map = self._data_map(self.a200_info, split, start_dir)
        a200_data_map.update(a100_data_map)
        if a200_data_map:
            etas.write_json(
                a200_data_map,
                self.a200_info.data_json_path(split),
                pretty_print=True,
            )

    def _data_map(self, info, split, start_dir):
        to_rel = lambda fp, d: os.path.relpath(fp, start=d)
        to_uuid = lambda p: os.path.splitext(p)[0]
        data_path = info.data_dir(split)
        data_map = {
            to_uuid(p): to_rel(os.path.join(data_path, p), start_dir)
            for p in etau.list_files(data_path, recursive=True)
            if not (p.endswith(".part") or p.endswith(".ytdl"))
        }
        return data_map

    @classmethod
    def from_dataset_dir(cls, dataset_dir, version):
        dataset_dir = os.path.abspath(dataset_dir)
        foz_dir, _, _ = ActivityNetDatasetInfo.get_dir_info(dataset_dir)
        return cls(foz_dir, version)


class ActivityNetInfo(object):
    """Necessary information used to parse and format annotations."""

    def __init__(self, raw_annotations):
        self.raw_annotations = raw_annotations
        self.taxonomy = self.raw_annotations["taxonomy"]
        self.all_classes = _get_all_classes(self.taxonomy)

        self._splitwise_sample_ids = self._parse_sample_ids()
        self.all_sample_ids = _flatten_list(
            self._splitwise_sample_ids.values()
        )

    def _parse_sample_ids(self):
        ids = {}
        for anno_id, annot in self.raw_annotations["database"].items():
            split = _SPLIT_MAP_REV[annot["subset"]]
            if split not in ids:
                ids[split] = []
            ids[split].append(anno_id)
        return ids

    def get_matching_samples(
        self, split=None, max_duration=None, classes=None, ids=None
    ):
        if split:
            classes = self._parse_classes(classes, split)

        # Sample contains all specified classes
        all_class_match = {}

        # Sample contains any specified classes
        any_class_match = {}

        if split:
            activitynet_split = _SPLIT_MAP[split]
        else:
            activitynet_split = None

        if classes is not None:
            class_set = set(classes)

        for sample_id, anno_info in self.raw_annotations["database"].items():
            if ids and sample_id not in ids:
                continue

            if activitynet_split:
                is_correct_split = activitynet_split == anno_info["subset"]
            else:
                is_correct_split = True
            if max_duration:
                is_correct_dur = max_duration >= anno_info["duration"]
            else:
                is_correct_dur = True

            if not is_correct_split or not is_correct_dur:
                continue

            if classes is None:
                any_class_match[sample_id] = anno_info
            else:
                anno_labels = set(
                    [a["label"] for a in anno_info["annotations"]]
                )
                if class_set.issubset(anno_labels):
                    all_class_match[sample_id] = anno_info
                elif class_set & anno_labels:
                    any_class_match[sample_id] = anno_info

        return any_class_match, all_class_match

    def _parse_classes(self, classes, split):
        if classes is not None:
            if split == "test":
                logger.warning(
                    "Test split is unlabeled but `classes` were provided; "
                    "Skipping the split..."
                )

            bad_classes = list(set(classes) - set(self.all_classes))
            if bad_classes:
                raise ValueError(
                    "The following classes were specified but do not exist in "
                    "the dataset; %s" % bad_classes,
                )

        return classes

    def format_annotations(self, sample_ids, split=None):
        if split:
            activitynet_split = _SPLIT_MAP[split]
        else:
            activitynet_split = None

        labels = {}
        for anno_id, anno_info in self.raw_annotations["database"].items():
            if sample_ids is not None and anno_id not in sample_ids:
                continue

            if activitynet_split and anno_info["subset"] != activitynet_split:
                continue

            fo_anno_labels = []
            for an_anno_label in anno_info["annotations"]:
                target = an_anno_label["label"]
                timestamps = an_anno_label["segment"]
                fo_anno_labels.append(
                    {"label": target, "timestamps": timestamps}
                )

            sample_id = "v_" + anno_id
            labels[sample_id] = fo_anno_labels

        fo_annots = {
            "classes": self.all_classes,
            "labels": labels,
            "taxonomy": self.taxonomy,
        }
        return fo_annots


class ActivityNetSplitInfo(ActivityNetInfo):
    """Class that contains information related to paths, labels, and sample IDs
    of a single ActivityNet split.
    """

    def __init__(self, split_dir, version=None, raw_annotations=None):
        self.split_dir = os.path.abspath(split_dir)
        if raw_annotations:
            if not os.path.exists(self.raw_anno_path):
                etas.write_json(raw_annotations, self.raw_anno_path)
        else:
            raw_annotations = self._get_raw_annotations(version=version)

        self.raw_annotations = raw_annotations

        super().__init__(self.raw_annotations)

        self.update_existing_sample_ids()

    @property
    def raw_anno_path(self):
        return os.path.join(self.split_dir, "labels.json")

    @property
    def data_dir(self):
        _data_dir = os.path.join(self.split_dir, "data")
        etau.ensure_dir(_data_dir)
        return _data_dir

    @property
    def data_json_path(self):
        return os.path.join(self.split_dir, "data.json")

    @property
    def error_path(self):
        return os.path.join(self.split_dir, "download_errors.json")

    def update_existing_sample_ids(self):
        self.existing_sample_ids = self._get_video_files()

    def _get_video_files(self):
        video_filenames = etau.list_files(self.data_dir)
        video_ids = []
        for vfn in video_filenames:
            video_id, ext = os.path.splitext(vfn)
            if ext not in [".part", ".ytdl"]:
                vid = video_id[2:]
                video_ids.append(vid)

        return video_ids

    def cleanup(self):
        videos_dir = self.data_dir
        video_filenames = etau.list_files(videos_dir)
        for vfn in video_filenames:
            _, ext = os.path.splitext(vfn)
            if ext in [".part", ".ytdl"]:
                try:
                    os.remove(os.path.join(videos_dir, vfn))
                except FileNotFoundError:
                    pass

    def _get_raw_annotations(self, version=None):
        if not os.path.isfile(self.raw_anno_path):
            if not version:
                raise ValueError(
                    "Found `version=None` and no file at `%s`. If raw "
                    "annotations have not been loaded, then a version must be "
                    "provided." % self.raw_anno_path
                )

            anno_link = _ANNOTATION_DOWNLOAD_LINKS[version]
            etaw.download_file(anno_link, path=self.raw_anno_path)

        return etas.read_json(self.raw_anno_path)


class ActivityNetDatasetInfo(ActivityNetInfo):
    """Class that stores information related to paths, labels, and sample IDs
    for an ActivityNet dataset download.
    """

    def __init__(self, foz_dir):
        self.foz_dir = os.path.abspath(foz_dir)
        self._split_infos = {}
        self.raw_annotations = self._get_raw_annotations()
        super().__init__(self.raw_annotations)

        self.update_existing_sample_ids()

    def split_info(self, split):
        if split not in self._split_infos:
            self._split_infos[split] = ActivityNetSplitInfo(
                self.split_dir(split),
                version=self.version,
                raw_annotations=self.raw_annotations,
            )

        return self._split_infos[split]

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
        return os.path.join(self.dataset_dir, "labels.json")

    def split_sample_ids(self, split):
        return self._splitwise_sample_ids[split]

    def existing_split_sample_ids(self, split):
        return self._splitwise_existing_sample_ids[split]

    def split_dir(self, split):
        return os.path.join(self.dataset_dir, split)

    def data_dir(self, split):
        return self.split_info(split).data_dir

    def data_json_path(self, split):
        return self.split_info(split).data_json_path

    def error_path(self, split):
        return self.split_info(split).error_path

    def update_existing_sample_ids(self):
        self._splitwise_existing_sample_ids = None
        self.existing_sample_ids = None
        raise NotImplementedError(
            "Subclass must implement `update_existing_sample_ids()`"
        )

    def _get_existing_sample_ids(self):
        ids = {}
        for split in self.splits:
            if os.path.exists(self.split_dir(split)):
                split_info = self.split_info(split)
                split_info.update_existing_sample_ids()
                split_ids = split_info.existing_sample_ids
            else:
                split_ids = []

            ids[split] = split_ids

        return ids

    def cleanup_split(self, split):
        self.split_info(split).cleanup()

    def _get_raw_annotations(self):
        if not os.path.isfile(self.raw_anno_path):
            anno_link = _ANNOTATION_DOWNLOAD_LINKS[self.version]
            etaw.download_file(anno_link, path=self.raw_anno_path)

        return etas.read_json(self.raw_anno_path)

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
        version = an_dirname.split("-")[-1]
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
    """ActivityNet 100 dataset info."""

    @property
    def version(self):
        return "100"

    def get_sample_dataset_version(self, sample_id):
        if sample_id in self.all_sample_ids:
            return "100"

        return "200"

    def update_existing_sample_ids(self):
        self._splitwise_existing_sample_ids = self._get_existing_sample_ids()
        self.existing_sample_ids = _flatten_list(
            self._splitwise_existing_sample_ids.values()
        )


class ActivityNet200DatasetInfo(ActivityNetDatasetInfo):
    """ActivityNet 200 dataset info."""

    def __init__(self, foz_dir):
        self.a100_info = ActivityNet100DatasetInfo(foz_dir)
        super().__init__(foz_dir)

    @property
    def version(self):
        return "200"

    def get_sample_dataset_version(self, sample_id):
        if sample_id in self.a100_info.all_sample_ids:
            return "100"

        return "200"

    def update_existing_sample_ids(self):
        self._splitwise_existing_sample_ids = self._get_existing_sample_ids()
        self.a100_info.update_existing_sample_ids()

        for split in self.splits:
            self._splitwise_existing_sample_ids[split].extend(
                self.a100_info.existing_split_sample_ids(split)
            )

        self.existing_sample_ids = _flatten_list(
            self._splitwise_existing_sample_ids.values()
        )


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


def _flatten_list(l):
    l = [list(i) for i in l]
    return list(chain(*l))


_ANNOTATION_DOWNLOAD_LINKS = {
    "100": "http://ec2-52-25-205-214.us-west-2.compute.amazonaws.com/files/activity_net.v1-2.min.json",
    "200": "http://ec2-52-25-205-214.us-west-2.compute.amazonaws.com/files/activity_net.v1-3.min.json",
}

_SPLIT_MAP = {
    "train": "training",
    "test": "testing",
    "validation": "validation",
}

_SPLIT_MAP_REV = {v: k for k, v in _SPLIT_MAP.items()}

_NUM_TOTAL_SAMPLES = {
    "100": {
        "train": 4819,
        "test": 2480,
        "validation": 2383,
    },
    "200": {
        "train": 10024,
        "test": 5044,
        "validation": 4926,
    },
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
    "missing_files": [],
    "missing_files_v1-2_test": [],
    "missing_files_v1-3_test": [],
    "v1-2": ["test", "train", "val"],
    "v1-3": ["test", "train_val"],
}
