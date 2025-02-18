.. _loading-datasets-from-disk:

Loading Datasets From Disk
==========================

.. default-role:: code

FiftyOne provides native support for importing datasets from disk in a
variety of :ref:`common formats <supported-import-formats>`, and it can be
easily extended to import datasets in
:ref:`custom formats <custom-dataset-importer>`.

.. note::

    Did you know? You can import media and/or labels from within the FiftyOne
    App by installing the
    `@voxel51/io <https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/io>`_
    plugin!

.. note::

    If your data is in a custom format,
    :ref:`writing a simple loop <loading-custom-datasets>` is the easiest way
    to load your data into FiftyOne.

Basic recipe
------------

The interface for creating a FiftyOne |Dataset| for your data on disk is
conveniently exposed via the Python library and the CLI. The basic recipe is
that you simply specify the path(s) to the data on disk and the type of dataset
that you're loading.

.. tabs::

  .. group-tab:: Python

    You can import a |Dataset| from disk via the
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` factory
    method.

    If your data is stored in the
    :ref:`canonical format <supported-import-formats>` of the type you're
    importing, then you can load it by providing the `dataset_dir` and
    `dataset_type` parameters:

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        # The directory containing the dataset to import
        dataset_dir = "/path/to/dataset"

        # The type of the dataset being imported
        dataset_type = fo.types.COCODetectionDataset  # for example

        # Import the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=dataset_type,
        )

    Alternatively, when importing labeled datasets in formats such as
    :ref:`COCO <COCODetectionDataset-import>`, you may find it more natural to
    provide the `data_path` and `labels_path` parameters to independently
    specify the location of the source media on disk and the annotations file
    containing the labels to import:

    .. code-block:: python
        :linenos:

        # The directory containing the source images
        data_path = "/path/to/images"

        # The path to the COCO labels JSON file
        labels_path = "/path/to/coco-labels.json"

        # Import the dataset
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.COCODetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
        )

    Many formats like :ref:`COCO <COCODetectionDataset-import>` also support
    storing absolute filepaths to the source media directly in the labels, in
    which case you can provide only the `labels_path` parameter:

    .. code-block:: python
        :linenos:

        # The path to a COCO labels JSON file containing absolute image paths
        labels_path = "/path/to/coco-labels.json"

        # Import the dataset
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.COCODetectionDataset,
            labels_path=labels_path,
        )

    In general, you can pass any parameter for the |DatasetImporter| of the
    format you're importing to
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>`. For
    example, most builtin importers support optional `max_samples`, `shuffle`,
    and `seed` parameters, which provide support for importing a small subset
    of a potentially large dataset:

    .. code-block:: python
        :linenos:

        # Import a random subset of 10 samples from the dataset
        dataset = fo.Dataset.from_dir(
            ...,
            max_samples=10,
            shuffle=True,
            seed=51,
        )

  .. group-tab:: CLI

    You can import a dataset from disk into FiftyOne
    :ref:`via the CLI <cli-fiftyone-datasets-create>`.

    If your data is stored in the
    :ref:`canonical format <supported-import-formats>` of the type you're
    importing, then you can load it by providing the `--dataset-dir` and
    `--type` options:

    .. code-block:: shell

        # A name for the dataset
        NAME=my-dataset

        # The directory containing the dataset to import
        DATASET_DIR=/path/to/dataset

        # The type of the dataset being imported
        # Any subclass of `fiftyone.types.Dataset` is supported
        TYPE=fiftyone.types.COCODetectionDataset  # for example

        # Import the dataset
        fiftyone datasets create --name $NAME --dataset-dir $DATASET_DIR --type $TYPE

    Alternatively, when importing labeled datasets in formats such as
    :ref:`COCO <COCODetectionDataset-import>`, you may find it more natural to
    provide the `data_path` and `labels_path` parameters via the
    :ref:`kwargs option <cli-fiftyone-datasets-create>` to independently
    specify the location of the source media on disk and the annotations file
    containing the labels to import:

    .. code-block:: shell

        # The directory containing the source images
        DATA_PATH=/path/to/images

        # The path to the COCO labels JSON file
        LABELS_PATH=/path/to/coco-labels.json

        # Import the dataset
        fiftyone datasets create --name my-dataset \
            --type fiftyone.types.COCODetectionDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

    Many formats like :ref:`COCO <COCODetectionDataset-import>` also support
    storing absolute filepaths to the source media directly in the labels, in
    which case you can provide only the `labels_path` parameter:

    .. code-block:: shell

        # The path to a COCO labels JSON file containing absolute image paths
        LABELS_PATH=/path/to/coco-labels.json

        # Import the dataset
        fiftyone datasets create --name my-dataset \
            --type fiftyone.types.COCODetectionDataset \
            --kwargs labels_path=$LABELS_PATH

    In general, you can pass any parameter for the |DatasetImporter| of the
    format you're importing via the
    :ref:`kwargs option <cli-fiftyone-datasets-create>`. For example, most
    builtin importers support optional `max_samples`, `shuffle`, and `seed`
    parameters, which provide support for importing a small subset of a
    potentially large dataset:

    .. code-block:: shell

        # Import a random subset of 10 samples from the dataset
        fiftyone datasets create \
            --name $NAME --dataset-dir $DATASET_DIR --type $TYPE \
            --kwargs \
                max_samples=10 \
                shuffle=True \
                seed=51

.. _supported-import-formats:

Supported formats
-----------------

Each supported dataset type is represented by a subclass of
:class:`fiftyone.types.Dataset`, which is used by the Python library and CLI to
refer to the corresponding dataset format when reading the dataset from disk.

.. table::
    :widths: 40 60

    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | Dataset Type                                                                          | Description                                                                        |
    +=======================================================================================+====================================================================================+
    | :ref:`ImageDirectory <ImageDirectory-import>`                                         | A directory of images.                                                             |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`VideoDirectory <VideoDirectory-import>`                                         | A directory of videos.                                                             |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`MediaDirectory <MediaDirectory-import>`                                         | A directory of media files.                                                        |
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
    | :ref:`FiftyOneTemporalDetectionDataset <FiftyOneTemporalDetectionDataset-import>`     | A labeled dataset consisting of videos and their associated temporal detections in |
    |                                                                                       | a simple JSON format.                                                              |
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
    | :ref:`YOLOv4Dataset <YOLOv4Dataset-import>`                                           | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `YOLOv4 format <https://github.com/AlexeyAB/darknet>`_.                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`YOLOv5Dataset <YOLOv5Dataset-import>`                                           | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | saved in `YOLOv5 format <https://github.com/ultralytics/yolov5>`_.                 |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFObjectDetectionDataset <TFObjectDetectionDataset-import>`                     | A labeled dataset consisting of images and their associated object detections      |
    |                                                                                       | stored as TFRecords in `TF Object Detection API format \                           |
    |                                                                                       | <https://github.com/tensorflow/models/blob/master/research/object\_detection>`_.   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`ImageSegmentationDirectory <ImageSegmentationDirectory-import>`                 | A labeled dataset consisting of images and their associated semantic segmentations |
    |                                                                                       | stored as images on disk.                                                          |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CVATImageDataset <CVATImageDataset-import>`                                     | A labeled dataset consisting of images and their associated multitask labels       |
    |                                                                                       | stored in `CVAT image format <https://github.com/opencv/cvat>`_.                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CVATVideoDataset <CVATVideoDataset-import>`                                     | A labeled dataset consisting of videos and their associated multitask labels       |
    |                                                                                       | stored in `CVAT video format <https://github.com/opencv/cvat>`_.                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`OpenLABELImageDataset <OpenLABELImageDataset-import>`                           | A labeled dataset consisting of images and their associated multitask labels       |
    |                                                                                       | stored in `OpenLABEL format <https://www.asam.net/standards/detail/openlabel/>`_.  |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`OpenLABELVideoDataset <OpenLABELVideoDataset-import>`                           | A labeled dataset consisting of videos and their associated multitask labels       |
    |                                                                                       | stored in `OpenLABEL format <https://www.asam.net/standards/detail/openlabel/>`_.  |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageLabelsDataset <FiftyOneImageLabelsDataset-import>`                 | A labeled dataset consisting of images and their associated multitask predictions  |
    |                                                                                       | stored in `ETA ImageLabels format \                                                |
    |                                                                                       | <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.        |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`BDDDataset <BDDDataset-import>`                                                 | A labeled dataset consisting of images and their associated multitask predictions  |
    |                                                                                       | saved in `Berkeley DeepDrive (BDD) format <http://bdd-data.berkeley.edu>`_.        |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CSVDataset <CSVDataset-import>`                                                 | A labeled dataset consisting of images or videos and their associated field values |
    |                                                                                       | stored as columns of a CSV file.                                                   |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`DICOMDataset <DICOMDataset-import>`                                             | An image dataset whose image data and optional properties are stored in            |
    |                                                                                       | `DICOM format <https://en.wikipedia.org/wiki/DICOM>`_.                             |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`GeoJSONDataset <GeoJSONDataset-import>`                                         | An image or video dataset whose location data and labels are stored in             |
    |                                                                                       | `GeoJSON format <https://en.wikipedia.org/wiki/GeoJSON>`_.                         |
    +---------------------------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`GeoTIFFDataset <GeoTIFFDataset-import>`                                         | An image dataset whose image and geolocation data are stored in                    |
    |                                                                                       | `GeoTIFF format <https://en.wikipedia.org/wiki/GeoTIFF>`_.                         |
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

The :class:`fiftyone.types.ImageDirectory` type represents a directory of
images.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>

where files with non-image MIME types are omitted.

By default, the dataset may contain nested subfolders of images, which are
recursively listed.

