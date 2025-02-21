.. _exporting-datasets:

Exporting FiftyOne Datasets
===========================

.. default-role:: code

FiftyOne provides native support for exporting datasets to disk in a
variety of :ref:`common formats <supported-export-formats>`, and it can be
easily extended to export datasets in
:ref:`custom formats <custom-dataset-exporter>`.

.. note::

    Did you know? You can export media and/or labels from within the FiftyOne
    App by installing the
    `@voxel51/io <https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/io>`_
    plugin!

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
        dataset_or_view = fo.load_dataset(...)

        # The directory to which to write the exported dataset
        export_dir = "/path/for/export"

        # The name of the sample field containing the label that you wish to export
        # Used when exporting labeled datasets (e.g., classification or detection)
        label_field = "ground_truth"  # for example

        # The type of dataset to export
        # Any subclass of `fiftyone.types.Dataset` is supported
        dataset_type = fo.types.COCODetectionDataset  # for example

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=dataset_type,
            label_field=label_field,
        )

    Note the `label_field` argument in the above example, which specifies the
    particular label field that you wish to export. This is necessary if your
    FiftyOne dataset contains multiple label fields.

    The :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    method also provides additional parameters that you can use to configure
    the export. For example, you can use the `data_path` and `labels_path`
    parameters to independently customize the location of the exported media
    and labels, including labels-only exports:

    .. code-block:: python
        :linenos:

        # Export **only** labels in the `ground_truth` field in COCO format
        # with absolute image filepaths in the labels
        dataset_or_view.export(
            dataset_type=fo.types.COCODetectionDataset,
            labels_path="/path/for/export.json",
            label_field="ground_truth",
            abs_paths=True,
        )

    Or you can use the `export_media` parameter to configure whether to copy,
    move, symlink, or omit the media files from the export:

    .. code-block:: python
        :linenos:

        # Export the labels in the `ground_truth` field in COCO format, and
        # move (rather than copy) the source media to the output directory
        dataset_or_view.export(
            export_dir="/path/for/export",
            dataset_type=fo.types.COCODetectionDataset,
            label_field="ground_truth",
            export_media="move",
        )

    In general, you can pass any parameter for the |DatasetExporter| of the
    format you're writing to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`.

  .. group-tab:: CLI

    You can export a FiftyOne dataset
    :ref:`via the CLI <cli-fiftyone-datasets-export>`:

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

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type $TYPE \
            --label-field $LABEL_FIELD

    Note the `LABEL_FIELD` argument in the above example, which specifies the
    particular label field that you wish to export. This is necessary your
    FiftyOne dataset contains multiple label fields.

    You can use the :ref:`kwargs option <cli-fiftyone-datasets-export>` to
    provide additional parameters to configure the export. For example, you can
    use the `data_path` and `labels_path` parameters to independently
    customize the location of the exported media and labels, including
    labels-only exports:

    .. code-block:: shell

        # Export **only** labels in the `ground_truth` field in COCO format
        # with absolute image filepaths in the labels
        fiftyone datasets export $NAME \
            --type fiftyone.types.COCODetectionDataset \
            --label-field ground_truth \
            --kwargs \
                labels_path=/path/for/labels.json \
                abs_paths=True

    Or you can use the `export_media` parameter to configure whether to copy,
    move, symlink, or omit the media files from the export:

    .. code-block:: shell

        # Export the labels in the `ground_truth` field in COCO format, and
        # move (rather than copy) the source media to the output directory
        fiftyone datasets export $NAME \
            --export-dir /path/for/export \
            --type fiftyone.types.COCODetectionDataset \
            --label-field ground_truth \
            --kwargs export_media=move

    In general, you can pass any parameter for the |DatasetExporter| of the
    format you're writing via the
    :ref:`kwargs option <cli-fiftyone-datasets-export>`.

.. _export-label-coercion:

Label type coercion
-------------------

For your convenience, the
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` method
will automatically coerce the data to match the requested export types in a
variety of common cases listed below.

Single labels to lists
~~~~~~~~~~~~~~~~~~~~~~

Many export formats expect label list types
(|Classifications|, |Detections|, |Polylines|, or |Keypoints|). If you provide
a label field to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` that
refers to a single label type (|Classification|, |Detection|, |Polyline|, or
|Keypoint|), then the labels will be automatically upgraded to single-label
lists to match the export type's expectations.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    patches = dataset.to_patches("ground_truth")

    # The `ground_truth` field has type `Detection`, but COCO format expects
    # `Detections`, so the labels are automatically coerced to single-label lists
    patches.export(
        export_dir="/tmp/quickstart/detections",
        dataset_type=fo.types.COCODetectionDataset,
        label_field="ground_truth",
    )

Classifications as detections
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

When exporting in labeled image dataset formats that expect |Detections|
labels, if you provide a label field to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` that has
type |Classification|, the classification labels will be automatically upgraded
to detections that span the entire images.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart").limit(5).clone()

    for idx, sample in enumerate(dataset):
        sample["attribute"] = fo.Classification(label=str(idx))
        sample.save()

    # Exports the `attribute` classifications as detections that span entire images
    dataset.export(
        export_dir="/tmp/quickstart/attributes",
        dataset_type=fo.types.COCODetectionDataset,
        label_field="attribute",
    )

Object patches
~~~~~~~~~~~~~~

When exporting in either an unlabeled image or image classification format, if
a spatial label field (|Detection|, |Detections|, |Polyline|, or |Polylines|)
is provided to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>`, the
:ref:`object patches <app-object-patches>` of the provided samples will be
exported.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # No label field is provided; only images are exported
    dataset.export(
        export_dir="/tmp/quickstart/images",
        dataset_type=fo.types.ImageDirectory,
    )

    # A detections field is provided, so the object patches are exported as a
    # directory of images
    dataset.export(
        export_dir="/tmp/quickstart/patches",
        dataset_type=fo.types.ImageDirectory,
        label_field="ground_truth",
    )

    # A detections field is provided, so the object patches are exported as an
    # image classification directory tree
    dataset.export(
        export_dir="/tmp/quickstart/objects",
        dataset_type=fo.types.ImageClassificationDirectoryTree,
        label_field="ground_truth",
    )

You can also directly call
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` on
:ref:`patches views <object-patches-views>` to export the specified object
patches along with their appropriately typed labels.

.. code-block:: python
    :linenos:

    # Continuing from above...

    patches = dataset.to_patches("ground_truth")

    # Export the object patches as a directory of images
    patches.export(
        export_dir="/tmp/quickstart/also-patches",
        dataset_type=fo.types.ImageDirectory,
    )

    # Export the object patches as an image classification directory tree
    patches.export(
        export_dir="/tmp/quickstart/also-objects",
        dataset_type=fo.types.ImageClassificationDirectoryTree,
    )

Video clips
~~~~~~~~~~~

When exporting in either an unlabeled video or video classification format, if
a |TemporalDetection| or |TemporalDetections| field is provided to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>`, the
specified :ref:`video clips <app-video-clips>` will be exported.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

    # Add some temporal detections to the dataset
    sample1 = dataset.first()
    sample1["events"] = fo.TemporalDetections(
        detections=[
            fo.TemporalDetection(label="first", support=[31, 60]),
            fo.TemporalDetection(label="second", support=[90, 120]),
        ]
    )
    sample1.save()

    sample2 = dataset.last()
    sample2["events"] = fo.TemporalDetections(
        detections=[
            fo.TemporalDetection(label="first", support=[16, 45]),
            fo.TemporalDetection(label="second", support=[75, 104]),
        ]
    )
    sample2.save()

    # A temporal detection field is provided, so the clips are exported as a
    # directory of videos
    dataset.export(
        export_dir="/tmp/quickstart-video/clips",
        dataset_type=fo.types.VideoDirectory,
        label_field="events",
    )

    # A temporal detection field is provided, so the clips are exported as a
    # video classification directory tree
    dataset.export(
        export_dir="/tmp/quickstart-video/video-classifications",
        dataset_type=fo.types.VideoClassificationDirectoryTree,
        label_field="events",
    )

