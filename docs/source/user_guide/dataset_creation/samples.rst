.. _adding-samples:

Adding Samples to Datasets
==========================

.. default-role:: code

FiftyOne datasets are composed of |Sample| instances, and FiftyOne provides a
number of options for building datasets from individual samples.

If you have entire datasets on disk that you would like to load into a FiftyOne
dataset, see :doc:`loading datasets from disk <datasets>`.

You can take a fully customized approach and
:ref:`build your own samples <manually-building-datasets>`, or you can
:ref:`use a built-in SampleParser <builtin-sample-parser>` to parse
samples from a variety of common formats, or you can
:ref:`provide your own SampleParser <custom-sample-parser>` to automatically
load samples in your own custom formats.

.. _manually-building-datasets:

Manually building datasets
--------------------------

The most flexible way to create a FiftyOne dataset is to manually construct
your own |Sample| instances.

The following examples demonstrate how to construct datasets of various kinds
manually.

.. tabs::

    .. group-tab:: Unlabeled images

        .. code:: python
            :linenos:

            import fiftyone as fo

            num_samples = 3
            images_patt = "/path/to/images/%06d.jpg"

            # Generate some image samples
            samples = []
            for i in range(num_samples):
                # Path to the image on disk
                filepath = images_patt % i

                sample = fo.Sample(filepath=filepath)

                samples.append(sample)

            # Create the dataset
            dataset = fo.Dataset(name="my-images-dataset")
            dataset.add_samples(samples)

            # View summary info about the dataset
            print(dataset)

            # Print the first few samples in the dataset
            print(dataset.head())

    .. group-tab:: Classification

        .. code:: python
            :linenos:

            import random
            import fiftyone as fo

            num_samples = 3
            images_patt = "/path/to/images/%06d.jpg"

            # Generate some classification samples
            samples = []
            for i in range(num_samples):
                # Path to the image on disk
                filepath = images_patt % i

                # Classification label
                label = random.choice(["cat", "dog"])

                sample = fo.Sample(filepath=filepath)

                # Store classification in a field with name of your choice
                sample["ground_truth"] = fo.Classification(label=label)

                samples.append(sample)

            # Create the dataset
            dataset = fo.Dataset(name="my-classification-dataset")
            dataset.add_samples(samples)

            # View summary info about the dataset
            print(dataset)

            # Print the first few samples in the dataset
            print(dataset.head())

    .. group-tab:: Object detection

        .. code:: python
            :linenos:

            import random
            import fiftyone as fo

            num_samples = 3
            num_objects_per_sample = 4
            images_patt = "/path/to/images/%06d.jpg"

            # Generate some detection samples
            samples = []
            for i in range(num_samples):
                # Path to the image on disk
                filepath = images_patt % i

                # Object detections
                detections = []
                for j in range(num_objects_per_sample):
                    label = random.choice(["cat", "dog", "bird", "rabbit"])

                    # Bounding box coordinates are stored as relative numbers in [0, 1]
                    # in the following format:
                    # [top-left-x, top-left-y, width, height]
                    bounding_box = [
                        0.8 * random.random(),
                        0.8 * random.random(),
                        0.2,
                        0.2,
                    ]
                    detections.append(fo.Detection(label=label, bounding_box=bounding_box))

                sample = fo.Sample(filepath=filepath)

                # Store detections in a field with name of your choice
                sample["ground_truth"] = fo.Detections(detections=detections)

                samples.append(sample)

            # Create the dataset
            dataset = fo.Dataset(name="my-detection-dataset")
            dataset.add_samples(samples)

            # View summary info about the dataset
            print(dataset)

            # Print the first few samples in the dataset
            print(dataset.head())

    .. group-tab:: Unlabeled videos

        .. code:: python
            :linenos:

            import fiftyone as fo

            num_samples = 3
            videos_patt = "/path/to/videos/%06d.mp4"

            # Generate some video samples
            samples = []
            for i in range(num_samples):
                # Path to the video on disk
                filepath = videos_patt % i

                sample = fo.Sample(filepath=filepath)

                samples.append(sample)

            # Create the dataset
            dataset = fo.Dataset(name="my-videos-dataset")
            dataset.add_samples(samples)

            # View summary info about the dataset
            print(dataset)

            # Print the first few samples in the dataset
            print(dataset.head())

    .. group-tab:: Labeled videos

        .. code:: python
            :linenos:

            import random
            import fiftyone as fo

            num_frames = 5
            num_objects_per_frame = 3
            video_path = "/path/to/video.mp4"

            # Create video sample
            sample = fo.Sample(filepath=video_path)

            # Add some frame labels
            for frame_number in range(1, num_frames + 1):
                # Frame classification
                weather = random.choice(["sunny", "cloudy"])
                sample[frame_number]["weather"] = fo.Classification(label=weather)

                # Object detections
                detections = []
                for _ in range(num_objects_per_frame):
                    label = random.choice(["cat", "dog", "bird", "rabbit"])

                    # Bounding box coordinates are stored as relative numbers in [0, 1]
                    # in the following format:
                    # [top-left-x, top-left-y, width, height]
                    bounding_box = [
                        0.8 * random.random(),
                        0.8 * random.random(),
                        0.2,
                        0.2,
                    ]
                    detections.append(fo.Detection(label=label, bounding_box=bounding_box))

                # Object detections
                sample[frame_number]["objects"] = fo.Detections(detections=detections)

            # Create dataset
            dataset = fo.Dataset(name="my-labeled-video-dataset")
            dataset.add_sample(sample)

.. _adding-samples-to-datasets:

Adding samples to datasets
--------------------------

