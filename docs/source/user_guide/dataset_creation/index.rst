Loading data into FiftyOne
==========================

.. default-role:: code

The first step to using FiftyOne is to load your data into a
|WhatIsAFiftyOneDataset|. FiftyOne supports automatic loading of datasets stored in
various common formats. If your dataset is stored in a custom format, don't
worry, FiftyOne also provides support for easily loading datasets in custom
formats.

.. note::

    When you create a |WhatIsAFiftyOneDataset|, its samples and all of their
    fields (metadata, labels, custom fields, etc.) are written to FiftyOne's
    backing database.

    **Important!** Samples only store the `filepath` to the media, not the
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

        - :ref:`ImageDirectory-import`
        - :ref:`FiftyOneImageClassificationDataset-import`
        - :ref:`ImageClassificationDirectoryTree-import`
        - :ref:`TFImageClassificationDataset-import`
        - :ref:`FiftyOneImageDetectionDataset-import`
        - :ref:`COCODetectionDataset-import`
        - :ref:`VOCDetectionDataset-import`
        - :ref:`KITTIDetectionDataset-import`
        - :ref:`TFObjectDetectionDataset-import`
        - :ref:`CVATImageDataset-import`
        - :ref:`FiftyOneImageLabelsDataset-import`
        - :ref:`BDDDataset-import`
        - :ref:`FiftyOneDataset-import`

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
                  for filepath in glob.glob(image_directory):
                      samples.append(fo.Sample(filepath=filepath))

                  # Create the dataset
                  dataset = fo.Dataset("my-image-dataset")
                  dataset.add_samples(samples)

            .. tab:: Classification

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
                      label = annotations[filepath]
                      samples.append(
                          fo.Sample(
                              filepath=filepath,
                              ground_truth=fo.Classification(label=label),
                          )
                      )

                  # Create the dataset
                  dataset = fo.Dataset("my-classification-dataset")
                  dataset.add_samples(samples)

            .. tab:: Detection

              .. code:: python
                  :linenos:

                  import glob

                  import fiftyone as fo

                  images_patt = "/path/to/images/*"

                  # Ex: your custom label format
                  annotations = {
                      "/path/to/images/000001.jpg": [{"bbox": ..., "label": ...}, ...],
                      ...
                  }

                  # Create samples for your data
                  samples = []
                  for filepath in glob.glob(images_patt):
                      # Convert detections to FiftyOne format
                      detections = []
                      for det in annotations[filepath]:
                          label = det["label"]

                          # Relative coordinates ranging from 0 to 1
                          # [top-left-x, top-left-y, width, height]
                          bounding_box = det["bbox"]

                          detections.append(
                              fo.Detection(label=label, bounding_box=bounding_box)
                          )

                      samples.append(
                          fo.Sample(
                              filepath=filepath,
                              ground_truth=fo.Detections(detections=detections),
                          )
                      )

                  # Create the dataset
                  dataset = fo.Dataset("my-detection-dataset")
                  dataset.add_samples(samples)

            .. tab:: Multitask prediction

              .. code:: python
                  :linenos:

                  import glob

                  # The `eta` package comes bundled with FiftyOne
                  import eta.core.data as etad
                  import eta.core.geometry as etag
                  import eta.core.image as etai
                  import eta.core.objects as etao

                  import fiftyone as fo

                  images_patt = "/path/to/images/*"

                  # Ex: your custom label format
                  annotations = {
                      "/path/to/images/000001.jpg": {
                          "label": ...,
                          "objects": [
                              {"bbox":..., "label":..., "age":...}
                          ]
                      }
                      ...
                  }

                  # Create samples for your data
                  samples = []
                  for filepath in glob.glob(images_patt):
                      # Convert predictions to FiftyOne format
                      image_labels = etai.ImageLabels()

                      # Frame-level classifications
                      label = annotations[filepath]["label"]
                      image_labels.add_attribute(etad.CategoricalAttribute("label", label))

                      # Object detections
                      for det in annotations[filepath]["objects"]:
                          label = det["label"]

                          # Relative coordinates ranging from 0 to 1
                          # [top-left-x, top-left-y, bottom-right-x, bottom-right-y]
                          bbox = det["bbox"]
                          bounding_box = etag.BoundingBox.from_coords(bbox)

                          obj = etao.DetectedObject(label=label, bounding_box=bounding_box)

                          # Object attributes
                          age = det["age"]
                          obj.add_attribute(etad.NumericAttribute("age", age))

                          image_labels.add_object(obj)

                      samples.append(
                          fo.Sample(
                              filepath=filepath,
                              ground_truth=fo.ImageLabels(labels=image_labels),
                          )
                      )

                  # Create the dataset
                  dataset = fo.Dataset("my-multitask-dataset")
                  dataset.add_samples(samples)

        If your data does not fit naturally into this pattern, check out the
        `Advanced loading options`_ section to find the best approach for your
        use case.

        .. note::

            :doc:`Learn more <samples>` about loading samples into a Dataset!

    .. tab:: I don't have data

        Check out how to automatically download and load popular public
        datasets using the :doc:`FiftyOne Dataset Zoo <zoo>`!

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

            :doc:`Learn more <zoo>` about the FiftyOne Dataset Zoo!

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
        will allow you to automatically load your samples using these methods:

        - :meth:`Dataset.add_labeled_images() <fiftyone.core.dataset.Dataset.add_labeled_images>`
        - :meth:`Dastaset.ingest_labeled_images() <fiftyone.core.dataset.Dataset.ingest_labeled_images>`

        .. code-block:: python
            :linenos:

            import fiftyone as fo

            dataset = fo.Dataset()

            # An iterable of labeled image data and the SampleParser that you
            # wrote to parse them
            samples = ...
            sample_parser = CustomSampleParser(...)

            #
            # OPTION 1
            #
            # Add your samples to a FiftyOne dataset without copying the data
            #

            dataset.add_labeled_images(samples, sample_parser)

            #
            # OPTION 2
            #
            # Copy the source data into a permanent location as per-sample
            # files
            #

            # A directory into which to copy the source data from `samples`
            dataset_dir = ...

            # Ingest the images into the dataset
            # The source images are copied into `dataset_dir`
            dataset.ingest_labeled_images(samples, sample_parser, dataset_dir=dataset_dir)

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

   Loading datasets <datasets>
   Adding samples <samples>
   Zoo datasets <zoo>