You can also directly call
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` on
:ref:`clip views <clip-views>` to export the specified video clips along with
their appropriately typed labels.

.. code-block:: python
    :linenos:

    # Continuing from above...

    clips = dataset.to_clips("events")

    # Export the clips as a directory of videos
    clips.export(
        export_dir="/tmp/quickstart-video/also-clips",
        dataset_type=fo.types.VideoDirectory,
    )

    # Export the clips as a video classification directory tree
    clips.export(
        export_dir="/tmp/quickstart-video/clip-classifications",
        dataset_type=fo.types.VideoClassificationDirectoryTree,
    )

    # Export the clips along with their associated frame labels
    clips.export(
        export_dir="/tmp/quickstart-video/clip-frame-labels",
        dataset_type=fo.types.FiftyOneVideoLabelsDataset,
        frame_labels_field="detections",
    )

.. _export-class-lists:

Class lists
-----------

Certain labeled image/video export formats such as
:ref:`COCO <COCODetectionDataset-export>` and
:ref:`YOLO <YOLOv5Dataset-export>` store an explicit list of classes for the
label field being exported.

By convention, all exporters provided by FiftyOne should provide a `classes`
parameter that allows for manually specifying the classes list to use.

If no explicit class list is provided, the observed classes in the collection
being exported are used, which may be a subset of the classes in the parent
dataset when exporting a view.

.. note::

    See :ref:`this section <storing-classes>` for more information about
    storing class lists on FiftyOne datasets.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    # Load 10 samples containing cats and dogs (among other objects)
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        classes=["cat", "dog"],
        shuffle=True,
        max_samples=10,
    )

    # Loading zoo datasets generally populates the `default_classes` attribute
    print(len(dataset.default_classes))  # 91

    # Create a view that only contains cats and dogs
    view = dataset.filter_labels("ground_truth", F("label").is_in(["cat", "dog"]))

    # By default, only the observed classes will be stored as COCO categories
    view.export(
        labels_path="/tmp/coco1.json",
        dataset_type=fo.types.COCODetectionDataset,
    )

    # However, if desired, we can explicitly provide a classes list
    view.export(
        labels_path="/tmp/coco2.json",
        dataset_type=fo.types.COCODetectionDataset,
        classes=dataset.default_classes,
    )

.. _supported-export-formats:

Supported formats
-----------------

Each supported dataset type is represented by a subclass of
:class:`fiftyone.types.Dataset`, which is used by the Python library and CLI to
refer to the corresponding dataset format when writing the dataset to disk.

.. table::
    :widths: 40 60

    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | Dataset Type                                                       | Description                                                                        |
    +====================================================================+====================================================================================+
    | :ref:`ImageDirectory <ImageDirectory-export>`                      | A directory of images.                                                             |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`VideoDirectory <VideoDirectory-export>`                      | A directory of videos.                                                             |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`MediaDirectory <MediaDirectory-export>`                      | A directory of media files.                                                        |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageClassificationDataset                           | A labeled dataset consisting of images and their associated classification labels  |
    | <FiftyOneImageClassificationDataset-export>`                       | in a simple JSON format.                                                           |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`ImageClassificationDirectoryTree                             | A directory tree whose subfolders define an image classification dataset.          |
    | <ImageClassificationDirectoryTree-export>`                         |                                                                                    |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`VideoClassificationDirectoryTree                             | A directory tree whose subfolders define a video classification dataset.           |
    | <VideoClassificationDirectoryTree-export>`                         |                                                                                    |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFImageClassificationDataset                                 | A labeled dataset consisting of images and their associated classification labels  |
    | <TFImageClassificationDataset-export>`                             | stored as TFRecords.                                                               |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageDetectionDataset                                | A labeled dataset consisting of images and their associated object detections      |
    | <FiftyOneImageDetectionDataset-export>`                            | stored in a simple JSON format.                                                    |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneTemporalDetectionDataset                             | A labeled dataset consisting of videos and their associated temporal detections in |
    | <FiftyOneTemporalDetectionDataset-export>`                         | a simple JSON format.                                                              |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`COCODetectionDataset                                         | A labeled dataset consisting of images and their associated object detections      |
    | <COCODetectionDataset-export>`                                     | saved in `COCO Object Detection Format <https://cocodataset.org/#format-data>`_.   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`VOCDetectionDataset                                          | A labeled dataset consisting of images and their associated object detections      |
    | <VOCDetectionDataset-export>`                                      | saved in `VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.                   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`KITTIDetectionDataset <KITTIDetectionDataset-export>`        | A labeled dataset consisting of images and their associated object detections      |
    |                                                                    | saved in `KITTI format <http://www.cvlibs.net/datasets/kitti/eval\_object.php>`_.  |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`YOLOv4Dataset <YOLOv4Dataset-export>`                        | A labeled dataset consisting of images and their associated object detections      |
    |                                                                    | saved in `YOLOv4 format <https://github.com/AlexeyAB/darknet>`_.                   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`YOLOv5Dataset <YOLOv5Dataset-export>`                        | A labeled dataset consisting of images and their associated object detections      |
    |                                                                    | saved in `YOLOv5 format <https://github.com/ultralytics/yolov5>`_.                 |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`TFObjectDetectionDataset <TFObjectDetectionDataset-export>`  | A labeled dataset consisting of images and their associated object detections      |
    |                                                                    | stored as TFRecords in `TF Object Detection API format \                           |
    |                                                                    | <https://github.com/tensorflow/models/blob/master/research/object\_detection>`_.   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`ImageSegmentationDirectory                                   | A labeled dataset consisting of images and their associated semantic segmentations |
    | <ImageSegmentationDirectory-export>`                               | stored as images on disk.                                                          |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CVATImageDataset <CVATImageDataset-export>`                  | A labeled dataset consisting of images and their associated object detections      |
    |                                                                    | stored in `CVAT image format <https://github.com/opencv/cvat>`_.                   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CVATVideoDataset <CVATVideoDataset-export>`                  | A labeled dataset consisting of videos and their associated object detections      |
    |                                                                    | stored in `CVAT video format <https://github.com/opencv/cvat>`_.                   |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneImageLabelsDataset                                   | A labeled dataset consisting of images and their associated multitask predictions  |
    | <FiftyOneImageLabelsDataset-export>`                               | stored in `ETA ImageLabels format \                                                |
    |                                                                    | <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.        |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneVideoLabelsDataset                                   | A labeled dataset consisting of videos and their associated multitask predictions  |
    | <FiftyOneVideoLabelsDataset-export>`                               | stored in `ETA VideoLabels format \                                                |
    |                                                                    | <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.        |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`BDDDataset <BDDDataset-export>`                              | A labeled dataset consisting of images and their associated multitask predictions  |
    |                                                                    | saved in `Berkeley DeepDrive (BDD) format <http://bdd-data.berkeley.edu>`_.        |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`CSVDataset <CSVDataset-export>`                              | A flexible CSV format that represents slice(s) of a dataset's values as columns of |
    |                                                                    | a CSV file.                                                                        |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`GeoJSONDataset <GeoJSONDataset-export>`                      | An image or video dataset whose location data and labels are stored in             |
    |                                                                    | `GeoJSON format <https://en.wikipedia.org/wiki/GeoJSON>`_.                         |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`FiftyOneDataset <FiftyOneDataset-export>`                    | A dataset consisting of an entire serialized |Dataset| and its associated source   |
    |                                                                    | media.                                                                             |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+
    | :ref:`Custom formats <custom-dataset-exporter>`                    | Export datasets in custom formats by defining your own |DatasetType| or            |
    |                                                                    | |DatasetExporter| class.                                                           |
    +--------------------------------------------------------------------+------------------------------------------------------------------------------------+

