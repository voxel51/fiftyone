"""
Utilities for working with datasets in
`KITTI format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import csv
import logging
import os

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


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
            labels_path = fou.normpath(self.labels_path)
            labels_paths_map = {
                os.path.splitext(p)[0]: os.path.join(labels_path, p)
                for p in etau.list_files(labels_path, recursive=True)
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


_LABELS_ZIP_URL = (
    "https://s3.eu-central-1.amazonaws.com/avg-kitti/data_object_label_2.zip"
)
_IMAGES_ZIP_URL = (
    "https://s3.eu-central-1.amazonaws.com/avg-kitti/data_object_image_2.zip"
)

# unused
_DEVKIT_ZIP_URL = (
    "https://s3.eu-central-1.amazonaws.com/avg-kitti/devkit_object.zip"
)
_CALIB_ZIP_URL = (
    "https://s3.eu-central-1.amazonaws.com/avg-kitti/data_object_calib.zip"
)


def download_kitti_detection_dataset(
    dataset_dir, overwrite=True, cleanup=True
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
        overwrite (True): whether to redownload the zips if they already exist
        cleanup (True): whether to delete the downloaded zips
    """
    labels_zip_path = os.path.join(dataset_dir, "data_object_label_2.zip")
    if overwrite or not os.path.exists(labels_zip_path):
        logger.info("Downloading labels to '%s'...", labels_zip_path)
        etaw.download_file(_LABELS_ZIP_URL, path=labels_zip_path)
    else:
        logger.info("Using existing labels '%s'", labels_zip_path)

    images_zip_path = os.path.join(dataset_dir, "data_object_image_2.zip")
    if overwrite or not os.path.exists(images_zip_path):
        logger.info("Downloading images to '%s'...", images_zip_path)
        etaw.download_file(_IMAGES_ZIP_URL, path=images_zip_path)
    else:
        logger.info("Using existing images '%s'", images_zip_path)

    logger.info("Extracting data")
    scratch_dir = os.path.join(dataset_dir, "tmp-download")
    etau.extract_zip(labels_zip_path, outdir=scratch_dir, delete_zip=cleanup)
    etau.extract_zip(images_zip_path, outdir=scratch_dir, delete_zip=cleanup)
    etau.move_dir(
        os.path.join(scratch_dir, "training", "label_2"),
        os.path.join(dataset_dir, "train", "labels"),
    )
    etau.move_dir(
        os.path.join(scratch_dir, "training", "image_2"),
        os.path.join(dataset_dir, "train", "data"),
    )
    etau.move_dir(
        os.path.join(scratch_dir, "testing", "image_2"),
        os.path.join(dataset_dir, "test", "data"),
    )
    etau.delete_dir(scratch_dir)


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