FiftyOne provides native support for loading samples in a variety of
:ref:`common formats <builtin-sample-parser>`, and it can be easily
extended to import datasets in :ref:`custom formats <custom-sample-parser>`.

Basic recipe
~~~~~~~~~~~~

The basic recipe for adding samples to a |Dataset| is to create a
|SampleParser| of the appropriate type of sample that you're loading and then
pass the parser along with an iterable of samples to the appropriate
|Dataset| method.

.. tabs::

    .. group-tab:: Unlabeled images

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.utils.data as foud

            dataset = fo.Dataset()

            # An iterable of samples and an UnlabeledImageSampleParser to parse them
            samples = ...
            sample_parser = foud.ImageSampleParser  # for example

            # Add the image samples to the dataset
            dataset.add_images(samples, sample_parser)

    .. group-tab:: Labeled images

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.utils.bdd as foub

            dataset = fo.Dataset()

            # An iterable of samples and a LabeledImageSampleParser to parse them
            samples = ...
            sample_parser = foub.BDDSampleParser  # for example

            # Add the labeled image samples to the dataset
            dataset.add_labeled_images(samples, sample_parser)

    .. group-tab:: Unlabeled videos

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.utils.data as foud

            dataset = fo.Dataset()

            # An iterable of samples and an UnlabeledVideoSampleParser to parse them
            samples = ...
            sample_parser = foud.VideoSampleParser  # for example

            # Add the video samples to the dataset
            dataset.add_images(samples, sample_parser)

    .. group-tab:: Labeled videos

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.utils.data as foud

            dataset = fo.Dataset()

            # An iterable of samples and a LabeledVideoSampleParser to parse them
            samples = ...
            sample_parser = foud.FiftyOneVideoLabelsSampleParser  # for example

            # Add the labeled video samples to the dataset
            dataset.add_labeled_videos(samples, sample_parser)

.. note::

    A typical use case is that ``samples`` in the above recipe is a
    ``torch.utils.data.Dataset`` or an iterable generated by
    ``tf.data.Dataset.as_numpy_iterator()``.

Adding unlabeled images
~~~~~~~~~~~~~~~~~~~~~~~

FiftyOne provides a few convenient ways to add unlabeled images in FiftyOne
datasets.

Adding a directory of images
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_images_dir() <fiftyone.core.dataset.Dataset.add_images_dir>`
to add a directory of images to a dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset()

    # A directory of images to add
    images_dir = "/path/to/images"

    # Add images to the dataset
    dataset.add_images_dir(images_dir)

Adding a glob pattern of images
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_images_patt() <fiftyone.core.dataset.Dataset.add_images_patt>`
to add a glob pattern of images to a dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset()

    # A glob pattern of images to add
    images_patt = "/path/to/images/*.jpg"

    # Add images to the dataset
    dataset.add_images_patt(images_patt)

Adding images using a SampleParser
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_images() <fiftyone.core.dataset.Dataset.add_images>`
to add an iterable of unlabeled images that can be parsed via a specified
|UnlabeledImageSampleParser| to a dataset.

**Example**

FiftyOne provides an
:class:`ImageSampleParser <fiftyone.utils.data.parsers.ImageSampleParser>`
that handles samples that contain either an image that can be converted to
`NumPy format <https://numpy.org>`_ via ``np.asarray()`` of the path to an
image on disk.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud

    dataset = fo.Dataset()

    # An iterable of images or image paths and the UnlabeledImageSampleParser
    # to use to parse them
    samples = ...
    sample_parser = foud.ImageSampleParser

    # Add images to the dataset
    dataset.add_images(samples, sample_parser)

Adding labeled images
~~~~~~~~~~~~~~~~~~~~~

Use :meth:`Dataset.add_labeled_images() <fiftyone.core.dataset.Dataset.add_labeled_images>`
to add an iterable of samples that can be parsed via a specified
|LabeledImageSampleParser| to a dataset.

**Example**

FiftyOne provides a
:class:`BDDSampleParser <fiftyone.utils.bdd.BDDSampleParser>` that handles
samples that contain ``(image_or_path, anno_or_path)`` tuples, where:

- ``image_or_path`` is either an image that can be converted to numpy
  format via ``np.asarray()`` or the path to an image on disk

- ``anno_or_path`` is a dict of
  :class:`BDD annotations <fiftyone.utils.bdd.BDDSampleParser>` or the path to
  such a JSON file on disk

The snippet below adds an iterable of BDD samples in the above format to a
dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.bdd as foub

    dataset = fo.Dataset()

    # An iterable of `(image_or_path, anno_or_path)` tuples and the
    # LabeledImageSampleParser to use to parse them
    samples = ...
    sample_parser = foub.BDDSampleParser

    # Add labeled images to the dataset
    dataset.add_labeled_images(samples, sample_parser)

Adding unlabeled videos
~~~~~~~~~~~~~~~~~~~~~~~

FiftyOne provides a few convenient ways to add unlabeled videos in FiftyOne
datasets.

Adding a directory of videos
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_videos_dir() <fiftyone.core.dataset.Dataset.add_videos_dir>`
to add a directory of videos to a dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset()

    # A directory of videos to add
    videos_dir = "/path/to/videos"

    # Add videos to the dataset
    dataset.add_videos_dir(videos_dir)

Adding a glob pattern of videos
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_videos_patt() <fiftyone.core.dataset.Dataset.add_videos_patt>`
to add a glob pattern of videos to a dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset()

    # A glob pattern of videos to add
    videos_patt = "/path/to/videos/*.mp4"

    # Add videos to the dataset
    dataset.add_videos_patt(videos_patt)

