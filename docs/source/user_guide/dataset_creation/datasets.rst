Loading Datasets From Disk
==========================

.. default-role:: code

FiftyOne provides native support for importing datasets from disk in a
variety of :ref:`common formats <supported-import-formats>`, and it can be
easily extended to import datasets in
:ref:`custom formats <custom-dataset-importer>`.

If you have individual or in-memory samples that you would like to load into a
FiftyOne dataset, see :doc:`adding samples to datasets <samples>`.

Basic recipe
------------

The interface for creating a FiftyOne |Dataset| from your own dataset is
conveniently exposed via the Python library and the CLI. The basic recipe is
that you simply specify the path to the dataset on disk and the type of dataset
that you're loading.

.. tabs::

  .. group-tab:: Python

    You can export a |Dataset| from disk via the
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` factory
    method:

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        # A name for the dataset
        name = "my-coco-dataset"

        # The directory containing the dataset to import
        dataset_dir = "/path/to/dataset"

        # The type of the dataset being imported
        # Any subclass of `fiftyone.types.Dataset` is supported
        dataset_type = fo.types.COCODetectionDataset  # for example

        # Import the dataset!
        dataset = fo.Dataset.from_dir(dataset_dir, dataset_type, name=name)

  .. group-tab:: CLI

    You can import a dataset from disk into FiftyOne
    :doc:`via the CLI </cli/index>`:

    .. code-block:: shell

        # A name for the dataset
        NAME=my-coco-dataset

        # The directory containing the dataset to import
        DATASET_DIR=/path/to/dataset

        # The type of the dataset being imported
        # Any subclass of `fiftyone.types.Dataset` is supported
        TYPE=fiftyone.types.COCODetectionDataset  # for example

        # Import the dataset!
        fiftyone datasets create --name $NAME --dataset-dir $DATASET_DIR --type $TYPE

.. _supported-import-formats:

Supported formats
-----------------

Each supported dataset type is represented by a subclass of
:class:`fiftyone.types.Dataset <fiftyone.types.dataset_types.Dataset>`, which
is used by the Python library and CLI to refer to the corresponding dataset
format when reading the dataset from disk.

.. table::
    :widths: 40 60

    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | Dataset Type                                                                          | Description                                                                        |
    +=======================================================================================+====================================================================================+
    | :ref:`ImageDirectory <ImageDirectory-import>`                                         | A directory of images.                                                             |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageClassificationDataset <FiftyOneImageClassificationDataset-import>` | A labeled dataset consisting of images and their associated classification labels  |
    |                                                                                       | in a simple JSON format.                                                           |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`ImageClassificationDirectoryTree <ImageClassificationDirectoryTree-import>`     | A directory tree whose subfolders define an image classification dataset.          |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFImageClassificationDataset <TFImageClassificationDataset-import>`             | A labeled dataset consisting of images and their associated classification labels  |
    |                                                                                       | stored as TFRecords.                                                               |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageDetectionDataset <FiftyOneImageDetectionDataset-import>`           | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | stored in a simple JSON format.                                                    |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`COCODetectionDataset <COCODetectionDataset-import>`                             | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `COCO format <http://cocodataset.org/#home>`_.                            |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`VOCDetectionDataset <VOCDetectionDataset-import>`                               | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`KITTIDetectionDataset <KITTIDetectionDataset-import>`                           | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `KITTI format <http://www.cvlibs.net/datasets/kitti/eval\_object.php>`_.  |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFObjectDetectionDataset <TFObjectDetectionDataset-import>`                     | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | stored as TFRecords in `TF Object Detection API format \                           |
    |                                                                                       | <https://github.com/tensorflow/models/blob/master/research/object\_detection>`_.   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CVATImageDataset <CVATImageDataset-import>`                                     | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | stored in `CVAT image format <https://github.com/opencv/cvat>`_.                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageLabelsDataset <FiftyOneImageLabelsDataset-import>`                 | A labeled dataset consisting of images and their associated multitask predictions  |
    |                                                                                       | stored in `ETA ImageLabels format \                                                |
    |                                                                                       | <https://voxel51.com/docs/api/#types-imagelabels>`_.                               |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`BDDDataset <BDDDataset-import>`                                                 | A labeled dataset consisting of images and their associated multitask predictions  |
    |                                                                                       | saved in `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.       |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneDataset <FiftyOneDataset-import>`                                       | A dataset consisting of an arbitrary serialized |WhatIsAFiftyOneDataset| and its   |
    |                                                                                       | associated source data.                                                            |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`Custom formats <custom-dataset-importer>`                                       | Import datasets in custom formats by defining your own |DatasetType| or            |
    |                                                                                       | |DatasetImporter| class.                                                           |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+

