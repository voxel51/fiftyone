.. _loading-datasets:

Loading data into FiftyOne
==========================

.. default-role:: code

The first step to using FiftyOne is to load your data into a
:ref:`dataset <using-datasets>`. FiftyOne supports automatic loading of
datasets stored in various common formats. If your dataset is stored in a
custom format, don't worry, FiftyOne also provides support for easily loading
datasets in custom formats.

.. note::

    When you create a |Dataset|, its samples and all of their fields (metadata,
    labels, custom fields, etc.) are written to FiftyOne's backing database.

    **Important:** Samples only store the `filepath` to the media, not the
    raw media itself. FiftyOne does not create duplicate copies of your data!

Loading datasets
----------------

Depending on the format of your data and labels, FiftyOne provides a few
different options for loading your data into a |Dataset|. Navigate the tabs
below to figure out which option is best for you.

.. tabs::

    .. tab:: I have data in a common format

        FiftyOne provides easy-to-use functions to load your datasets from
        disk. You can automatically load your data if it is stored in one of
        the following formats:

        - :ref:`ImageDirectory <ImageDirectory-import>`
        - :ref:`VideoDirectory <VideoDirectory-import>`
        - :ref:`FiftyOneImageClassificationDataset <FiftyOneImageClassificationDataset-import>`
        - :ref:`ImageClassificationDirectoryTree <ImageClassificationDirectoryTree-import>`
        - :ref:`VideoClassificationDirectoryTree <VideoClassificationDirectoryTree-import>`
        - :ref:`TFImageClassificationDataset <TFImageClassificationDataset-import>`
        - :ref:`FiftyOneImageDetectionDataset <FiftyOneImageDetectionDataset-import>`
        - :ref:`COCODetectionDataset <COCODetectionDataset-import>`
        - :ref:`VOCDetectionDataset <VOCDetectionDataset-import>`
        - :ref:`YOLOv4Dataset <YOLOv4Dataset-import>`
        - :ref:`YOLOv5Dataset <YOLOv5Dataset-import>`
        - :ref:`KITTIDetectionDataset <KITTIDetectionDataset-import>`
        - :ref:`TFObjectDetectionDataset <TFObjectDetectionDataset-import>`
        - :ref:`ImageSegmentationDirectory <ImageSegmentationDirectory-import>`
        - :ref:`CVATImageDataset <CVATImageDataset-import>`
        - :ref:`CVATVideoDataset <CVATVideoDataset-import>`
        - :ref:`FiftyOneImageLabelsDataset <FiftyOneImageLabelsDataset-import>`
        - :ref:`FiftyOneVideoLabelsDataset <FiftyOneVideoLabelsDataset-import>`
        - :ref:`BDDDataset <BDDDataset-import>`
        - :ref:`GeoJSONDataset <GeoJSONDataset-import>`
        - :ref:`FiftyOneDataset <FiftyOneDataset-import>`

        If one of these formats matches your data, you can load it with the
        following code:

        .. code-block:: python
            :linenos:

            import fiftyone as fo

            # A name for the dataset
            name = "my-dataset"

            # The directory containing the dataset to import
            dataset_dir = "/path/to/dataset"

            # The type of the dataset being imported
            # Any subclass of `fiftyone.types.Dataset` is supported
            dataset_type = fo.types.COCODetectionDataset  # for example

            dataset = fo.Dataset.from_dir(dataset_dir, dataset_type, name=name)

        .. note::

            :doc:`Learn more <datasets>` about loading common-format datasets!

    .. tab:: I have data in a custom format

        The simplest approach to loading your data as a |Dataset| is to iterate
        over your data and labels and create a |Sample| for each data/label
        pair and add those samples to a Dataset:

        .. tabs::

            .. tab:: Unlabeled images

              .. code:: python
                  :linenos:

                  import glob
                  import fiftyone as fo

                  images_patt = "/path/to/images/*"

                  # Create samples for your images
                  samples = []
                  for filepath in glob.glob(images_patt):
                      samples.append(fo.Sample(filepath=filepath))

                  # Create the dataset
                  dataset = fo.Dataset(name="my-image-dataset")
                  dataset.add_samples(samples)

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

                  # Create dataset
                  dataset = fo.Dataset(name="my-classification-dataset")

                  # Add your samples to the dataset
                  for filepath in glob.glob(images_patt):
                      label = annotations[filepath]

                      sample = fo.Sample(filepath=filepath)

                      # Store classification in a field name of your choice
                      sample["ground_truth"] = fo.Classification(label=label)

                      dataset.add_sample(sample)

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

                  # Create dataset
                  dataset = fo.Dataset(name="my-detection-dataset")

                  # Add your samples to the dataset
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

                      dataset.add_sample(sample)

            .. tab:: Unlabeled videos

              .. code:: python
                  :linenos:

                  import glob
                  import fiftyone as fo

                  videos_patt = "/path/to/videos/*"

                  # Create samples for your videos
                  samples = []
                  for filepath in glob.glob(videos_patt):
                      sample = fo.Sample(filepath=filepath)
                      samples.append(sample)

                  # Create the dataset
                  dataset = fo.Dataset(name="my-video-dataset")
                  dataset.add_samples(samples)

            .. tab:: Labeled videos

              .. code:: python
                  :linenos:

                  import glob
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

                  # Create dataset
                  dataset = fo.Dataset(name="my-labeled-video-dataset")

                  # Create video sample with frame labels
                  sample = fo.Sample(filepath=video_path)
                  for frame_number, labels in frame_labels.items():
                      # Frame classification
                      weather = labels["weather"]
                      sample[frame_number]["weather"] = fo.Classification(label=weather)

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

                      # Object detections
                      sample[frame_number]["objects"] = fo.Detections(detections=detections)

                  # Add sample to dataset
                  dataset.add_sample(sample)

        If your data does not fit naturally into this pattern, check out the
        `Advanced loading options`_ section to find the best approach for your
        use case.

        .. note::

            :doc:`Learn more <samples>` about loading samples into a Dataset!

    .. tab:: I don't have data

        Check out how to automatically download and load popular public
        datasets using the :ref:`FiftyOne Dataset Zoo <dataset-zoo>`!

        You can download any dataset in the zoo and load it into FiftyOne using
        a single command:

        .. code-block:: python
            :linenos:

            import fiftyone.zoo as foz

            # List available datasets
            print(foz.list_zoo_datasets())
            # ['coco-2014', ...,  'kitti', ..., 'voc-2012', ...]

            # Load a split of a zoo dataset
            dataset = foz.load_zoo_dataset("cifar10", split="train")

        .. note::

            :ref:`Learn more <dataset-zoo>` about the FiftyOne Dataset Zoo!