.. note::

    See :class:`ImageDirectoryImporter <fiftyone.utils.data.importers.ImageDirectoryImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a directory of images as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/images-dir"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.ImageDirectory,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code:: shell

      NAME=my-dataset
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

The :class:`fiftyone.types.VideoDirectory` type represents a directory of
videos.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>

where files with non-video MIME types are omitted.

By default, the dataset may contain nested subfolders of videos, which are
recursively listed.

.. note::

    See :class:`VideoDirectoryImporter <fiftyone.utils.data.importers.VideoDirectoryImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a directory of videos as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/videos-dir"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.VideoDirectory,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code:: shell

      NAME=my-dataset
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

.. _MediaDirectory-import:

MediaDirectory
--------------

The :class:`fiftyone.types.MediaDirectory` type represents a directory of media
files.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>

.. note::

    All files must have the same media type (image, video, point cloud, etc.)

By default, the dataset may contain nested subfolders of media files, which are
recursively listed.

.. note::

    See :class:`MediaDirectoryImporter <fiftyone.utils.data.importers.MediaDirectoryImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a directory of media files as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/media-dir"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.MediaDirectory,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code:: shell

      NAME=my-dataset
      DATASET_DIR=/path/to/media-dir

      # Create the dataset
      fiftyone datasets create \
          --name $NAME \
          --dataset-dir $DATASET_DIR \
          --type fiftyone.types.MediaDirectory

      # View summary info about the dataset
      fiftyone datasets info $NAME

      # Print the first few samples in the dataset
      fiftyone datasets head $NAME

    To view a directory of media in the FiftyOne App without creating
    a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/media-dir

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.MediaDirectory

.. _FiftyOneImageClassificationDataset-import:

FiftyOneImageClassificationDataset
----------------------------------

The :class:`fiftyone.types.FiftyOneImageClassificationDataset` type represents
a labeled dataset consisting of images and their associated classification
label(s) stored in a simple JSON format.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.json

In the simplest case, `labels.json` can be a JSON file in the following format:

.. code-block:: text

    {
        "classes": [
            "<labelA>",
            "<labelB>",
            ...
        ],
        "labels": {
            "<uuid1>": <target>,
            "<uuid2>": <target>,
            ...
        }
    }

If the `classes` field is provided, the `target` values are class IDs that are
mapped to class label strings via `classes[target]`. If no `classes` field is
provided, then the `target` values directly store the label strings.

The target value in `labels` for unlabeled images is `None` (or missing).

The UUIDs can also be relative paths like `path/to/uuid`, in which case the
images in `data/` should be arranged in nested subfolders with the
corresponding names, or they can be absolute paths, in which case the images
may or may not be in `data/`.

Alternatively, `labels.json` can contain predictions with associated
confidences and additional attributes in the following format:

.. code-block:: text

    {
        "classes": [
            "<labelA>",
            "<labelB>",
            ...
        ],
        "labels": {
            "<uuid1>": {
                "label": <target>,
                "confidence": <optional-confidence>,
                "attributes": {
                    <optional-name>: <optional-value>,
                    ...
                }
            },
            "<uuid2>": {
                "label": <target>,
                "confidence": <optional-confidence>,
                "attributes": {
                    <optional-name>: <optional-value>,
                    ...
                }
            },
            ...
        }
    }

You can also load multilabel classifications in this format by storing lists
of targets in `labels.json`:

.. code-block:: text

    {
        "classes": [
            "<labelA>",
            "<labelB>",
            ...
        ],
        "labels": {
            "<uuid1>": [<target1>, <target2>, ...],
            "<uuid2>": [<target1>, <target2>, ...],
            ...
        }
    }

where the target values in `labels` can be class strings, class IDs, or dicts
in the format described above defining class labels, confidences, and optional
attributes.

.. note::

    See :class:`FiftyOneImageClassificationDatasetImporter <fiftyone.utils.data.importers.FiftyOneImageClassificationDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from an image classification dataset stored
in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/image-classification-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/labels.json"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/labels.json

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.FiftyOneImageClassificationDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    If the UUIDs in your labels are absolute paths to the source media, then
    you can omit the `data_path` parameter from the example above.

.. _ImageClassificationDirectoryTree-import:

ImageClassificationDirectoryTree
--------------------------------

The :class:`fiftyone.types.ImageClassificationDirectoryTree` type represents a
directory tree whose subfolders define an image classification dataset.

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

Each class folder may contain nested subfolders of images.

.. note::

    See :class:`ImageClassificationDirectoryTreeImporter <fiftyone.utils.data.importers.ImageClassificationDirectoryTreeImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from an image classification directory tree
stored in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/image-classification-dir-tree"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

The :class:`fiftyone.types.VideoClassificationDirectoryTree` type represents a
directory tree whose subfolders define a video classification dataset.

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

Each class folder may contain nested subfolders of videos.

.. note::

    See :class:`VideoClassificationDirectoryTreeImporter <fiftyone.utils.data.importers.VideoClassificationDirectoryTreeImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a video classification directory tree
stored in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/video-classification-dir-tree"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

The :class:`fiftyone.types.TFImageClassificationDataset` type represents a
labeled dataset consisting of images and their associated classification labels
stored as
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

.. note::

    See :class:`TFImageClassificationDatasetImporter <fiftyone.utils.tf.TFImageClassificationDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from an image classification dataset stored
as a directory of TFRecords in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/tf-image-classification-dataset"
        images_dir = "/path/for/images"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.TFImageClassificationDataset,
            images_dir=images_dir,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

    When the above command is executed, the images in the TFRecords will be
    written to the provided `images_dir`, which is required because FiftyOne
    datasets must make their images available as individual files on disk.

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/tf-image-classification-dataset
        IMAGES_DIR=/path/for/images

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.TFImageClassificationDataset \
            --kwargs images_dir=$IMAGES_DIR

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    When the above command is executed, the images in the TFRecords will be
    written to the provided `IMAGES_DIR`, which is required because FiftyOne
    datasets must make their images available as individual files on disk.

    To view an image classification dataset stored as a directory of TFRecords
    in the FiftyOne App without creating a persistent FiftyOne dataset,
    you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/tf-image-classification-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.TFImageClassificationDataset

.. note::

    You can provide the `tf_records_path` argument instead of `dataset_dir` in
    the examples above to directly specify the path to the TFRecord(s) to load.
    See :class:`TFImageClassificationDatasetImporter <fiftyone.utils.tf.TFImageClassificationDatasetImporter>`
    for details.

.. _FiftyOneImageDetectionDataset-import:

FiftyOneImageDetectionDataset
-----------------------------

The :class:`fiftyone.types.FiftyOneImageDetectionDataset` type represents a
labeled dataset consisting of images and their associated object detections
stored in a simple JSON format.

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

The target value in `labels` for unlabeled images is `None` (or missing).

The UUIDs can also be relative paths like `path/to/uuid`, in which case the
images in `data/` should be arranged in nested subfolders with the
corresponding names, or they can be absolute paths, in which case the images
may or may not be in `data/`.

.. note::

    See :class:`FiftyOneImageDetectionDatasetImporter <fiftyone.utils.data.importers.FiftyOneImageDetectionDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from an image detection dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/image-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/labels.json"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/labels.json

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.FiftyOneImageDetectionDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    If the UUIDs in your labels are absolute paths to the source media, then
    you can omit the `data_path` parameter from the example above.

.. _FiftyOneTemporalDetectionDataset-import:

FiftyOneTemporalDetectionDataset
--------------------------------

The :class:`fiftyone.types.FiftyOneTemporalDetectionDataset` type represents a
labeled dataset consisting of videos and their associated temporal detections
stored in a simple JSON format.

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
            "<labelA>",
            "<labelB>",
            ...
        ],
        "labels": {
            "<uuid1>": [
                {
                    "label": <target>,
                    "support": [<first-frame>, <last-frame>],
                    "confidence": <optional-confidence>,
                    "attributes": {
                        <optional-name>: <optional-value>,
                        ...
                    }
                },
                {
                    "label": <target>,
                    "support": [<first-frame>, <last-frame>],
                    "confidence": <optional-confidence>,
                    "attributes": {
                        <optional-name>: <optional-value>,
                        ...
                    }
                },
                ...
            ],
            "<uuid2>": [
                {
                    "label": <target>,
                    "timestamps": [<start-timestamp>, <stop-timestamp>],
                    "confidence": <optional-confidence>,
                    "attributes": {
                        <optional-name>: <optional-value>,
                        ...
                    }
                },
                {
                    "label": <target>,
                    "timestamps": [<start-timestamp>, <stop-timestamp>],
                    "confidence": <optional-confidence>,
                    "attributes": {
                        <optional-name>: <optional-value>,
                        ...
                    }
                },
            ],
            ...
        }
    }

The temporal range of each detection can be specified either via the `support`
key, which should contain the `[first, last]` frame numbers of the detection,
or the `timestamps` key, which should contain the `[start, stop]` timestamps of
the detection in seconds.

If the `classes` field is provided, the `target` values are class IDs that are
mapped to class label strings via `classes[target]`. If no `classes` field is
provided, then the `target` values directly store the label strings.

Unlabeled videos can have a `None` (or missing) key in `labels`.

The UUIDs can also be relative paths like `path/to/uuid`, in which case the
images in `data/` should be arranged in nested subfolders with the
corresponding names, or they can be absolute paths, in which case the images
may or may not be in `data/`.

