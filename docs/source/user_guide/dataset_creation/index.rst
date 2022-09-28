.. _loading-datasets:

Loading data into FiftyOne
==========================

.. default-role:: code

The first step to using FiftyOne is to load your data into a
:ref:`dataset <using-datasets>`. FiftyOne supports automatic loading of
datasets stored in various :ref:`common formats <supported-import-formats>`.
If your dataset is stored in a custom format, don't worry, FiftyOne also
provides support for easily loading datasets in
:ref:`custom formats <loading-custom-datasets>`.

Check out the sections below to see which import pattern is the best fit for
your data.

.. note::

    When you create a |Dataset|, its samples and all of their fields (metadata,
    labels, custom fields, etc.) are written to FiftyOne's backing database.

    **Important:** Samples only store the `filepath` to the media, not the
    raw media itself. FiftyOne does not create duplicate copies of your data!

.. _loading-common-datasets:

Common formats
--------------

If your data is stored on disk in one of the
:ref:`many common formats <supported-import-formats>` supported natively by
FiftyOne, then you can automatically load your data into a |Dataset| via the
following simple pattern:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # A name for the dataset
    name = "my-dataset"

    # The directory containing the dataset to import
    dataset_dir = "/path/to/dataset"

    # The type of the dataset being imported
    dataset_type = fo.types.COCODetectionDataset  # for example

    dataset = fo.Dataset.from_dir(
        dataset_dir=dataset_dir,
        dataset_type=dataset_type,
        name=name,
    )

.. note::

    Check out :ref:`this page <loading-datasets-from-disk>` for more details
    about loading datasets from disk in common formats!

.. _loading-custom-datasets:

Custom formats
--------------

The simplest and most flexible approach to loading your data into FiftyOne is
to iterate over your data in a simple Python loop, create a |Sample| for each
data + label(s) pair, and then add those samples to a |Dataset|.

FiftyOne provides :ref:`label types <using-labels>` for common tasks such as
classification, detection, segmentation, and many more. The examples below
give you a sense of the basic workflow for a few tasks:

.. tabs::

    .. tab:: Image classification

      .. code:: python
          :linenos:

          import glob
          import fiftyone as fo

          images_patt = "/path/to/images/*"

          # Ex: your custom label format
          annotations = {
              "/path/to/images/000001.jpg": "dog",
              ....,
          }

          # Create samples for your data
          samples = []
          for filepath in glob.glob(images_patt):
              sample = fo.Sample(filepath=filepath)

              # Store classification in a field name of your choice
              label = annotations[filepath]
              sample["ground_truth"] = fo.Classification(label=label)

              samples.append(sample)

          # Create dataset
          dataset = fo.Dataset("my-classification-dataset")
          dataset.add_samples(samples)

    .. tab:: Object detection

      .. code:: python
          :linenos:

          import glob
          import fiftyone as fo

          images_patt = "/path/to/images/*"

          # Ex: your custom label format
          annotations = {
              "/path/to/images/000001.jpg": [
                  {"bbox": ..., "label": ...},
                  ...
              ],
              ...
          }

          # Create samples for your data
          samples = []
          for filepath in glob.glob(images_patt):
              sample = fo.Sample(filepath=filepath)

              # Convert detections to FiftyOne format
              detections = []
              for obj in annotations[filepath]:
                  label = obj["label"]

                  # Bounding box coordinates should be relative values
                  # in [0, 1] in the following format:
                  # [top-left-x, top-left-y, width, height]
                  bounding_box = obj["bbox"]

                  detections.append(
                      fo.Detection(label=label, bounding_box=bounding_box)
                  )

              # Store detections in a field name of your choice
              sample["ground_truth"] = fo.Detections(detections=detections)

              samples.append(sample)

          # Create dataset
          dataset = fo.Dataset("my-detection-dataset")
          dataset.add_samples(samples)

    .. tab:: Labeled videos

      .. code:: python
          :linenos:

          import fiftyone as fo

          video_path = "/path/to/video.mp4"

          # Ex: your custom label format
          frame_labels = {
              1: {
                  "weather": "sunny",
                  "objects": [
                      {
                          "label": ...
                          "bbox": ...
                      },
                      ...
                  ]
              },
              ...
          }

          # Create video sample with frame labels
          sample = fo.Sample(filepath=video_path)
          for frame_number, labels in frame_labels.items():
              frame = fo.Frame()

              # Store a frame classification
              weather = labels["weather"]
              frame["weather"] = fo.Classification(label=weather)

              # Convert detections to FiftyOne format
              detections = []
              for obj in labels["objects"]:
                  label = obj["label"]

                  # Bounding box coordinates should be relative values
                  # in [0, 1] in the following format:
                  # [top-left-x, top-left-y, width, height]
                  bounding_box = obj["bbox"]

                  detections.append(
                      fo.Detection(label=label, bounding_box=bounding_box)
                  )

              # Store object detections
              frame["objects"] = fo.Detections(detections=detections)

              # Add frame to sample
              sample.frames[frame_number] = frame

          # Create dataset
          dataset = fo.Dataset("my-labeled-video-dataset")
          dataset.add_sample(sample)

