.. _loading-datasets-from-disk:

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

    You can also provide additional arguments to
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import behavior:

    .. code-block:: python
        :linenos:

        # Import a random subset of 10 samples from the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, dataset_type, shuffle=True, max_samples=10
        )

    The additional arguments are passed directly to the |DatasetImporter| that
    performs the actual import.

  .. group-tab:: CLI

    You can import a dataset from disk into FiftyOne
    :ref:`via the CLI <cli-fiftyone-datasets-create>`:

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

    You can also provide
    :ref:`additional arguments <cli-fiftyone-datasets-create>` to customize the
    import behavior:

    .. code-block:: shell

        # Import a random subset of 10 samples from the dataset
        fiftyone datasets create \
            --name $NAME --dataset-dir $DATASET_DIR --type $TYPE \
            --shuffle --max-samples 10

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
    | :ref:`VideoDirectory <VideoDirectory-import>`                                         | A directory of videos.                                                             |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageClassificationDataset <FiftyOneImageClassificationDataset-import>` | A labeled dataset consisting of images and their associated classification labels  |
    |                                                                                       | in a simple JSON format.                                                           |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`ImageClassificationDirectoryTree <ImageClassificationDirectoryTree-import>`     | A directory tree whose subfolders define an image classification dataset.          |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`VideoClassificationDirectoryTree <VideoClassificationDirectoryTree-import>`     | A directory tree whose subfolders define a video classification dataset.           |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFImageClassificationDataset <TFImageClassificationDataset-import>`             | A labeled dataset consisting of images and their associated classification labels  |
    |                                                                                       | stored as TFRecords.                                                               |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageDetectionDataset <FiftyOneImageDetectionDataset-import>`           | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | stored in a simple JSON format.                                                    |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`COCODetectionDataset <COCODetectionDataset-import>`                             | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `COCO Object Detection Format <https://cocodataset.org/#format-data>`_.   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`VOCDetectionDataset <VOCDetectionDataset-import>`                               | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`KITTIDetectionDataset <KITTIDetectionDataset-import>`                           | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `KITTI format <http://www.cvlibs.net/datasets/kitti/eval\_object.php>`_.  |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`YOLODataset <YOLODataset-import>`                                               | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `YOLO format <https://github.com/AlexeyAB/darknet>`_.                     |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFObjectDetectionDataset <TFObjectDetectionDataset-import>`                     | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | stored as TFRecords in `TF Object Detection API format \                           |
    |                                                                                       | <https://github.com/tensorflow/models/blob/master/research/object\_detection>`_.   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CVATImageDataset <CVATImageDataset-import>`                                     | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | stored in `CVAT image format <https://github.com/opencv/cvat>`_.                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CVATVideoDataset <CVATVideoDataset-import>`                                     | A labeled dataset consisting of videos and their associated object detections      |
    |                                                                                       | stored in `CVAT video format <https://github.com/opencv/cvat>`_.                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageLabelsDataset <FiftyOneImageLabelsDataset-import>`                 | A labeled dataset consisting of images and their associated multitask predictions  |
    |                                                                                       | stored in `ETA ImageLabels format \                                                |
    |                                                                                       | <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.        |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`BDDDataset <BDDDataset-import>`                                                 | A labeled dataset consisting of images and their associated multitask predictions  |
    |                                                                                       | saved in `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.       |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`GeoJSONImageDataset <GeoJSONImageDataset-import>`                               | An image dataset whose labels and location data are stored in                      |
    |                                                                                       | `GeoJSON format <https://en.wikipedia.org/wiki/GeoJSON>`_.                         |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneVideoLabelsDataset <FiftyOneVideoLabelsDataset-import>`                 | A labeled dataset consisting of videos and their associated multitask predictions  |
    |                                                                                       | stored in `ETA VideoLabels format \                                                |
    |                                                                                       | <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.        |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneDataset <FiftyOneDataset-import>`                                       | A dataset consisting of an entire serialized |Dataset| and its associated source   |
    |                                                                                       | media.                                                                             |
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

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.ImageDirectory

