"""
Utilities for working with datasets in
`KITTI format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import csv
import logging
import struct
import os

import numpy as np

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.storage as fos
import fiftyone.core.threed as fo3d
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

o3d = fou.lazy_import("open3d", callback=lambda: fou.ensure_import("open3d"))


logger = logging.getLogger(__name__)


class KITTIDetectionDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for KITTI detection datasets stored on disk.

    See :ref:`this page <KITTIDetectionDataset-import>` for format details.

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
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with label entries (False)
        extra_attrs (True): whether to load extra annotation attributes onto
            the imported labels. Supported values are:

            -   ``True``: load all extra attributes found
            -   ``False``: do not load extra attributes
            -   a name or list of names of specific attributes to load
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
        extra_attrs=True,
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
        self.extra_attrs = extra_attrs

        self._image_paths_map = None
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

        try:
            image_path = self._image_paths_map[uuid]
        except KeyError:
            raise ValueError("No image found for sample '%s'" % uuid)

        image_metadata = fom.ImageMetadata.build_for(image_path)

        labels_path = self._labels_paths_map.get(uuid, None)
        if labels_path:
            # Labeled image
            frame_size = (image_metadata.width, image_metadata.height)
            detections = load_kitti_detection_annotations(
                labels_path, frame_size, extra_attrs=self.extra_attrs
            )
        else:
            # Unlabeled image
            detections = None

        return image_path, image_metadata, detections

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        image_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        if self.labels_path is not None and os.path.isdir(self.labels_path):
            labels_path = fos.normpath(self.labels_path)
            labels_paths_map = {
                os.path.splitext(p)[0]: os.path.join(labels_path, p)
                for p in etau.list_files(labels_path, recursive=True)
                if etau.has_extension(p, ".txt")
            }
        else:
            labels_paths_map = {}

        uuids = set(labels_paths_map.keys())

        if self.include_all_data:
            uuids.update(image_paths_map.keys())

        uuids = self._preprocess_list(sorted(uuids))

        self._image_paths_map = image_paths_map
        self._labels_paths_map = labels_paths_map
        self._uuids = uuids
        self._num_samples = len(uuids)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        return len(etau.list_files(os.path.join(dataset_dir, "data")))


class KITTIDetectionDatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes KITTI detection datasets to disk.

    See :ref:`this page <KITTIDetectionDataset-export>` for format details.

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
            -   an absolute folder path to which to export the labels. In this
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
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``data_path`` and
            ``labels_path`` to generate output paths for each exported image
            and labels file. This argument allows for populating nested
            subdirectories that match the shape of the input paths. The path is
            converted to an absolute path (if necessary) via
            :func:`fiftyone.core.storage.normalize_path`
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
            default="labels/",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.rel_dir = rel_dir
        self.image_format = image_format

        self._writer = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._writer = KITTIAnnotationWriter()
        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            rel_dir=self.rel_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

        etau.ensure_dir(self.labels_path)

    def export_sample(self, image_or_path, detections, metadata=None):
        _, uuid = self._media_exporter.export(image_or_path)

        if detections is None:
            return

        out_labels_path = os.path.join(self.labels_path, uuid + ".txt")

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(image_or_path)

        self._writer.write(detections, metadata, out_labels_path)

    def close(self, *args):
        self._media_exporter.close()


class KITTIAnnotationWriter(object):
    """Class for writing annotations in KITTI detection format.

    See :ref:`this page <KITTIDetectionDataset-export>` for format details.
    """

    def write(self, detections, metadata, txt_path):
        """Writes the detections to disk.

        Args:
            detections: a :class:`fiftyone.core.labels.Detections` instance
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` instance
            txt_path: the path to write the annotation TXT file
        """
        frame_size = (metadata.width, metadata.height)

        rows = []
        for detection in detections.detections:
            row = _make_kitti_detection_row(detection, frame_size)
            rows.append(row)

        etau.write_file("\n".join(rows), txt_path)


def load_kitti_detection_annotations(txt_path, frame_size, extra_attrs=True):
    """Loads the KITTI detection annotations from the given TXT file.

    See :ref:`this page <KITTIDetectionDataset-import>` for format details.

    Args:
        txt_path: the path to the annotations TXT file
        frame_size: the ``(width, height)`` of the image
        extra_attrs (True): whether to load extra annotation attributes onto
            the imported labels. Supported values are:

            -   ``True``: load all extra attributes found
            -   ``False``: do not load extra attributes
            -   a name or list of names of specific attributes to load

    Returns:
        a :class:`fiftyone.core.detections.Detections` instance
    """
    if extra_attrs == True:
        extra_attrs = {
            "truncated",
            "occluded",
            "alpha",
            "dimensions",
            "location",
            "rotation_y",
        }
    elif extra_attrs == False:
        extra_attrs = set()
    elif etau.is_str(extra_attrs):
        extra_attrs = {extra_attrs}
    else:
        extra_attrs = set(extra_attrs)

    detections = []
    with open(txt_path) as f:
        reader = csv.reader(f, delimiter=" ")
        for row in reader:
            detections.append(
                _parse_kitti_detection_row(row, frame_size, extra_attrs)
            )

    return fol.Detections(detections=detections)


def download_kitti_multiview_dataset(
    dataset_dir,
    splits=None,
    scratch_dir=None,
    overwrite=False,
    cleanup=False,
    num_workers=None,
):
    """Downloads and prepares the multiview KITTI dataset.

    The dataset will be organized on disk in as follows, with each split stored
    in :ref:`FiftyOneDataset format <FiftyOneDataset-import>`::

        dataset_dir/
            train/
                labels/
                    000000.txt
                    000001.txt
                    ...
                calib/
                    000000.txt
                    000001.txt
                    ...
                left/
                    000000.png
                    000001.png
                    ...
                right/
                    000000.png
                    000001.png
                    ...
                velodyne/
                    000000.bin
                    000001.bin
                    ...
                pcd/
                    000000.pcd
                    000001.pcd
                    ...
                metadata.json
                samples.json
            test/
                ...

    Args:
        dataset_dir: the directory in which to construct the dataset
        splits (None): the split or list of splits to download. Supported
            values are ``("train", "test")``
        scratch_dir (None): a scratch directory to use to download any necessary
            temporary files
        overwrite (False): whether to redownload/regenerate files if they
            already exist
        cleanup (False): whether to delete the downloaded zips and scratch
            directory
        num_workers (None): a suggested number of processes to use when
            converting LiDAR to PCD
    """
    if splits is None:
        splits = ("test", "train")

    if not etau.is_container(splits):
        splits = [splits]

    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "tmp-download")

    if "train" in splits:
        _download_and_unpack_kitti_zip(
            _LABELS,
            dataset_dir,
            scratch_dir,
            "train",
            "labels",
            cleanup=cleanup,
            overwrite=overwrite,
        )

    # Always unpack both splits because they come in a single zip
    all_splits = ("train", "test")

    _download_and_unpack_kitti_zip(
        _CALIB,
        dataset_dir,
        scratch_dir,
        all_splits,
        "calib",
        cleanup=cleanup,
        overwrite=overwrite,
    )

    _download_and_unpack_kitti_zip(
        _LEFT_IMAGES,
        dataset_dir,
        scratch_dir,
        all_splits,
        "left",
        cleanup=cleanup,
        overwrite=overwrite,
    )

    _download_and_unpack_kitti_zip(
        _RIGHT_IMAGES,
        dataset_dir,
        scratch_dir,
        all_splits,
        "right",
        cleanup=cleanup,
        overwrite=overwrite,
    )

    _download_and_unpack_kitti_zip(
        _VELODYNE,
        dataset_dir,
        scratch_dir,
        all_splits,
        "velodyne",
        cleanup=cleanup,
        overwrite=overwrite,
    )

    for split in splits:
        split_dir = os.path.join(dataset_dir, split)
        samples_path = os.path.join(split_dir, "samples.json")
        if overwrite or not os.path.isfile(samples_path):
            _prepare_kitti_split(
                split_dir, overwrite=overwrite, num_workers=num_workers
            )

    if cleanup:
        etau.delete_dir(scratch_dir)


def download_kitti_detection_dataset(
    dataset_dir,
    splits=None,
    scratch_dir=None,
    overwrite=False,
    cleanup=False,
):
    """Downloads the KITTI object detection dataset from the web.

    The dataset will be organized on disk in as follows::

        dataset_dir/
            train/
                data/
                    000000.png
                    000001.png
                    ...
                labels/
                    000000.txt
                    000001.txt
                    ...
            test/
                data/
                    000000.png
                    000001.png
                    ...

    Args:
        dataset_dir: the directory in which to construct the dataset
        splits (None): the split or list of splits to download. Supported
            values are ``("train", "test")``
        scratch_dir (None): a scratch directory to use to download any necessary
            temporary files
        overwrite (False): whether to redownload the zips if they already exist
        cleanup (False): whether to delete the downloaded zips and scratch
            directory
    """
    if splits is None:
        splits = ("test", "train")

    if not etau.is_container(splits):
        splits = [splits]

    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "tmp-download")

    if "train" in splits:
        _download_and_unpack_kitti_zip(
            _LABELS,
            dataset_dir,
            scratch_dir,
            "train",
            "labels",
            cleanup=cleanup,
            overwrite=overwrite,
        )

    # Always download and unpack both splits because they come in a single zip
    _download_and_unpack_kitti_zip(
        _LEFT_IMAGES,
        dataset_dir,
        scratch_dir,
        ("train", "test"),
        "data",
        cleanup=cleanup,
        overwrite=overwrite,
    )

    if cleanup:
        etau.delete_dir(scratch_dir)


_LABELS = {
    "url": "https://s3.eu-central-1.amazonaws.com/avg-kitti/data_object_label_2.zip",
    "contents": {
        "train": ["training", "label_2"],
    },
}

_LEFT_IMAGES = {
    "url": "https://s3.eu-central-1.amazonaws.com/avg-kitti/data_object_image_2.zip",
    "contents": {
        "train": ["training", "image_2"],
        "test": ["testing", "image_2"],
    },
}

_RIGHT_IMAGES = {
    "url": "https://s3.eu-central-1.amazonaws.com/avg-kitti/data_object_image_3.zip",
    "contents": {
        "train": ["training", "image_3"],
        "test": ["testing", "image_3"],
    },
}

_VELODYNE = {
    "url": "https://s3.eu-central-1.amazonaws.com/avg-kitti/data_object_velodyne.zip",
    "contents": {
        "train": ["training", "velodyne"],
        "test": ["testing", "velodyne"],
    },
}

_CALIB = {
    "url": "https://s3.eu-central-1.amazonaws.com/avg-kitti/data_object_calib.zip",
    "contents": {
        "train": ["training", "calib"],
        "test": ["testing", "calib"],
    },
}


def _download_and_unpack_kitti_zip(
    data,
    dataset_dir,
    scratch_dir,
    splits,
    name,
    cleanup=False,
    overwrite=False,
):
    url = data["url"]
    zip_path = os.path.join(scratch_dir, os.path.basename(url))

    if not etau.is_container(splits):
        splits = [splits]

    should_unzip = False
    move_dirs = []

    for split in splits:
        unzipped_dir = os.path.join(scratch_dir, *data["contents"][split])
        final_dir = os.path.join(dataset_dir, split, name)

        if overwrite:
            move_dirs.append((unzipped_dir, final_dir))

            if os.path.isdir(final_dir):
                logger.info("Overwriting existing directory '%s'", final_dir)
                etau.delete_dir(final_dir)
        elif not os.path.isdir(final_dir):
            move_dirs.append((unzipped_dir, final_dir))

        if overwrite:
            should_unzip = True

            if os.path.isdir(unzipped_dir):
                etau.delete_dir(unzipped_dir)
        elif not os.path.isdir(unzipped_dir) and not os.path.isdir(final_dir):
            should_unzip = True

    if overwrite or (should_unzip and not os.path.isfile(zip_path)):
        logger.info("Downloading %s to '%s'", name, zip_path)
        etaw.download_file(url, path=zip_path)
    elif should_unzip:
        logger.info("Using existing %s '%s'", name, zip_path)

    if should_unzip:
        logger.info("Extracting '%s'", zip_path)
        etau.extract_zip(zip_path, outdir=scratch_dir)

    if cleanup and os.path.isfile(zip_path):
        etau.delete_file(zip_path)

    for indir, outdir in move_dirs:
        etau.move_dir(indir, outdir)


def _parse_kitti_detection_row(row, frame_size, extra_attrs):
    label = row[0]

    attributes = {}

    if "truncated" in extra_attrs:
        attributes["truncated"] = float(row[1])

    if "occluded" in extra_attrs:
        attributes["occluded"] = int(row[2])

    if "alpha" in extra_attrs:
        attributes["alpha"] = float(row[3])

    width, height = frame_size
    xtl, ytl, xbr, ybr = tuple(map(float, row[4:8]))
    bounding_box = [
        xtl / width,
        ytl / height,
        (xbr - xtl) / width,
        (ybr - ytl) / height,
    ]

    if "dimensions" in extra_attrs:
        try:
            attributes["dimensions"] = list(map(float, row[8:11]))
        except IndexError:
            pass

    if "location" in extra_attrs:
        try:
            attributes["location"] = list(map(float, row[11:14]))
        except IndexError:
            pass

    if "rotation_y" in extra_attrs:
        try:
            attributes["rotation_y"] = float(row[14])
        except IndexError:
            pass

    try:
        confidence = float(row[15])
    except IndexError:
        confidence = None

    return fol.Detection(
        label=label,
        bounding_box=bounding_box,
        confidence=confidence,
        **attributes,
    )


def _make_kitti_detection_row(detection, frame_size):
    cols = [
        detection.label.replace(" ", "_"),
        detection.get_attribute_value("truncated", 0),
        detection.get_attribute_value("occluded", 0),
        detection.get_attribute_value("alpha", 0),
    ]

    width, height = frame_size
    x, y, w, h = detection.bounding_box
    cols.extend(
        [
            int(round(x * width)),
            int(round(y * height)),
            int(round((x + w) * width)),
            int(round((y + h) * height)),
        ]
    )

    dimensions = detection.get_attribute_value("dimensions", None)
    if dimensions is not None:
        dimensions = dimensions.tolist()
    else:
        dimensions = [0, 0, 0]

    cols.extend(dimensions)

    location = detection.get_attribute_value("location", None)
    if location is not None:
        location = location.tolist()
    else:
        location = [0, 0, 0]

    cols.extend(location)

    rotation_y = detection.get_attribute_value("rotation_y", 0)
    cols.append(rotation_y)

    if detection.confidence is not None:
        cols.append(detection.confidence)

    return " ".join(map(str, cols))


#
# References for parsing the KITTI multiview data:
# http://www.cvlibs.net/datasets/kitti/eval_object.php?obj_benchmark=2d
# https://github.com/kuixu/kitti_object_vis/blob/master/kitti_util.py
# http://www.cvlibs.net/publications/Geiger2013IJRR.pdf
#


def _prepare_kitti_split(split_dir, overwrite=False, num_workers=None):
    group_field = "group"
    label_field = "ground_truth"

    dataset = fo.Dataset()
    dataset.add_group_field(group_field, default="left")

    dataset.app_config.plugins["3d"] = {
        "defaultCameraPosition": {"x": 0, "y": 0, "z": 100}
    }
    dataset.save()

    calib_dir = os.path.join(split_dir, "calib")
    velodyne_dir = os.path.join(split_dir, "velodyne")
    labels_dir = os.path.join(split_dir, "labels")
    left_images_dir = os.path.join(split_dir, "left")
    right_images_dir = os.path.join(split_dir, "right")
    pcd_dir = os.path.join(split_dir, "pcd")
    fo3d_dir = os.path.join(split_dir, "fo3d")

    make_map = lambda d: {
        os.path.splitext(os.path.basename(p))[0]: p
        for p in etau.list_files(d, abs_paths=True)
    }

    calib_map = make_map(calib_dir)
    velodyne_map = make_map(velodyne_dir)

    uuids = sorted(velodyne_map.keys())

    _convert_velodyne_to_pcd(
        velodyne_map,
        calib_map,
        pcd_dir,
        uuids,
        overwrite=overwrite,
        num_workers=num_workers,
    )

    _write_fo3d_files(pcd_dir, fo3d_dir, overwrite=overwrite)

    left_map = make_map(left_images_dir)
    right_map = make_map(right_images_dir)
    fo3d_map = make_map(fo3d_dir)

    is_labeled = os.path.isdir(labels_dir)
    if is_labeled:
        labels_map = make_map(labels_dir)

    samples = []

    logger.info("Parsing samples...")
    with fou.ProgressBar() as pb:
        for uuid in pb(uuids):
            group = fo.Group()

            left_filepath = left_map[uuid]
            right_filepath = right_map[uuid]
            scene_filepath = fo3d_map[uuid]

            left_sample = fo.Sample(filepath=left_filepath)
            left_sample[group_field] = group.element("left")

            right_sample = fo.Sample(filepath=right_filepath)
            right_sample[group_field] = group.element("right")

            pcd_sample = fo.Sample(filepath=scene_filepath)
            pcd_sample[group_field] = group.element("pcd")

            if is_labeled:
                labels_path = labels_map[uuid]
                calib_path = calib_map[uuid]

                left_metadata = fom.ImageMetadata.build_for(left_filepath)
                left_frame_size = (left_metadata.width, left_metadata.height)
                gt_left, gt_3d = _load_kitti_annotations(
                    labels_path, left_frame_size
                )

                right_metadata = fom.ImageMetadata.build_for(right_filepath)
                right_frame_size = (
                    right_metadata.width,
                    right_metadata.height,
                )

                calib = _load_calibration_matrices(calib_path)
                gt_right = _proj_3d_to_right_camera(
                    gt_3d, calib, right_frame_size
                )

                left_sample["metadata"] = left_metadata
                left_sample[label_field] = gt_left

                right_sample["metadata"] = right_metadata
                right_sample[label_field] = gt_right

                pcd_sample[label_field] = _normalize_3d_detections(gt_3d)

            samples.extend([left_sample, right_sample, pcd_sample])

    logger.info("Adding samples...")
    dataset.add_samples(samples)

    if is_labeled:
        dataset.compute_metadata()

    logger.info("Writing samples...")
    dataset.export(
        export_dir=split_dir,
        dataset_type=fo.types.FiftyOneDataset,
        export_media=False,
        rel_dir=split_dir,
    )

    dataset.delete()


def _load_kitti_annotations(labels_path, frame_size):
    gt2d = load_kitti_detection_annotations(labels_path, frame_size)
    gt3d = gt2d.copy()

    for detection in gt2d.detections:
        del detection["alpha"]
        del detection["dimensions"]
        del detection["location"]
        del detection["rotation_y"]

    for detection in gt3d.detections:
        detection["bounding_box"] = []
        detection["rotation"] = [0, detection["rotation_y"], 0]
        del detection["alpha"]
        del detection["rotation_y"]
        del detection["truncated"]
        del detection["occluded"]

    return gt2d, gt3d


def _normalize_3d_detections(detections):
    if detections is None:
        return None

    # DontCare labels don't have valid coordinates
    detections.detections = [
        d for d in detections.detections if d["label"] != "DontCare"
    ]

    for detection in detections.detections:
        # KITTI uses bottom-center; FiftyOne uses centroid
        detection["location"][1] -= 0.5 * detection["dimensions"][1]

        # Resolve yaw mismatch between LIDAR and scene
        detection["rotation"][1] -= 0.5 * np.pi

        # Switch to z-up coordinates
        detection["location"] = _swap_coordinates(detection["location"])
        detection["dimensions"] = _swap_coordinates(detection["dimensions"])
        detection["rotation"] = _swap_coordinates(detection["rotation"])

    return detections


def _swap_coordinates(vec):
    return [vec[0], vec[2], -vec[1]]


def _load_calibration_matrices(inpath):
    with open(inpath, "r") as f:
        lines = [l.strip() for l in f.readlines()]
        lines = [l for l in lines if l]

    calib = {}
    for l in lines:
        key, vals = l.split(":", 1)
        vals = [float(v) for v in vals.split()]

        if key.startswith("R"):
            m = np.reshape(vals, (3, 3))
        elif key.startswith("P"):
            m = np.reshape(vals, (3, 4))
        elif key.startswith("T"):
            m = np.reshape(vals, (3, 4))

        calib[key] = m

    return calib


def _roty(t):
    c = np.cos(t)
    s = np.sin(t)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def _proj_3d_to_right_camera(detections3d, calib, frame_size):
    if detections3d is None:
        return None

    P = calib["P3"]
    width, height = frame_size

    detections2d = detections3d.copy()

    # DontCare labels don't have valid coordinates
    detections2d.detections = [
        d for d in detections2d.detections if d["label"] != "DontCare"
    ]

    for detection in detections2d.detections:
        h, w, l = detection["dimensions"]
        t = np.array(detection["location"])
        R = _roty(detection["rotation"][1])

        # Construct (x, y, z) coordinates of 3d box corners
        corners3d = np.array(
            [
                [l / 2, l / 2, -l / 2, -l / 2, l / 2, l / 2, -l / 2, -l / 2],
                [0, 0, 0, 0, -h, -h, -h, -h],
                [w / 2, -w / 2, -w / 2, w / 2, w / 2, -w / 2, -w / 2, w / 2],
            ]
        )
        corners3d = R @ corners3d + t[:, np.newaxis]

        # Project to image coordinates
        corners2d = P @ np.vstack((corners3d, np.ones((1, 8))))
        cornersx = corners2d[0, :] / corners2d[2, :]
        cornersy = corners2d[1, :] / corners2d[2, :]

        # Convert to [0, 1] x [0, 1]
        cornersx = np.clip(cornersx / width, 0, 1)
        cornersy = np.clip(cornersy / height, 0, 1)
        x = min(cornersx)
        y = min(cornersy)
        w = max(cornersx) - x
        h = max(cornersy) - y

        detection.bounding_box = [x, y, w, h]

        del detection["dimensions"]
        del detection["location"]
        del detection["rotation"]

    return detections2d


def _convert_velodyne_to_pcd(
    velodyne_map, calib_map, pcd_dir, uuids, overwrite=False, num_workers=None
):
    inputs = []
    for uuid in uuids:
        velodyne_path = velodyne_map[uuid]
        calib_path = calib_map[uuid]

        outname = os.path.splitext(os.path.basename(velodyne_path))[0] + ".pcd"
        pcd_path = os.path.join(pcd_dir, outname)

        if overwrite or not os.path.isfile(pcd_path):
            inputs.append((velodyne_path, calib_path, pcd_path))

    if not inputs:
        return

    etau.ensure_dir(pcd_dir)

    logger.info("Converting Velodyne scans to PCD format...")
    num_workers = fou.recommend_process_pool_workers(num_workers)
    with fou.ProgressBar(total=len(inputs)) as pb:
        with fou.get_multiprocessing_context().Pool(
            processes=num_workers
        ) as pool:
            for _ in pb(pool.imap_unordered(_do_conversion, inputs)):
                pass


def _do_conversion(input):
    velodyne_path, calib_path, pcd_path = input

    size_float = 4
    list_points = []
    list_colors = []
    with open(velodyne_path, "rb") as f:
        byte = f.read(size_float * 4)
        while byte:
            x, y, z, intensity = struct.unpack("ffff", byte)
            r = intensity
            g = intensity
            b = intensity
            list_points.append([x, y, z])
            list_colors.append([r, g, b])
            byte = f.read(size_float * 4)

    points = np.array(list_points)
    colors = np.array(list_colors)

    # Transform to camera coordinates
    calib = _load_calibration_matrices(calib_path)
    P = calib["R0_rect"] @ calib["Tr_velo_to_cam"]
    points = np.hstack((points, np.ones((len(points), 1)))) @ P.T

    # Switch to z-up coordinates
    points = np.stack((points[:, 0], points[:, 2], -points[:, 1]), axis=1)

    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    pcd.colors = o3d.utility.Vector3dVector(colors)

    o3d.io.write_point_cloud(pcd_path, pcd)


def _write_fo3d_files(pcd_dir, fo3d_dir, overwrite=False, abs_paths=False):
    for pcd_filepath in etau.list_files(pcd_dir, abs_paths=True):
        scene_filepath = os.path.join(
            fo3d_dir,
            os.path.splitext(os.path.basename(pcd_filepath))[0] + ".fo3d",
        )

        if overwrite or not os.path.isfile(scene_filepath):
            if not abs_paths:
                pcd_filepath = os.path.relpath(pcd_filepath, fo3d_dir)

            scene = fo3d.Scene(camera=fo3d.PerspectiveCamera(up="Z"))
            scene.add(fo3d.PointCloud("point cloud", pcd_filepath))
            scene.write(scene_filepath)