.. _ImageDirectory-import:

ImageDirectory
--------------

The :class:`fiftyone.types.ImageDirectory <fiftyone.types.dataset_types.ImageDirectory>`
type represents a directory of images.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>

When reading datasets of this type, subfolders are recursively traversed, and
files with non-image MIME types are omitted.

You can create a FiftyOne dataset from a directory of images as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-images-dir"
        dataset_dir = "/path/to/images-dir"

        # Create the dataset
        dataset = fo.Dataset.from_dir(dataset_dir, fo.types.ImageDirectory, name=name)

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code:: shell

      NAME=my-images-dir
      DATASET_DIR=/path/to/images-dir

      # Create the dataset
      fiftyone datasets create \
          --name $NAME \
          --dataset-dir $DATASET_DIR \
          --type fiftyone.types.ImageDirectory

      # View summary info about the dataset
      fiftyone datasets info $NAME

      # Print the first few samples in the dataset
      fiftyone datasets head $NAME

    To view a directory of images in the FiftyOne App without creating
    a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/images-dir

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.ImageDirectory

.. _FiftyOneImageClassificationDataset-import:

FiftyOneImageClassificationDataset
----------------------------------

The :class:`fiftyone.types.FiftyOneImageClassificationDataset <fiftyone.types.dataset_types.FiftyOneImageClassificationDataset>`
type represents a labeled dataset consisting of images and their associated
classification labels stored in a simple JSON format.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.json

where ``labels.json`` is a JSON file in the following format:

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

You can create a FiftyOne dataset from an image classification dataset stored
in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-image-classification-dataset"
        dataset_dir = "/path/to/image-classification-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.FiftyOneImageClassificationDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-image-classification-dataset
        DATASET_DIR=/path/to/image-classification-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneImageClassificationDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view an image classification dataset in the FiftyOne App without
    creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/image-classification-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneImageClassificationDataset

.. _ImageClassificationDirectoryTree-import:

ImageClassificationDirectoryTree
--------------------------------

The :class:`fiftyone.types.ImageClassificationDirectoryTree <fiftyone.types.dataset_types.ImageClassificationDirectoryTree>`
type represents a directory tree whose subfolders define an image
classification dataset.

Datasets of this type are read in the following format:

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

You can create a FiftyOne dataset from an image classification directory tree
stored in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-image-classification-dir-tree"
        dataset_dir = "/path/to/image-classification-dir-tree"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.ImageClassificationDirectoryTree, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-image-classification-dir-tree
        DATASET_DIR=/path/to/image-classification-dir-tree

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.ImageClassificationDirectoryTree

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view an image classification directory tree in the FiftyOne App
    without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/image-classification-dir-tree

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.ImageClassificationDirectoryTree

.. _TFImageClassificationDataset-import:

TFImageClassificationDataset
----------------------------

The :class:`fiftyone.types.TFImageClassificationDataset <fiftyone.types.dataset_types.TFImageClassificationDataset>`
type represents a labeled dataset consisting of images and their associated
classification labels stored as
`TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_.

Datasets of this type are read in the following format:

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

You can create a FiftyOne dataset from an image classification dataset stored
as a directory of TFRecords in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-tf-image-classification-dataset"
        dataset_dir = "/path/to/tf-image-classification-dataset"
        images_dir = "/path/for/images"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir,
            fo.types.TFImageClassificationDataset,
            name=name,
            images_dir=images_dir,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

    When the above command is executed, the images in the TFRecords will be
    written to the provided `images_dir`, which is required because FiftyOne
    datasets must make their images available as invididual files on disk.

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-tf-image-classification-dataset
        DATASET_DIR=/path/to/tf-image-classification-dataset
        IMAGES_DIR=/path/for/images

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.TFImageClassificationDataset
            --images-dir $IMAGES_DIR

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    When the above command is executed, the images in the TFRecords will be
    written to the provided `IMAGES_DIR`, which is required because FiftyOne
    datasets must make their images available as invididual files on disk.

    To view an image classification dataset stored as a directory of TFRecords
    in the FiftyOne App without creating a persistent FiftyOne dataset,
    you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/tf-image-classification-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.TFImageClassificationDataset

.. _FiftyOneImageDetectionDataset-import:

FiftyOneImageDetectionDataset
-----------------------------

The :class:`fiftyone.types.FiftyOneImageDetectionDataset <fiftyone.types.dataset_types.FiftyOneImageDetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections stored in a simple JSON format.