.. _VideoDirectory-import:

VideoDirectory
--------------

The :class:`fiftyone.types.VideoDirectory <fiftyone.types.dataset_types.VideoDirectory>`
type represents a directory of videos.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>

When reading datasets of this type, subfolders are recursively traversed, and
files with non-video MIME types are omitted.

You can create a FiftyOne dataset from a directory of videos as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-videos-dir"
        dataset_dir = "/path/to/videos-dir"

        # Create the dataset
        dataset = fo.Dataset.from_dir(dataset_dir, fo.types.VideoDirectory, name=name)

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code:: shell

      NAME=my-videos-dir
      DATASET_DIR=/path/to/videos-dir

      # Create the dataset
      fiftyone datasets create \
          --name $NAME \
          --dataset-dir $DATASET_DIR \
          --type fiftyone.types.VideoDirectory

      # View summary info about the dataset
      fiftyone datasets info $NAME

      # Print the first few samples in the dataset
      fiftyone datasets head $NAME

    To view a directory of videos in the FiftyOne App without creating
    a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/videos-dir

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.VideoDirectory

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

        # View the dataset in the App
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

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.ImageClassificationDirectoryTree

.. _VideoClassificationDirectoryTree-import:

VideoClassificationDirectoryTree
--------------------------------

The :class:`fiftyone.types.VideoClassificationDirectoryTree <fiftyone.types.dataset_types.VideoClassificationDirectoryTree>`
type represents a directory tree whose subfolders define a video classification
dataset.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        <classA>/
            <video1>.<ext>
            <video2>.<ext>
            ...
        <classB>/
            <video1>.<ext>
            <video2>.<ext>
            ...
        ...

Unlabeled videos are stored in a subdirectory named `_unlabeled`.

You can create a FiftyOne dataset from a video classification directory tree
stored in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-video-classification-dir-tree"
        dataset_dir = "/path/to/video-classification-dir-tree"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.VideoClassificationDirectoryTree, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-video-classification-dir-tree
        DATASET_DIR=/path/to/video-classification-dir-tree

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.VideoClassificationDirectoryTree

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a video classification directory tree in the FiftyOne App without
    creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/video-classification-dir-tree

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.VideoClassificationDirectoryTree

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

        # View the dataset in the App
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

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneImageDetectionDataset

.. _COCODetectionDataset-import:

COCODetectionDataset
--------------------

The :class:`fiftyone.types.COCODetectionDataset <fiftyone.types.dataset_types.COCODetectionDataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in
`COCO Object Detection Format <https://cocodataset.org/#format-data>`_.

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
                "segmentation": [...],
                "area": 45969,
                "iscrowd": 0
            },
            ...
        ]
    }

See `this page <https://cocodataset.org/#format-data>`_ for a full
specification of the `segmentation` field.

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

        # View the dataset in the App
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

        # View the dataset in the App
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

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.KITTIDetectionDataset

.. _YOLODataset-import:

YOLODataset
-----------

The :class:`fiftyone.types.YOLODataset <fiftyone.types.dataset_types.YOLODataset>`
type represents a labeled dataset consisting of images and their associated
object detections saved in
`YOLO format <https://github.com/AlexeyAB/darknet>`_.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        obj.names
        images.txt
        data/
            <uuid1>.<ext>
            <uuid1>.txt
            <uuid2>.<ext>
            <uuid2>.txt
            ...

where `obj.names` contains the object class labels:

.. code-block:: text

    <label-0>
    <label-1>
    ...

and `images.txt` contains the list of images in `data/`:

.. code-block:: text

    data/<uuid1>.<ext>
    data/<uuid2>.<ext>
    ...

and the TXT files in `data/` are space-delimited files where each row
corresponds to an object in the image of the same name, in the following
format:

.. code-block:: text

    <target> <x-center> <y-center> <width> <height>

where `<target>` is the zero-based integer index of the object class
label from `obj.names` and the bounding box coordinates are expressed as
relative coordinates in `[0, 1] x [0, 1]`.

