Exporting FiftyOne Datasets
===========================

.. include:: ../substitutions.rst
.. default-role:: code

FiftyOne provides native support for exporting a |Dataset2|_ to disk in a variety of
common formats.

Basic recipe
------------

The interface for exporting a FiftyOne |Dataset| is conveniently exposed via the
Python library and the CLI. You can easily export entire datasets as well as
arbitrary subsets of your datasets that you have identified by constructing a
|DatasetView| into any format of your choice via the basic recipe below.

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        # The Dataset or DatasetView containing the samples you wish to export
        dataset_or_view = fo.Dataset(...)

        # The directory to which to write the exported dataset
        export_dir = "/path/for/export"

        # The name of the sample field containing the label that you wish to export
        # Used when exporting labeled datasets (e.g., classification or detection)
        label_field = "ground_truth"  # for example

        # The type of dataset to export
        # Any subclass of `fiftyone.types.BaseDataset` is supported
        dataset_type = fo.types.COCODetectionDataset  # for example

        # Export the dataset!
        dataset_or_view.export(
            export_dir, label_field=label_field, dataset_type=dataset_type
        )

    Note the `label_field` argument in the above example, which specifies the
    particular label field that you wish to export. This is necessary your
    FiftyOne dataset contains multiple label fields.

  .. group-tab:: CLI

    .. code-block:: shell

        # The name of the FiftyOne dataset to export
        NAME="your-dataset"

        # The directory to which to write the exported dataset
        EXPORT_DIR=/path/for/export

        # The name of the sample field containing the label that you wish to export
        # Used when exporting labeled datasets (e.g., classification or detection)
        LABEL_FIELD=ground_truth  # for example

        # The type of dataset to export
        # Any subclass of `fiftyone.types.BaseDataset` is supported
        TYPE=fiftyone.types.COCODetectionDataset  # for example

        # Export the dataset!
        fiftyone datasets export $NAME --export-dir $EXPORT_DIR --label-field $LABEL_FIELD --type $TYPE

    Note the `LABEL_FIELD` argument in the above example, which specifies the
    particular label field that you wish to export. This is necessary your
    FiftyOne dataset contains multiple label fields.

Supported formats
-----------------

Each supported dataset type is represented by a subclass of
:class:`fiftyone.types.BaseDataset <fiftyone.types.dataset_types.BaseDataset>`,
which is used by the Python library and CLI to refer to the corresponding
dataset format when writing the dataset to disk.

+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| Dataset Type                                                     | Description                                                                        |
+==================================================================+====================================================================================+
| :class:`ImageDirectory \                                         | A directory of images.                                                             |
| <fiftyone.types.dataset_types.ImageDirectory>`                   |                                                                                    |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`ImageClassificationDataset \                             | A labeled dataset consisting of images and their associated classification labels  |
| <fiftyone.types.dataset_types.ImageClassificationDataset>`       | in a simple JSON format.                                                           |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`ImageClassificationDirectoryTree \                       | A directory tree whose subfolders define an image classification dataset.          |
| <fiftyone.types.dataset_types.ImageClassificationDirectoryTree>` |                                                                                    |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`TFImageClassificationDataset \                           | A labeled dataset consisting of images and their associated classification labels  |
| <fiftyone.types.dataset_types.TFImageClassificationDataset>`     | stored as TFRecords.                                                               |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`ImageDetectionDataset \                                  | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.ImageDetectionDataset>`            | stored in a simple JSON format.                                                    |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`COCODetectionDataset \                                   | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.COCODetectionDataset>`             | saved in `COCO format <http://cocodataset.org/#home>`_.                            |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`VOCDetectionDataset \                                    | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.VOCDetectionDataset>`              | saved in `VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.                   |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`KITTIDetectionDataset \                                  | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.KITTIDetectionDataset>`            | saved in `KITTI format <http://www.cvlibs.net/datasets/kitti/eval\_object.php>`_.  |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`TFObjectDetectionDataset \                               | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.TFObjectDetectionDataset>`         | stored as TFRecords in `TF Object Detection API format \                           |
|                                                                  | <https://github.com/tensorflow/models/blob/master/research/object\_detection>`_.   |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`CVATImageDataset \                                       | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.CVATImageDataset>`                 | stored in `CVAT image format <https://github.com/opencv/cvat>`_.                   |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`ImageLabelsDataset \                                     | A labeled dataset consisting of images and their associated multitask predictions  |
| <fiftyone.types.dataset_types.ImageLabelsDataset>`               | stored in `eta.core.image.ImageLabels format \                                     |
|                                                                  | <https://voxel51.com/docs/api/#types-imagelabels>`_.                               |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`BDDDataset \                                             | A labeled dataset consisting of images and their associated multitask predictions  |
| <fiftyone.types.dataset_types.BDDDataset>`                       | saved in `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.       |
+------------------------------------------------------------------+------------------------------------------------------------------------------------+

Image directories
-----------------

The :class:`fiftyone.types.ImageDirectory <fiftyone.types.dataset_types.ImageDirectory>`
type represents a directory of images.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>