.. _ImageDirectory-export:

ImageDirectory
--------------

The :class:`fiftyone.types.ImageDirectory` type represents a directory of
images.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>
        ...

.. note::

    See :class:`ImageDirectoryExporter <fiftyone.utils.data.exporters.ImageDirectoryExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export the images in a FiftyOne dataset as a directory of images on
disk as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/images-dir"

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

.. _VideoDirectory-export:

VideoDirectory
--------------

The :class:`fiftyone.types.VideoDirectory` type represents a directory of
videos.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>
        ...

.. note::

    See :class:`VideoDirectoryExporter <fiftyone.utils.data.exporters.VideoDirectoryExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export the videos in a FiftyOne dataset as a directory of videos on
disk as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/videos-dir"

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir, dataset_type=fo.types.VideoDirectory
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/to/videos-dir

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.VideoDirectory

.. _MediaDirectory-export:

MediaDirectory
--------------

The :class:`fiftyone.types.MediaDirectory` type represents a directory of
media files.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        <filename1>.<ext>
        <filename2>.<ext>
        ...

.. note::

    See :class:`MediaDirectoryExporter <fiftyone.utils.data.exporters.MediaDirectoryExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export the media in a FiftyOne dataset as a directory of media files on
disk as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/media-dir"

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir, dataset_type=fo.types.MediaDirectory
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/to/media-dir

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.MediaDirectory

.. _FiftyOneImageClassificationDataset-export:

FiftyOneImageClassificationDataset
----------------------------------

.. admonition:: Supported label types
    :class: note

    |Classification|, |Classifications|

The :class:`fiftyone.types.FiftyOneImageClassificationDataset` type represents
a labeled dataset consisting of images and their associated classification
label(s) stored in a simple JSON format.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <uuid1>.<ext>
            <uuid2>.<ext>
            ...
        labels.json

In the simplest case, `labels.json` will be a JSON file in the following
format:

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

If the `classes` field is included in the JSON, the `target` values are class
IDs that are mapped to class label strings via `classes[target]`. If no
`classes` are included, then the `target` values directly store the label
strings.

The target value in `labels` for unlabeled images is `None`.

If you wish to export classifications with associated confidences and/or
additional  attributes, you can use the `include_confidence` and
`include_attributes` parameters to include this information in the export.
In this case, `labels.json` will have the following format:

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

You can also export multilabel classification fields, in which case
`labels.json` will have the following format:

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

where the target values in `labels` may be class strings, class IDs, or dicts
in the format described above defining class labels, confidences, and optional
attributes, depending on how you configured the export.

.. note::

    See :class:`FiftyOneImageClassificationDatasetExporter <fiftyone.utils.data.exporters.FiftyOneImageClassificationDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as an image classification dataset stored on
disk in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-classification-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

.. note::

    You can pass the optional `classes` parameter to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    explicitly define the class list to use in the exported labels. Otherwise,
    the strategy outlined in :ref:`this section <export-class-lists>` will be
    used to populate the class list.