Unlabeled images have no corresponding TXT file in `data/`.

You can create a FiftyOne dataset from a YOLO dataset stored in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-yolo-dataset"
        dataset_dir = "/path/to/yolo-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.YOLODataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-yolo-dataset
        DATASET_DIR=/path/to/yolo-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.YOLODataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a YOLO dataset stored in the above format in the FiftyOne App
    without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/yolo-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.YOLODataset

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

        # View the dataset in the App
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

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.CVATImageDataset

.. _CVATVideoDataset-import:

CVATVideoDataset
----------------

The :class:`fiftyone.types.CVATVideoDataset <fiftyone.types.dataset_types.CVATVideoDataset>`
type represents a labeled dataset consisting of videos and their associated
object detections stored in
`CVAT video format <https://github.com/opencv/cvat>`_.

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

where the labels XML files are stored in the following format:

.. code-block:: xml

    <?xml version="1.0" encoding="utf-8"?>
        <annotations>
            <version>1.1</version>
            <meta>
                <task>
                    <id>task-id</id>
                    <name>task-name</name>
                    <size>51</size>
                    <mode>interpolation</mode>
                    <overlap></overlap>
                    <bugtracker></bugtracker>
                    <flipped>False</flipped>
                    <created>2017-11-20 11:51:51.000000+00:00</created>
                    <updated>2017-11-20 11:51:51.000000+00:00</updated>
                    <labels>
                        <label>
                            <name>car</name>
                            <attributes>
                                <attribute>
                                    <name>type</name>
                                    <values>coupe\\nsedan\\ntruck</values>
                                </attribute>
                                ...
                            </attributes>
                        </label>
                        <label>
                            <name>person</name>
                            <attributes>
                                <attribute>
                                    <name>gender</name>
                                    <values>male\\nfemale</values>
                                </attribute>
                                ...
                            </attributes>
                        </label>
                        ...
                    </labels>
                </task>
                <segments>
                    <segment>
                        <id>0</id>
                        <start>0</start>
                        <stop>50</stop>
                        <url></url>
                    </segment>
                </segments>
                <owner>
                    <username></username>
                    <email></email>
                </owner>
                <original_size>
                    <width>640</width>
                    <height>480</height>
                </original_size>
                <dumped>2017-11-20 11:51:51.000000+00:00</dumped>
            </meta>
            <track id="0" label="car">
                <box frame="0" xtl="100" ytl="50" xbr="325" ybr="190" outside="0" occluded="0" keyframe="1">
                    <attribute name="type">sedan</attribute>
                    ...
                </box>
                ...
            </track>
            ...
            <track id="10" label="person">
                <box frame="45" xtl="300" ytl="25" xbr="375" ybr="400" outside="0" occluded="0" keyframe="1">
                    <attribute name="gender">female</attribute>
                    ...
                </box>
                ...
            </track>
        </annotations>

Unlabeled videos have no corresponding file in `labels/`.

You can create a FiftyOne dataset from a CVAT video dataset stored in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-cvat-video-dataset"
        dataset_dir = "/path/to/cvat-video-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.CVATVideoDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-cvat-video-dataset
        DATASET_DIR=/path/to/cvat-video-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.CVATVideoDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a CVAT video dataset stored in the above format in the FiftyOne
    App without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/cvat-video-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.CVATVideoDataset

.. _FiftyOneImageLabelsDataset-import:

FiftyOneImageLabelsDataset
--------------------------

The :class:`fiftyone.types.FiftyOneImageLabelsDataset <fiftyone.types.dataset_types.FiftyOneImageLabelsDataset>`
type represents a labeled dataset consisting of images and their associated
multitask predictions stored in
`ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

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
`ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

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

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneImageLabelsDataset

.. _FiftyOneVideoLabelsDataset-import:

FiftyOneVideoLabelsDataset
--------------------------

