"""
Utilities for working with datasets in
`KITTI format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import csv
import logging
import os

import eta.core.image as etai
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class KITTIDetectionSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples in
    `KITTI detection format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.

    This implementation supports samples that are
    ``(image_or_path, anno_txt_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``anno_txt_path`` is the path to a KITTI labels TXT file on disk. Or,
          for unlabeled images, ``anno_txt_path`` can be ``None``.

    See :class:`fiftyone.types.dataset_types.KITTIDetectionDataset` for more
    format details.
    """

    def __init__(self):
        super().__init__(
            label_field=None,
            bounding_box_field=None,
            confidence_field=None,
            attributes_field=None,
            classes=None,
            normalized=False,  # image required to convert to relative coords
        )

    def _parse_label(self, target, img=None):
        if target is None:
            return None

        frame_size = etai.to_frame_size(img=img)
        return load_kitti_detection_annotations(target, frame_size)


class KITTIDetectionDatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for KITTI detection datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.KITTIDetectionDataset` for format
    details.

    Args:
        dataset_dir: the dataset directory
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir,
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self._uuids_to_image_paths = None
        self._uuids_to_labels_paths = None
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
            image_path = self._uuids_to_image_paths[uuid]
        except KeyError:
            raise ValueError("No image found for sample '%s'" % uuid)

        image_metadata = fom.ImageMetadata.build_for(image_path)

        labels_path = self._uuids_to_labels_paths.get(uuid, None)
        if labels_path:
            # Labeled image
            frame_size = (image_metadata.width, image_metadata.height)
            detections = load_kitti_detection_annotations(
                labels_path, frame_size
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
        to_uuid = lambda p: os.path.splitext(os.path.basename(p))[0]

        data_dir = os.path.join(self.dataset_dir, "data")
        if os.path.isdir(data_dir):
            self._uuids_to_image_paths = {
                to_uuid(p): p
                for p in etau.list_files(data_dir, abs_paths=True)
            }
        else:
            self._uuids_to_image_paths = {}

        labels_dir = os.path.join(self.dataset_dir, "labels")
        if os.path.isdir(labels_dir):
            self._uuids_to_labels_paths = {
                to_uuid(p): p
                for p in etau.list_files(labels_dir, abs_paths=True)
            }
        else:
            self._uuids_to_labels_paths = {}

        if self.skip_unlabeled:
            uuids = sorted(self._uuids_to_labels_paths.keys())
        else:
            uuids = sorted(self._uuids_to_image_paths.keys())

        self._uuids = self._preprocess_list(uuids)
        self._num_samples = len(self._uuids)

    @staticmethod
    def get_num_samples(dataset_dir):
        data_dir = os.path.join(dataset_dir, "data")
        if not os.path.isdir(data_dir):
            return 0

        return len(etau.list_files(data_dir))


class KITTIDetectionDatasetExporter(foud.LabeledImageDatasetExporter):
    """Exporter that writes KITTI detection datasets to disk.

    See :class:`fiftyone.types.dataset_types.KITTIDetectionDataset` for format
    details.

    Args:
        export_dir: the directory to write the export
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self._data_dir = None
        self._labels_dir = None
        self._filename_maker = None
        self._writer = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_dir = os.path.join(self.export_dir, "labels")
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._writer = KITTIAnnotationWriter()

        etau.ensure_dir(self._data_dir)
        etau.ensure_dir(self._labels_dir)

    def export_sample(self, image_or_path, detections, metadata=None):
        out_image_path = self._export_image_or_path(
            image_or_path, self._filename_maker
        )

        if detections is None:
            return

        name = os.path.splitext(os.path.basename(out_image_path))[0]
        out_anno_path = os.path.join(self._labels_dir, name + ".txt")

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(out_image_path)

        self._writer.write(detections, metadata, out_anno_path)


class KITTIAnnotationWriter(object):
    """Class for writing annotations in KITTI detection format.

    See :class:`fiftyone.types.dataset_types.KITTIDetectionDataset` for more
    format details.
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


def load_kitti_detection_annotations(txt_path, frame_size):
    """Loads the KITTI detection annotations from the given TXT file.

    See :class:`fiftyone.types.dataset_types.KITTIDetectionDataset` for format
    details.

    Args:
        txt_path: the path to the annotations TXT file
        frame_size: the ``(width, height)`` of the image

    Returns:
        a :class:`fiftyone.core.detections.Detections` instance
    """
    detections = []
    with open(txt_path) as f:
        reader = csv.reader(f, delimiter=" ")
        for row in reader:
            detection = _parse_kitti_detection_row(row, frame_size)
            detections.append(detection)

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

    The dataset will be organized on disk in
    :class:`fiftyone.types.dataset_types.KITTIDetectionDataset` format as
    follows::

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


def _parse_kitti_detection_row(row, frame_size):
    attributes = {}

    label = row[0]

    attributes["truncated"] = fol.NumericAttribute(value=float(row[1]))
    attributes["occluded"] = fol.NumericAttribute(value=int(row[2]))
    attributes["alpha"] = fol.NumericAttribute(value=float(row[3]))

    width, height = frame_size
    xtl, ytl, xbr, ybr = tuple(map(float, row[4:8]))
    bounding_box = [
        xtl / width,
        ytl / height,
        (xbr - xtl) / width,
        (ybr - ytl) / height,
    ]

    try:
        attributes["dimensions"] = fol.ListAttribute(
            value=list(map(float, row[8:11]))
        )
    except IndexError:
        pass

    try:
        attributes["location"] = fol.ListAttribute(
            value=list(map(float, row[11:14]))
        )
    except IndexError:
        pass

    try:
        attributes["rotation_y"] = fol.NumericAttribute(value=float(row[14]))
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
        attributes=attributes,
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
