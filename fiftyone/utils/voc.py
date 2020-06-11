"""
Utilities for working with datasets in PASCAL VOC format.

The VOC dataset: http://host.robots.ox.ac.uk/pascal/VOC.

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

from collections import defaultdict
import logging
import os

import jinja2

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


VOC_DETECTION_CLASSES = [
    "aeroplane",
    "bicycle",
    "bird",
    "boat",
    "bottle",
    "bus",
    "car",
    "cat",
    "chair",
    "cow",
    "diningtable",
    "dog",
    "horse",
    "motorbike",
    "person",
    "pottedplant",
    "sheep",
    "sofa",
    "train",
    "tvmonitor",
]


class VOCDetectionSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples in PASCAL VOC Detection format.

    This implementation supports samples that are
    ``(image_or_path, annotations_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``annotations_or_path`` is either a JSON dictionary of annotations
          in the following format::

            {
                "annotation": {
                    ...
                    "object": [
                        {
                            "name": "chair",
                            "pose": "Frontal",
                            "truncated": "0",
                            "difficult": "0",
                            "occluded": "0",
                            "bndbox": {
                                "xmin": "263",
                                "ymin": "211",
                                "xmax": "324",
                                "ymax": "339"
                            },
                            ...
                        },
                        ...
                    ],
                    ...
                }
            }

          or the path to a VOC annotations XML file on disk.

    See :class:`fiftyone.types.VOCDetectionDataset` for more format details.
    """

    def __init__(self):
        super().__init__(
            label_field=None, bounding_box_field=None, confidence_field=None
        )

    def _parse_label(self, target, img=None):
        if etau.is_str(target):
            target = fou.load_xml_as_json_dict(target)

        annotation = target["annotation"]
        size = annotation["size"]
        frame_size = (int(size["width"]), int(size(["height"])))

        objects = _ensure_list(annotation.get("object", []))
        detections = [
            VOCObject.from_annotation_dict(obj).to_detection(frame_size)
            for obj in objects
        ]
        return fol.Detections(detections=detections)


