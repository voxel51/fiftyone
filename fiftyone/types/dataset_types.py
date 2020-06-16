"""
FiftyOne dataset types.

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


class BaseDataset(object):
    """Base type for datasets."""

    pass


class BaseUnlabeledDataset(BaseDataset):
    """Base type for datasets that represent an unlabeled collection of data
    samples.
    """

    pass


class BaseUnlabeledImageDataset(BaseUnlabeledDataset):
    """Base type for datasets that represent an unlabeled collection of images.
    """

    pass


class BaseLabeledDataset(BaseDataset):
    """Base type for datasets that represent a collection of data samples and
    their associated labels.
    """

    pass


class BaseLabeledImageDataset(BaseLabeledDataset):
    """Base type for datasets that represent a collection of images and their
    associated labels.
    """

    pass


class BaseImageClassificationDataset(BaseLabeledImageDataset):
    """Base type for datasets that represent a collection of images and a set
    of associated classification labels.
    """

    pass


class BaseImageDetectionDataset(BaseLabeledImageDataset):
    """Base type for datasets that represent a collection of images and a set
    of associated object detections.
    """

    pass


class BaseImageLabelsDataset(BaseLabeledImageDataset):
    """Base type for datasets that represent a collection of images and a set
    of associated multitask predictions.
    """

    pass


class ImageDirectory(BaseUnlabeledImageDataset):
    """A directory of images.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            <filename1>.<ext>
            <filename2>.<ext>

    When reading datasets of this type, subfolders are recursively traversed,
    and files with non-image MIME types are omitted.
    """

    pass


class ImageClassificationDataset(BaseImageClassificationDataset):
    """A labeled dataset consisting of images and their associated
    classification labels.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels.json

    where ``labels.json`` is a JSON file in the following format::

        {
            "classes": [
                <labelA>,
                <labelB>,
                ...
            ],
            "labels": {
                <uuid1>: <target1>,
                <uuid2>: <target2>,
                ...
            }
        }

    If the ``classes`` field is provided, the ``target`` values are class IDs
    that are mapped to class label strings via ``classes[target]``. If no
    ``classes`` field is provided, then the ``target`` values directly store
    the label strings.
    """

    pass


class ImageClassificationDirectoryTree(BaseImageClassificationDataset):
    """A directory tree that defines an image classification dataset.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            <classA>/
                <image1>.<ext>
                <image2>.<ext>
                ...
            <classB>/
                <image1>.<ext>
                <image2>.<ext>
                ...
    """

    pass


class TFImageClassificationDataset(BaseImageClassificationDataset):
    """A labeled dataset consisting of images and their associated
    classification labels stored as TFRecords.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            tf.records-?????-of-?????

    where the features of the (possibly sharded) TFRecords are stored in the
    following format::

        {
            # Image dimensions
            "height": tf.io.FixedLenFeature([], tf.int64),
            "width": tf.io.FixedLenFeature([], tf.int64),
            "depth": tf.io.FixedLenFeature([], tf.int64),

            # Image filename
            "filename": tf.io.FixedLenFeature([], tf.int64),

            # Encoded image bytes
            "image_bytes": tf.io.FixedLenFeature([], tf.string),

            # Class label string
            "label": tf.io.FixedLenFeature([], tf.string),
        }
    """

    pass


class ImageDetectionDataset(BaseImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels.json

    where ``labels.json`` is a JSON file in the following format::

        {
            "classes": [
                <labelA>,
                <labelB>,
                ...
            ],
            "labels": {
                <uuid1>: [
                    {
                        "label": <target>,
                        "bounding_box": [
                            <top-left-x>, <top-left-y>, <width>, <height>
                        ],
                        "confidence": <optional-confidence>,
                    },
                    ...
                ],
                <uuid2>: [
                    ...
                ],
                ...
            }
        }

    and where the bounding box coordinates are expressed as relative values in
    ``[0, 1] x [0, 1]``.

    If the ``classes`` field is provided, the ``target`` values are class IDs
    that are mapped to class label strings via ``classes[target]``. If no
    ``classes`` field is provided, then the ``target`` values directly store
    the label strings.
    """

    pass