.. note::

    See :class:`FiftyOneTemporalDetectionDatasetImporter <fiftyone.utils.data.importers.FiftyOneTemporalDetectionDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a temporal detection dataset stored in
the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/temporal-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/temporal-detection-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneTemporalDetectionDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a temporal detection dataset in the FiftyOne App without creating
    a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/temporal-detection-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneTemporalDetectionDataset

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/labels.json"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/labels.json

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.FiftyOneTemporalDetectionDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    If the UUIDs in your labels are absolute paths to the source media, then
    you can omit the `data_path` parameter from the example above.

.. _COCODetectionDataset-import:

COCODetectionDataset
--------------------

The :class:`fiftyone.types.COCODetectionDataset` type represents a labeled
dataset consisting of images and their associated object detections saved in
`COCO Object Detection Format <https://cocodataset.org/#format-data>`_.

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

    {
        "info": {...},
        "licenses": [
            {
                "id": 1,
                "name": "Attribution-NonCommercial-ShareAlike License",
                "url": "http://creativecommons.org/licenses/by-nc-sa/2.0/",
            },
            ...
        ],
        "categories": [
            {
                "id": 1,
                "name": "cat",
                "supercategory": "animal",
                "keypoints": ["nose", "head", ...],
                "skeleton": [[12, 14], [14, 16], ...]
            },
            ...
        ],
        "images": [
            {
                "id": 1,
                "license": 1,
                "file_name": "<filename0>.<ext>",
                "height": 480,
                "width": 640,
                "date_captured": null
            },
            ...
        ],
        "annotations": [
            {
                "id": 1,
                "image_id": 1,
                "category_id": 1,
                "bbox": [260, 177, 231, 199],
                "segmentation": [...],
                "keypoints": [224, 226, 2, ...],
                "num_keypoints": 10,
                "score": 0.95,
                "area": 45969,
                "iscrowd": 0
            },
            ...
        ]
    }

See `this page <https://cocodataset.org/#format-data>`_ for a full
specification of the `segmentation` field.

For unlabeled datasets, `labels.json` does not contain an `annotations` field.

The `file_name` attribute of the labels file encodes the location of the
corresponding images, which can be any of the following:

-   The filename of an image in the `data/` folder
-   A relative path like `data/sub/folder/filename.ext` specifying the relative
    path to the image in a nested subfolder of `data/`
-   An absolute path to an image, which may or may not be in the `data/` folder

.. note::

    See :class:`COCODetectionDatasetImporter <fiftyone.utils.coco.COCODetectionDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a COCO detection dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/coco-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.COCODetectionDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

.. note::

    By default, all supported label types are loaded (detections,
    segmentations, and keypoints). However, you can choose specific type(s) to
    load by passing the optional `label_types` argument to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>`:

    .. code-block:: python

        # Only load bounding boxes
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.COCODetectionDataset,
            label_types=["detections"],
            ...
        )

    See :class:`COCODetectionDatasetImporter <fiftyone.utils.coco.COCODetectionDatasetImporter>`
    for complete documentation of the available COCO import options.

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/coco-labels.json"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.COCODetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/coco-labels.json

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.COCODetectionDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    If the `file_name` key of your labels contains absolute paths to the source
    media, then you can omit the `data_path` parameter from the example above.

If you have an existing dataset and corresponding model predictions stored in
COCO format, then you can use
:func:`add_coco_labels() <fiftyone.utils.coco.add_coco_labels>` to conveniently
add the labels to the dataset. The example below demonstrates a round-trip
export and then re-import of both images-and-labels and labels-only data in
COCO format:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.coco as fouc

    dataset = foz.load_zoo_dataset("quickstart")
    classes = dataset.distinct("predictions.detections.label")

    # Export images and ground truth labels to disk
    dataset.export(
        export_dir="/tmp/coco",
        dataset_type=fo.types.COCODetectionDataset,
        label_field="ground_truth",
        classes=classes,
    )

    # Export predictions
    dataset.export(
        dataset_type=fo.types.COCODetectionDataset,
        labels_path="/tmp/coco/predictions.json",
        label_field="predictions",
        classes=classes,
    )

    # Now load ground truth labels into a new dataset
    dataset2 = fo.Dataset.from_dir(
        dataset_dir="/tmp/coco",
        dataset_type=fo.types.COCODetectionDataset,
        label_field="ground_truth",
    )

    # And add model predictions
    fouc.add_coco_labels(
        dataset2,
        "predictions",
        "/tmp/coco/predictions.json",
        classes,
    )

    # Verify that ground truth and predictions were imported as expected
    print(dataset.count("ground_truth.detections"))
    print(dataset2.count("ground_truth.detections"))
    print(dataset.count("predictions.detections"))
    print(dataset2.count("predictions.detections"))

.. note::

    See :func:`add_coco_labels() <fiftyone.utils.coco.add_coco_labels>` for a
    complete description of the available syntaxes for loading COCO-formatted
    predictions to an existing dataset.

.. _VOCDetectionDataset-import:

VOCDetectionDataset
-------------------

The :class:`fiftyone.types.VOCDetectionDataset` type represents a labeled
dataset consisting of images and their associated object detections saved in
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
        <folder></folder>
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

where either the `<filename>` and/or `<path>` field of the annotations may be
populated to specify the corresponding source image.

Unlabeled images have no corresponding file in `labels/`.

The `data/` and `labels/` files may contain nested subfolders of parallelly
organized images and masks.

.. note::

    See :class:`VOCDetectionDatasetImporter <fiftyone.utils.voc.VOCDetectionDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a VOC detection dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/voc-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.VOCDetectionDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/voc-labels"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.VOCDetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/voc-labels

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.VOCDetectionDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    If the `<path>` field of your labels are populated with the absolute paths
    to the source media, then you can omit the `data_path` parameter from the
    example above.

.. _KITTIDetectionDataset-import:

KITTIDetectionDataset
---------------------

The :class:`fiftyone.types.KITTIDetectionDataset` type represents a labeled
dataset consisting of images and their associated object detections saved in
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
| 1        | truncated   | A float in `[0, 1]`, where 0 is non-truncated and           | 0       |
|          |             | 1 is fully truncated. Here, truncation refers to the object |         |
|          |             | leaving image boundaries                                    |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | occluded    | An int in `(0, 1, 2, 3)` indicating occlusion state,        | 0       |
|          |             | where:- 0 = fully visible- 1 = partly occluded- 2 =         |         |
|          |             | largely occluded- 3 = unknown                               |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | alpha       | Observation angle of the object, in `[-pi, pi]`             | 0       |
+----------+-------------+-------------------------------------------------------------+---------+
| 4        | bbox        | 2D bounding box of object in the image in pixels, in the    |         |
|          |             | format `[xtl, ytl, xbr, ybr]`                               |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | dimensions  | 3D object dimensions, in meters, in the format              | 0       |
|          |             | `[height, width, length]`                                   |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | location    | 3D object location `(x, y, z)` in camera coordinates        | 0       |
|          |             | (in meters)                                                 |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | rotation\_y | Rotation around the y-axis in camera coordinates, in        | 0       |
|          |             | `[-pi, pi]`                                                 |         |
+----------+-------------+-------------------------------------------------------------+---------+
| 1        | score       | `(optional)` A float confidence for the detection           |         |
+----------+-------------+-------------------------------------------------------------+---------+

When reading datasets of this type, all columns after the four `bbox` columns
are optional.

Unlabeled images have no corresponding file in `labels/`.

The `data/` and `labels/` files may contain nested subfolders of parallelly
organized images and masks.

.. note::

    See :class:`KITTIDetectionDatasetImporter <fiftyone.utils.kitti.KITTIDetectionDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a KITTI detection dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/kitti-detection-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.KITTIDetectionDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/kitti-labels"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.KITTIDetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/kitti-labels

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.KITTIDetectionDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. _YOLOv4Dataset-import:

YOLOv4Dataset
-------------

The :class:`fiftyone.types.YOLOv4Dataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
`YOLOv4 format <https://github.com/AlexeyAB/darknet>`_.

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

The image paths in `images.txt` can be specified as either relative (to the
location of file) or as absolute paths. Alternatively, this file can be
omitted, in which case the `data/` directory is listed to determine the
available images.

The TXT files in `data/` are space-delimited files where each row corresponds
to an object in the image of the same name, in one of the following formats:

.. code-block:: text

    # Detections
    <target> <x-center> <y-center> <width> <height>
    <target> <x-center> <y-center> <width> <height> <confidence>

    # Polygons
    <target> <x1> <y1> <x2> <y2> <x3> <y3> ...

where `<target>` is the zero-based integer index of the object class label from
`obj.names`, all coordinates are expressed as relative values in
`[0, 1] x [0, 1]`, and `<confidence>` is an optional confidence in `[0, 1]`.

Unlabeled images have no corresponding TXT file in `data/`.

The `data/` folder may contain nested subfolders.

.. note::

    By default, all annotations are loaded as |Detections|, converting any
    polylines to tight bounding boxes if necessary. However, you can choose to
    load YOLO annotations as |Polylines| by passing the optional `label_type`
    argument to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>`:

    .. code-block:: python

        # Load annotations as polygons
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.YOLOv4Dataset,
            label_type="polylines",
            ...
        )

    See :class:`YOLOv4DatasetImporter <fiftyone.utils.yolo.YOLOv4DatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a YOLOv4 dataset stored in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/yolov4-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.YOLOv4Dataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/yolov4-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.YOLOv4Dataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a YOLOv4 dataset stored in the above format in the FiftyOne App
    without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/yolov4-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.YOLOv4Dataset

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/yolo-labels"
        classes = ["list", "of", "classes"]

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.YOLOv4Dataset,
            data_path=data_path,
            labels_path=labels_path,
            classes=classes,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/yolo-labels
        OBJECTS_PATH=/path/to/obj.names

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.YOLOv4Dataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH \
                objects_path=$OBJECTS_PATH