Advanced loading options
------------------------

If you have data stored in a custom format, then there are more direct ways of
loading a |Dataset| than adding samples manually. The following techniques will
show you how to implement your own classes that can automate the dataset
loading process and allow you to more easily load various datasets from disk in
your custom format.

.. tabs::

    .. tab:: My data is exposed by a Python iterable

        If you already have a way to efficiently parse your data into Python,
        then the best practice is to wrap it in a FiftyOne |SampleParser|.
        For example, a `torch.utils.data.Dataset` is a parser for various
        datasets that has been wrapped in a FiftyOne |SampleParser|.

        :ref:`Writing a custom SampleParser <custom-sample-parser>`
        will allow you to automatically load your samples using factory methods
        exposed on |Dataset| objectss

        .. tabs::

            .. tab:: Add labeled images

                You can use the
                :meth:`Dataset.add_labeled_images() <fiftyone.core.dataset.Dataset.add_labeled_images>`
                method to add labeled images to a FiftyOne dataset without
                creating copies of the underlying images:

                .. code-block:: python
                    :linenos:

                    import fiftyone as fo

                    dataset = fo.Dataset()

                    # An iterable of labeled images and the SampleParser that you
                    # wrote to parse them
                    samples = ...
                    sample_parser = CustomLabeledImageSampleParser(...)

                    # Add your samples to a FiftyOne dataset without copying the images
                    dataset.add_labeled_images(samples, sample_parser)

            .. tab:: Ingest labeled images

                You can use the
                :meth:`Dataset.ingest_labeled_images() <fiftyone.core.dataset.Dataset.ingest_labeled_images>`
                method to add labeled images to a FiftyOne dataset, while also
                creating copies of the underlying images in a backing
                directory:

                .. code-block:: python
                    :linenos:

                    import fiftyone as fo

                    dataset = fo.Dataset()

                    # An iterable of labeled images and the SampleParser that you
                    # wrote to parse them
                    samples = ...
                    sample_parser = CustomLabeledImageSampleParser(...)

                    # A directory into which to copy the source images from `samples`
                    dataset_dir = ...

                    # Ingest the images into the dataset
                    # The source images are copied into `dataset_dir`
                    dataset.ingest_labeled_images(samples, sample_parser, dataset_dir=dataset_dir)

            .. tab:: Add labeled videos

                You can use the
                :meth:`Dataset.add_labeled_videos() <fiftyone.core.dataset.Dataset.add_labeled_videos>`
                method to add labeled videos to a FiftyOne dataset without
                creating copies of the underlying videos:

                .. code-block:: python
                    :linenos:

                    import fiftyone as fo

                    dataset = fo.Dataset()

                    # An iterable of labeled videos and the SampleParser that you
                    # wrote to parse them
                    samples = ...
                    sample_parser = CustomLabeledVideoSampleParser(...)

                    # Add your samples to a FiftyOne dataset without copying the videos
                    dataset.add_labeled_videos(samples, sample_parser)

            .. tab:: Ingest labeled videos

                You can use the
                :meth:`Dataset.ingest_labeled_videos() <fiftyone.core.dataset.Dataset.ingest_labeled_videos>`
                method to add labeled videos to a FiftyOne dataset, while also
                creating copies of the underlying videos in a backing
                directory:

                .. code-block:: python
                    :linenos:

                    import fiftyone as fo

                    dataset = fo.Dataset()

                    # An iterable of labeled videos and the SampleParser that you
                    # wrote to parse them
                    samples = ...
                    sample_parser = CustomLabeledVideoSampleParser(...)

                    # A directory into which to copy the source videos from `samples`
                    dataset_dir = ...

                    # Ingest the videos into the dataset
                    # The source videos are copied into `dataset_dir`
                    dataset.ingest_labeled_videos(samples, sample_parser, dataset_dir=dataset_dir)

        .. note::

            :ref:`Learn more <custom-sample-parser>` about
            implementing your own custom SampleParser!

    .. tab:: My data is stored as media files on disk

        If your raw data and annotations are stored as files on disk, then the
        recommended option to load into FiftyOne is to create a custom
        |DatasetImporter|.

        :ref:`Writing your own DatasetImporter <writing-a-custom-dataset-type-importer>`
        will allow you to use
        :meth:`Dataset.from_importer() <fiftyone.core.dataset.Dataset.from_importer>`
        to automatically load your data:

        .. code-block:: python
            :linenos:

            import fiftyone as fo

            dataset_dir = "/path/to/your/dataset"

            # Create an instance of your custom dataset importer
            importer = CustomDatasetImporter(dataset_dir, ...)

            # Import the dataset
            dataset = fo.Dataset.from_importer(importer)

        .. note::

            :ref:`Learn more <writing-a-custom-dataset-importer>` about
            implementing your own custom DatasetImporter!

        You can take this a step further by writing a custom |DatasetType|
        that encapsulates your dataset format. This will allow you to import
        (and export) datasets in your custom format using
        :meth:`dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>`:

        .. code-block:: python
            :linenos:

            import fiftyone as fo

            dataset_dir = "/path/to/your/dataset"

            # The `fiftyone.types.Dataset` subtype of your custom dataset
            dataset_type = CustomLabeledDataset

            # Import the dataset
            dataset = fo.Dataset.from_dir(dataset_dir, dataset_type)

        .. note::

            :ref:`Learn more <writing-a-custom-dataset-type-importer>` about
            implementing your own custom Dataset type!

.. toctree::
   :maxdepth: 1
   :hidden:

   Datasets from disk <datasets>
   Adding samples <samples>
