"""
Utilities for working with the
`Kinetics <https://deepmind.com/research/open-source/kinetics>`
dataset.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from itertools import chain
import logging
import os
import random

import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.utils as fou
import fiftyone.utils.aws as foua
import fiftyone.utils.data as foud
import fiftyone.utils.youtubedl as fouy


logger = logging.getLogger(__name__)


def download_kinetics_split(
    dataset_dir,
    split,
    classes=None,
    num_workers=None,
    shuffle=None,
    seed=None,
    max_samples=None,
    retry_errors=False,
    scratch_dir=None,
    version="700-2020",
):
    """Utility that downloads full or partial splits of the
    `Kinetics <https://deepmind.com/research/open-source/kinetics>`_. dataset
    See :class:`fiftyone.types.dataset_types.KineticsDataset` for the
    format in which ``dataset_dir`` will be arranged.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
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
        retry_errors (False): whether to retry downloading samples from YouTube
            that have previously raised an error
        scratch_dir (None): a scratch directory to use to store temporary files
        version ("700-2020"): the version of the Kinetics dataset to download
            ("400", "600", "700", or "700-2020")
    Returns:
        a tuple of:
        -   num_samples: the total number of downloaded videos, or ``None`` if
            everything was already downloaded
        -   classes: the list of all classes, or ``None`` if everything was
            already downloaded
        -   did_download: whether any content was downloaded (True) or if all
            necessary files were already downloaded (False)
    """
    cleanup = False
    if scratch_dir is None:
        cleanup = True
        scratch_dir = os.path.join(dataset_dir, "scratch")

    info = KineticsDatasetInfo.build_for_version(
        version, dataset_dir, scratch_dir, split
    )
    manager = KineticsDatasetManager(info)

    downloader = KineticsDatasetDownloader(num_workers=num_workers)
    download_config = KineticsDownloadConfig(
        split,
        classes=classes,
        num_workers=num_workers,
        shuffle=shuffle,
        seed=seed,
        max_samples=max_samples,
        retry_errors=retry_errors,
    )

    all_classes = info.all_classes
    num_existing = len(info.existing_sample_ids)

    manager.download(download_config, downloader)
    info.update_existing_sample_ids()

    num_samples = len(info.existing_sample_ids)
    num_downloaded_samples = num_samples - num_existing

    did_download = num_downloaded_samples > 0

    if cleanup:
        etau.delete_dir(scratch_dir)

    return num_samples, all_classes, did_download


class KineticsDatasetImporter(foud.VideoClassificationDirectoryTreeImporter):
    """Importer for a kinetics video classification directory tree stored on disk.

    See :ref:`this page <VideoClassificationDirectoryTree-import>` for format
    details. The only difference is that this importer allows you to define the
    specific classes to load.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
        unlabeled ("_unlabeled"): the name of the subdirectory containing
            unlabeled images
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples of the given classes will be
            loaded 
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        unlabeled="_unlabeled",
        shuffle=False,
        seed=None,
        max_samples=None,
        classes=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            compute_metadata=compute_metadata,
            unlabeled=unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self.classes = classes
        if isinstance(self.classes, str):
            self.classes = [self.classes]

    def setup(self):
        samples = []
        classes = set()
        for class_dir in etau.list_subdirs(self.dataset_dir, abs_paths=True):
            label = os.path.basename(class_dir)
            if label.startswith("."):
                continue

            if self.classes is not None and label not in self.classes:
                continue

            if label == self.unlabeled:
                label = None
            else:
                classes.add(label)

            for path in etau.list_files(
                class_dir, abs_paths=True, recursive=True
            ):
                samples.append((path, label))

        self._samples = self._preprocess_list(samples)
        self._num_samples = len(self._samples)
        self._classes = sorted(classes)