If you have an existing dataset and corresponding model predictions stored in
YOLO format, then you can use
:func:`add_yolo_labels() <fiftyone.utils.yolo.add_yolo_labels>` to conveniently
add the labels to the dataset.

The example below demonstrates a round-trip export and then re-import of both
images-and-labels and labels-only data in YOLO format:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.yolo as fouy

    dataset = foz.load_zoo_dataset("quickstart")
    classes = dataset.distinct("predictions.detections.label")

    # Export images and ground truth labels to disk
    dataset.export(
        export_dir="/tmp/yolov4",
        dataset_type=fo.types.YOLOv4Dataset,
        label_field="ground_truth",
        classes=classes,
    )

    # Export predictions
    dataset.export(
        dataset_type=fo.types.YOLOv4Dataset,
        labels_path="/tmp/yolov4/predictions",
        label_field="predictions",
        classes=classes,
    )

    # Now load ground truth labels into a new dataset
    dataset2 = fo.Dataset.from_dir(
        dataset_dir="/tmp/yolov4",
        dataset_type=fo.types.YOLOv4Dataset,
        label_field="ground_truth",
    )

    # And add model predictions
    fouy.add_yolo_labels(
        dataset2,
        "predictions",
        "/tmp/yolov4/predictions",
        classes,
    )

    # Verify that ground truth and predictions were imported as expected
    print(dataset.count("ground_truth.detections"))
    print(dataset2.count("ground_truth.detections"))
    print(dataset.count("predictions.detections"))
    print(dataset2.count("predictions.detections"))

.. note::

    See :func:`add_yolo_labels() <fiftyone.utils.yolo.add_yolo_labels>` for a
    complete description of the available syntaxes for loading YOLO-formatted
    predictions to an existing dataset.

.. _YOLOv5Dataset-import:

YOLOv5Dataset
-------------

The :class:`fiftyone.types.YOLOv5Dataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
`YOLOv5 format <https://github.com/ultralytics/yolov5>`_.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        dataset.yaml
        images/
            train/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            val/
                <uuid3>.<ext>
                <uuid4>.<ext>
                ...
        labels/
            train/
                <uuid1>.txt
                <uuid2>.txt
                ...
            val/
                <uuid3>.txt
                <uuid4>.txt
                ...

where `dataset.yaml` contains the following information:

.. code-block:: text

    path: <dataset_dir>  # optional
    train: ./images/train/
    val: ./images/val/

    names:
      0: list
      1: of
      2: classes
      ...

See `this page <https://docs.ultralytics.com/datasets/detect>`_ for a full
description of the possible format of `dataset.yaml`. In particular, the
dataset may contain one or more splits with arbitrary names, as the specific
split being imported or exported is specified by the `split` argument to
:class:`fiftyone.utils.yolo.YOLOv5DatasetImporter`. Also, `dataset.yaml` can be
located outside of `<dataset_dir>` as long as the optional `path` is provided.

.. note::

    Any relative paths in `dataset.yaml` or per-split TXT files are interpreted
    relative to the directory containing these files, not your current working
    directory.

The TXT files in `labels/` are space-delimited files where each row corresponds
to an object in the image of the same name, in one of the following formats:

.. code-block:: text

    # Detections
    <target> <x-center> <y-center> <width> <height>
    <target> <x-center> <y-center> <width> <height> <confidence>

    # Polygons
    <target> <x1> <y1> <x2> <y2> <x3> <y3> ...

where `<target>` is the zero-based integer index of the object class label from
`names`, all coordinates are expressed as relative values in `[0, 1] x [0, 1]`,
and `<confidence>` is an optional confidence in `[0, 1]`.

Unlabeled images have no corresponding TXT file in `labels/`. The label file
path for each image is obtained by replacing `images/` with `labels/` in the
respective image path.

The image and labels directories for a given split may contain nested
subfolders of parallelly organized images and labels.

.. note::

    By default, all annotations are loaded as |Detections|, converting any
    polylines to tight bounding boxes if necessary. However, you can choose to
    load YOLO annotations as |Polylines| by passing the optional `label_type`
    argument to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>`:

    .. code-block:: python

        # Load annotations as polygons
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.YOLOv5Dataset,
            label_type="polylines",
            ...
        )

    See :class:`YOLOv5DatasetImporter <fiftyone.utils.yolo.YOLOv5DatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a YOLOv5 dataset stored in the above
format as follows:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    name = "my-dataset"
    dataset_dir = "/path/to/yolov5-dataset"

    # The splits to load
    splits = ["train", "val"]

    # Load the dataset, using tags to mark the samples in each split
    dataset = fo.Dataset(name)
    for split in splits:
        dataset.add_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.YOLOv5Dataset,
            split=split,
            tags=split,
    )

    # View summary info about the dataset
    print(dataset)

    # Print the first few samples in the dataset
    print(dataset.head())

If you have an existing dataset and corresponding model predictions stored in
YOLO format, then you can use
:func:`add_yolo_labels() <fiftyone.utils.yolo.add_yolo_labels>` to conveniently
add the labels to the dataset.

The example below demonstrates a round-trip export and then re-import of both
images-and-labels and labels-only data in YOLO format:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.yolo as fouy

    dataset = foz.load_zoo_dataset("quickstart")
    classes = dataset.distinct("predictions.detections.label")

    # YOLOv5 format supports splits, so let's grab only the `validation` split
    view = dataset.match_tags("validation")

    # Export images and ground truth labels to disk
    view.export(
        export_dir="/tmp/yolov5",
        dataset_type=fo.types.YOLOv5Dataset,
        split="validation",
        label_field="ground_truth",
        classes=classes,
    )

    # Export predictions
    view.export(
        dataset_type=fo.types.YOLOv5Dataset,
        labels_path="/tmp/yolov5/predictions/validation",
        label_field="predictions",
        classes=classes,
    )

    # Now load ground truth labels into a new dataset
    dataset2 = fo.Dataset.from_dir(
        dataset_dir="/tmp/yolov5",
        dataset_type=fo.types.YOLOv5Dataset,
        split="validation",
        label_field="ground_truth",
    )

    # And add model predictions
    fouy.add_yolo_labels(
        dataset2,
        "predictions",
        "/tmp/yolov5/predictions/validation",
        classes,
    )

    # Verify that ground truth and predictions were imported as expected
    print(view.count("ground_truth.detections"))
    print(dataset2.count("ground_truth.detections"))
    print(view.count("predictions.detections"))
    print(dataset2.count("predictions.detections"))

.. note::

    See :func:`add_yolo_labels() <fiftyone.utils.yolo.add_yolo_labels>` for a
    complete description of the available syntaxes for loading YOLO-formatted
    predictions to an existing dataset.

.. _TFObjectDetectionDataset-import:

TFObjectDetectionDataset
------------------------

The :class:`fiftyone.types.TFObjectDetectionDataset` type represents a labeled
dataset consisting of images and their associated object detections stored as
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

.. note::

    See :class:`TFObjectDetectionDatasetImporter <fiftyone.utils.tf.TFObjectDetectionDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from an object detection dataset stored as a
directory of TFRecords in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/tf-object-detection-dataset"
        images_dir = "/path/for/images"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.TFObjectDetectionDataset,
            images_dir=images_dir,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

    When the above command is executed, the images in the TFRecords will be
    written to the provided `images_dir`, which is required because FiftyOne
    datasets must make their images available as individual files on disk.

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/tf-object-detection-dataset
        IMAGES_DIR=/path/for/images

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.TFObjectDetectionDataset \
            --kwargs images_dir=$IMAGES_DIR

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    When the above command is executed, the images in the TFRecords will be
    written to the provided `IMAGES_DIR`, which is required because FiftyOne
    datasets must make their images available as individual files on disk.

    To view an object detection dataset stored as a directory of TFRecords in
    the FiftyOne App without creating a persistent FiftyOne dataset, you can
    execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/tf-object-detection-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.TFObjectDetectionDataset

.. note::

    You can provide the `tf_records_path` argument instead of `dataset_dir` in
    the examples above to directly specify the path to the TFRecord(s) to load.
    See :class:`TFObjectDetectionDatasetImporter <fiftyone.utils.tf.TFObjectDetectionDatasetImporter>`
    for details.

.. _ImageSegmentationDirectory-import:

ImageSegmentationDirectory
--------------------------

The :class:`fiftyone.types.ImageSegmentationDirectory` type represents a
labeled dataset consisting of images and their associated semantic
segmentations stored as images on disk.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename1>.<ext>
            <filename2>.<ext>
            ...
        labels/
            <filename1>.<ext>
            <filename2>.<ext>
            ...

where `labels/` contains the semantic segmentations stored as images.

Unlabeled images have no corresponding file in `labels/`.

The `data/` and `labels/` files may contain nested subfolders of parallelly
organized images and masks.

.. note::

    See :class:`ImageSegmentationDirectoryImporter <fiftyone.utils.data.importers.ImageSegmentationDirectoryImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from an image segmentation dataset stored in
the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/image-segmentation-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/image-segmentation-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.ImageSegmentationDirectory

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view an image segmentation dataset stored in the above format in the
    FiftyOne App without creating a persistent FiftyOne dataset, you
    can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/image-segmentation-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.ImageSegmentationDirectory

You can also independently specify the locations of the masks and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/masks"

        # Import dataset by explicitly providing paths to the source media and masks
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.ImageSegmentationDirectory,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/masks

        # Import dataset by explicitly providing paths to the source media and masks
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.ImageSegmentationDirectory \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. _CVATImageDataset-import:

CVATImageDataset
----------------