class VOCObject(object):
    """An object in VOC detection format.

    Args:
        name: the object label
        bndbox: a :class:`VOCBoundingBox`
        pose (None): the pose of the object
        truncated (None): whether the object is truncated
        difficult (None): whether the object is considered difficult
    """

    def __init__(
        self, name, bndbox, pose=None, truncated=None, difficult=None,
    ):
        self.name = name
        self.bndbox = bndbox
        self.pose = pose
        self.truncated = truncated
        self.difficult = difficult

    @classmethod
    def from_annotation_dict(cls, d):
        """Creates a :class:`VOCObject` from a VOC annotation dict.

        Args:
            d: an annotation dict

        Returns:
            a :class:`VOCObject`
        """
        name = d["name"]
        bndbox = VOCBoundingBox.from_bndbox_dict(d["bndbox"])
        pose = d.get("pose", None)
        truncated = d.get("truncated", None)
        difficult = d.get("difficult", None)
        return cls(
            name, bndbox, pose=pose, truncated=truncated, difficult=difficult
        )

    @classmethod
    def from_detection(cls, detection, metadata):
        """Creates a :class:`VOCObject` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            detection: a :class:`fiftyone.core.labels.Detection`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` instance
                for the image

        Returns:
            a :class:`VOCObject`
        """
        name = detection.label

        frame_size = (metadata.width, metadata.height)
        bndbox = VOCBoundingBox.from_detection_format(
            detection.bounding_box, frame_size
        )

        pose = detection.get_attribute_value("pose", None)
        truncated = detection.get_attribute_value("truncated", None)
        difficult = detection.get_attribute_value("difficult", None)

        return cls(
            name, bndbox, pose=pose, truncated=truncated, difficult=difficult
        )

    def to_detection(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label = self.name
        bounding_box = self.bndbox.to_detection_format(frame_size)
        detection = fol.Detection(label=label, bounding_box=bounding_box)

        if self.pose:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["pose"] = fol.CategoricalAttribute(self.pose)

        if self.truncated is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["truncated"] = fol.BooleanAttribute(
                self.truncated
            )

        if self.difficult is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["difficult"] = fol.BooleanAttribute(
                self.difficult
            )

        return detection


class VOCBoundingBox(object):
    """A bounding box in VOC detection format.

    Args:
        xmin: the top-left x coordinate
        ymin: the top-left y coordinate
        xmax: the bottom-right x coordinate
        ymax: the bottom-right y coordinate
    """

    def __init__(self, xmin, ymin, xmax, ymax):
        self.xmin = xmin
        self.ymin = ymin
        self.xmax = xmax
        self.ymax = ymax

    @classmethod
    def from_bndbox_dict(cls, d):
        """Creates a :class:`VOCBoundingBox` from a ``bndbox`` dict.

        Args:
            d: a ``bndbox`` dict

        Returns:
            a :class:`VOCBoundingBox`
        """
        return cls(
            int(d["xmin"]), int(d["ymin"]), int(d["xmax"]), int(d["ymax"])
        )

    @classmethod
    def from_detection_format(cls, bounding_box, frame_size):
        """Creates a :class:`VOCBoundingBox` from a bounding box stored in
        :class:`fiftyone.core.labels.Detection` format.

        Args:
            bounding_box: ``[x-top-left, y-top-left, width, height]``
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`VOCBoundingBox`
        """
        x, y, w, h = bounding_box
        width, height = frame_size
        return cls(
            int(width * x),
            int(height * y),
            int(width * (x + w)),
            int(height * (y + h)),
        )

    def to_detection_format(self, frame_size):
        """Returns a representation of the bounding box suitable for storing in
        the ``bounding_box`` field of a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            ``[x-top-left, y-top-left, width, height]``
        """
        width, height = frame_size
        x = self.xmin / width
        y = self.ymin / height
        w = (self.xmax - self.xmin) / width
        h = (self.ymax - self.ymin) / height
        return [x, y, w, h]


class VOCAnnotationWriter(object):
    """Class for writing annotations in VOC format.

    See :class:`fiftyone.types.VOCDetectionDataset` for format details.
    """

    def __init__(self):
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(foc.RESOURCES_DIR)
        )
        self.template = environment.get_template("voc_annotation_template.xml")

    def write(self, detections, metadata, img_path, xml_path):
        """Writes the annotations to disk.

        Args:
            detections: a :class:`fiftyone.core.labels.Detections`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` instance
                for the image
            img_path: the path to the image on disk
            xml_path: the path to write the annotations XML file
        """
        objects = []
        for detection in detections.detections:
            obj = VOCObject.from_detection(detection, metadata)
            objects.append(obj)

        xml_str = self.template.render(
            {
                "path": img_path,
                "filename": os.path.basename(img_path),
                "folder": os.path.basename(os.path.dirname(img_path)),
                "width": metadata.width,
                "height": metadata.height,
                "depth": metadata.num_channels,
                "database": "",
                "segmented": "",
                "objects": objects,
            }
        )
        etau.write_file(xml_str, xml_path)


def parse_voc_detection_dataset(dataset_dir):
    """Parses the VOC detection dataset stored in the given directory.

    Args:
        dataset_dir: the dataset directory

    Returns:
        a list of ``(img_path, image_metadata, detections)`` tuples
    """
    data_dir = os.path.join(dataset_dir, "data")
    labels_dir = os.path.join(dataset_dir, "labels")

    image_filenames = etau.list_files(data_dir, abs_paths=False)
    labels_filenames = etau.list_files(labels_dir, abs_paths=False)

    # @todo complete this
    samples = []

    """
    for filename in filenames:
        img_path = os.path.join(data_dir, filename)

        if filename not in image_dict:
            continue

        image_dict = images[filename]
        image_id = image_dict["id"]
        width = image_dict["width"]
        height = image_dict["height"]

        metadata = fom.ImageMetadata(width=width, height=height)

        frame_size = (width, height)
        detections = fol.Detections(
            detections=[
                obj.to_detection(frame_size, classes)
                for obj in annotations.get(image_id, [])
            ]
        )

        samples.append((img_path, metadata, detections))
    """

    return samples


def export_voc_detection_dataset(samples, label_field, dataset_dir):
    """Exports the given samples to disk as a VOC detection dataset.

    See :class:`fiftyone.types.VOCDetectionDataset` for format details.

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
        etau.get_class_name(fot.VOCDetectionDataset),
    )

    etau.ensure_dir(data_dir)
    etau.ensure_dir(labels_dir)

    writer = VOCAnnotationWriter()
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
            out_anno_path = os.path.join(labels_dir, name + ".xml")

            etau.copy_file(img_path, out_img_path)

            metadata = sample.metadata
            if metadata is None:
                metadata = fom.ImageMetadata.build_for(img_path)

            label = sample[label_field]
            writer.write(label, metadata, out_img_path, out_anno_path)

    logger.info("Dataset created")


def _ensure_list(value):
    return [value] if not isinstance(value, list) else value