Note that using :meth:`Dataset.add_samples() <fiftyone.core.dataset.Dataset.add_samples>`
to add batches of samples to your datasets can be significantly more efficient
than adding samples one-by-one via
:meth:`Dataset.add_sample() <fiftyone.core.dataset.Dataset.add_sample>`.

.. note::

    If you use the same custom data format frequently in your workflows, then
    writing a :ref:`custom dataset importer <custom-dataset-importer>` is a
    great way to abstract and streamline the loading of your data into
    FiftyOne.

.. _loading-images:

Loading images
--------------

If you're just getting started with a project and all you have is a bunch of
image files, you can easily load them into a FiftyOne dataset and start
visualizing them :ref:`in the App <fiftyone-app>`:

.. tabs::

  .. group-tab:: Python

    You can use the
    :meth:`Dataset.from_images() <fiftyone.core.dataset.Dataset.from_images>`,
    :meth:`Dataset.from_images_dir() <fiftyone.core.dataset.Dataset.from_images_dir>`, and
    :meth:`Dataset.from_images_patt() <fiftyone.core.dataset.Dataset.from_images_patt>`
    factory methods to load your images into FiftyOne:

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        # Create a dataset from a list of images
        dataset = fo.Dataset.from_images(
            ["/path/to/image1.jpg", "/path/to/image2.jpg", ...]
        )

        # Create a dataset from a directory of images
        dataset = fo.Dataset.from_images_dir("/path/to/images")

        # Create a dataset from a glob pattern of images
        dataset = fo.Dataset.from_images_patt("/path/to/images/*.jpg")

        session = fo.launch_app(dataset)

    You can also use
    :meth:`Dataset.add_images() <fiftyone.core.dataset.Dataset.add_images>`,
    :meth:`Dataset.add_images_dir() <fiftyone.core.dataset.Dataset.add_images_dir>`, and
    :meth:`Dataset.add_images_patt() <fiftyone.core.dataset.Dataset.add_images_patt>`
    to add images to an existing dataset.

  .. group-tab:: CLI

    You can use the :ref:`fiftyone app view <cli-fiftyone-app-view>` command
    from the CLI to quickly browse images in the App without creating a
    (persistent) FiftyOne dataset:

    .. code-block:: shell

        # View a glob pattern of images in the App
        fiftyone app view --images-patt '/path/to/images/*.jpg'

        # View a directory of images in the App
        fiftyone app view --images-dir '/path/to/images'

.. _loading-videos:

Loading videos
--------------

If you're just getting started with a project and all you have is a bunch of
video files, you can easily load them into a FiftyOne dataset and start
visualizing them :ref:`in the App <fiftyone-app>`:

.. tabs::

  .. group-tab:: Python

    You can use the
    :meth:`Dataset.from_videos() <fiftyone.core.dataset.Dataset.from_videos>`,
    :meth:`Dataset.from_videos_dir() <fiftyone.core.dataset.Dataset.from_videos_dir>`, and
    :meth:`Dataset.from_videos_patt() <fiftyone.core.dataset.Dataset.from_videos_patt>`
    factory methods to load your videos into FiftyOne:

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        # Create a dataset from a list of videos
        dataset = fo.Dataset.from_videos(
            ["/path/to/video1.mp4", "/path/to/video2.mp4", ...]
        )

        # Create a dataset from a directory of videos
        dataset = fo.Dataset.from_videos_dir("/path/to/videos")

        # Create a dataset from a glob pattern of videos
        dataset = fo.Dataset.from_videos_patt("/path/to/videos/*.mp4")

        session = fo.launch_app(dataset)

    You can also use
    :meth:`Dataset.add_videos() <fiftyone.core.dataset.Dataset.add_videos>`,
    :meth:`Dataset.add_videos_dir() <fiftyone.core.dataset.Dataset.add_videos_dir>`, and
    :meth:`Dataset.add_videos_patt() <fiftyone.core.dataset.Dataset.add_videos_patt>`
    to add videos to an existing dataset.

  .. group-tab:: CLI

    You can use the :ref:`fiftyone app view <cli-fiftyone-app-view>` command
    from the CLI to quickly browse videos in the App without creating a
    (persistent) FiftyOne dataset:

    .. code-block:: shell

        # View a glob pattern of videos in the App
        fiftyone app view --videos-patt '/path/to/videos/*.mp4'

        # View a directory of videos in the App
        fiftyone app view --videos-dir '/path/to/videos'

.. _model-predictions:

Model predictions
-----------------

Once you've created a dataset and ground truth labels, you can easily add model
predictions to take advantage of FiftyOne's
:ref:`evaluation capabilities <evaluating-models>`.

.. tabs::

  .. group-tab:: COCO

    If you have model predictions stored in
    :ref:`COCO format <COCODetectionDataset-import>`, then you can use
    :func:`add_coco_labels() <fiftyone.utils.coco.add_coco_labels>` to
    conveniently add the labels to an existing dataset.

    The example below demonstrates a round-trip export and then re-import of
    both images-and-labels and labels-only data in COCO format:

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

        See :func:`add_coco_labels() <fiftyone.utils.coco.add_coco_labels>` for
        a complete description of the available syntaxes for loading
        COCO-formatted predictions to an existing dataset.

  .. group-tab:: YOLO

    If you have model predictions stored in
    :ref:`YOLO format <YOLOv4Dataset-import>`, then you can use
    :func:`add_yolo_labels() <fiftyone.utils.yolo.add_yolo_labels>` to
    conveniently add the labels to an existing dataset.

    The example below demonstrates a round-trip export and then re-import of
    both images-and-labels and labels-only data in YOLO format:

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

        See :func:`add_yolo_labels() <fiftyone.utils.yolo.add_yolo_labels>` for
        a complete description of the available syntaxes for loading
        YOLO-formatted predictions to an existing dataset.

  .. group-tab:: Other formats

    Model predictions stored in other formats can always be
    :ref:`loaded iteratively <loading-custom-datasets>` through a simple Python
    loop.

    The example below shows how to add object detection predictions to a
    dataset, but many :ref:`other label types <using-labels>` are also
    supported.

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        # Ex: your custom predictions format
        predictions = {
            "/path/to/images/000001.jpg": [
                {"bbox": ..., "label": ..., "score": ...},
                ...
            ],
            ...
        }

        # Add predictions to your samples
        for sample in dataset:
            filepath = sample.filepath

            # Convert predictions to FiftyOne format
            detections = []
            for obj in predictions[filepath]:
                label = obj["label"]
                confidence = obj["score"]

                # Bounding box coordinates should be relative values
                # in [0, 1] in the following format:
                # [top-left-x, top-left-y, width, height]
                bounding_box = obj["bbox"]

                detections.append(
                    fo.Detection(
                        label=label,
                        bounding_box=bounding_box,
                        confidence=confidence,
                    )
                )

            # Store detections in a field name of your choice
            sample["predictions"] = fo.Detections(detections=detections)

            sample.save()

    .. note::

        If you are in need of a model to run on your dataset, check out the
        :ref:`FiftyOne Model Zoo <model-zoo>` or the
        :ref:`Lightning Flash integration <lightning-flash>`.

Need data?
----------

The :ref:`FiftyOne Dataset Zoo <dataset-zoo>` contains dozens of popular public
datasets that you can load into FiftyOne in a single line of code:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # List available datasets
    print(foz.list_zoo_datasets())
    # ['coco-2014', ...,  'kitti', ..., 'voc-2012', ...]

    # Load a split of a zoo dataset
    dataset = foz.load_zoo_dataset("cifar10", split="train")

.. note::

    Check out the :ref:`available zoo datasets <dataset-zoo-datasets>`!

.. toctree::
   :maxdepth: 1
   :hidden:

   Datasets from disk <datasets>
   Using sample parsers <samples>