The :class:`fiftyone.types.CVATImageDataset` type represents a labeled dataset
consisting of images and their associated tags and object detections stored in
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
                <id>0</id>
                <name>task-name</name>
                <size>51</size>
                <mode>annotation</mode>
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
                        <name>traffic_line</name>
                        <attributes>
                            <attribute>
                                <name>color</name>
                                <values>white\\nyellow</values>
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
            <dumped>2017-11-20 11:51:51.000000+00:00</dumped>
        </meta>
        <image id="0" name="<uuid1>.<ext>" width="640" height="480">
            <tag label="urban"></tag>
            ...
            <box label="car" xtl="100" ytl="50" xbr="325" ybr="190" occluded="0">
                <attribute name="type">sedan</attribute>
                ...
            </box>
            ...
            <polygon label="car" points="561.30,916.23;561.30,842.77;...;560.20,966.67" occluded="0">
                <attribute name="make">Honda</attribute>
                ...
            </polygon>
            ...
            <polyline label="traffic_line" points="462.10,0.00;126.80,1200.00" occluded="0">
                <attribute name="color">yellow</attribute>
                ...
            </polyline>
            ...
            <points label="wheel" points="574.90,939.48;1170.16,907.90;...;600.16,459.48" occluded="0">
                <attribute name="location">front_driver_side</attribute>
                ...
            </points>
            ...
        </image>
        ...
        <image id="50" name="<uuid51>.<ext>" width="640" height="480">
            ...
        </image>
    </annotations>

Unlabeled images have no corresponding `image` tag in `labels.xml`.

The `name` field of the `<image>` tags in the labels file encodes the location
of the corresponding images, which can be any of the following:

-   The filename of an image in the `data/` folder
-   A relative path like `data/sub/folder/filename.ext` specifying the relative
    path to the image in a nested subfolder of `data/`
-   An absolute path to an image, which may or may not be in the `data/` folder

.. note::

    See :class:`CVATImageDatasetImporter <fiftyone.utils.cvat.CVATImageDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a CVAT image dataset stored in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/cvat-image-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.CVATImageDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/cvat-labels.xml"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.CVATImageDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/cvat-labels.xml

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.CVATImageDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    If the `name` key of your labels contains absolute paths to the source
    media, then you can omit the `data_path` parameter from the example above.

.. _CVATVideoDataset-import:

CVATVideoDataset
----------------

The :class:`fiftyone.types.CVATVideoDataset` type represents a labeled dataset
consisting of videos and their associated object detections stored in
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
                        <name>traffic_line</name>
                        <attributes>
                            <attribute>
                                <name>color</name>
                                <values>white\\nyellow</values>
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
        <track id="1" label="car">
            <polygon frame="0" points="561.30,916.23;561.30,842.77;...;560.20,966.67" outside="0" occluded="0" keyframe="1">
                <attribute name="make">Honda</attribute>
                ...
            </polygon>
            ...
        </track>
        ...
        <track id="10" label="traffic_line">
            <polyline frame="10" points="462.10,0.00;126.80,1200.00" outside="0" occluded="0" keyframe="1">
                <attribute name="color">yellow</attribute>
                ...
            </polyline>
            ...
        </track>
        ...
        <track id="88" label="wheel">
            <points frame="176" points="574.90,939.48;1170.16,907.90;...;600.16,459.48" outside="0" occluded="0" keyframe="1">
                <attribute name="location">front_driver_side</attribute>
                ...
            </points>
            ...
        </track>
    </annotations>

Unlabeled videos have no corresponding file in `labels/`.

The `data/` and `labels/` files may contain nested subfolders of parallelly
organized images and labels.

.. note::

    See :class:`CVATVideoDatasetImporter <fiftyone.utils.cvat.CVATVideoDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a CVAT video dataset stored in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/cvat-video-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.CVATVideoDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/cvat-labels"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.CVATVideoDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/cvat-labels

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.CVATVideoDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. _OpenLABELImageDataset-import:

OpenLABELImageDataset
---------------------

The :class:`fiftyone.types.OpenLABELImageDataset` type represents a labeled
dataset consisting of images and their associated multitask predictions stored =
in `OpenLABEL format <https://www.asam.net/index.php?eID=dumpFile&t=f&f=3876&token=413e8c85031ae64cc35cf42d0768627514868b2f>`_.

OpenLABEL is a flexible format which allows labels to be stored in a variety of
different ways with respect to the corresponding media files. The following
enumerates the possible structures in which media data and OpenLABEL formatted
label files can be stored in ways that is understood by FiftyOne:

1. One label file per image. Each label contains only the metadata and labels
   associated with the image of the same name. In this case, the `labels_path`
   argument is expected to be a directory, if provided:

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

2. One label file for all images. The label file contains all of the metadata
   and labels associated with every image. In this case, there needs to be
   additional information provided in the label file to match labels to
   images. Specifically, the image filepath corresponding to a label must be
   stored as a stream:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.json

3. Multiple label files, each corresponding to one or more images. This case is
   similar to when there is a single label file, except that the label
   information may be spread out over multiple files. Since the filenames
   cannot be used to match labels to images, the image filepaths must again be
   stored as streams in the labels files:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels/
            <labels-filename1>.json
            <labels-filename2>.json
            ...

As for the actual structure of the labels files themselves, labels are stored
in one or more JSON files and can follow a variety of formats. In general
following this format:

.. note::

    All object information stored in the `frames` key is applied to the
    corresponding image.

.. code-block:: text

    {
        "openlabel": {
            "metadata": {
                "schema_version": "1.0.0",
                "uri": "/path/to/<uuid>.<ext>",
            },
            "objects": {
                "object_uuid1": {
                    "name": "instance1",
                    "type": "label1",
                    "object_data": {
                        "bbox": [
                            {
                                "name": "shape",
                                "val": [
                                    center-x,
                                    center-y,
                                    width,
                                    height
                                ]
                            }
                        ]
                    }
                },
                "object_uuid2": {
                    "name": "instance1",
                    "type": "label2",
                    "object_data": {},  # DEFINED IN FRAMES
                }
            },
            "frames": {
                "0": {
                   "frame_properties": {
                      "streams": {
                         "Camera1": {
                            "uri": "<uuid>.<ext>"
                         }
                      }
                   },
                   "objects": {
                      "object_uuid2": {
                         "object_data": {
                            "poly2d": [
                               {
                                  "attributes": {
                                     "boolean": [
                                        {
                                           "name": "is_hole",
                                           "val": false
                                        }
                                     ],
                                     "text": [
                                        {  # IF NOT PROVIDED OTHERWISE
                                           "name": "stream",
                                           "val": "Camera1"
                                        }
                                     ]
                                  },
                                  "closed": true,
                                  "mode": "MODE_POLY2D_ABSOLUTE",
                                  "name": "polygon_name",
                                  "stream": "Camera1",  # IF NOT IN ATTRIBUTES
                                  "val": [
                                     point1-x,
                                     point1-y,
                                     point2-x,
                                     point2-y,
                                     ...
                                  ]
                               }
                            ]
                         }
                      }
                  }
               }
            },
            "streams": {
               "Camera1": {
                  "description": "",
                  "stream_properties": {
                     "height": 480,
                     "width": 640
                  },
                  "type": "camera"
               }
            },
            "ontologies": ... # NOT PARSED
            "relations": ... # NOT PARSED
            "resources": ... # NOT PARSED
            "tags": ... # NOT PARSED
        }
    }

.. note::

    See :class:`OpenLABELImageDatasetImporter <fiftyone.utils.openlabel.OpenLABELImageDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

If loading |Keypoints| related to a given |KeypointSkeleton|, then you can
provide a `skeleton` and `skeleton_key` argument to the
:class:`OpenLABELImageDatasetImporter <fiftyone.utils.openlabel.OpenLABELImageDatasetImporter>`
allowing you to match points in your annotations file to labels in the
|KeypointSkeleton| and load the points and their attributes in the correct
order.

You can create a FiftyOne dataset from a OpenLABEL image dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/openlabel-image-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.OpenLABELImageDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/openlabel-image-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.OpenLABELImageDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a OpenLABEL image dataset stored in the above format in the
    FiftyOne App without creating a persistent FiftyOne dataset, you can
    execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/openlabel-image-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.OpenLABELImageDataset

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"

        labels_path = "/path/to/openlabel-labels.json"
        # labels_path = "/path/to/openlabel-labels"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.OpenLABELImageDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images

        LABELS_PATH=/path/to/openlabel-labels.json
        # LABELS_PATH=/path/to/openlabel-labels

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.OpenLABELImageDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    OpenLABEL is a flexible format that allows for many user-specific
    decisions about how to represent labels and metadata. If you have
    OpenLABEL-compliant data in a format not understood by the current
    importers, please make an issue or contribute a pull request!

.. _OpenLABELVideoDataset-import:

OpenLABELVideoDataset
---------------------

The :class:`fiftyone.types.OpenLABELVideoDataset` type represents a labeled
dataset consisting of videos and their associated multitask predictions stored
in `OpenLABEL format <https://www.asam.net/index.php?eID=dumpFile&t=f&f=3876&token=413e8c85031ae64cc35cf42d0768627514868b2f>`_.

OpenLABEL is a flexible format which allows labels to be stored in a variety of
different ways with respect to the corresponding media files. The following
enumerates the possible structures in which media data and OpenLABEL formatted
label files can be stored in ways that is understood by FiftyOne:

1. One label file per video. Each label contains only the metadata and labels
   associated with the video of the same name. In this case, the `labels_path`
   argument is expected to be a directory, if provided:

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

2. One label file for all videos. The label file contains all of the metadata
   and labels associated with every video. In this case, there needs to be
   additional information provided in the label file to match labels to
   videos. Specifically, the video filepath corresponding to a label must be
   stored as a stream:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.json