Datasets of this type are read in the following format:

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

You can create a FiftyOne dataset from an image detection dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-image-detection-dataset"
        dataset_dir = "/path/to/image-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.FiftyOneImageDetectionDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-image-detection-dataset
        DATASET_DIR=/path/to/image-detection-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneImageDetectionDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view an image detection dataset stored in the above format in the
    FiftyOne App without creating a persistent FiftyOne dataset, you
    can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/image-detection-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneImageDetectionDataset

.. _COCODetectionDataset-import:

COCODetectionDataset
--------------------

The :class:`fiftyone.types.COCODetectionDataset <fiftyone.types.dataset_types.COCODetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in `COCO format <http://cocodataset.org/#home>`_.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename0>.<ext>
            <filename1>.<ext>
            ...
        labels.json

where ``labels.json`` is a JSON file in the following format:

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

You can create a FiftyOne dataset from a COCO detection dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-coco-detection-dataset"
        dataset_dir = "/path/to/coco-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.COCODetectionDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-coco-detection-dataset
        DATASET_DIR=/path/to/coco-detection-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.COCODetectionDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a COCO detection dataset stored in the above format in the FiftyOne
    App without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/coco-detection-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.COCODetectionDataset

.. _VOCDetectionDataset-import:

VOCDetectionDataset
-------------------

The :class:`fiftyone.types.VOCDetectionDataset <fiftyone.types.dataset_types.VOCDetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in
`VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.

Datasets of this type are read in the following format:

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

Unlabeled images have no corresponding file in `labels/`.

You can create a FiftyOne dataset from a VOC detection dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-voc-detection-dataset"
        dataset_dir = "/path/to/voc-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.VOCDetectionDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-voc-detection-dataset
        DATASET_DIR=/path/to/voc-detection-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.VOCDetectionDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a VOC detection dataset stored in the above format in the FiftyOne
    App without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/voc-detection-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.VOCDetectionDataset

.. _KITTIDetectionDataset-import:

KITTIDetectionDataset
---------------------

The :class:`fiftyone.types.KITTIDetectionDataset <fiftyone.types.dataset_types.KITTIDetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in
`KITTI format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.

Datasets of this type are read in the following format:

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

When reading datasets of this type, all columns after the four `bbox` columns
may be omitted.

Unlabeled images have no corresponding file in `labels/`.

You can create a FiftyOne dataset from a KITTI detection dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-kitti-detection-dataset"
        dataset_dir = "/path/to/kitti-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.KITTIDetectionDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-kitti-detection-dataset
        DATASET_DIR=/path/to/kitti-detection-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.KITTIDetectionDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a KITTI detection dataset stored in the above format in the
    FiftyOne App without creating a persistent FiftyOne dataset, you can
    execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/kitti-detection-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.KITTIDetectionDataset

.. _TFObjectDetectionDataset-import:

TFObjectDetectionDataset
------------------------

The :class:`fiftyone.types.TFObjectDetectionDataset <fiftyone.types.dataset_types.TFObjectDetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections stored as
`TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_ in
`TF Object Detection API format <https://github.com/tensorflow/models/blob/master/research/object_detection>`_.

Datasets of this type are read in the following format:

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

