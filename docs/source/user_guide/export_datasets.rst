Exporting FiftyOne Datasets
===========================

.. default-role:: code

FiftyOne provides native support for exporting datasets to disk in a
variety of :ref:`common formats <supported-export-formats>`, and it can be
easily extended to export datasets in
:ref:`custom formats <custom-dataset-exporter>`.

Basic recipe
------------

The interface for exporting a FiftyOne |Dataset| is conveniently exposed via
the Python library and the CLI. You can easily export entire datasets as well
as arbitrary subsets of your datasets that you have identified by constructing
a |DatasetView| into any format of your choice via the basic recipe below.

.. tabs::

  .. group-tab:: Python

    You can export a |Dataset| or |DatasetView| via their
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    method:

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
        # Any subclass of `fiftyone.types.Dataset` is supported
        dataset_type = fo.types.COCODetectionDataset  # for example

        # Export the dataset!
        dataset_or_view.export(
            export_dir=export_dir, dataset_type=dataset_type, label_field=label_field
        )

    Note the `label_field` argument in the above example, which specifies the
    particular label field that you wish to export. This is necessary your
    FiftyOne dataset contains multiple label fields.

  .. group-tab:: CLI

    You can export a FiftyOne dataset :doc:`via the CLI </cli/index>`:

    .. code-block:: shell

        # The name of the FiftyOne dataset to export
        NAME="your-dataset"

        # The directory to which to write the exported dataset
        EXPORT_DIR=/path/for/export

        # The name of the sample field containing the label that you wish to export
        # Used when exporting labeled datasets (e.g., classification or detection)
        LABEL_FIELD=ground_truth  # for example

        # The type of dataset to export
        # Any subclass of `fiftyone.types.Dataset` is supported
        TYPE=fiftyone.types.COCODetectionDataset  # for example

        # Export the dataset!
        fiftyone datasets export $NAME --export-dir $EXPORT_DIR --label-field $LABEL_FIELD --type $TYPE

    Note the `LABEL_FIELD` argument in the above example, which specifies the
    particular label field that you wish to export. This is necessary your
    FiftyOne dataset contains multiple label fields.

.. _supported-export-formats:

Supported formats
-----------------

Each supported dataset type is represented by a subclass of
:class:`fiftyone.types.Dataset <fiftyone.types.dataset_types.Dataset>`, which
is used by the Python library and CLI to refer to the corresponding dataset
format when writing the dataset to disk.

.. table::
    :widths: 40 60

    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | Dataset Type                                                       | Description                                                                        |
    +====================================================================+====================================================================================+
    | :ref:`ImageDirectory <ImageDirectory-export>`                      | A directory of images.                                                             |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageClassificationDataset                           | A labeled dataset consisting of images and their associated classification labels  |
    | <FiftyOneImageClassificationDataset-export>`                       | in a simple JSON format.                                                           |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`ImageClassificationDirectoryTree                             | A directory tree whose subfolders define an image classification dataset.          |
    | <ImageClassificationDirectoryTree-export>`                         |                                                                                    |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFImageClassificationDataset                                 | A labeled dataset consisting of images and their associated classification labels  |
    | <TFImageClassificationDataset-export>`                             | stored as TFRecords.                                                               |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageDetectionDataset                                | A labeled dataset consisting of images and their associated object detections      |
    | <FiftyOneImageDetectionDataset-export>`                            | stored in a simple JSON format.                                                    |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`COCODetectionDataset                                         | A labeled dataset consisting of images and their associated object detections      |
    | <COCODetectionDataset-export>`                                     | saved in `COCO format <http://cocodataset.org/#home>`_.                            |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`VOCDetectionDataset                                          | A labeled dataset consisting of images and their associated object detections      |
    | <VOCDetectionDataset-export>`                                      | saved in `VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.                   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`KITTIDetectionDataset <KITTIDetectionDataset-export>`        | A labeled dataset consisting of images and their associated object detections      |
    |                                                                    | saved in `KITTI format <http://www.cvlibs.net/datasets/kitti/eval\_object.php>`_.  |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFObjectDetectionDataset <TFObjectDetectionDataset-export>`  | A labeled dataset consisting of images and their associated object detections      |
    |                                                                    | stored as TFRecords in `TF Object Detection API format \                           |
    |                                                                    | <https://github.com/tensorflow/models/blob/master/research/object\_detection>`_.   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CVATImageDataset <CVATImageDataset-export>`                  | A labeled dataset consisting of images and their associated object detections      |
    |                                                                    | stored in `CVAT image format <https://github.com/opencv/cvat>`_.                   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageLabelsDataset                                   | A labeled dataset consisting of images and their associated multitask predictions  |
    | <FiftyOneImageLabelsDataset-export>`                               | stored in `ETA ImageLabels format \                                                |
    |                                                                    | <https://voxel51.com/docs/api/#types-imagelabels>`_.                               |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`BDDDataset <BDDDataset-export>`                              | A labeled dataset consisting of images and their associated multitask predictions  |
    |                                                                    | saved in `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.       |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneDataset <FiftyOneDataset-export>`                    | A dataset consisting of an arbitrary serialized |WhatIsAFiftyOneDataset| and its   |
    |                                                                    | associated source data.                                                            |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`Custom formats <custom-dataset-exporter>`                    | Export datasets in custom formats by defining your own |DatasetType| or            |
    |                                                                    | |DatasetExporter| class.                                                           |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+