3. Multiple label files, each corresponding to one or more videos. This case is
   similar to when there is a single label file, except that the label
   information may be spread out over multiple files. Since the filenames
   cannot be used to match labels to videos, the video filepaths must again be
   stored as streams in the labels files:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels/
            <labaels-filename1>.json
            <labaels-filename2>.json
            ...

As for the actual structure of the labels files themselves, labels are stored
in one or more JSON files and can follow a variety of formats. In general
following this format:

.. code-block:: text

    {
        "openlabel": {
            "metadata": {
                "schema_version": "1.0.0",
                "uri": "/path/to/<uuid>.<ext>",
            },
            "objects": {
                "object_uuid1": {
                    "name": "instance1",
                    "type": "label1",
                    "object_data": {
                        "bbox": [
                            {
                                "name": "shape",
                                "val": [
                                    center-x,
                                    center-y,
                                    width,
                                    height
                                ]
                            }
                        ]
                    }
                    "frame_intervals": [{"frame_start": 0, "frame_end": 10}],
                },
                "object_uuid2": {
                    "name": "instance1",
                    "type": "label2",
                    "object_data": {},  # DEFINED IN FRAMES
                }
            },
            "frames": {
                "0": {
                   "frame_properties": {
                      "streams": {
                         "Camera1": {
                            "uri":"<uuid>.<ext>"
                         }
                      }
                   },
                   "objects": {
                      "object_uuid2": {
                         "object_data": {
                            "poly2d": [
                               {
                                  "attributes": {
                                     "boolean": [
                                        {
                                           "name": "is_hole",
                                           "val": false
                                        }
                                     ],
                                     "text": [
                                        {  # IF NOT PROVIDED OTHERWISE
                                           "name": "stream",
                                           "val": "Camera1"
                                        }
                                     ]
                                  },
                                  "closed": true,
                                  "mode": "MODE_POLY2D_ABSOLUTE",
                                  "name": "polygon_name",
                                  "stream": "Camera1",  # IF NOT IN ATTRIBUTES
                                  "val": [
                                     point1-x,
                                     point1-y,
                                     point2-x,
                                     point2-y,
                                     ...
                                  ]
                               }
                            ]
                         }
                      }
                  },
                  ...
               }
            },
            "streams": {
               "Camera1": {
                  "description": "",
                  "stream_properties": {
                     "height": 480,
                     "width": 640
                  },
                  "type": "camera"
               }
            },
            "ontologies": ...  # NOT PARSED
            "relations" ...  # NOT PARSED
            "resources" ...  # NOT PARSED
            "tags": ...  # NOT PARSED
        }
    }

.. note::

    See :class:`OpenLABELVideoDatasetImporter <fiftyone.utils.openlabel.OpenLABELVideoDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

If loading |Keypoints| related to a given |KeypointSkeleton|, then you can
provide a `skeleton` and `skeleton_key` argument to the
:class:`OpenLABELVideoDatasetImporter <fiftyone.utils.openlabel.OpenLABELVideoDatasetImporter>`
allowing you to match points in your annotations file to labels in the
|KeypointSkeleton| and load the points and their attributes in the correct
order.

You can create a FiftyOne dataset from a OpenLABEL video dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/openlabel-video-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.OpenLABELVideoDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/openlabel-video-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.OpenLABELVideoDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a OpenLABEL video dataset stored in the above format in the FiftyOne
    App without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/openlabel-video-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.OpenLABELVideoDataset

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/videos"

        labels_path = "/path/to/openlabel-labels.json"
        # labels_path = "/path/to/openlabel-labels"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.OpenLABELVideoDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/videos

        LABELS_PATH=/path/to/openlabel-labels.json
        # LABELS_PATH=/path/to/openlabel-labels

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.OpenLABELVideoDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    OpenLABEL is a flexible format that allows for many user-specific
    decisions about how to represent labels and metadata. If you have
    OpenLABEL-compliant data in a format not understood by the current
    importers, please make an issue or contribute a pull request!

.. _FiftyOneImageLabelsDataset-import:

FiftyOneImageLabelsDataset
--------------------------

The :class:`fiftyone.types.FiftyOneImageLabelsDataset` type represents a
labeled dataset consisting of images and their associated multitask predictions
stored in
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

.. note::

    See :class:`FiftyOneImageLabelsDatasetImporter <fiftyone.utils.data.importers.FiftyOneImageLabelsDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from an image labels dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/image-labels-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.FiftyOneImageLabelsDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

The :class:`fiftyone.types.FiftyOneVideoLabelsDataset` type represents a
labeled dataset consisting of videos and their associated labels stored in
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

.. note::

    See :class:`FiftyOneVideoLabelsDatasetImporter <fiftyone.utils.data.importers.FiftyOneVideoLabelsDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a video labels dataset stored in the
above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/video-labels-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.FiftyOneVideoLabelsDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

The :class:`fiftyone.types.BDDDataset` type represents a labeled dataset
consisting of images and their associated multitask predictions saved in
`Berkeley DeepDrive (BDD) format <http://bdd-data.berkeley.edu>`_.

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
                    },
                    "score": 0.95
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
                    ],
                    "score": 0.87
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
                    "score": 0.98
                },
                ...
            }
        }
        ...
    ]

Unlabeled images have no corresponding entry in `labels.json`.

The `name` attribute of the labels file encodes the location of the
corresponding images, which can be any of the following:

-   The filename of an image in the `data/` folder
-   A relative path like `data/sub/folder/filename.ext` specifying the relative
    path to the image in a nested subfolder of `data/`
-   An absolute path to an image, which may or may not be in the `data/` folder

.. note::

    See :class:`BDDDatasetImporter <fiftyone.utils.bdd.BDDDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a BDD dataset stored in the above format
as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/bdd-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.BDDDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/bdd-labels.json"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.BDDDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/bdd-labels.json

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.BDDDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    If the `name` key of your labels contains absolute paths to the source
    media, then you can omit the `data_path` parameter from the example above.

.. _CSVDataset-import:

CSVDataset
----------

The :class:`fiftyone.types.CSVDataset` type represents a dataset consisting
of images or videos and their associated field values stored as columns of a
CSV file.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename1>.<ext>
            <filename2>.<ext>
            ...
        labels.csv

where `labels.csv` is a CSV file in the following format:

.. code-block:: text

    field1,field2,field3,...
    value1,value2,value3,...
    value1,value2,value3,...
    ...

One sample will be generated per row in the CSV file (excluding the header
row).

One column of the CSV file must contain media paths, which may be either:

-   filenames or relative paths to media files in ``data/``
-   absolute paths to media files

By default it is assumed that a ``filepath`` column exists and contains the
media paths, but you can customize this via the optional ``media_field``
parameter.

By default all columns are loaded as string fields, but you can provide the
optional ``fields`` parameter to select a subset of columns to load or provide
custom parsing functions for each field, as demonstrated below.

.. note::

    See :class:`CSVDatasetImporter <fiftyone.utils.csv.CSVDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a CSV dataset stored in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/csv-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.CSVDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/csv-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.CSVDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a CSV dataset stored in the above format in the FiftyOne App
    without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/csv-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.CSVDataset

If your CSV file contains absolute media paths, then you can directly specify
the path to the CSV file itself by providing the `labels_path` parameter.

Additionally, you can use the `fields` parameter to customize how each field is
parsed, as demonstrated below:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        labels_path = "/path/to/labels.csv"

        fields = {
            "filepath": None,  # load as strings
            "tags": lambda v: v.strip("").split(","),
            "float_field": lambda v: float(v),
            "weather": lambda v: fo.Classification(label=v) if v else None,
        }

        # Import CSV file with absolute media paths and custom field parsers
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.CSVDataset,
            labels_path=labels_path,
            fields=fields,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/to/labels.csv

        # Import CSV file with absolute media paths
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.CSVDataset \
            --kwargs labels_path=$LABELS_PATH

.. _DICOMDataset-import:

DICOMDataset
------------

The :class:`fiftyone.types.DICOMDataset` type represents a dataset consisting
of images and their associated properties stored in
`DICOM format <https://en.wikipedia.org/wiki/DICOM>`_.

.. note::

    You must have `pydicom<3 <https://github.com/pydicom/pydicom>`_ installed
    in order to load DICOM datasets.

The standard format for datasets of this type is the following:

.. code-block:: text

    <dataset_dir>/
        <filename1>.dcm
        <filename2>.dcm

where each `.dcm` file is a DICOM file that can be read via
:func:`pydicom.dcmread <pydicom:pydicom.filereader.dcmread>`.

Alternatively, rather than providing a ``dataset_dir``, you can provide the
``dicom_path`` argument, which can directly specify a glob pattern of DICOM
files or the path to a
`DICOMDIR <https://pydicom.github.io/pydicom/stable/tutorials/filesets.html>`_
file.

By default, all attributes in the DICOM files discoverable via
:meth:`pydicom:pydicom.dataset.Dataset.dir` with supported types are loaded
into sample-level fields, but you can select only specific attributes by
passing the optional ``keywords`` argument.

.. note::

    When importing DICOM datasets, the pixel data are converted to 8-bit
    images, using the ``SmallestImagePixelValue`` and
    ``LargestImagePixelValue`` attributes (if present), to inform the
    conversion.

    The images are written to a backing directory that you can configure by
    passing the ``images_dir`` argument. By default, the images are written to
    ``dataset_dir``.

    Currently, only single frame images are supported, but a community
    contribution to support 3D or 4D image types (e.g., CT scans) is welcomed!