Adding videos using a SampleParser
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_videos() <fiftyone.core.dataset.Dataset.add_videos>`
to add an iterable of unlabeled videos that can be parsed via a specified
|UnlabeledVideoSampleParser| to a dataset.

**Example**

FiftyOne provides a
:class:`VideoSampleParser <fiftyone.utils.data.parsers.VideoSampleParser>`
that handles samples that directly contain the path to the video on disk.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud

    dataset = fo.Dataset()

    # An iterable of video paths and the UnlabeledVideoSampleParser to use to
    # parse them
    samples = ...
    sample_parser = foud.VideoSampleParser

    # Add videos to the dataset
    dataset.add_videos(samples, sample_parser)

Adding labeled videos
~~~~~~~~~~~~~~~~~~~~~

Use :meth:`Dataset.add_labeled_videos() <fiftyone.core.dataset.Dataset.add_labeled_videos>`
to add an iterable of samples that can be parsed via a specified
|LabeledVideoSampleParser| to a dataset.

**Example**

FiftyOne provides a
:class:`VideoLabelsSampleParser <fiftyone.utils.data.parsers.VideoLabelsSampleParser>`
that handles samples that contain ``(video_path, video_labels_or_path)``
tuples, where:

- ``video_path`` is the path to a video on disk

- ``video_labels_or_path`` is an ``eta.core.video.VideoLabels``
  instance, a serialized dict representation of one, or the path to one on disk

The snippet below adds an iterable of labeled video samples in the above format
to a dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud

    dataset = fo.Dataset()

    # An iterable of `(video_path, video_labels_or_path)` tuples and the
    # LabeledVideoSampleParser to use to parse them
    samples = ...
    sample_parser = foud.VideoLabelsSampleParser

    # Add labeled videos to the dataset
    dataset.add_labeled_videos(samples, sample_parser)

.. _ingesting-samples-into-datasets:

Ingesting samples into datasets
-------------------------------

Creating FiftyOne datasets typically does not create copies of the source media,
since |Sample| instances store the `filepath` to the media, not the media itself.

However, in certain circumstances, such as loading data from binary sources
like `TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_
or creating a FiftyOne dataset from unorganized and/or temporary files on disk,
it can be desirable to *ingest* the raw media for each sample into a common
backing location.

FiftyOne provides support for ingesting samples and their underlying source
media in both :ref:`common formats <builtin-sample-parser>` and can be extended
to import datasets in :ref:`custom formats <custom-sample-parser>`.

Basic recipe
~~~~~~~~~~~~

The basic recipe for ingesting samples and their source media into a |Dataset|
is to create a |SampleParser| of the appropriate type of sample that you're
loading and then pass the parser along with an iterable of samples to the
appropriate |Dataset| method.

.. tabs::

    .. group-tab:: Unlabeled images

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.utils.data as foud

            dataset = fo.Dataset()

            # The iterable of samples and the UnlabeledImageSampleParser to use
            # to parse them
            samples = ...
            sample_parser = foud.ImageSampleParser  # for example

            # A directory in which the images will be written; If `None`, a default directory
            # based on the dataset's `name` will be used
            dataset_dir = ...

            # Ingest the labeled image samples into the dataset
            # The source images are copied into `dataset_dir`
            dataset.ingest_images(samples, sample_parser, dataset_dir=dataset_dir)

    .. group-tab:: Labeled images

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.utils.bdd as foub

            dataset = fo.Dataset()

            # The iterable of samples and the LabeledImageSampleParser to use
            # to parse them
            samples = ...
            sample_parser = foub.BDDSampleParser  # for example

            # A directory in which the images will be written; If `None`, a default directory
            # based on the dataset's `name` will be used
            dataset_dir = ...

            # Add the labeled image samples to the dataset
            dataset.add_labeled_images(samples, sample_parser, dataset_dir=dataset_dir)

    .. group-tab:: Unlabeled videos

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.utils.data as foud

            dataset = fo.Dataset()

            # The iterable of samples and the UnlabeledVideoSampleParser to use
            # to parse them
            samples = ...
            sample_parser = foud.VideoSampleParser  # for example

            # A directory in which the videos will be written; If `None`, a default directory
            # based on the dataset's `name` will be used
            dataset_dir = ...

            # Ingest the labeled video samples into the dataset
            # The source videos are copied into `dataset_dir`
            dataset.ingest_videos(samples, sample_parser, dataset_dir=dataset_dir)

    .. group-tab:: Labeled videos

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.utils.data as foud

            dataset = fo.Dataset()

            # The iterable of samples and the LabeledVideoSampleParser to use
            # to parse them
            samples = ...
            sample_parser = foud.VideoLabelsSampleParser  # for example

            # A directory in which the videos will be written; If `None`, a default directory
            # based on the dataset's `name` will be used
            dataset_dir = ...

            # Add the labeled video samples to the dataset
            dataset.add_labeled_videos(samples, sample_parser, dataset_dir=dataset_dir)

.. note::

    A typical use case is that ``samples`` in the above recipe is a
    ``torch.utils.data.Dataset`` or an iterable generated by
    ``tf.data.Dataset.as_numpy_iterator()``.

Ingesting unlabeled images
~~~~~~~~~~~~~~~~~~~~~~~~~~

Use :meth:`Dataset.ingest_images() <fiftyone.core.dataset.Dataset.ingest_images>`
to ingest an iterable of unlabeled images that can be parsed via a specified
|UnlabeledImageSampleParser| into a dataset.

The :meth:`has_image_path <fiftyone.utils.data.parsers.UnlabeledImageSampleParser.has_image_path>`
property of the parser may either be `True` or `False`. If the parser provides
image paths, the source images will be directly copied from their source
locations into the backing directory for the dataset; otherwise, the image will
be read in-memory via
:meth:`get_image() <fiftyone.utils.data.parsers.UnlabeledImageSampleParser.get_image>`
and then written to the backing directory.