class COCODetectionDataset(BaseImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in COCO format (http://cocodataset.org/#home).

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <filename0>
                <filename1>
                ...
            labels.json

    where ``labels.json`` is a JSON file in the following format::

        {
            "info": {...},
            "licenses": [],
            "categories": [
                ...
                {
                    "id": 2,
                    "name": "cat",
                    "supercategory": "none"
                },
                ...
            ],
            "images": [
                {
                    "id": 0,
                    "license": null,
                    "file_name": <filename0>,
                    "height": 480,
                    "width": 640,
                    "date_captured": null
                },
                ...
            ],
            "annotations": [
                {
                    "id": 0,
                    "image_id": 0,
                    "category_id": 2,
                    "bbox": [260, 177, 231, 199],
                    "area": 45969,
                    "segmentation": [],
                    "iscrowd": 0
                },
                ...
            ]
        }
    """

    pass


class VOCDetectionDataset(BaseImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in VOC format (http://host.robots.ox.ac.uk/pascal/VOC).

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels/
                <uuid1>.xml
                <uuid2>.xml

    where the labels XML files are in the following format::

        <annotation>
            <folder>data</folder>
            <filename>image.ext</filename>
            <path>/path/to/dataset/data/image.ext</path>
            <source>
                <database></database>
            </source>
            <size>
                <width>640</width>
                <height>480</height>
                <depth>3</depth>
            </size>
            <segmented></segmented>
            <object>
                <name>cat</name>
                <pose></pose>
                <truncated></truncated>
                <difficult></difficult>
                <bndbox>
                    <xmin>256</xmin>
                    <ymin>200</ymin>
                    <xmax>450</xmax>
                    <ymax>400</ymax>
                </bndbox>
            </object>
            <object>
                <name>dog</name>
                <pose></pose>
                <truncated></truncated>
                <difficult></difficult>
                <bndbox>
                    <xmin>128</xmin>
                    <ymin>100</ymin>
                    <xmax>350</xmax>
                    <ymax>300</ymax>
                </bndbox>
            </object>
            ...
        </annotation>
    """

    pass


class TFObjectDetectionDataset(BaseImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections stored as TFRecords in TF Object Detection API format
    (https://github.com/tensorflow/models/blob/master/research/object_detection).

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            tf.records-?????-of-?????

    where the features of the (possibly sharded) TFRecords are stored in the
    following format::

        {
            # Image dimensions
            "image/height": tf.io.FixedLenFeature([], tf.int64),
            "image/width": tf.io.FixedLenFeature([], tf.int64),

            # Image filename is used for both of these
            "image/filename": tf.io.FixedLenFeature([], tf.int64),
            "image/source_id": tf.io.FixedLenFeature([], tf.string),

            # Encoded image bytes
            "image/encoded": tf.io.FixedLenFeature([], tf.string),

            # Image format, either `jpeg` or `png`
            "image/format": tf.io.FixedLenFeature([], tf.string),

            # Normalized bounding box coordinates in `[0, 1]`
            "image/object/bbox/xmin": tf.io.FixedLenFeature([], tf.float64),
            "image/object/bbox/xmax": tf.io.FixedLenFeature([], tf.float64),
            "image/object/bbox/ymin": tf.io.FixedLenFeature([], tf.float64),
            "image/object/bbox/ymax": tf.io.FixedLenFeature([], tf.float64),

            # Class label string
            "image/object/class/text": tf.io.FixedLenFeature([], tf.string),

            # Integer class ID
            "image/object/class/label": tf.io.FixedLenFeature([], tf.int64),
        }
    """

    pass


class CVATImageDataset(BaseImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections stored in CVAT image format (https://github.com/opencv/cvat).

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels.xml

    where ``labels.xml`` is an XML file in the following format::

        <?xml version="1.0" encoding="utf-8"?>
        <annotations>
            <version>1.1</version>
            <meta>
                <task>
                    <size>51</size>
                    <mode>annotation</mode>
                    <labels>
                        <label>
                            <name>car</name>
                            <attributes>
                                <attribute>
                                    <name>type</name>
                                    <values>coupe,sedan,truck</values>
                                </attribute>
                                ...
                            </attributes>
                        </label>
                        <label>
                            <name>person</name>
                            <attributes>
                                <attribute>
                                    <name>gender</name>
                                    <values>male,female</values>
                                </attribute>
                                ...
                            </attributes>
                        </label>
                        ...
                    </labels>
                </task>
                <dumped>2017-11-20 11:51:51.000000+00:00</dumped>
            </meta>
            <image id="1" name="<uuid1>.<ext>" width="640" height="480">
                <box label="car" xtl="100" ytl="50" xbr="325" ybr="190" type="sedan"></box>
                ...
            </image>
            ...
            <image id="51" name="<uuid51>.<ext>" width="640" height="480">
                <box label="person" xtl="300" ytl="25" xbr="375" ybr="400" gender="female"></box>
                ...
            </image>
        </annotations>
    """

    pass


class ImageLabelsDataset(BaseImageLabelsDataset):
    """A labeled dataset consisting of images and their associated multitask
    predictions stored in ``eta.core.image.ImageLabels`` format.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels/
                <uuid1>.json
                <uuid2>.json
                ...
            manifest.json

    where ``manifest.json`` is a JSON file in the following format::

        {
            "type": "eta.core.datasets.LabeledImageDataset",
            "description": "",
            "index": [
                {
                    "data": "data/<uuid1>.<ext>",
                    "labels": "labels/<uuid1>.json"
                },
                ...
            ]
        }

    and where each labels JSON file is stored in ``eta.core.image.ImageLabels``
    format. See https://voxel51.com/docs/api/#types-imagelabels for more
    details.
    """

    pass