.. note::

    See :class:`DICOMDatasetImporter <fiftyone.utils.dicom.DICOMDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a DICOM dataset stored in standard
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/dicom-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.DICOMDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/dicom-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.DICOMDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

You can create a FiftyOne dataset from a glob pattern of DICOM files or the
path to a DICOMDIR file as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"

        dicom_path = "/path/to/*.dcm"  # glob pattern of DICOM files
        # dicom_path = "/path/to/DICOMDIR"  # DICOMDIR file

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dicom_path=dicom_path,
            dataset_type=fo.types.DICOMDataset,
            keywords=["PatientName", "StudyID"],  # load specific attributes
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset

        DICOM_PATH='/path/to/*.dcm'  # glob pattern of DICOM files
        # DICOM_PATH='/path/to/DICOMDIR'  # DICOMDIR file

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.DICOMDataset \
            --kwargs \
                dicom_path=$DICOM_PATH \
                keywords=PatientName,StudyID  # load specific attributes

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

.. _GeoJSONDataset-import:

GeoJSONDataset
--------------

The :class:`fiftyone.types.GeoJSONDataset` type represents a dataset consisting
of images or videos and their associated geolocation data and optional
properties stored in `GeoJSON format <https://en.wikipedia.org/wiki/GeoJSON>`_.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename1>.<ext>
            <filename2>.<ext>
            ...
        labels.json

where `labels.json` is a GeoJSON file containing a `FeatureCollection` in the
following format:

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

where the `geometry` field may contain any valid GeoJSON geometry object, and
the `filename` property encodes the name of the corresponding media in the
`data/` folder. The `filename` property can also be an absolute path, which
may or may not be in the `data/` folder.

Samples with no location data will have a null `geometry` field.

The `properties` field of each feature can contain additional labels that
can be imported.

.. note::

    See :class:`GeoJSONDatasetImporter <fiftyone.utils.geojson.GeoJSONDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a GeoJSON dataset stored in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/geojson-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.GeoJSONDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/geojson-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.GeoJSONDataset

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

    To view a GeoJSON dataset stored in the above format in the FiftyOne App
    without creating a persistent FiftyOne dataset, you can execute:

    .. code-block:: shell

        DATASET_DIR=/path/to/geojson-dataset

        # View the dataset in the App
        fiftyone app view \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.GeoJSONDataset

You can also independently specify the locations of the labels and the root
directory containing the corresponding media files by providing the
`labels_path` and `data_path` parameters rather than `dataset_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        data_path = "/path/to/images"
        labels_path = "/path/to/geo-labels.json"

        # Import dataset by explicitly providing paths to the source media and labels
        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.GeoJSONDataset,
            data_path=data_path,
            labels_path=labels_path,
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATA_PATH=/path/to/images
        LABELS_PATH=/path/to/geo-labels.json

        # Import dataset by explicitly providing paths to the source media and labels
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.GeoJSONDataset \
            --kwargs \
                data_path=$DATA_PATH \
                labels_path=$LABELS_PATH

.. note::

    If the `filename` key of your labels contains absolute paths to the source
    media, then you can omit the `data_path` parameter from the example above.

.. _GeoTIFFDataset-import:

GeoTIFFDataset
--------------

The :class:`fiftyone.types.GeoTIFFDataset` type represents a dataset consisting
of images and their associated geolocation data stored in
`GeoTIFF format <https://en.wikipedia.org/wiki/GeoTIFF>`_.

.. note::

    You must have `rasterio <https://github.com/mapbox/rasterio>`_ installed in
    order to load GeoTIFF datasets.

The standard format for datasets of this type is the following:

.. code-block:: text

    <dataset_dir>/
        <filename1>.tif
        <filename2>.tif

where each `.tif` file is a GeoTIFF image that can be read via
:func:`rasterio.open <rasterio:rasterio.open>`.

Alternatively, rather than providing a ``dataset_dir``, you can provide the
``image_path`` argument, which can directly specify a list or glob pattern of
GeoTIFF images to load.

The dataset will contain a |GeoLocation| field whose
:attr:`point <fiftyone.core.labels.GeoLocation.point>` attribute contains the
`(longitude, latitude)` coordinates of each image center and whose
:attr:`polygon <fiftyone.core.labels.GeoLocation.polygon>` attribute contains
the `(longitude, latitude)` coordinates of the corners of the image (clockwise,
starting from the top-left corner).

