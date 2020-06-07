"""
Utilities for the PASCAL VOC dataset.

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

import eta.core.utils as etau

import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


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
    """Sample parser for the PASCAL VOC Detection Dataset.

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
                            "pose": "Rear",
                            "truncated": "0",
                            "difficult": "0",
                            "bndbox": {
                                "xmin": "263",
                                "ymin": "211",
                                "xmax": "324",
                                "ymax": "339"
                            }
                        },
                        ...
                    ],
                    ...
                }
            }

          or the path to a VOC annotations XML file on disk.
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
