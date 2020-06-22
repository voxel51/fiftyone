"""
Utilities for working with datasets in KITTI format.

The KITTI dataset: http://www.cvlibs.net/datasets/kitti/index.php.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import csv
from collections import defaultdict
import logging
import os

import numpy as np

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class KITTIDetectionSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples in KITTI detection format.

    This implementation supports samples that are
    ``(image_or_path, anno_txt_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``anno_txt_path`` is the path to a KITTI labels TXT file on disk

    See :class:`fiftyone.types.KITTIDetectionDataset` for more format details.
    """

    def __init__(self):
        super().__init__(
            label_field=None,
            bounding_box_field=None,
            confidence_field=None,
            normalized=False,
        )

    def _parse_label(self, target, img=None):
        frame_size = etai.to_frame_size(img=img)
        return load_kitti_detection_annotations(target, frame_size)


class KITTIAnnotationWriter(object):
    """Class for writing annotations in KITTI detection format.

    See :class:`fiftyone.types.KITTIDetectionDataset` for more format details.
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


def parse_kitti_detection_dataset(dataset_dir):
    """Parses the KITTI detection dataset stored in the given directory.

    See :class:`fiftyone.types.KITTIDetectionDataset` for format details.

    Args:
        dataset_dir: the dataset directory

    Returns:
        a list of ``(img_path, image_metadata, detections)`` tuples
    """
    data_dir = os.path.join(dataset_dir, "data")
    labels_dir = os.path.join(dataset_dir, "labels")

    img_paths = etau.list_files(data_dir, abs_paths=True)

    anno_uuids_to_paths = {
        os.path.splitext(f)[0]: os.path.join(labels_dir, f)
        for f in etau.list_files(labels_dir, abs_paths=False)
    }

    samples = []
    for img_path in img_paths:
        uuid = os.path.splitext(os.path.basename(img_path))[0]

        metadata = fom.ImageMetadata.build_for(img_path)

        frame_size = (metadata.width, metadata.height)
        anno_path = anno_uuids_to_paths[uuid]
        detections = load_kitti_detection_annotations(anno_path, frame_size)

        samples.append((img_path, metadata, detections))

    return samples


def load_kitti_detection_annotations(txt_path, frame_size):
    """Loads the KITTI detection annotations from the given TXT file.

    See :class:`fiftyone.types.KITTIDetectionDataset` for format details.

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


def export_kitti_detection_dataset(samples, label_field, dataset_dir):
    """Exports the given samples to disk as a KITTI detection dataset.

    See :class:`fiftyone.types.KITTIDetectionDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the :class:`fiftyone.core.labels.Detections`
            field of the samples to export
        dataset_dir: the directory to which to write the dataset
    """
    data_dir = os.path.join(dataset_dir, "data")
    labels_dir = os.path.join(dataset_dir, "labels")

    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.KITTIDetectionDataset),
    )

    etau.ensure_dir(data_dir)
    etau.ensure_dir(labels_dir)

    writer = KITTIAnnotationWriter()
    data_filename_counts = defaultdict(int)
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            img_path = sample.filepath
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            out_img_path = os.path.join(data_dir, name + ext)
            out_anno_path = os.path.join(labels_dir, name + ".txt")

            etau.copy_file(img_path, out_img_path)

            metadata = sample.metadata
            if metadata is None:
                metadata = fom.ImageMetadata.build_for(img_path)

            detections = sample[label_field]
            writer.write(detections, metadata, out_anno_path)

    logger.info("Dataset created")


def _parse_kitti_detection_row(row, frame_size):
    attributes = {}

    label = row[0]

    attributes["truncated"] = fol.NumericAttribute(value=float(row[1]))
    attributes["occluded"] = fol.NumericAttribute(value=int(row[2]))
    attributes["alpha"] = fol.NumericAttribute(value=float(row[3]))

    width, height = frame_size
    xtl, ytl, xbr, ybr = map(float, row[4:8])
    bounding_box = [
        xtl / width,
        ytl / height,
        (xbr - xtl) / width,
        (ybr - ytl) / height,
    ]

    try:
        attributes["dimensions"] = fol.VectorAttribute(
            value=np.asarray(map(float, row[8:11]))
        )
    except IndexError:
        pass

    try:
        attributes["location"] = fol.VectorAttribute(
            value=np.asarray(map(float, row[11:14]))
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
        detection.label,
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