You can also perform labels-only exports in this format by providing the
`labels_path` parameter instead of `export_dir` to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` to specify
a location to write (only) the labels.

.. note::

    You can optionally include the `export_media=False` option to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    make it explicit that you only wish to export labels, although this will be
    inferred if you do not provide an `export_dir` or `data_path`.

By default, the filenames of your images will be used as keys in the exported
labels. However, you can also provide the optional `rel_dir` parameter to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` to specify
a prefix to strip from each image path to generate a key for the image. This
argument allows for populating nested subdirectories that match the shape of
the input paths.

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/labels.json"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels using the basename of each image as keys
        dataset_or_view.export(
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

        # Export labels using the relative path of each image with respect to
        # the given `rel_dir` as keys
        dataset_or_view.export(
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            labels_path=labels_path,
            label_field=label_field,
            rel_dir="/common/images/dir",
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/labels.json
        LABEL_FIELD=ground_truth  # for example

        # Export labels using the basename of each image as keys
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneImageClassificationDataset \
            --kwargs labels_path=$LABELS_PATH

        # Export labels using the relative path of each image with respect to
        # the given `rel_dir` as keys
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneImageClassificationDataset \
            --kwargs \
                labels_path=$LABELS_PATH \
                rel_dir=/common/images/dir

.. _ImageClassificationDirectoryTree-export:

ImageClassificationDirectoryTree
--------------------------------

.. admonition:: Supported label types
    :class: note

    |Classification|

The :class:`fiftyone.types.ImageClassificationDirectoryTree` type represents a
directory tree whose subfolders define an image classification dataset.

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

.. note::

    See :class:`ImageClassificationDirectoryTreeExporter <fiftyone.utils.data.exporters.ImageClassificationDirectoryTreeExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as an image classification directory tree
stored on disk in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-classification-dir-tree"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

.. _VideoClassificationDirectoryTree-export:

VideoClassificationDirectoryTree
--------------------------------

.. admonition:: Supported label types
    :class: note

    |Classification|

The :class:`fiftyone.types.VideoClassificationDirectoryTree` type represents a
directory tree whose subfolders define a video classification dataset.

Datasets of this type are exported in the following format:

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

.. note::

    See :class:`VideoClassificationDirectoryTreeExporter <fiftyone.utils.data.exporters.VideoClassificationDirectoryTreeExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a video classification directory tree
stored on disk in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/video-classification-dir-tree"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/video-classification-dir-tree
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.VideoClassificationDirectoryTree

.. _TFImageClassificationDataset-export:

TFImageClassificationDataset
----------------------------

.. admonition:: Supported label types
    :class: note

    |Classification|

The :class:`fiftyone.types.TFImageClassificationDataset` type represents a
labeled dataset consisting of images and their associated classification labels
stored as
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

.. note::

    See :class:`TFImageClassificationDatasetExporter <fiftyone.utils.tf.TFImageClassificationDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a directory of TFRecords in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/tf-image-classification-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

.. note::

    You can provide the `tf_records_path` argument instead of `export_dir` in
    the examples above to directly specify the path to the TFRecord(s) to
    write. See
    :class:`TFImageClassificationDatasetExporter <fiftyone.utils.tf.TFImageClassificationDatasetExporter>`
    for details.

.. _FiftyOneImageDetectionDataset-export:

FiftyOneImageDetectionDataset
-----------------------------

.. admonition:: Supported label types
    :class: note

    |Detections|

The :class:`fiftyone.types.FiftyOneImageDetectionDataset` type represents a
labeled dataset consisting of images and their associated object detections
stored in a simple JSON format.

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

If the `classes` field is included in the JSON, the `target` values are class
IDs that are mapped to class label strings via `classes[target]`. If no
`classes` are included, then the `target` values directly store the label
strings.

The target value in `labels` for unlabeled images is `None`.

By default, confidences and any additional dynamic attributes of your
detections will be automatically included in the export. However, you can
provide the optional `include_confidence` and `include_attributes` parameters
to customize this behavior.

.. note::

    See :class:`FiftyOneImageDetectionDatasetExporter <fiftyone.utils.data.exporters.FiftyOneImageDetectionDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as an image detection dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-detection-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

.. note::

    You can pass the optional `classes` parameter to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    explicitly define the class list to use in the exported labels. Otherwise,
    the strategy outlined in :ref:`this section <export-class-lists>` will be
    used to populate the class list.

You can also perform labels-only exports in this format by providing the
`labels_path` parameter instead of `export_dir` to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` to specify
a location to write (only) the labels.

.. note::

    You can optionally include the `export_media=False` option to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    make it explicit that you only wish to export labels, although this will be
    inferred if you do not provide an `export_dir` or `data_path`.

By default, the filenames of your images will be used as keys in the exported
labels. However, you can also provide the optional `rel_dir` parameter to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` to specify
a prefix to strip from each image path to generate a key for the image. This
argument allows for populating nested subdirectories that match the shape of
the input paths.

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/labels.json"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels using the basename of each image as keys
        dataset_or_view.export(
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

        # Export labels using the relative path of each image with respect to
        # the given `rel_dir` as keys
        dataset_or_view.export(
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            labels_path=labels_path,
            label_field=label_field,
            rel_dir="/common/images/dir",
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/labels.json
        LABEL_FIELD=ground_truth  # for example

        # Export labels using the basename of each image as keys
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneImageDetectionDataset \
            --kwargs labels_path=$LABELS_PATH

        # Export labels using the relative path of each image with respect to
        # the given `rel_dir` as keys
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneImageDetectionDataset \
            --kwargs \
                labels_path=$LABELS_PATH \
                rel_dir=/common/images/dir

.. _FiftyOneTemporalDetectionDataset-export:

FiftyOneTemporalDetectionDataset
--------------------------------

.. admonition:: Supported label types
    :class: note

    |TemporalDetections|

The :class:`fiftyone.types.FiftyOneTemporalDetectionDataset` type represents a
labeled dataset consisting of videos and their associated temporal detections
stored in a simple JSON format.

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

By default, the `support` keys will be populated with the `[first, last]` frame
numbers of the detections, but you can pass the `use_timestamps=True` key
during export to instead populate the `timestamps` keys with the
`[start, stop]` timestamps of the detections, in seconds.

If the `classes` field is included in the JSON, the `target` values are class
IDs that are mapped to class label strings via `classes[target]`. If no
`classes` are included, then the `target` values directly store the label
strings.

The target value in `labels` for unlabeled videos is `None`.

By default, confidences and any additional dynamic attributes of your
detections will be automatically included in the export. However, you can
provide the optional `include_confidence` and `include_attributes` parameters
to customize this behavior.

.. note::

    See :class:`FiftyOneTemporalDetectionDatasetExporter <fiftyone.utils.data.exporters.FiftyOneTemporalDetectionDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a temporal detection dataset stored on
disk in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/temporal-detection-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/temporal-detection-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneTemporalDetectionDataset

.. note::

    You can pass the optional `classes` parameter to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    explicitly define the class list to use in the exported labels. Otherwise,
    the strategy outlined in :ref:`this section <export-class-lists>` will be
    used to populate the class list.

You can also perform labels-only exports in this format by providing the
`labels_path` parameter instead of `export_dir` to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` to specify
a location to write (only) the labels.

.. note::

    You can optionally include the `export_media=False` option to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    make it explicit that you only wish to export labels, although this will be
    inferred if you do not provide an `export_dir` or `data_path`.

By default, the filenames of your images will be used as keys in the exported
labels. However, you can also provide the optional `rel_dir` parameter to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>` to specify
a prefix to strip from each image path to generate a key for the image. This
argument allows for populating nested subdirectories that match the shape of
the input paths.

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/labels.json"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels using the basename of each image as keys
        dataset_or_view.export(
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

        # Export labels using the relative path of each image with respect to
        # the given `rel_dir` as keys
        dataset_or_view.export(
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            labels_path=labels_path,
            label_field=label_field,
            rel_dir="/common/images/dir",
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/labels.json
        LABEL_FIELD=ground_truth  # for example

        # Export labels using the basename of each image as keys
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneTemporalDetectionDataset \
            --kwargs labels_path=$LABELS_PATH

        # Export labels using the relative path of each image with respect to
        # the given `rel_dir` as keys
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneTemporalDetectionDataset \
            --kwargs \
                labels_path=$LABELS_PATH \
                rel_dir=/common/images/dir

.. _COCODetectionDataset-export:

COCODetectionDataset
--------------------

.. admonition:: Supported label types
    :class: note

    |Detections|, |Polylines|, |Keypoints|

The :class:`fiftyone.types.COCODetectionDataset` type represents a labeled
dataset consisting of images and their associated object detections saved in
`COCO Object Detection Format <https://cocodataset.org/#format-data>`_.

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
            {
                "id": 1,
                "name": "cat",
                "supercategory": "animal"
            },
            ...
        ],
        "images": [
            {
                "id": 1,
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
                "id": 1,
                "image_id": 1,
                "category_id": 1,
                "bbox": [260, 177, 231, 199],
                "segmentation": [...],
                "score": 0.95,
                "area": 45969,
                "iscrowd": 0
            },
            ...
        ]
    }

See `this page <https://cocodataset.org/#format-data>`_ for a full
specification of the `segmentation` field, which will only be included if you
export |Detections| with instance masks populated or |Polylines|.

For unlabeled datasets, `labels.json` does not contain an `annotations` field.

The `file_name` attribute of the labels file encodes the location of the
corresponding images, which can be any of the following:

-   The filename of an image in the `data/` folder
-   A relative path like `path/to/filename.ext` specifying the relative path to
    the image in a nested subfolder of `data/`
-   An absolute path to an image, which may or may not be in the `data/` folder

.. note::

    See :class:`COCODetectionDatasetExporter <fiftyone.utils.coco.COCODetectionDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a COCO detection dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-detection-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

.. note::

    You can pass the optional `classes` or `categories` parameters to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    explicitly define the class list/category IDs to use in the exported
    labels. Otherwise, the strategy outlined in
    :ref:`this section <export-class-lists>` will be used to populate the class
    list.

You can also perform labels-only exports of COCO-formatted labels by providing
the `labels_path` parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/coco-labels.json"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.COCODetectionDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/coco-labels.json
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.COCODetectionDataset \
            --kwargs labels_path=$LABELS_PATH

.. _VOCDetectionDataset-export:

VOCDetectionDataset
-------------------

.. admonition:: Supported label types
    :class: note

    |Detections|

The :class:`fiftyone.types.VOCDetectionDataset` type represents a labeled
dataset consisting of images and their associated object detections saved in
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

Samples with no values for certain attributes (like `pose` in the above
example) are left empty.

Unlabeled images have no corresponding file in `labels/`.

.. note::

    See :class:`VOCDetectionDatasetExporter <fiftyone.utils.voc.VOCDetectionDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a VOC detection dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/voc-detection-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

You can also perform labels-only exports of VOC-formatted labels by providing
the `labels_path` parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/voc-labels"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.VOCDetectionDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/voc-labels
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.VOCDetectionDataset \
            --kwargs labels_path=$LABELS_PATH

.. _KITTIDetectionDataset-export:

KITTIDetectionDataset
---------------------

.. admonition:: Supported label types
    :class: note

    |Detections|

The :class:`fiftyone.types.KITTIDetectionDataset` type represents a labeled
dataset consisting of images and their associated object detections saved in
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

The `default` column above indicates the default value that will be used when
writing datasets in this type whose samples do not contain the necessary
field(s).

Unlabeled images have no corresponding file in `labels/`.

.. note::

    See :class:`KITTIDetectionDatasetExporter <fiftyone.utils.kitti.KITTIDetectionDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a KITTI detection dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/kitti-detection-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

You can also perform labels-only exports of KITTI-formatted labels by providing
the `labels_path` parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/kitti-labels"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.KITTIDetectionDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/kitti-labels
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.KITTIDetectionDataset \
            --kwargs labels_path=$LABELS_PATH

.. _YOLOv4Dataset-export:

YOLOv4Dataset
-------------

.. admonition:: Supported label types
    :class: note

    |Detections| |Polylines|

The :class:`fiftyone.types.YOLOv4Dataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
`YOLOv4 format <https://github.com/AlexeyAB/darknet>`_.

Datasets of this type are exported in the following format:

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
corresponds to an object in the image of the same name, in one of the following
formats:

.. code-block:: text

    # Detections
    <target> <x-center> <y-center> <width> <height>
    <target> <x-center> <y-center> <width> <height> <confidence>

    # Polygons
    <target> <x1> <y1> <x2> <y2> <x3> <y3> ...

where `<target>` is the zero-based integer index of the object class label from
`obj.names`, all coordinates are expressed as relative values in
`[0, 1] x [0, 1]`, and `<confidence>` is an optional confidence in `[0, 1]`,
which will be included only if you pass the optional `include_confidence=True`
flag to the export.

Unlabeled images have no corresponding TXT file in `data/`.

.. note::

    See :class:`YOLOv4DatasetExporter <fiftyone.utils.yolo.YOLOv4DatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a YOLOv4 dataset in the above format as
follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/yolov4-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv4Dataset,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/yolov4-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.YOLOv4Dataset

.. note::

    You can pass the optional `classes` parameter to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    explicitly define the class list to use in the exported labels. Otherwise,
    the strategy outlined in :ref:`this section <export-class-lists>` will be
    used to populate the class list.

You can also perform labels-only exports of YOLO-formatted labels by providing
the `labels_path` parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/yolo-labels"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.YOLOv4Dataset,
            labels_path=labels_path,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/yolo-labels
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.YOLOv4Dataset \
            --kwargs labels_path=$LABELS_PATH

.. _YOLOv5Dataset-export:

YOLOv5Dataset
-------------

.. admonition:: Supported label types
    :class: note

    |Detections| |Polylines|

The :class:`fiftyone.types.YOLOv5Dataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
`YOLOv5 format <https://github.com/ultralytics/yolov5>`_.

Datasets of this type are exported in the following format:

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
:class:`fiftyone.utils.yolo.YOLOv5DatasetExporter`. Also, `dataset.yaml` can be
located outside of `<dataset_dir>` as long as the optional `path` is provided.

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
and `<confidence>` is an optional confidence in `[0, 1]`, which will be
included only if you pass the optional `include_confidence=True` flag to the
export.

Unlabeled images have no corresponding TXT file in `labels/`. The label file
path for each image is obtained by replacing `images/` with `labels/` in the
respective image path.

.. note::

    See :class:`YOLOv5DatasetExporter <fiftyone.utils.yolo.YOLOv5DatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a YOLOv5 dataset in the above format as
follows:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    export_dir = "/path/for/yolov5-dataset"
    label_field = "ground_truth"  # for example

    # The splits to export
    splits = ["train", "val"]

    # All splits must use the same classes list
    classes = ["list", "of", "classes"]

    # The dataset or view to export
    # We assume the dataset uses sample tags to encode the splits to export
    dataset_or_view = fo.load_dataset(...)

    # Export the splits
    for split in splits:
        split_view = dataset_or_view.match_tags(split)
        split_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
            label_field=label_field,
            split=split,
            classes=classes,
        )

.. note::

    You can pass the optional `classes` parameter to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    explicitly define the class list to use in the exported labels. Otherwise,
    the strategy outlined in :ref:`this section <export-class-lists>` will be
    used to populate the class list.

You can also perform labels-only exports of YOLO-formatted labels by providing
the `labels_path` parameter instead of `export_dir`:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    labels_path = "/path/for/yolo-labels"
    label_field = "ground_truth"  # for example

    # The dataset or view to export
    dataset_or_view = fo.load_dataset(...)

    # Export labels
    dataset_or_view.export(
        dataset_type=fo.types.YOLOv5Dataset,
        labels_path=labels_path,
        label_field=label_field,
    )

.. _TFObjectDetectionDataset-export:

TFObjectDetectionDataset
------------------------

.. admonition:: Supported label types
    :class: note

    |Detections|

The :class:`fiftyone.types.TFObjectDetectionDataset` type represents a labeled
dataset consisting of images and their associated object detections stored as
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

.. note::

    See :class:`TFObjectDetectionDatasetExporter <fiftyone.utils.tf.TFObjectDetectionDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a directory of TFRecords in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/tf-object-detection-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

.. note::

    You can provide the `tf_records_path` argument instead of `export_dir` in
    the examples above to directly specify the path to the TFRecord(s) to
    write. See
    :class:`TFObjectDetectionDatasetExporter <fiftyone.utils.tf.TFObjectDetectionDatasetExporter>`
    for details.

.. note::

    You can pass the optional `classes` parameter to
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
    explicitly define the class list to use in the exported labels. Otherwise,
    the strategy outlined in :ref:`this section <export-class-lists>` will be
    used to populate the class list.

.. _ImageSegmentationDirectory-export:

ImageSegmentationDirectory
--------------------------

.. admonition:: Supported label types
    :class: note

    |Segmentation|, |Detections|, |Polylines|

The :class:`fiftyone.types.ImageSegmentationDirectory` type represents a
labeled dataset consisting of images and their associated semantic
segmentations stored as images on disk.

Datasets of this type are exported in the following format:

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

By default, the masks will be stored as PNG images, but you can customize this
by passing the optional `mask_format` parameter. The masks will be stored as 8
bit images if they contain at most 256 classes, otherwise 16 bits will be used.

Unlabeled images have no corresponding file in `labels/`.

.. note::

    See :class:`ImageSegmentationDirectoryExporter <fiftyone.utils.data.exporters.ImageSegmentationDirectoryExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as an image segmentation dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-segmentation-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/image-segmentation-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.ImageSegmentationDirectory

You can also export only the segmentation masks by providing the `labels_path`
parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/segmentation-masks"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.ImageSegmentationDirectory,
            labels_path=labels_path,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/segmentation-masks
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.ImageSegmentationDirectory \
            --kwargs labels_path=$LABELS_PATH

.. _CVATImageDataset-export:

CVATImageDataset
----------------

.. admonition:: Supported label types
    :class: note

    |Classifications|, |Detections|, |Polylines|, |Keypoints|

The :class:`fiftyone.types.CVATImageDataset` type represents a labeled dataset
consisting of images and their associated tags and object detections stored in
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
-   A relative path like `path/to/filename.ext` specifying the relative path to
    the image in a nested subfolder of `data/`
-   An absolute path to an image, which may or may not be in the `data/` folder

.. note::

    See :class:`CVATImageDatasetExporter <fiftyone.utils.cvat.CVATImageDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a CVAT image dataset in the above format
as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/cvat-image-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

You can also perform labels-only exports of CVAT-formatted labels by providing
the `labels_path` parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/cvat-labels.xml"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.CVATImageDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/cvat-labels.xml
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.CVATImageDataset \
            --kwargs labels_path=$LABELS_PATH

.. _CVATVideoDataset-export:

CVATVideoDataset
----------------

.. admonition:: Supported label types
    :class: note

    |Detections|, |Polylines|, |Keypoints|

The :class:`fiftyone.types.CVATVideoDataset` type represents a labeled dataset
consisting of videos and their associated object detections stored in
`CVAT video format <https://github.com/opencv/cvat>`_.

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

.. note::

    See :class:`CVATVideoDatasetExporter <fiftyone.utils.cvat.CVATVideoDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a CVAT video dataset in the above format
as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/cvat-video-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            frame_labels_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/cvat-video-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.CVATVideoDataset \
            --kwargs frame_labels_field=$LABEL_FIELD

You can also perform labels-only exports of CVAT-formatted labels by providing
the `labels_path` parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/cvat-labels"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.CVATVideoDataset,
            labels_path=labels_path,
            frame_labels_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/cvat-labels
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.CVATVideoDataset \
            --kwargs frames_labels_path=$LABELS_PATH

.. _FiftyOneImageLabelsDataset-export:

FiftyOneImageLabelsDataset
--------------------------

.. admonition:: Supported label types
    :class: note

    |Classifications|, |Detections|, |Polylines|, |Keypoints|

The :class:`fiftyone.types.FiftyOneImageLabelsDataset` type represents a
labeled dataset consisting of images and their associated multitask predictions
stored in
`ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

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
`ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

For unlabeled images, an empty `eta.core.image.ImageLabels` file is stored.

.. note::

    See :class:`FiftyOneImageLabelsDatasetExporter <fiftyone.utils.data.exporters.FiftyOneImageLabelsDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as an image labels dataset in the above
format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/image-labels-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

.. _FiftyOneVideoLabelsDataset-export:

FiftyOneVideoLabelsDataset
--------------------------

.. admonition:: Supported label types
    :class: note

    |Classifications|, |Detections|, |TemporalDetections|, |Polylines|, |Keypoints|

The :class:`fiftyone.types.FiftyOneVideoLabelsDataset` type represents a
labeled dataset consisting of videos and their associated labels stored in
`ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

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

For unlabeled videos, an empty `eta.core.video.VideoLabels` file is stored.

.. note::

    See :class:`FiftyOneVideoLabelsDatasetExporter <fiftyone.utils.data.exporters.FiftyOneVideoLabelsDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a video labels dataset in the above format
as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/video-labels-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneVideoLabelsDataset,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/video-labels-dataset
        LABEL_FIELD=ground_truth  # for example

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.FiftyOneVideoLabelsDataset

.. _BDDDataset-export:

BDDDataset
----------

.. admonition:: Supported label types
    :class: note

    |Classifications|, |Detections|, |Polylines|

The :class:`fiftyone.types.BDDDataset` type represents a labeled dataset
consisting of images and their associated multitask predictions saved in
`Berkeley DeepDrive (BDD) format <http://bdd-data.berkeley.edu>`_.

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
-   A relative path like `path/to/filename.ext` specifying the relative path to
    the image in a nested subfolder of `data/`
-   An absolute path to an image, which may or may not be in the `data/` folder

.. note::

    See :class:`BDDDatasetExporter <fiftyone.utils.bdd.BDDDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a BDD dataset in the above format as
follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/bdd-dataset"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

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

You can also perform labels-only exports of BDD-formatted labels by providing
the `labels_path` parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/bdd-labels.json"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.BDDDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/bdd-labels.json
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.BDDDataset \
            --kwargs labels_path=$LABELS_PATH

.. _CSVDataset-export:

CSVDataset
----------

The :class:`fiftyone.types.CSVDataset` type is a flexible CSV format that
represents slice(s) of field values of a dataset as columns of a CSV file.

Datasets of this type are exported in the following format:

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

where the columns of interest are specified via the `fields` parameter, and may
contain any number of top-level or embedded fields such as strings, ints,
floats, booleans, or lists of such values.

List values are encoded as `"list,of,values"` with double quotes to escape the
commas. Missing field values are encoded as empty cells.

.. note::

    See :class:`CSVDatasetExporter <fiftyone.utils.csv.CSVDatasetExporter>` for
    parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a CSV dataset in the above format as
follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/csv-dataset"

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.CSVDataset,
            fields=["list", "of", "fields"],
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/csv-dataset

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.CSVDataset \
            --kwargs fields=list,of,fields

You can also directly export a CSV file of field values and absolute media
paths without exporting the actual media files by providing the `labels_path`
parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/labels.csv"

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels with absolute media paths
        dataset_or_view.export(
            dataset_type=fo.types.CSVDataset,
            labels_path=labels_path,
            fields=["list", "of", "fields"],
            abs_paths=True,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/labels.csv

        # Export labels with absolute media paths
        fiftyone datasets export $NAME \
            --type fiftyone.types.CSVDataset \
            --kwargs \
                labels_path=$LABELS_PATH \
                fields=list,of,fields \
                abs_paths=True

.. _GeoJSONDataset-export:

GeoJSONDataset
--------------

The :class:`fiftyone.types.GeoJSONDataset` type represents a dataset consisting
of images or videos and their associated geolocation data and optional
properties stored in `GeoJSON format <https://en.wikipedia.org/wiki/GeoJSON>`_.

Datasets of this type are exported in the following format:

.. code-block:: text

    <dataset_dir>/
        data/
            <filename1>.<ext>
            <filename2>.<ext>
            ...
        labels.json

where `labels.json` is a GeoJSON file containing a `FeatureCollection` in
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

where the `geometry` field may contain any valid GeoJSON geometry object, and
the `filename` property encodes the name of the corresponding media in the
`data/` folder. The `filename` property can also be an absolute path, which
may or may not be in the `data/` folder.

Samples with no location data will have a null `geometry` field.

The `properties` field of each feature can contain additional labels for
each sample.

.. note::

    See :class:`GeoJSONDatasetExporter <fiftyone.utils.geojson.GeoJSONDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset as a GeoJSON dataset in the above format as
follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/geojson-dataset"

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.GeoJSONDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/geojson-dataset

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.GeoJSONDataset

You can also perform labels-only exports of GeoJSON-formatted labels by
providing the `labels_path` parameter instead of `export_dir`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        labels_path = "/path/for/geo-labels.json"
        label_field = "ground_truth"  # for example

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export labels
        dataset_or_view.export(
            dataset_type=fo.types.GeoJSONDataset,
            labels_path=labels_path,
            label_field=label_field,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        LABELS_PATH=/path/for/geo-labels.json
        LABEL_FIELD=ground_truth  # for example

        # Export labels
        fiftyone datasets export $NAME \
            --label-field $LABEL_FIELD \
            --type fiftyone.types.GeoJSONDataset \
            --kwargs labels_path=$LABELS_PATH

.. _FiftyOneDataset-export:

FiftyOneDataset
---------------

The :class:`fiftyone.types.FiftyOneDataset` provides a disk representation of
an entire |Dataset| in a serialized JSON format along with its source media.

Datasets of this type are exported in the following format:

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

Video datasets have an additional `frames.json` file that contains a serialized
representation of the frame labels for each video in the dataset.

.. note::

    See :class:`FiftyOneDatasetExporter <fiftyone.utils.data.exporters.FiftyOneDatasetExporter>`
    for parameters that can be passed to methods like
    :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
    to customize the export of datasets of this type.

You can export a FiftyOne dataset to disk in the above format as follows:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/fiftyone-dataset"

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/fiftyone-dataset

        # Export the dataset
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.FiftyOneDataset

You can export datasets in this this format without copying the source media
files by including `export_media=False` in your call to
:meth:`export() <fiftyone.core.collections.SampleCollection.export>`.

You can also pass `use_dirs=True` to export per-sample/frame JSON files rather
than storing all samples/frames in single JSON files.

By default, the absolute filepath of each image will be included in the export.
However, if you want to re-import this dataset on a different machine with the
source media files stored in a different root directory, you can include the
optional `rel_dir` parameter to specify a common prefix to strip from each
image's filepath, and then provide the new `rel_dir` when
:ref:`importing the dataset <FiftyOneDataset-import>`:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        export_dir = "/path/for/fiftyone-dataset"

        # The dataset or view to export
        dataset_or_view = fo.load_dataset(...)

        # Export the dataset without copying the media files
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            export_media=False,
        )

        # Export the dataset without media, including only the relative path of
        # each image with respect to the given `rel_dir` so that the dataset
        # can be imported with a different `rel_dir` prepended later
        dataset_or_view.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            export_media=False,
            rel_dir="/common/images/dir",
        )

  .. group-tab:: CLI

    .. code-block:: shell

        NAME=my-dataset
        EXPORT_DIR=/path/for/fiftyone-dataset

        # Export the dataset without copying the media files
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.FiftyOneDataset \
            --kwargs export_media=False

        # Export the dataset without media, including only the relative path of
        # each image with respect to the given `rel_dir` so that the dataset
        # can be imported with a different `rel_dir` prepended later
        fiftyone datasets export $NAME \
            --export-dir $EXPORT_DIR \
            --type fiftyone.types.FiftyOneDataset \
            --kwargs \
                export_media=False \
                rel_dir=/common/images/dir

.. note::

    Exporting in :class:`fiftyone.types.FiftyOneDataset` format as shown above
    using the `export_media=False` and `rel_dir` parameters is a convenient way
    to transfer datasets between work environments, since this enables you to
    store the media files wherever you wish in each environment and then simply
    provide the appropriate `rel_dir` value when
    :ref:`importing <FiftyOneDataset-import>` the dataset into FiftyOne in a
    new environment.

You can also pass in a `chunk_size` parameter to create nested directories of
media files with a maximum number of files per directory. This can be useful
when exporting large datasets to avoid filesystem limits on the number of files
in a single directory.

As an example, the following code exports a dataset with a maximum of 1000
media files per directory:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    export_dir = "/path/for/fiftyone-dataset"

    # The dataset or view to export
    dataset_or_view = fo.load_dataset(...)

    # Export the dataset with a maximum of 1000 media files per directory
    dataset_or_view.export(
        export_dir=export_dir,
        dataset_type=fo.types.FiftyOneDataset,
        chunk_size=1000,
    )

This will create a directory structure like the following:

.. code-block:: text

    <dataset_dir>/
        metadata.json
        samples.json
        data/
            data_0/
                <filename1>.<ext>
                <filename2>.<ext>
                ...
            data_1/
                <filename1>.<ext>
                <filename2>.<ext>
            ...

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

    # The dataset or view to export
    dataset_or_view = fo.load_dataset(...)

    # Create an instance of your custom dataset exporter
    exporter = CustomDatasetExporter(...)

    # Export the dataset
    dataset_or_view.export(dataset_exporter=exporter, ...)

You can also define a custom |DatasetType| type, which enables you to export
datasets in your custom format using the following recipe:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # The `fiftyone.types.Dataset` subclass for your custom dataset
    dataset_type = CustomDataset

    # The dataset or view to export
    dataset_or_view = fo.load_dataset(...)

    # Export the dataset
    dataset_or_view.export(dataset_type=dataset_type, ...)

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
                    export_dir (None): the directory to write the export. This may be
                        optional for some exporters
                    **kwargs: additional keyword arguments for your exporter
                """

                def __init__(self, export_dir=None, **kwargs):
                    super().__init__(export_dir=export_dir)
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
                    :meth:`fiftyone.core.collections.SampleCollection.info` or
                    :meth:`fiftyone.core.collections.SampleCollection.classes` of the
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

            samples = ...
            exporter = CustomUnlabeledImageDatasetExporter(...)

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
                    export_dir (None): the directory to write the export. This may be
                        optional for some exporters
                    **kwargs: additional keyword arguments for your exporter
                """

                def __init__(self, export_dir=None, **kwargs):
                    super().__init__(export_dir=export_dir)
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
                    """The :class:`fiftyone.core.labels.Label` class(es) exported by this
                    exporter.

                    This can be any of the following:

                    -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                        exporter directly exports labels of this type
                    -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
                        this case, the exporter can export a single label field of any of
                        these types
                    -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                        In this case, the exporter can handle label dictionaries with
                        value-types specified by this dictionary. Not all keys need be
                        present in the exported label dicts
                    -   ``None``. In this case, the exporter makes no guarantees about the
                        labels that it can export
                    """
                    # Return the appropriate value here
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

            samples = ...
            exporter = CustomLabeledImageDatasetExporter(...)
            label_field = ...

            with exporter:
                exporter.log_collection(samples)

                for sample in samples:
                    image_path = sample.filepath

                    metadata = sample.metadata
                    if exporter.requires_image_metadata and metadata is None:
                        metadata = fo.ImageMetadata.build_for(image_path)

                    # Assumes single label field case
                    label = sample[label_field]

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
        property of the exporter declares the type of label(s) that the dataset
        format expects.

        The
        :meth:`requires_image_metadata <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.requires_image_metadata>`
        property of the exporter allows it to declare whether it requires
        |ImageMetadata| instances for each image to be provided when
        :meth:`export_sample() <fiftyone.utils.data.exporters.LabeledImageDatasetExporter.export_sample>`
        is called. This allows for cases where metadata about of the image
        (e.g., its filename, encoding, shape, etc) are required in order to
        export the sample.

  .. group-tab:: Unlabeled video datasets

        To define a custom exporter for unlabeled video datasets, implement the
        |UnlabeledVideoDatasetExporter| interface.

        The pseudocode below provides a template for a custom
        |UnlabeledVideoDatasetExporter|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud

            class CustomUnlabeledVideoDatasetExporter(foud.UnlabeledVideoDatasetExporter):
                """Custom exporter for unlabeled video datasets.

                Args:
                    export_dir (None): the directory to write the export. This may be
                        optional for some exporters
                    **kwargs: additional keyword arguments for your exporter
                """

                def __init__(self, export_dir=None, **kwargs):
                    super().__init__(export_dir=export_dir)
                    # Your initialization here

                @property
                def requires_video_metadata(self):
                    """Whether this exporter requires
                    :class:`fiftyone.core.metadata.VideoMetadata` instances for each sample
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

                def export_sample(self, video_path, metadata=None):
                    """Exports the given sample to the dataset.

                    Args:
                        video_path: the path to a video on disk
                        metadata (None): a :class:`fiftyone.core.metadata.VideoMetadata`
                            isinstance for the sample. Only required when
                            :meth:`requires_video_metadata` is ``True``
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
        called with a custom |UnlabeledVideoDatasetExporter|, the export is
        effectively performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            samples = ...
            exporter = CustomUnlabeledVideoDatasetExporter(...)

            with exporter:
                exporter.log_collection(samples)

                for sample in samples:
                    video_path = sample.filepath

                    metadata = sample.metadata
                    if exporter.requires_video_metadata and metadata is None:
                        metadata = fo.VideoMetadata.build_for(video_path)

                    exporter.export_sample(video_path, metadata=metadata)

        Note that the exporter is invoked via its context manager interface,
        which automatically calls the
        :meth:`setup() <fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter.setup>`
        and
        :meth:`close() <fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter.close>`
        methods of the exporter to handle setup/completion of the export.

        The
        :meth:`log_collection() <fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter.log_collection>`
        method is called after the exporter's context manager has been entered
        but before any samples have been exported. This method can optionally
        be implemented by exporters that store information such as the
        :meth:`name <fiftyone.core.collections.SampleCollection.name>` or
        :meth:`info <fiftyone.core.collections.SampleCollection.info>` from the
        collection being exported.

        The video in each |Sample| is exported via the
        :meth:`export_sample() <fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter.export_sample>`
        method.

        The
        :meth:`requires_video_metadata <fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter.requires_video_metadata>`
        property of the exporter allows it to declare whether it requires
        |VideoMetadata| instances for each video to be provided when
        :meth:`export_sample() <fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter.export_sample>`
        is called. This allows for cases where metadata about the video
        (e.g., its filename, encoding, shape, etc) are required in order to export the
        sample.

  .. group-tab:: Labeled video datasets

        To define a custom exporter for labeled video datasets, implement the
        |LabeledVideoDatasetExporter| interface.

        The pseudocode below provides a template for a custom
        |LabeledVideoDatasetExporter|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud

            class CustomLabeledVideoDatasetExporter(foud.LabeledVideoDatasetExporter):
                """Custom exporter for labeled video datasets.

                Args:
                    export_dir (None): the directory to write the export. This may be
                        optional for some exporters
                    **kwargs: additional keyword arguments for your exporter
                """

                def __init__(self, export_dir=None, **kwargs):
                    super().__init__(export_dir=export_dir)
                    # Your initialization here

                @property
                def requires_video_metadata(self):
                    """Whether this exporter requires
                    :class:`fiftyone.core.metadata.VideoMetadata` instances for each sample
                    being exported.
                    """
                    # Return True or False here
                    pass

                @property
                def label_cls(self):
                    """The :class:`fiftyone.core.labels.Label` class(es) that can be
                    exported at the sample-level.

                    This can be any of the following:

                    -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                        exporter directly exports sample-level labels of this type
                    -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
                        this case, the exporter can export a single sample-level label field
                        of any of these types
                    -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                        In this case, the exporter can export multiple label fields with
                        value-types specified by this dictionary. Not all keys need be
                        present in the exported sample-level labels
                    -   ``None``. In this case, the exporter makes no guarantees about the
                        sample-level labels that it can export
                    """
                    # Return the appropriate value here
                    pass

                @property
                def frame_labels_cls(self):
                    """The :class:`fiftyone.core.labels.Label` class(es) that can be
                    exported by this exporter at the frame-level.

                    This can be any of the following:

                    -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                        exporter directly exports frame labels of this type
                    -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
                        this case, the exporter can export a single frame label field of
                        any of these types
                    -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                        In this case, the exporter can export multiple frame label fields
                        with value-types specified by this dictionary. Not all keys need be
                        present in the exported frame labels
                    -   ``None``. In this case, the exporter makes no guarantees about the
                        frame labels that it can export
                    """
                    # Return the appropriate value here
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

                def export_sample(self, video_path, label, frames, metadata=None):
                    """Exports the given sample to the dataset.

                    Args:
                        video_path: the path to a video on disk
                        label: an instance of :meth:`label_cls`, or a dictionary mapping
                            field names to :class:`fiftyone.core.labels.Label` instances,
                            or ``None`` if the sample has no sample-level labels
                        frames: a dictionary mapping frame numbers to dictionaries that map
                            field names to :class:`fiftyone.core.labels.Label` instances,
                            or ``None`` if the sample has no frame-level labels
                        metadata (None): a :class:`fiftyone.core.metadata.VideoMetadata`
                            instance for the sample. Only required when
                            :meth:`requires_video_metadata` is ``True``
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
        called with a custom |LabeledVideoDatasetExporter|, the export is
        effectively performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            samples = ...
            exporter = CustomLabeledVideoDatasetExporter(...)

            with exporter:
                exporter.log_collection(samples)

                for sample in samples:
                    video_path = sample.filepath

                    metadata = sample.metadata
                    if exporter.requires_video_metadata and metadata is None:
                        metadata = fo.VideoMetadata.build_for(video_path)

                    # Extract relevant sample-level labels to export
                    label = ...

                    # Extract relevant frame-level labels to export
                    frames = ...

                    exporter.export_sample(
                        video_path, label, frames, metadata=metadata
                    )

        Note that the exporter is invoked via its context manager interface,
        which automatically calls the
        :meth:`setup() <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter.setup>`
        and
        :meth:`close() <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter.close>`
        methods of the exporter to handle setup/completion of the export.

        The
        :meth:`log_collection() <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter.log_collection>`
        method is called after the exporter's context manager has been entered
        but before any samples have been exported. This method can optionally
        be implemented by exporters that store information such as the
        :meth:`name <fiftyone.core.collections.SampleCollection.name>` or
        :meth:`info <fiftyone.core.collections.SampleCollection.info>` from the
        collection being exported.

        The video and its corresponding sample and frame-level labels are
        exported via the
        :meth:`export_sample() <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter.export_sample>`
        method.

        The
        :meth:`label_cls <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter.label_cls>`
        property of the exporter declares the type of sample-level label(s)
        that the dataset format expects (if any), and the
        :meth:`frame_labels_cls <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter.frame_labels_cls>`
        property of the exporter declares the type of frame-level label(s) that
        the dataset format expects (if any),

        The
        :meth:`requires_video_metadata <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter.requires_video_metadata>`
        property of the exporter allows it to declare whether it requires
        |VideoMetadata| instances for each video to be provided when
        :meth:`export_sample() <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter.export_sample>`
        is called. This allows for cases where metadata about the video
        (e.g., its filename, encoding, shape, etc) are required in order to
        export the sample.

  .. group-tab:: Grouped datasets

        To define a custom exporter for grouped datasets, implement the
        |GroupDatasetExporter| interface.

        The pseudocode below provides a template for a custom
        |GroupDatasetExporter|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud

            class CustomGroupDatasetExporter(foud.GroupDatasetExporter):
                """Custom exporter for grouped datasets.

                Args:
                    export_dir (None): the directory to write the export. This may be
                        optional for some exporters
                    **kwargs: additional keyword arguments for your exporter
                """

                def __init__(self, export_dir=None, **kwargs):
                    super().__init__(export_dir=export_dir)
                    # Your initialization here

                def setup(self):
                    """Performs any necessary setup before exporting the first group in
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
                    :meth:`fiftyone.core.collections.SampleCollection.info` or
                    :meth:`fiftyone.core.collections.SampleCollection.classes` of the
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

                def export_group(self, group):
                    """Exports the given group to the dataset.

                    Args:
                        group: a dict mapping group slice names to
                            :class:`fiftyone.core.sample.Sample` instances
                    """
                    # Export the provided group
                    pass

                def close(self, *args):
                    """Performs any necessary actions after the last group has been
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
        called with a custom |GroupDatasetExporter|, the export is effectively
        performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            samples = ...
            exporter = CustomGroupDatasetExporter(...)

            with exporter:
                exporter.log_collection(samples)

                for group in samples.iter_groups():
                    exporter.export_group(group)

        Note that the exporter is invoked via its context manager interface,
        which automatically calls the
        :meth:`setup() <fiftyone.utils.data.exporters.GroupDatasetExporter.setup>`
        and
        :meth:`close() <fiftyone.utils.data.exporters.GroupDatasetExporter.close>`
        methods of the exporter to handle setup/completion of the export.

        The
        :meth:`log_collection() <fiftyone.utils.data.exporters.GroupDatasetExporter.log_collection>`
        method is called after the exporter's context manager has been entered
        but before any samples have been exported. This method can optionally
        be implemented by exporters that store information such as the
        :meth:`name <fiftyone.core.collections.SampleCollection.name>` or
        :meth:`info <fiftyone.core.collections.SampleCollection.info>` from the
        collection being exported.

        Each sample group is exported via the
        :meth:`export_group() <fiftyone.utils.data.exporters.GroupDatasetExporter.export_group>`
        method.

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

        Note that, as this type represents an unlabeled video dataset, its
        importer must be a subclass of |UnlabeledVideoDatasetImporter|, and its
        exporter must be a subclass of |UnlabeledVideoDatasetExporter|.

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

        Note that, as this type represents a labeled video dataset, its
        importer must be a subclass of |LabeledVideoDatasetImporter|, and its
        exporter must be a subclass of |LabeledVideoDatasetExporter|.

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

        Note that, as this type represents a grouped dataset, its importer must
        be a subclass of |GroupDatasetImporter|, and its exporter must be a
        subclass of |GroupDatasetExporter|.