class KineticsDatasetManager(object):
    """Manages the sample ids and labels that need to be downloaded as well as
    performing the downloading
    """

    def __init__(self, info):
        self.info = info

    def download(self, config, downloader):
        if config.load_entire_split:
            loaded_tar_urls = downloader.download_entire_split(self.info)
            self._log_loaded_tars(loaded_tar_urls)
        else:
            self.download_partial_split(config, downloader)

    def download_partial_split(self, config, downloader):
        if config.max_samples is None and self.info.version != "400":
            # Download specific classes from AWS
            self._download_entire_classes(config, downloader)

        else:
            # Download up to max_samples from YouTube
            self._download_samples_from_youtube(config)

    def _download_entire_classes(self, config, downloader):
        incomplete_classes = self.info.get_incomplete_classes()
        classes = list(set(incomplete_classes).intersection(config.classes))
        loaded_tar_urls = downloader.download_classes(self.info, classes)
        self._log_loaded_tars(loaded_tar_urls)

    def _download_samples_from_youtube(self, config):
        max_samples = config.max_samples
        classes = config.classes

        if classes is None:
            classes = self.info.all_classes

        if max_samples is None:
            num_remaining = None
        else:
            matching_samples = self._get_matching_samples(classes)
            num_remaining = max_samples - matching_samples
            if num_remaining <= 0:
                return

        urls, clip_segments = self._get_all_matching_urls(
            classes, retry_errors=config.retry_errors
        )

        if config.shuffle:
            if config.seed is not None:
                random.seed(config.seed)
            _urls_segs = list(zip(list(urls.items()), clip_segments))
            random.shuffle(_urls_segs)
            _urls, _clip_segments = zip(*_urls_segs)
            urls = dict(_urls)
            clip_segments = list(_clip_segments)

        logger.info("Downloading %d videos from YouTube..." % num_remaining)
        _, errors = fouy.download_from_youtube(
            urls=urls,
            clip_segments=clip_segments,
            max_videos=num_remaining,
            num_workers=config.num_workers,
        )

        self.info.cleanup_partial_downloads()
        self._merge_and_write_errors(errors)

    def _get_matching_samples(self, classes):
        existing_samples = []
        for c in classes:
            existing_samples.extend(self.info.class_existing_sample_ids(c))

        return len(existing_samples)

    def _get_all_matching_urls(self, classes, retry_errors=False):
        # Create a dict mapping url to destination filepath for every sample
        # that matches a specified class
        urls = {}
        clip_segments = []
        previous_errors = set(self.info.prev_errors.keys())
        for c in classes:
            remaining_ids = self._get_remaining_ids(c)

            # If a sample has had a download error in the path, skip it unless
            # retry_errors is True
            if not retry_errors:
                remaining_ids = list(set(remaining_ids) - previous_errors)

            class_dir = self.info.class_dir(c)
            for _id in remaining_ids:
                filename = self.info.filename_from_id(_id)
                url = self.info.url_from_id(_id)
                filepath = os.path.join(class_dir, filename)
                urls[url] = filepath
                clip_segments.append(self.info.segment_from_id(_id))

        return urls, clip_segments

    def _get_remaining_ids(self, c):
        sample_ids = self.info.class_sample_ids(c)
        existing_ids = self.info.class_existing_sample_ids(c)
        return list(set(sample_ids) - set(existing_ids))

    def _log_loaded_tars(self, tar_urls):
        loaded_tar_path = self.info.loaded_tar_path
        prev_loaded = self.info.all_prev_loaded_tars

        split = self.info.split
        prev_loaded[split].extend(tar_urls)
        prev_loaded[split] = sorted(set(prev_loaded[split]))

        etas.write_json(prev_loaded, loaded_tar_path, pretty_print=True)

    def _merge_and_write_errors(self, download_errors):
        error_path = self.info.error_path
        prev_errors = self.info.all_prev_errors

        split = self.info.split
        for e, videos in download_errors.items():
            if e in prev_errors[split]:
                prev_errors[split][e].extend(videos)
                prev_errors[split][e] = sorted(set(prev_errors[split][e]))
            else:
                prev_errors[split][e] = sorted(videos)

        etas.write_json(prev_errors, error_path, pretty_print=True)