**Example**

FiftyOne provides an
:class:`ImageSampleParser <fiftyone.utils.data.parsers.ImageSampleParser>`
that handles samples that contain either an image that can be converted to
`NumPy format <https://numpy.org>`_ via ``np.asarray()`` of the path to an
image on disk.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud

    dataset = fo.Dataset()

    # An iterable of images or image paths and the UnlabeledImageSampleParser
    # to use to parse them
    samples = ...
    sample_parser = foud.ImageSampleParser

    # A directory in which the images will be written; If `None`, a default directory
    # based on the dataset's `name` will be used
    dataset_dir = ...

    # Ingest the images into the dataset
    # The source images are copied into `dataset_dir`
    dataset.ingest_images(samples, sample_parser, dataset_dir=dataset_dir)

Ingesting labeled images
~~~~~~~~~~~~~~~~~~~~~~~~

Use :meth:`Dataset.ingest_labeled_images() <fiftyone.core.dataset.Dataset.ingest_labeled_images>`
to ingest an iterable of samples that can be parsed via a specified
|LabeledImageSampleParser| into a dataset.

The :meth:`has_image_path <fiftyone.utils.data.parsers.LabeledImageSampleParser.has_image_path>`
property of the parser may either be `True` or `False`. If the parser provides
image paths, the source images will be directly copied from their source
locations into the backing directory for the dataset; otherwise, the image will
be read in-memory via
:meth:`get_image() <fiftyone.utils.data.parsers.LabeledImageSampleParser.get_image>`
and then written to the backing directory.

**Example**

FiftyOne provides a
:class:`BDDSampleParser <fiftyone.utils.bdd.BDDSampleParser>` that handles
samples that contain ``(image_or_path, anno_or_path)`` tuples, where:

- ``image_or_path`` is either an image that can be converted to numpy
  format via ``np.asarray()`` or the path to an image on disk

- ``anno_or_path`` is a dict of
  :class:`BDD annotations <fiftyone.utils.bdd.BDDSampleParser>` or the path to
  such a JSON file on disk

The snippet below ingests an iterable of BDD samples in the above format into
a FiftyOne dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.bdd as foub

    dataset = fo.Dataset()

    # An iterable of `(image_or_path, anno_or_path)` tuples and the
    # LabeledImageSampleParser to use to parse them
    samples = ...
    sample_parser = foub.BDDSampleParser  # for example

    # A directory in which the images will be written; If `None`, a default directory
    # based on the dataset's `name` will be used
    dataset_dir = ...

    # Ingest the labeled images into the dataset
    # The source images are copied into `dataset_dir`
    dataset.ingest_labeled_images(samples, sample_parser, dataset_dir=dataset_dir)

Ingesting unlabeled videos
~~~~~~~~~~~~~~~~~~~~~~~~~~

Use :meth:`Dataset.ingest_videos() <fiftyone.core.dataset.Dataset.ingest_videos>`
to ingest an iterable of unlabeled videos that can be parsed via a specified
|UnlabeledVideoSampleParser| into a dataset.

The source videos will be directly copied from their source locations into the
backing directory for the dataset.

**Example**

FiftyOne provides a
:class:`VideoSampleParser <fiftyone.utils.data.parsers.VideoSampleParser>`
that handles samples that directly contain the paths to videos on disk.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud

    dataset = fo.Dataset()

    # An iterable of videos or video paths and the UnlabeledVideoSampleParser
    # to use to parse them
    samples = ...
    sample_parser = foud.VideoSampleParser

    # A directory in which the videos will be written; If `None`, a default directory
    # based on the dataset's `name` will be used
    dataset_dir = ...

    # Ingest the videos into the dataset
    # The source videos are copied into `dataset_dir`
    dataset.ingest_videos(samples, sample_parser, dataset_dir=dataset_dir)

Ingesting labeled videos
~~~~~~~~~~~~~~~~~~~~~~~~

Use :meth:`Dataset.ingest_labeled_videos() <fiftyone.core.dataset.Dataset.ingest_labeled_videos>`
to ingest an iterable of samples that can be parsed via a specified
|LabeledVideoSampleParser| into a dataset.

The source videos will be directly copied from their source locations into the
backing directory for the dataset.

**Example**

FiftyOne provides a
:class:`VideoLabelsSampleParser <fiftyone.utils.data.parsers.VideoLabelsSampleParser>`
that handles samples that contain ``(video_path, video_labels_or_path)``
tuples, where:

- ``video_path`` is the path to a video on disk

- ``video_labels_or_path`` is an ``eta.core.video.VideoLabels`` instance, a
  serialized dict representation of one, or the path to one on disk

The snippet below ingests an iterable of labeled videos in the above format
into a FiftyOne dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud

    dataset = fo.Dataset()

    # An iterable of `(video_path, video_labels_or_path)` tuples and the
    # LabeledVideoSampleParser to use to parse them
    samples = ...
    sample_parser = foud.VideoLabelsSampleParser  # for example

    # A directory in which the videos will be written; If `None`, a default directory
    # based on the dataset's `name` will be used
    dataset_dir = ...

    # Ingest the labeled videos into the dataset
    # The source videos are copied into `dataset_dir`
    dataset.ingest_labeled_videos(samples, sample_parser, dataset_dir=dataset_dir)

.. _builtin-sample-parser:

Built-in SampleParser classes
-----------------------------