The :class:`fiftyone.types.FiftyOneVideoLabelsDataset <fiftyone.types.dataset_types.FiftyOneVideoLabelsDataset>`
type represents a labeled dataset consisting of videos and their associated
labels stored in
`ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

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
        "type": "eta.core.datasets.LabeledVideoDataset",
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
`ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

For unlabeled videos, an empty `eta.core.video.VideoLabels` file is written.

You can create a FiftyOne dataset from a video labels dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-video-labels-dataset"
        dataset_dir = "/path/to/video-labels-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.FiftyOneVideoLabelsDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-video-labels-dataset
        DATASET_DIR=/path/to/video-labels-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneVideoLabelsDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a video labels dataset stored in the above format in the FiftyOne
    App without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/video-labels-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneVideoLabelsDataset

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
            "name": "<filename0>.<ext>",
            "attributes": {
                "scene": "city street",
                "timeofday": "daytime",
                "weather": "overcast"
            },
            "labels": [
                {
                    "id": 0,
                    "category": "traffic sign",
                    "manualAttributes": true,
                    "manualShape": true,
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
                    }
                },
                ...
                {
                    "id": 34,
                    "category": "drivable area",
                    "manualAttributes": true,
                    "manualShape": true,
                    "attributes": {
                        "areaType": "direct"
                    },
                    "poly2d": [
                        {
                            "types": "LLLLCCC",
                            "closed": true,
                            "vertices": [
                                [241.143645, 697.923453],
                                [541.525255, 380.564983],
                                ...
                            ]
                        }
                    ]
                },
                ...
                {
                    "id": 109356,
                    "category": "lane",
                    "attributes": {
                        "laneDirection": "parallel",
                        "laneStyle": "dashed",
                        "laneType": "single white"
                    },
                    "manualShape": true,
                    "manualAttributes": true,
                    "poly2d": [
                        {
                            "types": "LL",
                            "closed": false,
                            "vertices": [
                                [492.879546, 331.939543],
                                [0, 471.076658],
                                ...
                            ]
                        }
                    ],
                },
                ...
            }
        }
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

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.BDDDataset

.. _GeoJSONImageDataset-import:

GeoJSONImageDataset
-------------------

The :class:`fiftyone.types.GeoJSONImageDataset <fiftyone.types.dataset_types.GeoJSONImageDataset>`
type represents a dataset consisting of images and their associated
geolocation data and optional properties stored in
`GeoJSON format <https://en.wikipedia.org/wiki/GeoJSON>`_.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename1>.<ext>
            <filename2>.<ext>
            ...
        labels.json

where ``labels.json`` is a GeoJSON file containing a ``FeatureCollection`` in
the following format:

.. code-block:: text

    {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        -73.99496451958454,
                        40.66338032487842
                    ]
                },
                "properties": {
                    "filename": <filename1>.<ext>,
                    ...
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        -73.80992143421788,
                        40.65611832778962
                    ]
                },
                "properties": {
                    "filename": <filename2>.<ext>,
                    ...
                }
            },
            ...
        ]
    }

where the ``geometry`` field may contain any valid GeoJSON geometry object, and
the ``filename`` property encodes the name of the corresponding image in the
``data/`` folder.

You can also specify a ``filepath`` property rather than ``filename``, in which
case the path is interpreted as an absolute path to the corresponding image,
which may or may not be in ``data/`` folder.

Images with no location data will have a null ``geometry`` field.

The ``properties`` field of each feature can contain additional labels that
can be imported when working with datasets of this type.

You can create a FiftyOne dataset from a GeoJSON image dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-geojson-image-dataset"
        dataset_dir = "/path/to/geojson-image-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir, fo.types.GeoJSONImageDataset, name=name
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-geojson-image-dataset
        DATASET_DIR=/path/to/geojson-image-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.GeoJSONImageDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a GeoJSON image dataset stored in the above format in the FiftyOne
    App without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/geojson-image-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.GeoJSONImageDataset

.. _FiftyOneDataset-import:

FiftyOneDataset
---------------