.. note::

    See :class:`GeoTIFFDatasetImporter <fiftyone.utils.geotiff.GeoTIFFDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a GeoTIFF dataset stored in standard
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/geotiff-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.GeoTIFFDataset,
            label_field="location",
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/geotiff-dataset

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.GeoTIFFDataset \
            --kwargs label_field=location

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

You can create a FiftyOne dataset from a list or glob pattern of GeoTIFF images
as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        image_path = "/path/to/*.tif"  # glob pattern of GeoTIFF images
        # image_path = ["/path/to/image1.tif", ...]  # list of GeoTIFF images

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            image_path=image_path,
            dataset_type=fo.types.GeoTIFFDataset,
            label_field="location",
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        IMAGE_PATH='/path/to/*.tif'  # glob pattern of GeoTIFF images
        # IMAGE_PATH='/path/to/image1.tif,...'  # list of GeoTIFF images

        # Create the dataset
        fiftyone datasets create \
            --name $NAME \
            --type fiftyone.types.GeoTIFFDataset \
            --kwargs \
                image_path=$IMAGE_PATH \
                label_field=location

        # View summary info about the dataset
        fiftyone datasets info $NAME

        # Print the first few samples in the dataset
        fiftyone datasets head $NAME

.. _FiftyOneDataset-import:

FiftyOneDataset
---------------

The :class:`fiftyone.types.FiftyOneDataset` provides a disk representation of
an entire |Dataset| in a serialized JSON format along with its source media.

Datasets of this type are read in the following format:

.. code-block:: text

    <dataset_dir>/
        metadata.json
        samples.json
        data/
            <filename1>.<ext>
            <filename2>.<ext>
            ...
        annotations/
            <anno_key1>.json
            <anno_key2>.json
            ...
        brain/
            <brain_key1>.json
            <brain_key2>.json
            ...
        evaluations/
            <eval_key1>.json
            <eval_key2>.json
            ...

where `metadata.json` is a JSON file containing metadata associated with the
dataset, `samples.json` is a JSON file containing a serialized representation
of the samples in the dataset, `annotations/` contains any serialized
|AnnotationResults|, `brain/` contains any serialized |BrainResults|, and
`evaluations/` contains any serialized |EvaluationResults|.

The contents of the `data/` directory may also be organized in nested
subfolders, depending on how the dataset was exported, in which case the
filepaths in `samples.json` should contain corerspondingly nested paths.

Video datasets have an additional `frames.json` file that contains a serialized
representation of the frame labels for each video in the dataset.

.. note::

    See :class:`FiftyOneDatasetImporter <fiftyone.utils.data.importers.FiftyOneDatasetImporter>`
    for parameters that can be passed to methods like
    :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
    customize the import of datasets of this type.

You can create a FiftyOne dataset from a directory in the above format as
follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/fiftyone-dataset"

        # Create the dataset
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.FiftyOneDataset,
            name=name,
        )

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
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

If you performed a :ref:`FiftyOneDataset export <FiftyOneDataset-export>`
using the `rel_dir` parameter to strip a common prefix from the media filepaths
in the dataset, then simply include the `rel_dir` parameter when importing back
into FiftyOne to prepend the appropriate prefix to each media path:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        name = "my-dataset"
        dataset_dir = "/path/to/fiftyone-dataset"

        # Import dataset, prepending `rel_dir` to each media path
        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            dataset_type=fo.types.FiftyOneDataset,
            rel_dir="/common/images/dir",
            name=name,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        DATASET_DIR=/path/to/fiftyone-dataset

        # Import dataset, prepending `rel_dir` to each media path
        fiftyone datasets create \
            --name $NAME \
            --dataset-dir $DATASET_DIR \
            --type fiftyone.types.FiftyOneDataset \
            --kwargs rel_dir=/common/images/dir

.. note::

    Exporting in :ref:`FiftyOneDataset format <FiftyOneDataset-export>` using
    the `export_media=False` and `rel_dir` parameters is a convenient way to
    transfer datasets between work environments, since this enables you to
    store the media files wherever you wish in each environment and then simply
    provide the appropriate `rel_dir` value as shown above when importing the
    dataset into FiftyOne in a new environment.

.. _custom-dataset-importer:

Custom formats
--------------

If your data does not follow one of the previous formats, then the simplest and
most flexible approach to loading your data into FiftyOne is :ref:`to iterate over
your data in a Python loop<loading-custom-datasets>` and add it to a |Dataset|.

Alternatively, the |Dataset| class provides a
:meth:`Dataset.from_importer() <fiftyone.core.dataset.Dataset.from_importer>`
factory method that can be used to import a dataset using any |DatasetImporter|
instance.

This means that you can define your own |DatasetImporter| class and then import
a dataset from disk in your custom format using the following recipe:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # Create an instance of your custom dataset importer
    importer = CustomDatasetImporter(...)

    # Import the dataset
    dataset = fo.Dataset.from_importer(importer)

You can also define a custom |DatasetType| type, which enables you to import
datasets in your custom format using the
:meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` factory
method:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # The `fiftyone.types.Dataset` subclass for your custom dataset
    dataset_type = CustomDataset

    # Import the dataset
    dataset = fo.Dataset.from_dir(dataset_type=dataset_type, ...)

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
                dataset_dir (None): the dataset directory. This may be optional for
                    some importers
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self,
                dataset_dir=None,
                shuffle=False,
                seed=None,
                max_samples=None,
                **kwargs,
            ):
                super().__init__(
                    dataset_dir=dataset_dir,
                    shuffle=shuffle,
                    seed=seed,
                    max_samples=max_samples
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
        importer = CustomUnlabeledImageDatasetImporter(...)

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
                dataset_dir (None): the dataset directory. This may be optional for
                    some importers
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self,
                dataset_dir=None,
                shuffle=False,
                seed=None,
                max_samples=None,
                **kwargs,
            ):
                super().__init__(
                    dataset_dir=dataset_dir,
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
                -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
                    this case, the importer can produce a single label field of any of
                    these types
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
        importer = CustomLabeledImageDatasetImporter(...)
        label_field = ...

        if isinstance(label_field, dict):
            label_key = lambda k: label_field.get(k, k)
        elif label_field is not None:
            label_key = lambda k: label_field + "_" + k
        else:
            label_field = "ground_truth"
            label_key = lambda k: k

        with importer:
            for image_path, image_metadata, label in importer:
                sample = fo.Sample(filepath=image_path, metadata=image_metadata)

                if isinstance(label, dict):
                    sample.update_fields({label_key(k): v for k, v in label.items()})
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
                dataset_dir (None): the dataset directory. This may be optional for
                    some importers
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self,
                dataset_dir=None,
                shuffle=False,
                seed=None,
                max_samples=None,
                **kwargs,
            ):
                super().__init__(
                    dataset_dir=dataset_dir,
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
        importer = CustomUnlabeledVideoDatasetImporter(...)

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
                dataset_dir (None): the dataset directory. This may be optional for
                    some importers
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self,
                dataset_dir=None,
                shuffle=False,
                seed=None,
                max_samples=None,
                **kwargs,
            ):
                super().__init__(
                    dataset_dir=dataset_dir,
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
                -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
                    this case, the importer can produce a single sample-level label
                    field of any of these types
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
                -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
                    this case, the importer can produce a single frame label field of
                    any of these types
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
        importer = CustomLabeledVideoDatasetImporter(...)
        label_field = ...

        if isinstance(label_field, dict):
            label_key = lambda k: label_field.get(k, k)
        elif label_field is not None:
            label_key = lambda k: label_field + "_" + k
        else:
            label_field = "ground_truth"
            label_key = lambda k: k

        with importer:
            for video_path, video_metadata, label, frames in importer:
                sample = fo.Sample(filepath=video_path, metadata=video_metadata)

                if isinstance(label, dict):
                    sample.update_fields({label_key(k): v for k, v in label.items()})
                elif label is not None:
                    sample[label_field] = label

                if frames is not None:
                    frame_labels = {}

                    for frame_number, _label in frames.items():
                        if isinstance(_label, dict):
                            frame_labels[frame_number] = {
                                label_key(k): v for k, v in _label.items()
                            }
                        elif _label is not None:
                            frame_labels[frame_number] = {label_field: _label}

                    sample.frames.merge(frame_labels)

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
    may be returned in a `label` value (which may contain a single |Label|
    value or a dictionary that maps field names to labels), and frame-level
    labels may be returned in a `frames` dictionary that maps frame numbers
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

  .. group-tab:: Grouped datasets

    To define a custom importer for grouped datasets, implement the
    |GroupDatasetImporter| interface.

    The pseudocode below provides a template for a custom
    |GroupDatasetImporter|:

    .. code-block:: python
        :linenos:

        import fiftyone.utils.data as foud

        class CustomGroupDatasetImporter(foud.GroupDatasetImporter):
            """Custom importer for grouped datasets.

            Args:
                dataset_dir (None): the dataset directory. This may be optional for
                    some importers
                shuffle (False): whether to randomly shuffle the order in which the
                    samples are imported
                seed (None): a random seed to use when shuffling
                max_samples (None): a maximum number of samples to import. By default,
                    all samples are imported
                **kwargs: additional keyword arguments for your importer
            """

            def __init__(
                self,
                dataset_dir=None,
                shuffle=False,
                seed=None,
                max_samples=None,
                **kwargs,
            ):
                super().__init__(
                    dataset_dir=dataset_dir,
                    shuffle=shuffle,
                    seed=seed,
                    max_samples=max_samples
                )
                # Your initialization here

            def __len__(self):
                """The total number of samples that will be imported across all group
                slices.

                Raises:
                    TypeError: if the total number is not known
                """
                # Return the total number of samples in the dataset (if known)
                pass

            def __next__(self):
                """Returns information about the next group in the dataset.

                Returns:
                    a dict mapping slice names to :class:`fiftyone.core.sample.Sample`
                    instances

                Raises:
                    StopIteration: if there are no more groups to import
                """
                # Implement loading the next group in your dataset here
                pass

            @property
            def has_dataset_info(self):
                """Whether this importer produces a dataset info dictionary."""
                # Return True or False here
                pass

            @property
            def has_sample_field_schema(self):
                """Whether this importer produces a sample field schema."""
                # Return True or False here
                pass

            @property
            def group_field(self):
                """The name of the group field to populate on each sample."""
                # This is the default, but you can customize if desired
                return "group"

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

            def get_sample_field_schema(self):
                """Returns a dictionary describing the field schema of the samples
                loaded by this importer.

                The returned dictionary should map field names to to string
                representations of :class:`fiftyone.core.fields.Field` instances
                generated by ``str(field)``.

                Returns:
                    a dict
                """
                # Return the sample schema here, if known
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
    called with a custom |GroupDatasetImporter|, the import is effectively
    performed via the pseudocode below:

    .. code-block:: python

        import fiftyone as fo

        dataset = fo.Dataset(...)
        importer = CustomGroupDatasetImporter(...)
        group_field = importer.group_field

        with importer:
            for group in importer:
                _group = fo.Group()
                for name, sample in group.items():
                    sample[group_field] = _group.element(name)
                    dataset.add_sample(sample)

            if importer.has_dataset_info:
                info = importer.get_dataset_info()
                parse_info(dataset, info)

    Note that the importer is invoked via its context manager interface, which
    automatically calls the
    :meth:`setup() <fiftyone.utils.data.importers.GroupDatasetImporter.setup>`
    and
    :meth:`close() <fiftyone.utils.data.importers.GroupDatasetImporter.close>`
    methods of the importer to handle setup/completion of the import.

    The groups in the dataset are iteratively loaded by invoking the
    :meth:`__next__() <fiftyone.utils.data.importers.GroupDatasetImporter.__next__>`
    method of the importer.

    The
    :meth:`has_dataset_info <fiftyone.utils.data.importers.GroupDatasetImporter.has_dataset_info>`
    property of the importer allows it to declare whether its
    :meth:`get_dataset_info() <fiftyone.utils.data.importers.GroupDatasetImporter.get_dataset_info>`
    method should be called after all samples have been imported to retrieve
    dataset-level information to store on the FiftyOne dataset. See
    :ref:`this section <importing-dataset-level-info>` for more information.

    The
    :meth:`group_field <fiftyone.utils.data.importers.GroupDatasetImporter.group_field>`
    property of the importer allows it to declare the name of the field in
    which to store the |Group| information for each sample.

.. _importing-dataset-level-info:

Importing dataset-level information
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The
:meth:`has_dataset_info <fiftyone.utils.data.importers.DatasetImporter.has_dataset_info>`
property of the importer allows it to declare whether its
:meth:`get_dataset_info() <fiftyone.utils.data.importers.DatasetImporter.get_dataset_info>`
method should be called after all samples have been imported to retrieve a dict
of dataset-level information to store in the
:meth:`info <fiftyone.core.dataset.Dataset.info>` property of the dataset.

As a special case, if the `info` dict contains any of the keys listed below,
these items are popped and stored in the corresponding dedicated dataset field:

-   `"classes"` key:
    :meth:`Dataset.classes <fiftyone.core.dataset.Dataset.classes>`
-   `"default_classes"` key:
    :meth:`Dataset.default_classes <fiftyone.core.dataset.Dataset.default_classes>`
-   `"mask_targets"` key:
    :meth:`Dataset.mask_targets <fiftyone.core.dataset.Dataset.mask_targets>`
-   `"default_mask_targets"` key:
    :meth:`Dataset.default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`
-   `"skeletons"` key:
    :meth:`Dataset.skeletons <fiftyone.core.dataset.Dataset.skeletons>`
-   `"default_skeleton"` key:
    :meth:`Dataset.default_skeleton <fiftyone.core.dataset.Dataset.default_skeleton>`
-   `"app_config"` key:
    :meth:`Dataset.app_config <fiftyone.core.dataset.Dataset.app_config>`

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

  .. group-tab:: Grouped datasets

    The pseudocode below provides a template for a custom |GroupDatasetType|
    subclass:

    .. code-block:: python
        :linenos:

        import fiftyone.types as fot

        class CustomGroupDataset(fot.GroupDataset):
            """Custom grouped dataset type."""

            def get_dataset_importer_cls(self):
                """Returns the
                :class:`fiftyone.utils.data.importers.GroupDatasetImporter`
                class for importing datasets of this type from disk.

                Returns:
                    a :class:`fiftyone.utils.data.importers.GroupDatasetImporter`
                    class
                """
                # Return your custom GroupDatasetImporter class here
                pass

            def get_dataset_exporter_cls(self):
                """Returns the
                :class:`fiftyone.utils.data.exporters.GroupDatasetExporter`
                class for exporting datasets of this type to disk.

                Returns:
                    a :class:`fiftyone.utils.data.exporters.GroupDatasetExporter`
                    class
                """
                # Return your custom GroupDatasetExporter class here
                pass

    Note that, as this type represents a grouped dataset, its importer must be
    a subclass of |GroupDatasetImporter|, and its exporter must be a subclass
    of |GroupDatasetExporter|.