The table below lists the common data formats for which FiftyOne provides
built-in |SampleParser| implementations. You can also write a
:ref:`custom SampleParser <custom-sample-parser>` to automate the parsing of
samples in your own custom data format.

You can use a |SampleParser| to
:ref:`add samples to datasets <adding-samples-to-datasets>` and
:ref:`ingest samples into datasets <ingesting-samples-into-datasets>`.

+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| SampleParser                                                           | Description                                                                                                     |
+========================================================================+=================================================================================================================+
| :class:`ImageSampleParser                                              | A sample parser that parses raw image samples.                                                                  |
| <fiftyone.utils.data.parsers.ImageSampleParser>`                       |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`VideoSampleParser                                              | A sample parser that parses raw video samples.                                                                  |
| <fiftyone.utils.data.parsers.VideoSampleParser>`                       |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`ImageClassificationSampleParser                                | Generic parser for image classification samples whose labels are represented as |Classification| instances.     |
| <fiftyone.utils.data.parsers.ImageClassificationSampleParser>`         |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`ImageDetectionSampleParser                                     | Generic parser for image detection samples whose labels are represented as |Detections| instances.              |
| <fiftyone.utils.data.parsers.ImageDetectionSampleParser>`              |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`ImageLabelsSampleParser                                        | Generic parser for image detection samples whose labels are stored in                                           |
| <fiftyone.utils.data.parsers.ImageLabelsSampleParser>`                 | `ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.             |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`FiftyOneImageClassificationSampleParser                        | Parser for samples in FiftyOne image classification datasets. See                                               |
| <fiftyone.utils.data.parsers.FiftyOneImageClassificationSampleParser>` | :class:`FiftyOneImageClassificationDataset <fiftyone.types.dataset_types.FiftyOneImageClassificationDataset>`   |
|                                                                        | for format details.                                                                                             |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`FiftyOneImageDetectionSampleParser                             | Parser for samples in FiftyOne image detection datasets. See                                                    |
| <fiftyone.utils.data.parsers.FiftyOneImageDetectionSampleParser>`      | :class:`FiftyOneImageDetectionDataset <fiftyone.types.dataset_types.FiftyOneImageDetectionDataset>` for format  |
|                                                                        | details.                                                                                                        |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`FiftyOneImageLabelsSampleParser                                | Parser for samples in FiftyOne image labels datasets. See                                                       |
| <fiftyone.utils.data.parsers.FiftyOneImageLabelsSampleParser>`         | :class:`FiftyOneImageLabelsDataset <fiftyone.types.dataset_types.FiftyOneImageLabelsDataset>` for format        |
|                                                                        | details.                                                                                                        |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`FiftyOneVideoLabelsSampleParser                                | Parser for samples in FiftyOne video labels datasets. See                                                       |
| <fiftyone.utils.data.parsers.FiftyOneVideoLabelsSampleParser>`         | :class:`FiftyOneVideoLabelsDataset <fiftyone.types.dataset_types.FiftyOneVideoLabelsDataset>` for format        |
|                                                                        | details.                                                                                                        |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`TFImageClassificationSampleParser                              | Parser for image classification samples stored as                                                               |
| <fiftyone.utils.tf.TFImageClassificationSampleParser>`                 | `TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_.                                         |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`TFObjectDetectionSampleParser                                  | Parser for image detection samples stored in                                                                    |
| <fiftyone.utils.tf.TFObjectDetectionSampleParser>`                     | `TF Object Detection API format <https://github.com/tensorflow/models/blob/master/research/object_detection>`_. |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`COCODetectionSampleParser                                      | Parser for samples in `COCO Object Detection Format <https://cocodataset.org/#format-data>`_.                   |
| <fiftyone.utils.coco.COCODetectionSampleParser>`                       |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`VOCDetectionSampleParser                                       | Parser for samples in `VOC detection format <http://host.robots.ox.ac.uk/pascal/VOC>`_.                         |
| <fiftyone.utils.voc.VOCDetectionSampleParser>`                         |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`KITTIDetectionSampleParser                                     | Parser for samples in `KITTI detection format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.         |
| <fiftyone.utils.kitti.KITTIDetectionSampleParser>`                     |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`YOLOSampleParser                                               | Parser for samples in `YOLO format <https://github.com/AlexeyAB/darknet>`_.                                     |
| <fiftyone.utils.yolo.YOLOSampleParser>`                                |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`CVATImageSampleParser                                          | Parser for samples in `CVAT image format <https://github.com/opencv/cvat>`_.                                    |
| <fiftyone.utils.cvat.CVATImageSampleParser>`                           |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`BDDSampleParser                                                | Parser for samples in `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.                       |
| <fiftyone.utils.bdd.BDDSampleParser>`                                  |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+

.. _custom-sample-parser:

Writing a custom SampleParser
-----------------------------

FiftyOne provides a variety of
:ref:`built-in SampleParser classes <builtin-sample-parser>` to parse
data in common formats. However, if your samples are stored in a custom format,
you can provide a custom |SampleParser| class and provide it to FiftyOne when
:ref:`adding <adding-samples-to-datasets>` or
:ref:`ingesting <ingesting-samples-into-datasets>` samples into your datasets.

The |SampleParser| interface provides a mechanism for defining methods that
parse a data sample that is stored in a particular (external to FiftyOne)
format and return various elements of the sample in a format that FiftyOne
understands.

|SampleParser| itself is an abstract interface; the concrete interface that you
should implement is determined by the type of samples that you are importing.
For example, |LabeledImageSampleParser| defines an interface for parsing
information from a labeled image sample, such as the path to the image on
disk, the image itself, metadata about the image, and the label (e.g.,
classification or object detections) associated with the image.