class KineticsDatasetDownloader(object):
    """Downloads and extracts Kinetics tars from AWS"""

    def __init__(self, num_workers=None):
        self.num_workers = num_workers

    def download_entire_split(self, info):
        all_urls = info.download_urls
        prev_urls = info.prev_loaded_tars
        urls = list(set(all_urls) - set(prev_urls))
        if urls:
            tar_paths = self._download_tars(urls, info.scratch_dir)
            self._process_tars(tar_paths, info)

        return urls

    def download_classes(self, info, classes):
        if not info.supports_classwise_s3_downloads:
            raise ValueError(
                "Split `%s` of Kinetics version `%s` does not "
                "support classwise downloads from AWS"
                % (info.split, info.version)
            )

        urls = info.unloaded_class_urls(classes)
        if urls:
            tar_paths = self._download_tars(urls, info.scratch_dir)
            class_tar_map = {c: t for c, t in zip(classes, tar_paths)}
            self._process_class_tars(class_tar_map, info)
        return urls

    def _download_tars(self, urls, download_dir):
        foua.download_from_s3(
            urls, download_dir=download_dir, num_workers=self.num_workers,
        )
        return [
            os.path.join(download_dir, os.path.basename(url)) for url in urls
        ]

    def _process_tars(self, tar_paths, info):
        logger.info("Extracting videos...")
        with fou.ProgressBar(total=len(info.all_sample_ids)) as pb:
            for tar_path in tar_paths:
                extract_dir = tar_path.replace(".tar.gz", "")
                etau.extract_archive(
                    tar_path, extract_dir, delete_archive=True
                )
                for video_fn in os.listdir(extract_dir):
                    video_id = info.id_from_filename(video_fn)
                    c = info.get_video_class(video_id)
                    video_fp = os.path.join(extract_dir, video_fn)
                    moved_fp = os.path.join(info.class_dir(c), video_fn)
                    etau.move_file(video_fp, moved_fp)
                    pb.update()

    def _process_class_tars(self, class_tar_map, info):
        for c, tar_path in class_tar_map.items():
            extract_dir = tar_path.replace(".tar.gz", "")
            c = os.path.basename(extract_dir)
            etau.extract_archive(tar_path, extract_dir, delete_archive=True)
            etau.move_dir(extract_dir, info.class_dir(c))


class KineticsDownloadConfig(object):
    """Parses and stores the configuration parameters for a Kinetics 
    download run"""

    def __init__(
        self,
        split,
        classes=None,
        num_workers=None,
        shuffle=None,
        seed=None,
        max_samples=None,
        retry_errors=False,
    ):
        self.split = split
        self.classes = classes
        self.num_workers = num_workers
        self.shuffle = shuffle
        self.seed = seed
        self.max_samples = max_samples
        self.retry_errors = retry_errors

        self.validate()

    @property
    def load_entire_split(self):
        if self.split == "test":
            classes = None
        else:
            classes = self.classes
        return bool(self.max_samples is None and classes is None)

    def validate(self):
        self.validate_split()

    def validate_split(self):
        if self.split not in _SPLIT_MAP.keys():
            raise ValueError(
                "Unsupported split '%s'; supported values are %s"
                % (self.split, tuple(_SPLIT_MAP.keys()))
            )