You can create a FiftyOne dataset from an object detection dataset stored as a
directory of TFRecords in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-tf-object-detection-dataset"
        dataset_dir = "/path/to/tf-object-detection-dataset"
        images_dir = "/path/for/images"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir,
            fo.types.TFObjectDetectionDataset,
            name=name,
            images_dir=images_dir,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

    When the above command is executed, the images in the TFRecords will be
    written to the provided `images_dir`, which is required because FiftyOne
    datasets must make their images available as invididual files on disk.

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-tf-object-detection-dataset
        DATASET_DIR=/path/to/tf-object-detection-dataset
        IMAGES_DIR=/path/for/images

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.TFObjectDetectionDataset
            --images-dir $IMAGES_DIR

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    When the above command is executed, the images in the TFRecords will be
    written to the provided `IMAGES_DIR`, which is required because FiftyOne
    datasets must make their images available as invididual files on disk.

    To view an object detection dataset stored as a directory of TFRecords in
    the FiftyOne App without creating a persistent FiftyOne dataset, you can
    execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/tf-object-detection-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.TFObjectDetectionDataset

.. _CVATImageDataset-import:

CVATImageDataset
----------------

The :class:`fiftyone.types.CVATImageDataset <fiftyone.types.dataset_types.CVATImageDataset>`
type represents a labeled dataset consisting of images and their associated
object detections stored in
`CVAT image format <https://github.com/opencv/cvat>`_.

Datasets of this type are read in the following format:

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

You can create a FiftyOne dataset from a CVAT image dataset stored in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-cvat-image-dataset"
        dataset_dir = "/path/to/cvat-image-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.CVATImageDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-cvat-image-dataset
        DATASET_DIR=/path/to/cvat-image-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.CVATImageDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a CVAT image dataset stored in the above format in the FiftyOne
    App without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/cvat-image-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.CVATImageDataset

.. _FiftyOneImageLabelsDataset-import:

FiftyOneImageLabelsDataset
--------------------------

The :class:`fiftyone.types.FiftyOneImageLabelsDataset <fiftyone.types.dataset_types.FiftyOneImageLabelsDataset>`
type represents a labeled dataset consisting of images and their associated
multitask predictions stored in
`eta.core.image.ImageLabels format <https://voxel51.com/docs/api/#types-imagelabels>`_.

Datasets of this type are read in the following format:

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

You can create a FiftyOne dataset from an image labels dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-image-labels-dataset"
        dataset_dir = "/path/to/image-labels-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.FiftyOneImageLabelsDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-image-labels-dataset
        DATASET_DIR=/path/to/image-labels-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneImageLabelsDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view an image labels dataset stored in the above format in the FiftyOne
    App without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/image-labels-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneImageLabelsDataset

.. _BDDDataset-import:

BDDDataset
----------

The :class:`fiftyone.types.BDDDataset <fiftyone.types.dataset_types.BDDDataset>`
type represents a labeled dataset consisting of images and their associated
multitask predictions saved in
`Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

Datasets of this type are read in the following format:

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
            ],
            "name": "<filename0>.<ext>",
        },
        ...
    ]

Unlabeled images have no corresponding entry in `labels.json`.

You can create a FiftyOne dataset from a BDD dataset stored in the above format
as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-bdd-dataset"
        dataset_dir = "/path/to/bdd-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(dataset_dir, fo.types.BDDDataset, name=name)

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-bdd-dataset
        DATASET_DIR=/path/to/bdd-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.BDDDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a BDD dataset stored in the above format in the FiftyOne App
    without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/bdd-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.BDDDataset

.. _FiftyOneDataset-import:

FiftyOneDataset
---------------

The :class:`fiftyone.types.FiftyOneDataset <fiftyone.types.dataset_types.FiftyOneDataset>`
provides a disk representation of a |Dataset|, including its |Sample| instances
stored in a serialized JSON format, and the associated source data.

Datasets of this type are read in the following format:

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

You can create a FiftyOne dataset from a directory in the above format as
follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-fiftyone-dataset"
        dataset_dir = "/path/to/fiftyone-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(dataset_dir, fo.types.FiftyOneDataset, name=name)

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-fiftyone-dataset
        DATASET_DIR=/path/to/fiftyone-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a dataset stored on disk in the FiftyOne App without creating a
    persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/fiftyone-dataset

        # View the dataset in the app
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneDataset

.. _custom-dataset-importer:

Custom formats
--------------

The |Dataset| class provides a
:meth:`Dataset.from_importer() <fiftyone.core.dataset.Dataset.from_importer>`
factory method that can be used to import a dataset using any |DatasetImporter|
instance.

This means that you can define your own |DatasetImporter| class and then import
a dataset from disk in your custom format using the following recipe:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    name = "custom-dataset"
    dataset_dir = "/path/to/custom-dataset"

    # Create an instance of your custom dataset importer
    importer = CustomDatasetImporter(dataset_dir, ...)

    # Import the dataset!
    dataset = fo.Dataset.from_importer(importer, name=name)

You can also define a custom |DatasetType| type, which enables you to import
datasets in your custom format using the
:meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` factory
method:

.. tabs::

  .. group-tab:: Python

    Import a dataset in your custom format by passing your |DatasetType| to the
    `dataset_type` argument of
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>`:

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "custom-dataset"
        dataset_dir = "/path/to/custom-dataset"

        # The `fiftyone.types.Dataset` subclass for your custom dataset
        dataset_type = CustomDataset

        # Import the dataset!
        dataset = fo.Dataset.from_dir(dataset_dir, dataset_type, name=name)

  .. group-tab:: CLI

    Import a dataset in your custom format by passing your |DatasetType| in the
    `--type` flag of the `fiftyone datasets create` method of the CLI:

    .. code-block:: shell

        NAME=custom-dataset
        DATASET_DIR=/path/to/custom-dataset

        # The `fiftyone.types.Dataset` subclass for your custom dataset
        DATASET_TYPE = CustomDataset

        # Import the dataset!
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type $DATASET_TYPE

.. _writing-a-custom-dataset-importer:

Writing a custom DatasetImporter
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

|DatasetImporter| is an abstract interface; the concrete interface that you
should implement is determined by the type of dataset that you are importing.

.. tabs::

  .. group-tab:: Unlabeled image datasets

    To define a custom importer for unlabeled image datasets, implement the
    |UnlabeledImageDatasetImporter| interface.

    The pseudocode below provides a template for a custom
    |UnlabeledImageDatasetImporter|:

    .. code-block:: python
        :linenos:

        import fiftyone.utils.data as foud


        class CustomUnlabeledImageDatasetImporter(foud.UnlabeledImageDatasetImporter):
            """Custom importer for unlabeled image datasets.

            Args:
                dataset_dir: the dataset directory
                *args: additional positional arguments for your importer
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(self, dataset_dir, *args, **kwargs):
                super().__init__(dataset_dir)
                # Your initialization here

            def __len__(self):
                """The total number of samples that will be imported.

                Raises:
                    TypeError: if the total number is not known
                """
                # Return the total number of samples in the dataset (if known)
                pass

            def __next__(self):
                """Returns information about the next sample in the dataset.

                Returns:
                    an ``(image_path, image_metadata)`` tuple, where:
                    -   ``image_path`` is the path to the image on disk
                    -   ``image_metadata`` is an
                        :class:`fiftyone.core.metadata.ImageMetadata` instances for the
                        image, or ``None`` if :meth:`has_image_metadata` is ``False``

                Raises:
                    StopIteration: if there are no more samples to import
                """
                # Implement loading the next sample in your dataset here
                pass

            @property
            def has_dataset_info(self):
                """Whether this importer produces a dataset info dictionary."""
                # Return True or False here
                pass

            @property
            def has_image_metadata(self):
                """Whether this importer produces
                :class:`fiftyone.core.metadata.ImageMetadata` instances for each image.
                """
                # Return True or False here
                pass

            def setup(self):
                """Performs any necessary setup before importing the first sample in
                the dataset.

                This method is called when the importer's context manager interface is
                entered, :func:`DatasetImporter.__enter__`.
                """
                # Your custom setup here
                pass

            def get_dataset_info(self):
                """Returns the dataset info for the dataset.

                By convention, this method should be called after all samples in the
                dataset have been imported.

                Returns:
                    a dict of dataset info
                """
                # Return a dict of dataset info, if supported by your importer
                pass

            def close(self, *args):
                """Performs any necessary actions after the last sample has been
                imported.

                This method is called when the importer's context manager interface is
                exited, :func:`DatasetImporter.__exit__`.

                Args:
                    *args: the arguments to :func:`DatasetImporter.__exit__`
                """
                # Your custom code here to complete the import
                pass

    When :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` is
    called with a custom |UnlabeledImageDatasetImporter|, the import is effectively
    performed via the pseudocode below:

    .. code-block:: python

        import fiftyone as fo

        dataset = fo.Dataset(...)

        importer = CustomUnlabeledImageDatasetImporter(dataset_dir, ...)
        with importer:
            for image_path, image_metadata in importer:
                dataset.add_sample(
                    fo.Sample(filepath=image_path, metadata=image_metadata)
                )

            if importer.has_dataset_info:
                dataset.info.update(importer.get_dataset_info())

    Note that the importer is invoked via its context manager interface, which
    automatically calls the
    :meth:`setup() <fiftyone.utils.data.importers.UnlabeledImageDatasetImporter.setup>`
    and
    :meth:`close() <fiftyone.utils.data.importers.UnlabeledImageDatasetImporter.close>`
    methods of the importer to handle setup/completion of the import.

    The images in the dataset are iteratively loaded by invoking the
    :meth:`__next__() <fiftyone.utils.data.importers.UnlabeledImageDatasetImporter.__next__>`
    method of the importer.

    The
    :meth:`has_dataset_info <fiftyone.utils.data.importers.UnlabeledImageDatasetImporter.has_dataset_info>`
    property of the importer allows it to declare whether its
    :meth:`get_dataset_info() <fiftyone.utils.data.importers.UnlabeledImageDatasetImporter.get_dataset_info>`
    method should be called after all samples have been imported to retrieve a
    dictionary of information to store in the
    :meth:`info <fiftyone.core.dataset.Dataset.info>` property of the FiftyOne
    dataset.

    The
    :meth:`has_image_metadata <fiftyone.utils.data.importers.UnlabeledImageDatasetImporter.has_image_metadata>`
    property of the importer allows it to declare whether it returns
    |ImageMetadata| instances for each image that it loads when
    :meth:`__next__() <fiftyone.utils.data.importers.UnlabeledImageDatasetImporter.__next__>`
    is called.

  .. group-tab:: Labeled image datasets

    To define a custom importer for labeled image datasets, implement the
    |LabeledImageDatasetImporter| interface.

    The pseudocode below provides a template for a custom
    |LabeledImageDatasetImporter|:

    .. code-block:: python
        :linenos:

        import fiftyone.utils.data as foud


        class CustomLabeledImageDatasetImporter(foud.LabeledImageDatasetImporter):
            """Custom importer for labeled image datasets.

            Args:
                dataset_dir: the dataset directory
                *args: additional positional arguments for your importer
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(self, dataset_dir, *args, **kwargs):
                super().__init__(dataset_dir)
                # Your initialization here

            def __len__(self):
                """The total number of samples that will be imported.

                Raises:
                    TypeError: if the total number is not known
                """
                # Return the total number of samples in the dataset (if known)
                pass

            def __next__(self):
                """Returns information about the next sample in the dataset.

                Returns:
                    an  ``(image_path, image_metadata, label)`` tuple, where

                    -   ``image_path``: the path to the image on disk
                    -   ``image_metadata``: an
                        :class:`fiftyone.core.metadata.ImageMetadata` instances for the
                        image, or ``None`` if :meth:`has_image_metadata` is ``False``
                    -   ``label``: an instance of :meth:`label_cls`, or a dictionary
                        mapping field names to :class:`fiftyone.core.labels.Label`
                        instances, or ``None`` if the sample is unlabeled

                Raises:
                    StopIteration: if there are no more samples to import
                """
                # Implement loading the next sample in your dataset here
                pass

            @property
            def has_dataset_info(self):
                """Whether this importer produces a dataset info dictionary."""
                # Return True or False here
                pass

            @property
            def has_image_metadata(self):
                """Whether this importer produces
                :class:`fiftyone.core.metadata.ImageMetadata` instances for each image.
                """
                # Return True or False here
                pass

            @property
            def label_cls(self):
                """The :class:`fiftyone.core.labels.Label` class returned by this
                importer, or ``None`` if it returns a dictionary of labels.
                """
                # Return a Label subclass here
                pass

            def setup(self):
                """Performs any necessary setup before importing the first sample in
                the dataset.

                This method is called when the importer's context manager interface is
                entered, :func:`DatasetImporter.__enter__`.
                """
                # Your custom setup here
                pass

            def get_dataset_info(self):
                """Returns the dataset info for the dataset.

                By convention, this method should be called after all samples in the
                dataset have been imported.

                Returns:
                    a dict of dataset info
                """
                # Return a dict of dataset info, if supported by your importer
                pass

            def close(self, *args):
                """Performs any necessary actions after the last sample has been
                imported.

                This method is called when the importer's context manager interface is
                exited, :func:`DatasetImporter.__exit__`.

                Args:
                    *args: the arguments to :func:`DatasetImporter.__exit__`
                """
                # Your custom code here to complete the import
                pass

    When :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` is
    called with a custom |LabeledImageDatasetImporter|, the import is effectively
    performed via the pseudocode below:

    .. code-block:: python

        import fiftyone as fo

        dataset = fo.Dataset(...)

        importer = CustomLabeledImageDatasetImporter(dataset_dir, ...)

        with importer:
            for image_path, image_metadata, label in importer:
                sample = fo.Sample(filepath=image_path, metadata=image_metadata)

                if isinstance(label, dict):
                    sample.update_fields(label)
                elif label is not None:
                    sample[label_field] = label

                dataset.add_sample(sample)

            if importer.has_dataset_info:
                dataset.info.update(importer.get_dataset_info())

    Note that the importer is invoked via its context manager interface, which
    automatically calls the
    :meth:`setup() <fiftyone.utils.data.importers.LabeledImageDatasetImporter.setup>`
    and
    :meth:`close() <fiftyone.utils.data.importers.LabeledImageDatasetImporter.close>`
    methods of the importer to handle setup/completion of the import.

    The images and their corresponding |Label| instances in the dataset are
    iteratively loaded by invoking the
    :meth:`__next__() <fiftyone.utils.data.importers.LabeledImageDatasetImporter.__next__>`
    method of the importer.

    The
    :meth:`has_dataset_info <fiftyone.utils.data.importers.LabeledImageDatasetImporter.has_dataset_info>`
    property of the importer allows it to declare whether its
    :meth:`get_dataset_info() <fiftyone.utils.data.importers.LabeledImageDatasetImporter.get_dataset_info>`
    method should be called after all samples have been imported to retrieve a
    dictionary of information to store in the
    :meth:`info <fiftyone.core.dataset.Dataset.info>` property of the FiftyOne
    dataset.

    The
    :meth:`label_cls <fiftyone.utils.data.importers.LabeledImageDatasetImporter.label_cls>`
    property of the importer declares the type of |Label| that the dataset contains
    (e.g., |Classification| or |Detections|).

    The
    :meth:`has_image_metadata <fiftyone.utils.data.importers.LabeledImageDatasetImporter.has_image_metadata>`
    property of the importer allows it to declare whether it returns
    |ImageMetadata| instances for each image that it loads when
    :meth:`__next__() <fiftyone.utils.data.importers.LabeledImageDatasetImporter.__next__>`
    is called.

.. _writing-a-custom-dataset-type-importer:

Writing a custom Dataset type
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

FiftyOne provides the |DatasetType| type system so that dataset formats can be
conveniently referenced by their type when reading/writing datasets on disk.

The primary function of the |DatasetType| subclasses is to define the
|DatasetImporter| that should be used to read instances of the dataset from
disk and the |DatasetExporter| that should be used to write instances of the
dataset to disk.

See :ref:`this page <writing-a-custom-dataset-exporter>` for more information
about defining custom |DatasetExporter| classes.

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

    Note that, as this type represents an unlabeled image dataset, its importer
    must be a subclass of |UnlabeledImageDatasetImporter|, and its exporter
    must be a subclass of |UnlabeledImageDatasetExporter|.

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

    Note that, as this type represents a labeled image dataset, its importer
    must be a subclass of |LabeledImageDatasetImporter|, and its exporter must
    be a subclass of |LabeledImageDatasetExporter|.