.. tabs::

    .. group-tab:: Unlabeled images

        To define a custom parser for unlabeled images, implement the
        |UnlabeledImageSampleParser| interface.

        The pseudocode below provides a template for a custom
        |UnlabeledImageSampleParser|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud

            class CustomUnlabeledImageSampleParser(foud.UnlabeledImageSampleParser):
                """Custom parser for unlabeled image samples."""

                @property
                def has_image_path(self):
                    """Whether this parser produces paths to images on disk for samples
                    that it parses.
                    """
                    # Return True or False here
                    pass

                @property
                def has_image_metadata(self):
                    """Whether this parser produces
                    :class:`fiftyone.core.metadata.ImageMetadata` instances for samples
                    that it parses.
                    """
                    # Return True or False here
                    pass

                def get_image(self):
                    """Returns the image from the current sample.

                    Returns:
                        a numpy image
                    """
                    # Return the image in `self.current_sample` here
                    pass

                def get_image_path(self):
                    """Returns the image path for the current sample.

                    Returns:
                        the path to the image on disk
                    """
                    # Return the image path for `self.current_sample` here, or raise
                    # an error if `has_image_path == False`
                    pass

                def get_image_metadata(self):
                    """Returns the image metadata for the current sample.

                    Returns:
                        a :class:`fiftyone.core.metadata.ImageMetadata` instance
                    """
                    # Return the image metadata for `self.current_sample` here, or
                    # raise an error if `has_image_metadata == False`
                    pass

        When :meth:`Dataset.add_images() <fiftyone.core.dataset.Dataset.add_images>`
        is called with a custom |UnlabeledImageSampleParser|, the import is effectively
        performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            dataset = fo.Dataset(...)

            # An iterable of samples to parse and the UnlabeledImageSampleParser
            # to use to parse them
            samples = ...
            sample_parser = CustomUnlabeledImageSampleParser(...)

            for sample in samples:
                sample_parser.with_sample(sample)

                image_path = sample_parser.get_image_path()

                if sample_parser.has_image_metadata:
                    metadata = sample_parser.get_image_metadata()
                else:
                    metadata = None

                sample = fo.Sample(filepath=image_path, metadata=metadata)

                dataset.add_sample(sample)

        The base |SampleParser| interface provides a
        :meth:`with_sample() <fiftyone.utils.data.parsers.SampleParser.with_sample>`
        method that ingests the next sample and makes it available via the
        :meth:`current_sample <fiftyone.utils.data.parsers.SampleParser.current_sample>`
        property of the parser. Subsequent calls to the parser's `get_XXX()` methods
        return information extracted from the current sample.

        The |UnlabeledImageSampleParser| interface provides a
        :meth:`has_image_path <fiftyone.utils.data.parsers.UnlabeledImageSampleParser.has_image_path>`
        property that declares whether the sample parser can return the path to the
        current sample's image on disk via
        :meth:`get_image_path() <fiftyone.utils.data.parsers.UnlabeledImageSampleParser.get_image_path>`.
        Similarly, the
        :meth:`has_image_metadata <fiftyone.utils.data.parsers.UnlabeledImageSampleParser.has_image_metadata>`
        property that declares whether the sample parser can return an |ImageMetadata|
        for the current sample's image via
        :meth:`get_image_metadata() <fiftyone.utils.data.parsers.UnlabeledImageSampleParser.get_image_metadata>`.

        By convention, all |UnlabeledImageSampleParser| implementations must make the
        current sample's image available via
        :meth:`get_image() <fiftyone.utils.data.parsers.UnlabeledImageSampleParser.get_image>`.

    .. group-tab:: Labeled images

        To define a custom parser for labeled images, implement the
        |LabeledImageSampleParser| interface.

        The pseudocode below provides a template for a custom
        |LabeledImageSampleParser|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud

            class CustomLabeledImageSampleParser(foud.LabeledImageSampleParser):
                """Custom parser for labeled image samples."""

                @property
                def has_image_path(self):
                    """Whether this parser produces paths to images on disk for samples
                    that it parses.
                    """
                    # Return True or False here
                    pass

                @property
                def has_image_metadata(self):
                    """Whether this parser produces
                    :class:`fiftyone.core.metadata.ImageMetadata` instances for samples
                    that it parses.
                    """
                    # Return True or False here
                    pass

                @property
                def label_cls(self):
                    """The :class:`fiftyone.core.labels.Label` class(es) returned by this
                    parser.

                    This can be any of the following:

                    -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                        parser is guaranteed to return labels of this type
                    -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                        In this case, the parser will return label dictionaries with keys
                        and value-types specified by this dictionary. Not all keys need be
                        present in the imported labels
                    -   ``None``. In this case, the parser makes no guarantees about the
                        labels that it may return
                    """
                    # Return the appropriate value here
                    pass

                def get_image(self):
                    """Returns the image from the current sample.

                    Returns:
                        a numpy image
                    """
                    # Return the image in `self.current_sample` here
                    pass

                def get_image_path(self):
                    """Returns the image path for the current sample.

                    Returns:
                        the path to the image on disk
                    """
                    # Return the image path for `self.current_sample` here, or raise
                    # an error if `has_image_path == False`
                    pass

                def get_image_metadata(self):
                    """Returns the image metadata for the current sample.

                    Returns:
                        a :class:`fiftyone.core.metadata.ImageMetadata` instance
                    """
                    # Return the image metadata for `self.current_sample` here, or
                    # raise an error if `has_image_metadata == False`
                    pass

                def get_label(self):
                    """Returns the label for the current sample.

                    Returns:
                        a :class:`fiftyone.core.labels.Label` instance, or a dictionary
                        mapping field names to :class:`fiftyone.core.labels.Label`
                        instances, or ``None`` if the sample is unlabeled
                    """
                    # Return the label for `self.current_sample` here
                    pass

        When :meth:`Dataset.add_labeled_images() <fiftyone.core.dataset.Dataset.add_labeled_images>`
        is called with a custom |LabeledImageSampleParser|, the import is effectively
        performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            dataset = fo.Dataset(...)

            # An iterable of samples and the LabeledImageSampleParser to use
            # to parse them
            samples = ...
            sample_parser = CustomLabeledImageSampleParser(...)

            # The name of the sample field in which to store the labels
            label_field = "ground_truth"  # for example

            for sample in samples:
                sample_parser.with_sample(sample)

                image_path = sample_parser.get_image_path()

                if sample_parser.has_image_metadata:
                    metadata = sample_parser.get_image_metadata()
                else:
                    metadata = None

                label = sample_parser.get_label()

                sample = fo.Sample(filepath=image_path, metadata=metadata)

                if isinstance(label, dict):
                    sample.update_fields(
                        {label_field + "_" + k: v for k, v in label.items()}
                    )
                elif label is not None:
                    sample[label_field] = label

                dataset.add_sample(sample)

        The base |SampleParser| interface provides a
        :meth:`with_sample() <fiftyone.utils.data.parsers.SampleParser.with_sample>`
        method that ingests the next sample and makes it available via the
        :meth:`current_sample <fiftyone.utils.data.parsers.SampleParser.current_sample>`
        property of the parser. Subsequent calls to the parser's `get_XXX()` methods
        return information extracted from the current sample.

        The |LabeledImageSampleParser| interface provides a
        :meth:`has_image_path <fiftyone.utils.data.parsers.LabeledImageSampleParser.has_image_path>`
        property that declares whether the sample parser can return the path to the
        current sample's image on disk via
        :meth:`get_image_path() <fiftyone.utils.data.parsers.LabeledImageSampleParser.get_image_path>`.
        Similarly, the
        :meth:`has_image_metadata <fiftyone.utils.data.parsers.LabeledImageSampleParser.has_image_metadata>`
        property that declares whether the sample parser can return an |ImageMetadata|
        for the current sample's image via
        :meth:`get_image_metadata() <fiftyone.utils.data.parsers.LabeledImageSampleParser.get_image_metadata>`.
        Additionality, the
        :meth:`label_cls <fiftyone.utils.data.parsers.LabeledImageSampleParser.label_cls>`
        property of the parser declares the type of label(s) that the parser
        will produce.

        By convention, all |LabeledImageSampleParser| implementations must make the
        current sample's image available via
        :meth:`get_image() <fiftyone.utils.data.parsers.LabeledImageSampleParser.get_image>`
        , and they must make the current sample's label available via
        :meth:`get_label() <fiftyone.utils.data.parsers.LabeledImageSampleParser.get_label>`.

    .. group-tab:: Unlabeled videos

        To define a custom parser for unlabeled videos, implement the
        |UnlabeledVideoSampleParser| interface.

        The pseudocode below provides a template for a custom
        |UnlabeledVideoSampleParser|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud

            class CustomUnlabeledVideoSampleParser(foud.UnlabeledVideoSampleParser):
                """Custom parser for unlabeled video samples."""

                @property
                def has_video_metadata(self):
                    """Whether this parser produces
                    :class:`fiftyone.core.metadata.VideoMetadata` instances for samples
                    that it parses.
                    """
                    # Return True or False here
                    pass

                def get_video_path(self):
                    """Returns the video path for the current sample.

                    Returns:
                        the path to the video on disk
                    """
                    # Return the video path for `self.current_sample` here
                    pass

                def get_video_metadata(self):
                    """Returns the video metadata for the current sample.

                    Returns:
                        a :class:`fiftyone.core.metadata.VideoMetadata` instance
                    """
                    # Return the video metadata for `self.current_sample` here, or
                    # raise an error if `has_video_metadata == False`
                    pass

        When :meth:`Dataset.add_videos() <fiftyone.core.dataset.Dataset.add_videos>`
        is called with a custom |UnlabeledVideoSampleParser|, the import is effectively
        performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            dataset = fo.Dataset(...)

            # An iterable of samples to parse and the UnlabeledVideoSampleParser
            # to use to parse them
            samples = ...
            sample_parser = CustomUnlabeledVideoSampleParser(...)

            for sample in samples:
                sample_parser.with_sample(sample)

                video_path = sample_parser.get_video_path()

                if sample_parser.has_image_metadata:
                    metadata = sample_parser.get_image_metadata()
                else:
                    metadata = None

                sample = fo.Sample(filepath=video_path, metadata=metadata)

                dataset.add_sample(sample)

        The base |SampleParser| interface provides a
        :meth:`with_sample() <fiftyone.utils.data.parsers.SampleParser.with_sample>`
        method that ingests the next sample and makes it available via the
        :meth:`current_sample <fiftyone.utils.data.parsers.SampleParser.current_sample>`
        property of the parser. Subsequent calls to the parser's `get_XXX()` methods
        return information extracted from the current sample.

        The |UnlabeledVideoSampleParser| interface provides a
        :meth:`get_video_path() <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser.get_video_path>`
        to get the video path for the current sample. The
        :meth:`has_video_metadata <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser.has_video_metadata>`
        property that declares whether the sample parser can return a |VideoMetadata|
        for the current sample's video via
        :meth:`get_video_metadata() <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser.get_video_metadata>`.

    .. group-tab:: Labeled videos

        To define a custom parser for labeled videos, implement the
        |LabeledVideoSampleParser| interface.

        The pseudocode below provides a template for a custom
        |LabeledVideoSampleParser|:

        .. code-block:: python
            :linenos:

            import fiftyone.utils.data as foud

            class CustomLabeledVideoSampleParser(foud.LabeledVideoSampleParser):
                """Custom parser for labeled video samples."""

                @property
                def has_video_metadata(self):
                    """Whether this parser produces
                    :class:`fiftyone.core.metadata.VideoMetadata` instances for samples
                    that it parses.
                    """
                    # Return True or False here
                    pass

                @property
                def label_cls(self):
                    """The :class:`fiftyone.core.labels.Label` class(es) returned by this
                    parser within the sample-level labels that it produces.

                    This can be any of the following:

                    -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                        parser is guaranteed to return sample-level labels of this type
                    -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                        In this case, the parser will return sample-level label
                        dictionaries with keys and value-types specified by this
                        dictionary. Not all keys need be present in the imported labels
                    -   ``None``. In this case, the parser makes no guarantees about the
                        sample-level labels that it may return
                    """
                    # Return the appropriate value here
                    pass

                @property
                def frame_labels_cls(self):
                    """The :class:`fiftyone.core.labels.Label` class(es) returned by this
                    parser within the frame labels that it produces.

                    This can be any of the following:

                    -   a :class:`fiftyone.core.labels.Label` class. In this case, the
                        parser is guaranteed to return frame labels of this type
                    -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
                        In this case, the parser will return frame label dictionaries with
                        keys and value-types specified by this dictionary. Not all keys
                        need be present in each frame
                    -   ``None``. In this case, the parser makes no guarantees about the
                        frame labels that it may return
                    """
                    # Return the appropriate value here
                    pass

                def get_video_path(self):
                    """Returns the video path for the current sample.

                    Returns:
                        the path to the video on disk
                    """
                    # Return the video path for `self.current_sample` here
                    pass

                def get_video_metadata(self):
                    """Returns the video metadata for the current sample.

                    Returns:
                        a :class:`fiftyone.core.metadata.VideoMetadata` instance
                    """
                    # Return the video metadata for `self.current_sample` here, or
                    # raise an error if `has_video_metadata == False`
                    pass

                def get_label(self):
                    """Returns the sample-level labels for the current sample.

                    Returns:
                        a :class:`fiftyone.core.labels.Label` instance, or a dictionary
                        mapping field names to :class:`fiftyone.core.labels.Label`
                        instances, or ``None`` if the sample has no sample-level labels
                    """
                    # Return the sample labels for `self.current_sample` here
                    pass

                def get_frame_labels(self):
                    """Returns the frame labels for the current sample.

                    Returns:
                        a dictionary mapping frame numbers to dictionaries that map label
                        fields to :class:`fiftyone.core.labels.Label` instances for each
                        video frame, or ``None`` if the sample has no frame labels
                    """
                    # Return the frame labels for `self.current_sample` here
                    pass

        When :meth:`Dataset.add_labeled_videos() <fiftyone.core.dataset.Dataset.add_labeled_videos>`
        is called with a custom |LabeledVideoSampleParser|, the import is effectively
        performed via the pseudocode below:

        .. code-block:: python

            import fiftyone as fo

            dataset = fo.Dataset(...)

            # An iterable of samples and the LabeledVideoSampleParser to use
            # to parse them
            samples = ...
            sample_parser = CustomLabeledVideoSampleParser(...)

            # A prefix for all frame label fields in which to store the labels
            label_field = "ground_truth"  # for example

            for sample in samples:
                sample_parser.with_sample(sample)

                video_path = sample_parser.get_video_path()

                if sample_parser.has_video_metadata:
                    metadata = sample_parser.get_video_metadata()
                else:
                    metadata = None

                label = sample_parser.get_label()
                frames = sample_parser.get_frame_labels()

                sample = fo.Sample(filepath=video_path, metadata=metadata)

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

        The base |SampleParser| interface provides a
        :meth:`with_sample() <fiftyone.utils.data.parsers.SampleParser.with_sample>`
        method that ingests the next sample and makes it available via the
        :meth:`current_sample <fiftyone.utils.data.parsers.SampleParser.current_sample>`
        property of the parser. Subsequent calls to the parser's `get_XXX()` methods
        return information extracted from the current sample.

        The |LabeledVideoSampleParser| interface provides a
        :meth:`get_video_path() <fiftyone.utils.data.parsers.LabeledVideoSampleParser.get_video_path>`
        to get the video path for the current sample. The
        :meth:`has_video_metadata <fiftyone.utils.data.parsers.LabeledVideoSampleParser.has_video_metadata>`
        property that declares whether the sample parser can return a |VideoMetadata|
        for the current sample's video via
        :meth:`get_video_metadata() <fiftyone.utils.data.parsers.LabeledVideoSampleParser.get_video_metadata>`.

        The
        :meth:`label_cls <fiftyone.utils.data.parsers.LabeledVideoSampleParser.label_cls>`
        property of the parser declares the type of sample-level label(s) that
        the parser may produce (if any). The
        :meth:`frame_labels_cls <fiftyone.utils.data.parsers.LabeledVideoSampleParser.frame_labels_cls>`
        property of the parser declares the type of frame-level label(s) that
        the parser may produce (if any). By convention, all
        |LabeledVideoSampleParser| implementations must make the current
        sample's sample-level labels available via
        :meth:`get_label() <fiftyone.utils.data.parsers.LabeledVideoSampleParser.get_label>`
        and its frame-level labels available via
        :meth:`get_frame_labels() <fiftyone.utils.data.parsers.LabeledVideoSampleParser.get_frame_labels>`.