class KineticsDatasetInfo(object):
    """Contains information related to paths, labels, and sample ids"""

    def __init__(self, kinetics_dir, scratch_dir, split):
        self.kinetics_dir = os.path.abspath(kinetics_dir)
        self.scratch_dir = os.path.abspath(scratch_dir)
        self.split = split
        self.cleanup_partial_downloads()

        self.raw_annotations = self._get_raw_annotations()

        (
            self._classwise_sample_ids,
            self._classwise_sample_ids_rev,
            self._url_id_map,
        ) = self._parse_sample_ids()

        self.all_classes = sorted(self._classwise_sample_ids.keys())
        self.all_sample_ids = _flatten_list(
            self._classwise_sample_ids.values()
        )

        self.ensure_class_dirs()

        self.update_existing_sample_ids()

        self.all_prev_loaded_tars = self._get_prev_loaded_tars()
        self.all_prev_errors = self._get_prev_errors()

        self.download_urls = self._get_download_urls()

    @property
    def splits(self):
        return ["train", "test", "validation"]

    @property
    def version(self):
        raise NotImplementedError("Subclass must implement version")

    @property
    def supports_classwise_s3_downloads(self):
        raise NotImplementedError(
            "Subclass must implement `supports_classwise_s3_downloads`"
        )

    @property
    def raw_anno_path(self):
        return self.raw_anno_path_split(self.split)

    def raw_anno_path_split(self, split):
        return os.path.join(self.kinetics_dir, "%s.json" % split)

    @property
    def error_path(self):
        return os.path.join(self.kinetics_dir, "download_errors.json")

    @property
    def prev_errors(self):
        return self.all_prev_errors[self.split]

    @property
    def loaded_tar_path(self):
        return os.path.join(self.kinetics_dir, "previously_loaded_tars.json")

    @property
    def prev_loaded_tars(self):
        return self.all_prev_loaded_tars[self.split]

    @property
    def split_dir(self):
        return os.path.join(self.kinetics_dir, self.split)

    def class_dir(self, c):
        return os.path.join(self.split_dir, c)

    def class_existing_sample_ids(self, c):
        return self._classwise_existing_sample_ids[c]

    def class_sample_ids(self, c):
        return self._classwise_sample_ids[c]

    def id_from_filename(self, video_fn):
        return video_fn[:11]

    def filename_from_id(self, video_id):
        video_info = self.raw_annotations[video_id]
        seg_start, seg_end = video_info["annotations"]["segment"]
        return "%s_%06d_%06d.mp4" % (video_id, seg_start, seg_end)

    def segment_from_id(self, video_id):
        video_info = self.raw_annotations[video_id]
        return video_info["annotations"]["segment"]

    def url_from_id(self, video_id):
        video_info = self.raw_annotations[video_id]
        return video_info["url"]

    def id_from_url(self, video_url):
        return self._url_id_map[video_url]

    def get_video_class(self, video_id):
        return self._classwise_sample_ids_rev[video_id]

    def ensure_class_dirs(self):
        for c in self.all_classes:
            etau.ensure_dir(self.class_dir(c))

    def cleanup_partial_downloads(self):
        for c in etau.list_subdirs(self.split_dir):
            video_filenames = etau.list_files(self.class_dir(c))
            for vfn in video_filenames:
                _, ext = os.path.splitext(vfn)
                if ext in [".part", ".ytdl"]:
                    try:
                        filepath = os.path.join(self.class_dir(c), vfn)
                        os.remove(filepath)
                    except FileNotFoundError:
                        pass

    def update_existing_sample_ids(self):
        classwise_existing_sample_ids = {}
        for c in etau.list_subdirs(self.split_dir):
            _class_dir = self.class_dir(c)
            classwise_existing_sample_ids[c] = self._get_video_files(
                _class_dir
            )

        self._classwise_existing_sample_ids = classwise_existing_sample_ids
        self.existing_sample_ids = _flatten_list(
            self._classwise_existing_sample_ids.values()
        )

    def get_incomplete_classes(self):
        incomplete_classes = []
        for c, sample_ids in self._classwise_sample_ids.items():
            existing_ids = self._classwise_existing_sample_ids[c]
            if len(existing_ids) != len(sample_ids):
                incomplete_classes.append(c)

        return incomplete_classes

    def _parse_classes(self, classes):
        if classes is not None:
            if self.split == "test":
                logger.warning(
                    "Test split is unlabeled; ignoring classes requirement"
                )
                return None

            non_existant_classes = list(set(classes) - set(self.all_classes))
            if non_existant_classes:
                raise ValueError(
                    "The following classes were specified but do not exist in "
                    "the dataset; ",
                    tuple(non_existant_classes),
                )

        return classes

    def _get_download_urls(self):
        split = self.split
        if split == "validation":
            split = "val"
        version = self.version.replace("-", "_")
        data = etaw.download_file(
            "https://s3.amazonaws.com/kinetics/%s/%s/k%s_%s_path.txt"
            % (version, split, version, split)
        )
        urls = data.decode("utf-8").split("\n")
        return [url for url in urls if url]

    def _get_raw_annotations(self):
        if not os.path.isfile(self.raw_anno_path):
            anno_link = _ANNOTATION_DOWNLOAD_LINKS[self.version]
            _archive_name = os.path.basename(anno_link)
            _anno_dir = os.path.join(
                self.scratch_dir, _archive_name.replace(".tar.gz", "")
            )
            if not os.path.isdir(_anno_dir):
                _archive_path = os.path.join(self.scratch_dir, _archive_name)
                if not os.path.isfile(_archive_path):
                    etaw.download_file(anno_link, path=_archive_path)
                etau.extract_archive(_archive_path)

            for split in self.splits:
                fn = os.path.join(_anno_dir, _SPLIT_MAP[split] + ".json")
                etau.move_file(fn, self.raw_anno_path_split(split))

        return etas.load_json(self.raw_anno_path)

    def _parse_sample_ids(self):
        if self.split == "test":
            sample_ids = list(self.raw_annotations.keys())
            return {None: sample_ids}, {sid: None for sid in sample_ids}

        url_id_map = {}
        classwise_sample_ids = defaultdict(list)
        classwise_sample_ids_rev = {}
        for sample_id, info in self.raw_annotations.items():
            c = info["annotations"]["label"]
            classwise_sample_ids[c].append(sample_id)
            classwise_sample_ids_rev[sample_id] = c
            url_id_map[info["url"]] = sample_id

        return dict(classwise_sample_ids), classwise_sample_ids_rev, url_id_map

    def _get_video_files(self, class_dir):
        video_ids = []
        for vfn in etau.list_files(class_dir):
            video_id, ext = os.path.splitext(vfn)
            if ext not in [".part", ".ytdl"]:
                video_ids.append(video_id)
        return video_ids

    def _get_prev_loaded_tars(self):
        if os.path.isfile(self.loaded_tar_path):
            return etas.load_json(self.loaded_tar_path)

        return {s: [] for s in self.splits}

    def _get_prev_errors(self):
        if os.path.isfile(self.error_path):
            return etas.load_json(self.error_path)

        return {s: {} for s in self.splits}

    @classmethod
    def get_kinetics_dir(cls, dataset_dir):
        if not os.path.basename(dataset_dir):
            dataset_dir = os.path.dirname(dataset_dir)

        kinetics_dir = os.path.dirname(dataset_dir)
        return kinetics_dir

    @classmethod
    def build_for_version(cls, version, dataset_dir, scratch_dir, split):
        kinetics_dir = cls.get_kinetics_dir(dataset_dir)
        _info_cls = _INFO_VERSION_MAP[version]
        return _info_cls(kinetics_dir, scratch_dir, split)


