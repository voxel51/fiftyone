"""
Utilities for working with the
`ActivityNet <http://activity-net.org/index.html>`
dataset.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import multiprocessing
import multiprocessing.dummy
import os
import random
import time

import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

youtube_dl = fou.lazy_import("youtube_dl")


logger = logging.getLogger(__name__)


class ActivityNetDatasetImporter(
    foud.FiftyOneVideoClassificationDatasetImporter
):
    """Base class for importing datasets in ActivityNet format.

    See :class:`fiftyone.types.dataset_types.ActivityNetDataset` for format
    details.

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

        self._taxonomy = None

    @property
    def has_dataset_info(self):
        return self._classes is not None or self._taxonomy is not None

    def setup(self):
        self._sample_parser = foud.FiftyOneVideoClassificationSampleParser(
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

    num_workers = _parse_num_workers(num_workers)

    videos_dir = os.path.join(dataset_dir, "data")
    anno_path = os.path.join(dataset_dir, "labels.json")
    error_path = os.path.join(dataset_dir, "download_errors.json")
    raw_anno_path = os.path.join(dataset_dir, "raw_labels.json")

    etau.ensure_dir(videos_dir)

    if not os.path.isfile(raw_anno_path):
        anno_link = _ANNOTATION_DOWNLOAD_LINKS[version]
        etaw.download_file(anno_link, path=raw_anno_path)

    raw_annotations = etas.load_json(raw_anno_path)

    taxonomy = raw_annotations["taxonomy"]
    all_classes = _get_all_classes(taxonomy)
    target_map = {c: i for i, c in enumerate(all_classes)}

    if classes is not None:
        non_existant_classes = list(set(classes) - set(all_classes))
        if non_existant_classes:
            raise ValueError(
                "The following classes specified but do not exist in the "
                "dataset; %s",
                tuple(non_existant_classes),
            )

    # Get ids of previously downloaded samples
    prev_downloaded_ids = _get_downloaded_sample_ids(videos_dir)
    num_downloaded = len(prev_downloaded_ids)
    num_total = _NUM_TOTAL_SAMPLES[version][split]

    if source_dir is not None:
        # Copy/move all media if a source dir is provided
        prev_downloaded_ids = _process_source_dir(
            source_dir, videos_dir, split, copy_files
        )

    if load_entire_split:
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
        num_samples = len(prev_downloaded_ids)
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
    _write_annotations(selected_samples, anno_path, target_map, taxonomy)

    return num_samples, all_classes


def _get_all_classes(taxonomy):
    classes = set()
    parents = set()
    for node in taxonomy:
        node_name = node["nodeName"]
        parent_name = node["parentName"]
        classes.add(node_name)
        parents.add(parent_name)

    return sorted(classes - parents)


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
            annot_labels = set(
                {annot["label"] for annot in annot_info["annotations"]}
            )
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
    for e, num in errors.items():
        if e in download_errors:
            download_errors[e] += num
        else:
            download_errors[e] = num
    return download_errors


def _attempt_to_download(
    videos_dir, ids, samples_info, num_samples, num_workers
):
    downloaded = []
    tasks = []
    errors = {}
    for sample_id in ids:
        sample_info = samples_info[sample_id]
        url = sample_info["url"]
        output_path = os.path.join(videos_dir, "%s.mp4" % sample_id)
        tasks.append((url, output_path, sample_id))
    if num_workers == 1:
        with fou.ProgressBar(total=num_samples, iters_str="videos") as pb:
            for url, output_path, sample_id in tasks:
                is_success, _, error_type = _do_download(
                    (url, output_path, sample_id)
                )
                if is_success:
                    downloaded.append(sample_id)
                    pb.update()
                    if (
                        num_samples is not None
                        and len(downloaded) >= num_samples
                    ):
                        return downloaded, errors
                else:
                    if error_type not in errors:
                        errors[error_type] = 0
                    errors[error_type] += 1
    else:
        with fou.ProgressBar(total=num_samples, iters_str="videos") as pb:
            with multiprocessing.dummy.Pool(num_workers) as pool:
                for is_success, sample_id, error_type in pool.imap_unordered(
                    _do_download, tasks
                ):
                    if is_success:
                        if len(downloaded) < num_samples:
                            downloaded.append(sample_id)
                            pb.update()
                    else:
                        if error_type not in errors:
                            errors[error_type] = 0
                        errors[error_type] += 1
                    if (
                        num_samples is not None
                        and len(downloaded) >= num_samples
                    ):
                        return downloaded, errors

    return downloaded, errors


def _do_download(args):
    url, output_path, sample_id = args
    try:
        ydl_opts = {
            "outtmpl": output_path,
            "format": "bestvideo[ext=mp4]",
            "logtostderr": True,
            "quiet": True,
            "logger": logger,
            "age_limit": 99,
            "ignorerrors": True,
        }
        with youtube_dl.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        return True, sample_id, None
    except Exception as e:
        if isinstance(e, youtube_dl.utils.DownloadError):
            # pylint: disable=no-member
            return False, sample_id, str(e.exc_info[1])
        return False, sample_id, "other"


def _cleanup_partial_downloads(videos_dir):
    video_filenames = os.listdir(videos_dir)
    for vfn in video_filenames:
        video_id, ext = os.path.splitext(vfn)
        if ext != ".mp4":
            os.remove(os.path.join(videos_dir, vfn))


def _write_annotations(matching_samples, anno_path, target_map, taxonomy):
    fo_matching_labels = _convert_label_format(
        matching_samples, target_map, taxonomy
    )
    etas.write_json(fo_matching_labels, anno_path)


def _merge_and_write_errors(download_errors, error_path):
    prev_errors = etas.load_json(error_path)
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


def _parse_num_workers(num_workers):
    if num_workers is None:
        if os.name == "nt":
            # Default to 1 worker for Windows
            return 1
        return multiprocessing.cpu_count()

    if not isinstance(num_workers, int) or num_workers < 1:
        raise ValueError(
            "The `num_workers` argument must be a positive integer or `None` "
            "found %s" % str(type(num_workers))
        )
    return num_workers


_ANNOTATION_DOWNLOAD_LINKS = {
    "200": "http://ec2-52-25-205-214.us-west-2.compute.amazonaws.com/files/activity_net.v1-3.min.json",
    "100": "http://ec2-52-25-205-214.us-west-2.compute.amazonaws.com/files/activity_net.v1-2.min.json",
}

_SPLIT_MAP = {
    "train": "training",
    "test": "testing",
    "validation": "validation",
}

_NUM_TOTAL_SAMPLES = {
    "100": {"train": 4819, "test": 2480, "validation": 2383,},
    "200": {"train": 10024, "test": 5044, "validation": 4926,},
}