.. _ImageDirectory-export:

ImageDirectory
--------------

The :class:`fiftyone.types.ImageDirectory <fiftyone.types.dataset_types.ImageDirectory>`
type represents a directory of images.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>
        ...

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
        dataset_or_view.export(
            export_dir=export_dir, dataset_type=fo.types.ImageDirectory
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/to/images-dir

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.ImageDirectory

.. _FiftyOneImageClassificationDataset-export:

FiftyOneImageClassificationDataset
----------------------------------

The :class:`fiftyone.types.FiftyOneImageClassificationDataset <fiftyone.types.dataset_types.FiftyOneImageClassificationDataset>`
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

.. code-block:: text

    {
        "classes": [
            "<labelA>",
            "<labelB>",
            ...
        ],
        "labels": {
            "<uuid1>": "<target1>",
            "<uuid2>": "<target2>",
            ...
        }
    }

If the `classes` field is provided, the `target` values are class IDs that are
mapped to class label strings via `classes[target]`. If no `classes` field is
provided, then the `target` values directly store the label strings.

The target value in `labels` for unlabeled images is `None`.

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
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            label_field=label_field,
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
            --type fiftyone.types.FiftyOneImageClassificationDataset

.. _ImageClassificationDirectoryTree-export:

ImageClassificationDirectoryTree
--------------------------------

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
        ...

Unlabeled images are stored in a subdirectory named `_unlabeled`.

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
            export_dir=export_dir,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
            label_field=label_field,
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

.. _TFImageClassificationDataset-export:

TFImageClassificationDataset
----------------------------

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
        # The image extension
        "format": tf.io.FixedLenFeature([], tf.string),
        # Encoded image bytes
        "image_bytes": tf.io.FixedLenFeature([], tf.string),
        # Class label string
        "label": tf.io.FixedLenFeature([], tf.string, default_value=""),
    }

For unlabeled samples, the TFRecords do not contain `label` features.

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
            export_dir=export_dir,
            dataset_type=fo.types.TFImageClassificationDataset,
            label_field=label_field,
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

.. _FiftyOneImageDetectionDataset-export:

FiftyOneImageDetectionDataset
-----------------------------

The :class:`fiftyone.types.FiftyOneImageDetectionDataset <fiftyone.types.dataset_types.FiftyOneImageDetectionDataset>`
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
                    "attributes": {
                        <optional-name>: <optional-value>,
                        ...
                    }
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

The target value in `labels` for unlabeled images is `None`.

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
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            label_field=label_field,
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
            --type fiftyone.types.FiftyOneImageDetectionDataset

.. _COCODetectionDataset-export:

COCODetectionDataset
--------------------

The :class:`fiftyone.types.COCODetectionDataset <fiftyone.types.dataset_types.COCODetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in `COCO format <http://cocodataset.org/#home>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename0>.<ext>
            <filename1>.<ext>
            ...
        labels.json

where `labels.json` is a JSON file in the following format:

.. code-block:: text

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
            ...
            {
                "id": 2,
                "name": "cat",
                "supercategory": "animal"
            },
            ...
        ],
        "images": [
            {
                "id": 0,
                "license": null,
                "file_name": "<filename0>.<ext>",
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

For unlabeled datasets, `labels.json` does not contain an `annotations` field.

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
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_field=label_field,
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

.. _VOCDetectionDataset-export:

VOCDetectionDataset
-------------------

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
            ...

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

Unlabeled images have no corresponding file in `labels/`.

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
            export_dir=export_dir,
            dataset_type=fo.types.VOCDetectionDataset,
            label_field=label_field,
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

.. _KITTIDetectionDataset-export:

KITTIDetectionDataset
---------------------

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
            ...

where the labels TXT files are space-delimited files where each row corresponds
to an object and the 15 (and optional 16th score) columns have the following
meanings:

+----------+-------------+-------------------------------------------------------------+---------+
| \# of    | Name        | Description                                                 | Default |
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

Unlabeled images have no corresponding file in `labels/`.

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
            export_dir=export_dir,
            dataset_type=fo.types.KITTIDetectionDataset,
            label_field=label_field,
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

.. _TFObjectDetectionDataset-export:

TFObjectDetectionDataset
------------------------

The :class:`fiftyone.types.TFObjectDetectionDataset <fiftyone.types.dataset_types.TFObjectDetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections stored as
`TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_ in
`TF Object Detection API format <https://github.com/tensorflow/models/blob/master/research/object_detection>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        tf.records-?????-of-?????

where the features of the (possibly sharded) TFRecords are stored in the
following format:

.. code-block:: python

    {
        # Image dimensions
        "image/height": tf.io.FixedLenFeature([], tf.int64),
        "image/width": tf.io.FixedLenFeature([], tf.int64),
        # Image filename is used for both of these when writing
        "image/filename": tf.io.FixedLenFeature([], tf.string),
        "image/source_id": tf.io.FixedLenFeature([], tf.string),
        # Encoded image bytes
        "image/encoded": tf.io.FixedLenFeature([], tf.string),
        # Image format, either `jpeg` or `png`
        "image/format": tf.io.FixedLenFeature([], tf.string),
        # Normalized bounding box coordinates in `[0, 1]`
        "image/object/bbox/xmin": tf.io.FixedLenSequenceFeature(
            [], tf.float32, allow_missing=True
        ),
        "image/object/bbox/xmax": tf.io.FixedLenSequenceFeature(
            [], tf.float32, allow_missing=True
        ),
        "image/object/bbox/ymin": tf.io.FixedLenSequenceFeature(
            [], tf.float32, allow_missing=True
        ),
        "image/object/bbox/ymax": tf.io.FixedLenSequenceFeature(
            [], tf.float32, allow_missing=True
        ),
        # Class label string
        "image/object/class/text": tf.io.FixedLenSequenceFeature(
            [], tf.string, allow_missing=True
        ),
        # Integer class ID
        "image/object/class/label": tf.io.FixedLenSequenceFeature(
            [], tf.int64, allow_missing=True
        ),
    }

The TFRecords for unlabeled samples do not contain `image/object/*` features.

You can export a FiftyOne dataset as a directory of TFRecords in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/tf-object-detection-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.TFObjectDetectionDataset,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/tf-object-detection-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.TFObjectDetectionDataset

.. _CVATImageDataset-export:

CVATImageDataset
----------------

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
                                <values>coupe\nsedan\ntruck</values>
                            </attribute>
                            ...
                        </attributes>
                    </label>
                    <label>
                        <name>person</name>
                        <attributes>
                            <attribute>
                                <name>gender</name>
                                <values>male\nfemale</values>
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

Unlabeled images have no corresponding `image` tag in `labels.xml`.

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
            export_dir=export_dir,
            dataset_type=fo.types.CVATImageDataset,
            label_field=label_field,
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

.. _FiftyOneImageLabelsDataset-export:

FiftyOneImageLabelsDataset
--------------------------

The :class:`fiftyone.types.FiftyOneImageLabelsDataset <fiftyone.types.dataset_types.FiftyOneImageLabelsDataset>`
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

.. code-block:: text

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
            ...
        ]
    }

and where each labels JSON file is stored in
`eta.core.image.ImageLabels format <https://voxel51.com/docs/api/#types-imagelabels>`_.

For unlabeled images, an empty `eta.core.image.ImageLabels` file is stored.

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
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageLabelsDataset,
            label_field=label_field,
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
            --type fiftyone.types.FiftyOneImageLabelsDataset

.. _BDDDataset-export:

BDDDataset
----------

The :class:`fiftyone.types.BDDDataset <fiftyone.types.dataset_types.BDDDataset>`
type represents a labeled dataset consisting of images and their associated
multitask predictions saved in
`Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename0>.<ext>
            <filename1>.<ext>
            ...
        labels.json

where `labels.json` is a JSON file in the following format:

.. code-block:: text

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
                ...
            ],
            "name": "<filename0>.<ext>",
        },
        ...
    ]

Unlabeled images have no corresponding entry in `labels.json`.

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
            export_dir=export_dir,
            dataset_type=fo.types.BDDDataset,
            label_field=label_field,
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

.. _FiftyOneDataset-export:

FiftyOneDataset
---------------

The :class:`fiftyone.types.FiftyOneDataset <fiftyone.types.dataset_types.FiftyOneDataset>`
provides a disk representation of a |Dataset|, including its |Sample| instances
stored in a serialized JSON format, and the associated source data.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename1>.<ext>
            <filename2>.<ext>
            ...
        metadata.json
        samples.json

where `metadata.json` is an optional JSON file containing metadata associated
with the dataset, and `samples.json` is a JSON file containing a serialized
representation of the samples in the dataset generated by
:meth:`Sample.to_dict() <fiftyone.core.sample.Sample.to_dict>`.

You can export a FiftyOne dataset to disk in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/fiftyone-dataset"
        label_field = "ground_truth"  # for example

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/fiftyone-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneDataset

.. _custom-dataset-exporter:

Custom formats
--------------

The :meth:`export() <fiftyone.core.collections.SampleCollection.export>` method
provides an optional `dataset_exporter` keyword argument that can be used to
export a dataset using any |DatasetExporter| instance.

This means that you can define your own |DatasetExporter| class and then export
a |Dataset| or |DatasetView| in your custom format using the following recipe:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    export_dir = "/path/for/custom-dataset"
    label_field = "ground_truth"  # for example

    # The Dataset or DatasetView to export
    dataset_or_view = fo.Dataset(...)

    # Create an instance of your custom dataset exporter
    exporter = CustomDatasetExporter(export_dir, ...)

    # Export the dataset
    dataset_or_view.export(
        dataset_exporter=exporter, label_field=label_field,
    )

You can also define a custom |DatasetType| type, which enables you to export
datasets in your custom format using the following recipe:

.. tabs::

  .. group-tab:: Python

    Export your |Dataset| or |DatasetView| in your custom format by passing
    your |DatasetType| to the `dataset_type` argument of
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`:

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/custom-dataset"
        label_field = "ground_truth"  # for example

        # The `fiftyone.types.Dataset` subclass for your custom dataset
        dataset_type = CustomDataset

        # The Dataset or DatasetView to export
        dataset_or_view = fo.Dataset(...)

        # Export the dataset!
        dataset_or_view.export(
            export_dir=export_dir, dataset_type=dataset_type, label_field=label_field,
        )

  .. group-tab:: CLI

    Export your |Dataset| in your custom format by passing your |DatasetType|
    in the `--type` flag of the `fiftyone datasets export` method of the CLI:

    .. code-block:: shell

        NAME=custom-dataset
        EXPORT_DIR=/path/for/custom-dataset
        LABEL_FIELD=ground_truth  # for example

        # The `fiftyone.types.Dataset` subclass for your custom dataset
        DATASET_TYPE = CustomDataset

        # Export the dataset!
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type $DATASET_TYPE

.. _writing-a-custom-dataset-exporter:

Writing a custom DatasetExporter
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

|DatasetExporter| is an abstract interface; the concrete interface that you
should implement is determined by the type of dataset that you are exporting.

.. tabs::

  .. group-tab:: Unlabeled image datasets

        To define a custom exporter for unlabeled image datasets, implement the
        |UnlabeledImageDatasetExporter| interface.

        The pseudocode below provides a template for a custom
        |UnlabeledImageDatasetExporter|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud


            class CustomUnlabeledImageDatasetExporter(foud.UnlabeledImageDatasetExporter):
                """Custom exporter for unlabeled image datasets.

                Args:
                    export_dir: the directory to write the export
                    *args: additional positional arguments for your exporter
                    **kwargs: additional keyword arguments for your exporter
                """

                def __init__(self, export_dir, *args, **kwargs):
                    super().__init__(export_dir)
                    # Your initialization here

                @property
                def requires_image_metadata(self):
                    """Whether this exporter requires
                    :class:`fiftyone.core.metadata.ImageMetadata` instances for each sample
                    being exported.
                    """
                    # Return True or False here
                    pass

                def setup(self):
                    """Performs any necessary setup before exporting the first sample in
                    the dataset.

                    This method is called when the exporter's context manager interface is
                    entered, :func:`DatasetExporter.__enter__`.
                    """
                    # Your custom setup here
                    pass

                def log_collection(self, sample_collection):
                    """Logs any relevant information about the
                    :class:`fiftyone.core.collections.SampleCollection` whose samples will
                    be exported.

                    Subclasses can optionally implement this method if their export format
                    can record information such as the
                    :meth:`fiftyone.core.collections.SampleCollection.name` and
                    :meth:`fiftyone.core.collections.SampleCollection.info` of the
                    collection being exported.

                    By convention, this method must be optional; i.e., if it is not called
                    before the first call to :meth:`export_sample`, then the exporter must
                    make do without any information about the
                    :class:`fiftyone.core.collections.SampleCollection` (which may not be
                    available, for example, if the samples being exported are not stored in
                    a collection).

                    Args:
                        sample_collection: the
                            :class:`fiftyone.core.collections.SampleCollection` whose
                            samples will be exported
                    """
                    # Log any information from the sample collection here
                    pass

                def export_sample(self, image_or_path, metadata=None):
                    """Exports the given sample to the dataset.

                    Args:
                        image_or_path: an image or the path to the image on disk
                        metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                            isinstance for the sample. Only required when
                            :meth:`requires_image_metadata` is ``True``
                    """
                    # Export the provided sample
                    pass

                def close(self, *args):
                    """Performs any necessary actions after the last sample has been
                    exported.

                    This method is called when the importer's context manager interface is
                    exited, :func:`DatasetExporter.__exit__`.

                    Args:
                        *args: the arguments to :func:`DatasetExporter.__exit__`
                    """
                    # Your custom code here to complete the export
                    pass

        When
        :meth:`export() <fiftyone.core.collections.SampleCollection.export>` is
        called with a custom |UnlabeledImageDatasetExporter|, the export is
        effectively performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            samples = ...  # a SampleCollection (e.g., Dataset or DatasetView)

            exporter = CustomUnlabeledImageDatasetExporter(dataset_dir, ...)
            with exporter:
                exporter.log_collection(samples)
                for sample in samples:
                    image_path = sample.filepath
                    metadata = sample.metadata
                    if exporter.requires_image_metadata and metadata is None:
                        metadata = fo.ImageMetadata.build_for(image_path)

                    exporter.export_sample(image_path, metadata=metadata)

        Note that the exporter is invoked via its context manager interface,
        which automatically calls the
        :meth:`setup() <fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter.setup>`
        and
        :meth:`close() <fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter.close>`
        methods of the exporter to handle setup/completion of the export.

        The
        :meth:`log_collection() <fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter.log_collection>`
        method is called after the exporter's context manager has been entered
        but before any samples have been exported. This method can optionally
        be implemented by exporters that store information such as the
        :meth:`name <fiftyone.core.collections.SampleCollection.name>` or
        :meth:`info <fiftyone.core.collections.SampleCollection.info>` from the
        collection being exported.

        The image in each |Sample| is exported via the
        :meth:`export_sample() <fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter.export_sample>`
        method.

        The
        :meth:`requires_image_metadata <fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter.requires_image_metadata>`
        property of the exporter allows it to declare whether it requires
        |ImageMetadata| instances for each image to be provided when
        :meth:`export_sample() <fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter.export_sample>`
        is called. This allows for cases where metadata about of the image
        (e.g., its filename, encoding, shape, etc) are required in order to export the
        sample.

  .. group-tab:: Labeled image datasets

        To define a custom exporter for labeled image datasets, implement the
        |LabeledImageDatasetExporter| interface.

        The pseudocode below provides a template for a custom
        |LabeledImageDatasetExporter|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud


            class CustomLabeledImageDatasetExporter(foud.LabeledImageDatasetExporter):
                """Custom exporter for labeled image datasets.

                Args:
                    export_dir: the directory to write the export
                    *args: additional positional arguments for your exporter
                    **kwargs: additional keyword arguments for your exporter
                """

                def __init__(self, export_dir, *args, **kwargs):
                    super().__init__(export_dir)
                    # Your initialization here

                @property
                def requires_image_metadata(self):
                    """Whether this exporter requires
                    :class:`fiftyone.core.metadata.ImageMetadata` instances for each sample
                    being exported.
                    """
                    # Return True or False here
                    pass

                @property
                def label_cls(self):
                    """The :class:`fiftyone.core.labels.Label` class exported by this
                    exporter.
                    """
                    # Return a Label subclass here
                    pass

                def setup(self):
                    """Performs any necessary setup before exporting the first sample in
                    the dataset.

                    This method is called when the exporter's context manager interface is
                    entered, :func:`DatasetExporter.__enter__`.
                    """
                    # Your custom setup here
                    pass

                def log_collection(self, sample_collection):
                    """Logs any relevant information about the
                    :class:`fiftyone.core.collections.SampleCollection` whose samples will
                    be exported.

                    Subclasses can optionally implement this method if their export format
                    can record information such as the
                    :meth:`fiftyone.core.collections.SampleCollection.name` and
                    :meth:`fiftyone.core.collections.SampleCollection.info` of the
                    collection being exported.

                    By convention, this method must be optional; i.e., if it is not called
                    before the first call to :meth:`export_sample`, then the exporter must
                    make do without any information about the
                    :class:`fiftyone.core.collections.SampleCollection` (which may not be
                    available, for example, if the samples being exported are not stored in
                    a collection).

                    Args:
                        sample_collection: the
                            :class:`fiftyone.core.collections.SampleCollection` whose
                            samples will be exported
                    """
                    # Log any information from the sample collection here
                    pass

                def export_sample(self, image_or_path, label, metadata=None):
                    """Exports the given sample to the dataset.

                    Args:
                        image_or_path: an image or the path to the image on disk
                        label: an instance of :meth:`label_cls`, or a dictionary mapping
                            field names to :class:`fiftyone.core.labels.Label` instances,
                            or ``None`` if the sample is unlabeled
                        metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                            instance for the sample. Only required when
                            :meth:`requires_image_metadata` is ``True``
                    """
                    # Export the provided sample
                    pass

                def close(self, *args):
                    """Performs any necessary actions after the last sample has been
                    exported.

                    This method is called when the importer's context manager interface is
                    exited, :func:`DatasetExporter.__exit__`.

                    Args:
                        *args: the arguments to :func:`DatasetExporter.__exit__`
                    """
                    # Your custom code here to complete the export
                    pass

        When
        :meth:`export() <fiftyone.core.collections.SampleCollection.export>` is
        called with a custom |LabeledImageDatasetExporter|, the export is
        effectively performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            samples = ...  # a SampleCollection (e.g., Dataset or DatasetView)
            label_field = ...  # assumes single label field case

            exporter = CustomLabeledImageDatasetExporter(dataset_dir, ...)
            with exporter:
                exporter.log_collection(samples)
                for sample in samples:
                    image_path = sample.filepath
                    label = sample[label_field]
                    metadata = sample.metadata
                    if exporter.requires_image_metadata and metadata is None:
                        metadata = fo.ImageMetadata.build_for(image_path)

                    exporter.export_sample(image_path, label, metadata=metadata)

        Note that the exporter is invoked via its context manager interface,
        which automatically calls the
        :meth:`setup() <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.setup>`
        and
        :meth:`close() <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.close>`
        methods of the exporter to handle setup/completion of the export.

        The
        :meth:`log_collection() <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.log_collection>`
        method is called after the exporter's context manager has been entered
        but before any samples have been exported. This method can optionally
        be implemented by exporters that store information such as the
        :meth:`name <fiftyone.core.collections.SampleCollection.name>` or
        :meth:`info <fiftyone.core.collections.SampleCollection.info>` from the
        collection being exported.

        The image and corresponding |Label| in each |Sample| is exported via
        the
        :meth:`export_sample() <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.export_sample>`
        method.

        The
        :meth:`label_cls <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.label_cls>`
        property of the exporter declares the type of |Label| that the dataset
        format expects (e.g., |Classification| or |Detections|).

        The
        :meth:`requires_image_metadata <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.requires_image_metadata>`
        property of the exporter allows it to declare whether it requires
        |ImageMetadata| instances for each image to be provided when
        :meth:`export_sample() <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.export_sample>`
        is called. This allows for cases where metadata about of the image
        (e.g., its filename, encoding, shape, etc) are required in order to
        export the sample.

.. _writing-a-custom-dataset-type-exporter:

Writing a custom Dataset type
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

FiftyOne provides the |DatasetType| type system so that dataset formats can be
conveniently referenced by their type when reading/writing datasets on disk.

The primary function of the |DatasetType| subclasses is to define the
|DatasetImporter| that should be used to read instances of the dataset from
disk and the |DatasetExporter| that should be used to write instances of the
dataset to disk.

See :ref:`this page <writing-a-custom-dataset-importer>` for more information
about defining custom |DatasetImporter| classes.

Custom dataset types can be declared by implementing the |DatasetType| subclass
corresponding to the type of dataset that you are working with.

.. tabs::

  .. group-tab:: Unlabeled image datasets

        The pseudocode below provides a template for a custom
        |UnlabeledImageDatasetType| subclass:

        .. code-block:: python
            :linenos:

            import fiftyone.types as fot


            class CustomUnlabeledImageDataset(fot.UnlabeledImageDataset):
                """Custom unlabeled image dataset type."""

                def get_dataset_importer_cls(self):
                    """Returns the
                    :class:`fiftyone.utils.data.importers.UnlabeledImageDatasetImporter`
                    class for importing datasets of this type from disk.

                    Returns:
                        a :class:`fiftyone.utils.data.importers.UnlabeledImageDatasetImporter`
                        class
                    """
                    # Return your custom UnlabeledImageDatasetImporter class here
                    pass

                def get_dataset_exporter_cls(self):
                    """Returns the
                    :class:`fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter`
                    class for exporting datasets of this type to disk.

                    Returns:
                        a :class:`fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter`
                        class
                    """
                    # Return your custom UnlabeledImageDatasetExporter class here
                    pass

        Note that, as this type represents an unlabeled image dataset, its
        importer must be a subclass of |UnlabeledImageDatasetImporter|, and its
        exporter must be a subclass of |UnlabeledImageDatasetExporter|.

  .. group-tab:: Labeled image datasets

        The pseudocode below provides a template for a custom
        |LabeledImageDatasetType| subclass:

        .. code-block:: python
            :linenos:

            import fiftyone.types as fot


            class CustomLabeledImageDataset(fot.LabeledImageDataset):
                """Custom labeled image dataset type."""

                def get_dataset_importer_cls(self):
                    """Returns the
                    :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter`
                    class for importing datasets of this type from disk.

                    Returns:
                        a :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter`
                        class
                    """
                    # Return your custom LabeledImageDatasetImporter class here
                    pass

                def get_dataset_exporter_cls(self):
                    """Returns the
                    :class:`fiftyone.utils.data.exporters.LabeledImageDatasetExporter`
                    class for exporting datasets of this type to disk.

                    Returns:
                        a :class:`fiftyone.utils.data.exporters.LabeledImageDatasetExporter`
                        class
                    """
                    # Return your custom LabeledImageDatasetExporter class here
                    pass

        Note that, as this type represents a labeled image dataset, its
        importer must be a subclass of |LabeledImageDatasetImporter|, and its
        exporter must be a subclass of |LabeledImageDatasetExporter|.