class Kinetics400DatasetInfo(KineticsDatasetInfo):
    """Kinetics400-specific info management"""

    @property
    def supports_classwise_s3_downloads(self):
        return False

    @property
    def version(self):
        return "400"


class ClasswiseS3KineticsDatasetInfo(KineticsDatasetInfo):
    @property
    def supports_classwise_s3_downloads(self):
        return self.split != "test"

    def class_url(self, c):
        split = self.split
        if split == "validation":
            split = "val"

        return "s3://kinetics/%s/%s/%s.tar.gz" % (self.version, split, c,)

    def unloaded_class_urls(self, classes):
        urls = []
        for c in classes:
            url = self.class_url(c)
            if url not in self.prev_loaded_tars:
                urls.append(url)
        return urls


class Kinetics600DatasetInfo(ClasswiseS3KineticsDatasetInfo):
    """Kinetics600-specific info management"""

    @property
    def version(self):
        return "600"


class Kinetics700DatasetInfo(ClasswiseS3KineticsDatasetInfo):
    """Kinetics700-specific info management"""

    @property
    def version(self):
        return "700-2020"


class Kinetics7002020DatasetInfo(ClasswiseS3KineticsDatasetInfo):
    """Kinetics700-2020-specific info management"""

    @property
    def version(self):
        return "700"


def _flatten_list(l):
    l = [list(i) for i in l]
    return list(chain(*l))


_INFO_VERSION_MAP = {
    "400": Kinetics400DatasetInfo,
    "600": Kinetics600DatasetInfo,
    "700": Kinetics700DatasetInfo,
    "700-2020": Kinetics7002020DatasetInfo,
}

_ANNOTATION_DOWNLOAD_LINKS = {
    "400": "https://storage.googleapis.com/deepmind-media/Datasets/kinetics400.tar.gz",
    "600": "https://storage.googleapis.com/deepmind-media/Datasets/kinetics600.tar.gz",
    "700": "https://storage.googleapis.com/deepmind-media/Datasets/kinetics700.tar.gz",
    "700-2020": "https://storage.googleapis.com/deepmind-media/Datasets/kinetics700_2020.tar.gz",
    "700-2020-delta": "https://storage.googleapis.com/deepmind-media/Datasets/kinetics700_2020_delta.tar.gz",
}

_SPLIT_MAP = {
    "test": "test",
    "train": "train",
    "validation": "validate",
}
