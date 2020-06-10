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
                    "object": [
                        {
                            "name": "chair",
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
        super(VOCDetectionSampleParser, self).__init__(normalized=False)

    def _parse_label(self, target, img=None):
        if etau.is_str(target):
            target = fou.load_xml_as_json_dict(target)

        _objects = target["annotation"].get("object", [])

        # Single detections must be wrapped in a list
        if not isinstance(_objects, list):
            _objects = [_objects]

        objects = []
        for obj in _objects:
            bbox = obj["bndbox"]
            xmin = int(bbox["xmin"])
            ymin = int(bbox["ymin"])
            xmax = int(bbox["xmax"])
            ymax = int(bbox["ymax"])
            objects.append(
                {
                    "label": obj["name"],
                    "bounding_box": [xmin, ymin, xmax - xmin, ymax - ymin],
                }
            )

        return super(VOCDetectionSampleParser, self)._parse_label(
            objects, img=img
        )


class VOCObject(object):
    """Description of an object in VOC Detection format.

    Args:
        name: the object label
        xmin: the top-left x coordinate
        ymin: the top-left y coordinate
        xmax: the bottom-right x coordinate
        ymax: the bottom-right y coordinate
        pose (None): the pose of the object
        truncated (None): whether the object is truncated (0 or 1)
        difficult (None): whether the object is considered difficult (0 or 1)
    """

    def __init__(
        self,
        name,
        xmin,
        ymin,
        xmax,
        ymax,
        pose=None,
        truncated=None,
        difficult=None,
    ):
        self.name = name
        self.xmin = xmin
        self.ymin = ymin
        self.xmax = xmax
        self.ymax = ymax
        self.pose = pose
        self.truncated = truncated
        self.difficult = difficult

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

        width = metadata.width
        height = metadata.height
        x, y, w, h = detection.bounding_box
        xmin = int(round(x * width))
        ymin = int(round(y * height))
        xmax = int(round((x + w) * width))
        ymax = int(round((y + h) * height))

        return cls(name, xmin, ymin, xmax, ymax)

    def to_dict(self):
        """Returns a dictionary representation of the object.

        Returns:
            a dict
        """
        return {
            "name": self.name,
            "xmin": self.xmin,
            "ymin": self.ymin,
            "xmax": self.xmax,
            "ymax": self.ymax,
            "pose": self.pose or "",
            "truncated": self.truncated or "",
            "difficult": self.difficult or "",
        }


class VOCAnnotationWriter(object):
    """Class for writing annotations in VOC format."""

    def __init__(self):
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(foc.RESOURCES_DIR)
        )
        self.template = environment.get_template("voc_annotation_template.xml")

    def write_annotation(self, detections, metadata, img_path, xml_path):
        """Writes the annotations to disk in XML format.

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
            objects.append(obj.to_dict())

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
            writer.write_annotation(
                label, metadata, out_img_path, out_anno_path
            )

    logger.info("Dataset created")