The :class:`fiftyone.types.FiftyOneDataset <fiftyone.types.dataset_types.FiftyOneDataset>`
provides a disk representation of an entire |Dataset| in a serialized JSON
format along with its source media.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        metadata.json
        samples.json
        data/
            <filename1>.<ext>
            <filename2>.<ext>
            ...
        evaluations/
            <eval_key1>.json
            <eval_key2>.json
            ...
        brain/
            <brain_key1>.json
            <brain_key2>.json
            ...

where `metadata.json` is a JSON file containing metadata associated with the
dataset, `samples.json` is a JSON file containing a serialized representation
of the samples in the dataset, `evaluations/` contains any serialized
|EvaluationResults| for the dataset, and `brain/` contains any serialized
|BrainResults| for the dataset.

Video datasets have an additional `frames.json` file that contains a serialized
representation of the frame labels for each video in the dataset.

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

        # View the dataset in the App
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
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self, dataset_dir, shuffle=False, seed=None, max_samples=None, **kwargs
            ):
                super().__init__(
                    dataset_dir, shuffle=shuffle, seed=seed, max_samples=max_samples
                )
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
                info = importer.get_dataset_info()
                parse_info(dataset, info)

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
    method should be called after all samples have been imported to retrieve
    dataset-level information to store on the FiftyOne dataset. See
    :ref:`this section <importing-dataset-level-info>` for more information.

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
                skip_unlabeled (False): whether to skip unlabeled images when importing
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self,
                dataset_dir,
                skip_unlabeled=False,
                shuffle=False,
                seed=None,
                max_samples=None,
                **kwargs,
            ):
                super().__init__(
                    dataset_dir,
                    skip_unlabeled=skip_unlabeled,
                    shuffle=shuffle,
                    seed=seed,
                    max_samples=max_samples,
                )
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
                """The :class:`fiftyone.core.labels.Label` class(es) returned by this
                importer.

                This can be any of the following:

                -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                    importer is guaranteed to return labels of this type
                -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                    In this case, the importer will return label dictionaries with keys
                    and value-types specified by this dictionary. Not all keys need be
                    present in the imported labels
                -   ``None``. In this case, the importer makes no guarantees about the
                    labels that it may return
                """
                # Return the appropriate value here
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
        label_field = ...

        with importer:
            for image_path, image_metadata, label in importer:
                sample = fo.Sample(filepath=image_path, metadata=image_metadata)

                if isinstance(label, dict):
                    sample.update_fields(
                        {label_field + "_" + k: v for k, v in label.items()}
                    )
                elif label is not None:
                    sample[label_field] = label

                dataset.add_sample(sample)

            if importer.has_dataset_info:
                info = importer.get_dataset_info()
                parse_info(dataset, info)

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
    method should be called after all samples have been imported to retrieve
    dataset-level information to store on the FiftyOne dataset. See
    :ref:`this section <importing-dataset-level-info>` for more information.

    The
    :meth:`label_cls <fiftyone.utils.data.importers.LabeledImageDatasetImporter.label_cls>`
    property of the importer declares the type of label(s) that the importer
    will produce.

    The
    :meth:`has_image_metadata <fiftyone.utils.data.importers.LabeledImageDatasetImporter.has_image_metadata>`
    property of the importer allows it to declare whether it returns
    |ImageMetadata| instances for each image that it loads when
    :meth:`__next__() <fiftyone.utils.data.importers.LabeledImageDatasetImporter.__next__>`
    is called.

  .. group-tab:: Unlabeled video datasets

    To define a custom importer for unlabeled video datasets, implement the
    |UnlabeledVideoDatasetImporter| interface.

    The pseudocode below provides a template for a custom
    |UnlabeledVideoDatasetImporter|:

    .. code-block:: python
        :linenos:

        import fiftyone.utils.data as foud

        class CustomUnlabeledVideoDatasetImporter(foud.UnlabeledVideoDatasetImporter):
            """Custom importer for unlabeled video datasets.

            Args:
                dataset_dir: the dataset directory
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self, dataset_dir, shuffle=False, seed=None, max_samples=None, **kwargs
            ):
                super().__init__(
                    dataset_dir, shuffle=shuffle, seed=seed, max_samples=max_samples
                )
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
                    an ``(video_path, video_metadata)`` tuple, where:
                    -   ``video_path`` is the path to the video on disk
                    -   ``video_metadata`` is an
                        :class:`fiftyone.core.metadata.VideoMetadata` instances for the
                        video, or ``None`` if :meth:`has_video_metadata` is ``False``

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
            def has_video_metadata(self):
                """Whether this importer produces
                :class:`fiftyone.core.metadata.VideoMetadata` instances for each video.
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
    called with a custom |UnlabeledVideoDatasetImporter|, the import is effectively
    performed via the pseudocode below:

    .. code-block:: python

        import fiftyone as fo

        dataset = fo.Dataset(...)

        importer = CustomUnlabeledVideoDatasetImporter(dataset_dir, ...)
        with importer:
            for video_path, video_metadata in importer:
                dataset.add_sample(
                    fo.Sample(filepath=video_path, metadata=video_metadata)
                )

            if importer.has_dataset_info:
                info = importer.get_dataset_info()
                parse_info(dataset, info)

    Note that the importer is invoked via its context manager interface, which
    automatically calls the
    :meth:`setup() <fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter.setup>`
    and
    :meth:`close() <fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter.close>`
    methods of the importer to handle setup/completion of the import.

    The videos in the dataset are iteratively loaded by invoking the
    :meth:`__next__() <fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter.__next__>`
    method of the importer.

    The
    :meth:`has_dataset_info <fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter.has_dataset_info>`
    property of the importer allows it to declare whether its
    :meth:`get_dataset_info() <fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter.get_dataset_info>`
    method should be called after all samples have been imported to retrieve
    dataset-level information to store on the FiftyOne dataset. See
    :ref:`this section <importing-dataset-level-info>` for more information.

    The
    :meth:`has_video_metadata <fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter.has_video_metadata>`
    property of the importer allows it to declare whether it returns
    |VideoMetadata| instances for each video that it loads when
    :meth:`__next__() <fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter.__next__>`
    is called.

  .. group-tab:: Labeled video datasets

    To define a custom importer for labeled video datasets, implement the
    |LabeledVideoDatasetImporter| interface.

    The pseudocode below provides a template for a custom
    |LabeledVideoDatasetImporter|:

    .. code-block:: python
        :linenos:

        import fiftyone.utils.data as foud

        class CustomLabeledVideoDatasetImporter(foud.LabeledVideoDatasetImporter):
            """Custom importer for labeled video datasets.

            Args:
                dataset_dir: the dataset directory
                skip_unlabeled (False): whether to skip unlabeled videos when importing
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self,
                dataset_dir,
                skip_unlabeled=False,
                shuffle=False,
                seed=None,
                max_samples=None,
                **kwargs,
            ):
                super().__init__(
                    dataset_dir,
                    skip_unlabeled=skip_unlabeled,
                    shuffle=shuffle,
                    seed=seed,
                    max_samples=max_samples,
                )
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
                    an  ``(video_path, video_metadata, labels, frames)`` tuple, where

                    -   ``video_path``: the path to the video on disk
                    -   ``video_metadata``: an
                        :class:`fiftyone.core.metadata.VideoMetadata` instances for the
                        video, or ``None`` if :meth:`has_video_metadata` is ``False``
                    -   ``labels``: sample-level labels for the video, which can be any
                        of the following::

                        -   a :class:`fiftyone.core.labels.Label` instance
                        -   a dictionary mapping label fields to
                            :class:`fiftyone.core.labels.Label` instances
                        -   ``None`` if the sample has no sample-level labels

                    -   ``frames``: frame-level labels for the video, which can
                        be any of the following::

                        -   a dictionary mapping frame numbers to dictionaries that
                            map label fields to :class:`fiftyone.core.labels.Label`
                            instances for each video frame
                        -   ``None`` if the sample has no frame-level labels

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
            def has_video_metadata(self):
                """Whether this importer produces
                :class:`fiftyone.core.metadata.VideoMetadata` instances for each video.
                """
                # Return True or False here
                pass

            @property
            def label_cls(self):
                """The :class:`fiftyone.core.labels.Label` class(es) returned by this
                importer within the sample-level labels that it produces.

                This can be any of the following:

                -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                    importer is guaranteed to return sample-level labels of this type
                -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                    In this case, the importer will return sample-level label
                    dictionaries with keys and value-types specified by this
                    dictionary. Not all keys need be present in the imported labels
                -   ``None``. In this case, the importer makes no guarantees about the
                    sample-level labels that it may return
                """
                # Return the appropriate value here
                pass

            @property
            def frame_label_cls(self):
                """The :class:`fiftyone.core.labels.Label` class(es) returned by this
                importer within the frame labels that it produces.

                This can be any of the following:

                -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                    importer is guaranteed to return frame labels of this type
                -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                    In this case, the importer will return frame label dictionaries
                    with keys and value-types specified by this dictionary. Not all
                    keys need be present in each frame
                -   ``None``. In this case, the importer makes no guarantees about the
                    frame labels that it may return
                """
                # Return the appropriate value here
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
    called with a custom |LabeledVideoDatasetImporter|, the import is effectively
    performed via the pseudocode below:

    .. code-block:: python

        import fiftyone as fo

        dataset = fo.Dataset(...)

        importer = CustomLabeledVideoDatasetImporter(dataset_dir, ...)
        label_field = ...

        with importer:
            for video_path, video_metadata, label, frames in importer:
                sample = fo.Sample(filepath=video_path, metadata=video_metadata)

                if isinstance(label, dict):
                    sample.update_fields(
                        {label_field + "_" + k: v for k, v in label.items()}
                    )
                elif label is not None:
                    sample[label_field] = label

                if frames is not None:
                    sample.frames.merge(
                        {
                            frame_number: {
                                label_field + "_" + fname: flabel
                                for fname, flabel in frame_dict.items()
                            }
                            for frame_number, frame_dict in frames.items()
                        }
                    )

                dataset.add_sample(sample)

            if importer.has_dataset_info:
                info = importer.get_dataset_info()
                parse_info(dataset, info)

    Note that the importer is invoked via its context manager interface, which
    automatically calls the
    :meth:`setup() <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.setup>`
    and
    :meth:`close() <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.close>`
    methods of the importer to handle setup/completion of the import.

    The videos and their corresponding labels in the dataset are iteratively
    loaded by invoking the
    :meth:`__next__() <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.__next__>`
    method of the importer. In particular, sample-level labels for the video
    may be returned in a ``label`` value (which may contain a single |Label|
    value or a dictionary that maps field names to labels), and frame-level
    labels may be returned in a ``frames`` dictionary that maps frame numbers
    to dictionaries of field names and labels.

    The
    :meth:`has_dataset_info <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.has_dataset_info>`
    property of the importer allows it to declare whether its
    :meth:`get_dataset_info() <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.get_dataset_info>`
    method should be called after all samples have been imported to retrieve
    dataset-level information to store on the FiftyOne dataset. See
    :ref:`this section <importing-dataset-level-info>` for more information.

    The
    :meth:`label_cls <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.label_cls>`
    property of the importer declares the type of sample-level label(s) that
    the importer will produce (if any), and the
    :meth:`frame_labels_cls <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.frame_labels_cls>`
    property of the importer declares the type of frame-level label(s) that the
    importer will produce (if any).

    The
    :meth:`has_video_metadata <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.has_video_metadata>`
    property of the importer allows it to declare whether it returns
    |VideoMetadata| instances for each video that it loads when
    :meth:`__next__() <fiftyone.utils.data.importers.LabeledVideoDatasetImporter.__next__>`
    is called.

.. _importing-dataset-level-info:

Importing dataset-level information
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The
:meth:`has_dataset_info <fiftyone.utils.data.importers.DatasetImporter.has_dataset_info>`
property of the importer allows it to declare whether its
:meth:`get_dataset_info() <fiftyone.utils.data.importers.DatasetImporter.get_dataset_info>`
method should be called after all samples have been imported to retrieve
dataset-level information to store in the relevant properties of the FiftyOne
dataset, including
:meth:`info <fiftyone.core.dataset.Dataset.info>`,
:meth:`classes <fiftyone.core.dataset.Dataset.classes>`,
:meth:`default_classes <fiftyone.core.dataset.Dataset.default_classes>`,
:meth:`mask_targets <fiftyone.core.dataset.Dataset.mask_targets>`, and
:meth:`default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`.

The function below describes how the ``info`` dict is dissected by the dataset
import routine:

.. code-block:: python

    def parse_info(dataset, info):
        """Parses the info returned by :meth:`DatasetImporter.get_dataset_info` and
        stores it on the relevant properties of the dataset.

        Args:
            dataset: a :class:`fiftyone.core.dataset.Dataset`
            info: an info dict
        """
        classes = info.pop("classes", None)
        if isinstance(classes, dict):
            # Classes may already exist, so update rather than set
            dataset.classes.update(classes)
        elif isinstance(classes, list):
            dataset.default_classes = classes

        default_classes = info.pop("default_classes", None)
        if default_classes:
            dataset.default_classes = default_classes

        mask_targets = info.pop("mask_targets", None)
        if mask_targets:
            # Mask targets may already exist, so update rather than set
            dataset.mask_targets.update(dataset._parse_mask_targets(mask_targets))

        default_mask_targets = info.pop("default_mask_targets", None)
        if default_mask_targets:
            dataset.default_mask_targets = dataset._parse_default_mask_targets(
                default_mask_targets
            )

        dataset.info.update(info)
        dataset.save()

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

  .. group-tab:: Unlabeled video datasets

    The pseudocode below provides a template for a custom
    |UnlabeledVideoDatasetType| subclass:

    .. code-block:: python
        :linenos:

        import fiftyone.types as fot

        class CustomUnlabeledVideoDataset(fot.UnlabeledVideoDataset):
            """Custom unlabeled video dataset type."""

            def get_dataset_importer_cls(self):
                """Returns the
                :class:`fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter`
                class for importing datasets of this type from disk.

                Returns:
                    a :class:`fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter`
                    class
                """
                # Return your custom UnlabeledVideoDatasetImporter class here
                pass

            def get_dataset_exporter_cls(self):
                """Returns the
                :class:`fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter`
                class for exporting datasets of this type to disk.

                Returns:
                    a :class:`fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter`
                    class
                """
                # Return your custom UnlabeledVideoDatasetExporter class here
                pass

    Note that, as this type represents an unlabeled video dataset, its importer
    must be a subclass of |UnlabeledVideoDatasetImporter|, and its exporter
    must be a subclass of |UnlabeledVideoDatasetExporter|.

  .. group-tab:: Labeled video datasets

    The pseudocode below provides a template for a custom
    |LabeledVideoDatasetType| subclass:

    .. code-block:: python
        :linenos:

        import fiftyone.types as fot

        class CustomLabeledVideoDataset(fot.LabeledVideoDataset):
            """Custom labeled video dataset type."""

            def get_dataset_importer_cls(self):
                """Returns the
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`
                class for importing datasets of this type from disk.

                Returns:
                    a :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`
                    class
                """
                # Return your custom LabeledVideoDatasetImporter class here
                pass

            def get_dataset_exporter_cls(self):
                """Returns the
                :class:`fiftyone.utils.data.exporters.LabeledVideoDatasetExporter`
                class for exporting datasets of this type to disk.

                Returns:
                    a :class:`fiftyone.utils.data.exporters.LabeledVideoDatasetExporter`
                    class
                """
                # Return your custom LabeledVideoDatasetExporter class here
                pass

    Note that, as this type represents a labeled video dataset, its importer
    must be a subclass of |LabeledVideoDatasetImporter|, and its exporter must
    be a subclass of |LabeledVideoDatasetExporter|.