You can export the images in a FiftyOne dataset as a directory of images on
disk as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/images-dir"

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(export_dir, dataset_type=fo.types.ImageDirectory)

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/to/images-dir

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.ImageDirectory

Image classification datasets
-----------------------------

The :class:`fiftyone.types.ImageClassificationDataset <fiftyone.types.dataset_types.ImageClassificationDataset>`
type represents a labeled dataset consisting of images and their associated
classification labels stored in a simple JSON format.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.json

where `labels.json` is a JSON file in the following format:

.. code-block:: json

    {
        "classes": [
            "<labelA>",
            "<labelB>",
        ],
        "labels": {
            "<uuid1>": "<target1>",
            "<uuid2>": "<target2>",
        }
    }

If the `classes` field is provided, the `target` values are class IDs that are
mapped to class label strings via `classes[target]`. If no `classes` field is
provided, then the `target` values directly store the label strings.

You can export a FiftyOne dataset as an image classification dataset stored on
disk in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-classification-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.ImageClassificationDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/image-classification-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.ImageClassificationDataset

Image classification directory tree
-----------------------------------

The :class:`fiftyone.types.ImageClassificationDirectoryTree <fiftyone.types.dataset_types.ImageClassificationDirectoryTree>`
type represents a directory tree whose subfolders define an image
classification dataset.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        <classA>/
            <image1>.<ext>
            <image2>.<ext>
            ...
        <classB>/
            <image1>.<ext>
            <image2>.<ext>
            ...

You can export a FiftyOne dataset as an image classification directory tree
stored on disk in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-classification-dir-tree"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/image-classification-dir-tree
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.ImageClassificationDirectoryTree

TF image classification dataset
-------------------------------

The :class:`fiftyone.types.TFImageClassificationDataset <fiftyone.types.dataset_types.TFImageClassificationDataset>`
type represents a labeled dataset consisting of images and their associated
classification labels stored as
`TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        tf.records-?????-of-?????

where the features of the (possibly sharded) TFRecords are stored in the
following format:

.. code-block:: python

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

You can export a FiftyOne dataset as a directory of TFRecords in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/tf-image-classification-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.TFImageClassificationDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/tf-image-classification-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.TFImageClassificationDataset

Image detection dataset
-----------------------

The :class:`fiftyone.types.ImageDetectionDataset <fiftyone.types.dataset_types.ImageDetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections stored in a simple JSON format.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.json

where `labels.json` is a JSON file in the following format:

.. code-block:: text

    {
        "classes": [
            <labelA>,
            <labelB>,
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
`[0, 1] x [0, 1]`.

If the `classes` field is provided, the `target` values are class IDs that are
mapped to class label strings via `classes[target]`. If no `classes` field is
provided, then the `target` values directly store the label strings.

You can export a FiftyOne dataset as an image detection dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-detection-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.ImageDetectionDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/image-detection-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.ImageDetectionDataset

COCO detection dataset
----------------------

The :class:`fiftyone.types.COCODetectionDataset <fiftyone.types.dataset_types.COCODetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in `COCO format <http://cocodataset.org/#home>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename0>
            <filename1>
            ...
        labels.json

where `labels.json` is a JSON file in the following format:

.. code-block:: json

    {
        "info": {
            "year": "",
            "version": "",
            "description": "Exported from FiftyOne",
            "contributor": "",
            "url": "https://voxel51.com/fiftyone",
            "date_created": "2020-06-19T09:48:27"
        },
        "licenses": [],
        "categories": [
            {
                "id": 2,
                "name": "cat",
                "supercategory": "none"
            },
        ],
        "images": [
            {
                "id": 0,
                "license": null,
                "file_name": "<filename0>",
                "height": 480,
                "width": 640,
                "date_captured": null
            },
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
        ]
    }

You can export a FiftyOne dataset as a COCO detection dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-detection-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.COCODetectionDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/coco-detection-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.COCODetectionDataset

VOC detection dataset
---------------------

The :class:`fiftyone.types.VOCDetectionDataset <fiftyone.types.dataset_types.VOCDetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in
`VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels/
            <uuid1>.xml
            <uuid2>.xml

where the labels XML files are in the following format:

.. code-block:: xml

    <annotation>
        <folder>data</folder>
        <filename>image.ext</filename>
        <path>/path/to/dataset-dir/data/image.ext</path>
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
            <truncated>0</truncated>
            <difficult>0</difficult>
            <occluded>0</occluded>
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
            <truncated>1</truncated>
            <difficult>1</difficult>
            <occluded>1</occluded>
            <bndbox>
                <xmin>128</xmin>
                <ymin>100</ymin>
                <xmax>350</xmax>
                <ymax>300</ymax>
            </bndbox>
        </object>
        ...
    </annotation>

Samples with no values for certain attributes (like `pose` in the above
example) are left empty.

You can export a FiftyOne dataset as a VOC detection dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/voc-detection-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.VOCDetectionDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/voc-detection-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.VOCDetectionDataset

KITTI detection dataset
-----------------------

The :class:`fiftyone.types.KITTIDetectionDataset <fiftyone.types.dataset_types.KITTIDetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in
`KITTI format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels/
            <uuid1>.txt
            <uuid2>.txt

where the labels TXT files are space-delimited files where each row corresponds
to an object and the 15 (and optional 16th score) columns have the following
meanings:

+----------+-------------+-------------------------------------------------------------+---------+
| Number   | Name        | Description                                                 | Default |
| of       |             |                                                             |         |
| columns  |             |                                                             |         |
+==========+=============+=============================================================+=========+
| 1        | type        | The object label                                            |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | truncated   | A float in ``[0, 1]``, where 0 is non-truncated and         | 0       |
|          |             | 1 is fully truncated. Here, truncation refers to the object |         |
|          |             | leaving image boundaries                                    |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | occluded    | An int in ``(0, 1, 2, 3)`` indicating occlusion state,      | 0       |
|          |             | where:- 0 = fully visible- 1 = partly occluded- 2 =         |         |
|          |             | largely occluded- 3 = unknown                               |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | alpha       | Observation angle of the object, in ``[-pi, pi]``           | 0       |
+----------+-------------+-------------------------------------------------------------+---------+
| 4        | bbox        | 2D bounding box of object in the image in pixels, in the    |         |
|          |             | format ``[xtl, ytl, xbr, ybr]``                             |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | dimensions  | 3D object dimensions, in meters, in the format              | 0       |
|          |             | ``[height, width, length]``                                 |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | location    | 3D object location ``(x, y, z)`` in camera coordinates      | 0       |
|          |             | (in meters)                                                 |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | rotation\_y | Rotation around the y-axis in camera coordinates, in        | 0       |
|          |             | ``[-pi, pi]``                                               |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | score       | ``(optional)`` A float confidence for the detection         |         |
+----------+-------------+-------------------------------------------------------------+---------+

The `default` column above indicates the default value that will be used when
writing datasets in this type whose samples do not contain the necessary
field(s).

You can export a FiftyOne dataset as a KITTI detection dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/kitti-detection-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.KITTIDetectionDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/kitti-detection-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.KITTIDetectionDataset

CVAT image dataset
------------------

The :class:`fiftyone.types.CVATImageDataset <fiftyone.types.dataset_types.CVATImageDataset>`
type represents a labeled dataset consisting of images and their associated
object detections stored in
`CVAT image format <https://github.com/opencv/cvat>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.xml

where `labels.xml` is an XML file in the following format:

.. code-block:: xml

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

You can export a FiftyOne dataset as a CVAT image dataset in the above format
as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/cvat-image-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.CVATImageDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/cvat-image-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.CVATImageDataset

Multitask image labels dataset
------------------------------

The :class:`fiftyone.types.ImageLabelsDataset <fiftyone.types.dataset_types.ImageLabelsDataset>`
type represents a labeled dataset consisting of images and their associated
multitask predictions stored in
`eta.core.image.ImageLabels format <https://voxel51.com/docs/api/#types-imagelabels>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

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

where `manifest.json` is a JSON file in the following format:

.. code-block:: json

    {
        "type": "eta.core.datasets.LabeledImageDataset",
        "description": "",
        "index": [
            {
                "data": "data/<uuid1>.<ext>",
                "labels": "labels/<uuid1>.json"
            },
            {
                "data": "data/<uuid2>.<ext>",
                "labels": "labels/<uuid2>.json"
            },
        ]
    }

and where each labels JSON file is stored in
`eta.core.image.ImageLabels format <https://voxel51.com/docs/api/#types-imagelabels>`_.

You can export a FiftyOne dataset as an image labels dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-labels-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir,
            label_field=label_field,
            dataset_type=fo.types.ImageLabelsDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/image-labels-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.ImageLabelsDataset

BDD dataset
-----------

The :class:`fiftyone.types.BDDDataset <fiftyone.types.dataset_types.BDDDataset>`
type represents a labeled dataset consisting of images and their associated
multitask predictions saved in
`Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename0>
            <filename1>
            ...
        labels.json

where `labels.json` is a JSON file in the following format:

.. code-block:: json

    [
        {
            "attributes": {
                "scene": "city street",
                "timeofday": "daytime",
                "weather": "overcast"
            },
            "labels": [
                {
                    "attributes": {
                        "occluded": false,
                        "trafficLightColor": "none",
                        "truncated": false
                    },
                    "box2d": {
                        "x1": 1000.698742,
                        "x2": 1040.626872,
                        "y1": 281.992415,
                        "y2": 326.91156
                    },
                    "category": "traffic sign",
                    "id": 0,
                    "manualAttributes": true,
                    "manualShape": true
                },
            ],
            "name": "<filename0>",
        },
    ]

You can export a FiftyOne dataset as a BDD dataset in the above format as
follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/bdd-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir, label_field=label_field, dataset_type=fo.types.BDDDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/bdd-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.BDDDataset
