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

        import random

        import fiftyone as fo


        num_samples = 3
        images_patt = "/path/to/images/%06d.jpg"

        # Generate some unlabeled image samples
        samples = []
        for i in range(num_samples):
            # Path to the image on disk
            filepath = images_patt % i

            samples.append(fo.Sample(filepath=filepath))

        # Create the dataset
        dataset = fo.Dataset("raw-images-dataset")
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
        label_field = "ground_truth"
        images_patt = "/path/to/images/%06d.jpg"

        # Generate some classification samples
        samples = []
        for i in range(num_samples):
            # Path to the image on disk
            filepath = images_patt % i

            # Classification label
            label = random.choice(["cat", "dog"])

            samples.append(
                fo.Sample(
                    filepath=filepath, **{label_field: fo.Classification(label=label)},
                )
            )

        # Create the dataset
        dataset = fo.Dataset("classification-dataset")
        dataset.add_samples(samples)

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: Detection

    .. code:: python
        :linenos:

        import random

        import fiftyone as fo


        num_samples = 3
        num_objects_per_sample = 4
        label_field = "ground_truth"
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

                # [top-left-x, top-left-y, width, height]
                bounding_box = [
                    0.8 * random.random(),
                    0.8 * random.random(),
                    0.2,
                    0.2,
                ]
                detections.append(fo.Detection(label=label, bounding_box=bounding_box))

            samples.append(
                fo.Sample(
                    filepath=filepath,
                    **{label_field: fo.Detections(detections=detections)},
                )
            )

        # Create the dataset
        dataset = fo.Dataset("detection-dataset")
        dataset.add_samples(samples)

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

  .. group-tab:: Multitask prediction

    .. code:: python
        :linenos:

        import random

        import eta.core.data as etad
        import eta.core.geometry as etag
        import eta.core.image as etai
        import eta.core.objects as etao

        import fiftyone as fo


        num_samples = 3
        num_objects_per_sample = 4
        label_field = "ground_truth"
        images_patt = "/path/to/images/%06d.jpg"

        # Generate some multitask prediction samples
        samples = []
        for i in range(num_samples):
            # Path to the image on disk
            filepath = images_patt % i

            image_labels = etai.ImageLabels()

            # Frame-level classifications
            label = random.choice(["sun", "rain", "snow"])
            image_labels.add_attribute(etad.CategoricalAttribute("label", label))

            # Object detections
            for j in range(num_objects_per_sample):
                label = random.choice(["cat", "dog", "bird", "rabbit"])

                # [top-left-x, top-left-y, bottom-right-x, bottom-right-y]
                xtl = 0.8 * random.random()
                ytl = 0.8 * random.random()
                bounding_box = etag.BoundingBox.from_coords(
                    xtl, ytl, xtl + 0.2, ytl + 0.2
                )

                obj = etao.DetectedObject(label=label, bounding_box=bounding_box)

                # Object attributes
                age = random.randint(1, 20)
                obj.add_attribute(etad.NumericAttribute("age", age))

                image_labels.add_object(obj)

            samples.append(
                fo.Sample(
                    filepath=filepath,
                    **{label_field: fo.ImageLabels(labels=image_labels)},
                )
            )

        # Create the dataset
        dataset = fo.Dataset("multitask-dataset")
        dataset.add_samples(samples)

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

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

        # The iterable of samples and a SampleParser to use to parse them
        samples = ...
        sample_parser = foud.ImageSampleParser  # for example

        # Add the labeled image samples to the dataset
        dataset.add_images(samples, sample_parser)

  .. group-tab:: Labeled images

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.utils.bdd as foub


        dataset = fo.Dataset()

        # The iterable of samples and a SampleParser to use to parse them
        samples = ...
        sample_parser = foub.BDDSampleParser  # for example

        # Add the labeled image samples to the dataset
        dataset.add_labeled_images(samples, sample_parser)

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
    image_patt = "/path/to/images/*.jpg"

    # Add images to the dataset
    dataset.add_images_patt(image_patt)

Adding images using a SampleParser
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_images() <fiftyone.core.dataset.Dataset.add_images>`
to add an iterable of unlabeled images that can be parsed via a specified
|UnlabeledImageSampleParser| to a dataset.

**Example**

FiftyOne provides an
:class:`ImageSampleParser <fiftyone.utils.data.parsers.ImageSampleParser>`
that handles samples that contain either an image that can be converted to
`NumPy <https://numpy.org>`_ format via ``np.asarray()`` of the path to an
image on disk.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud


    dataset = fo.Dataset()

    # An iterable of images or image paths and the SampleParser to parse them
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

    # An iterable of `(image_or_path, anno_or_path)` tuples and the SampleParser
    # to use to parse the tuples
    samples = ...
    sample_parser = foub.BDDSampleParser  # for example

    # Add labeled images to the dataset
    dataset.add_labeled_images(samples, sample_parser)

.. _ingesting-samples-into-datasets:

Ingesting samples into datasets
-------------------------------

Creating FiftyOne datasets typically does not create copies of the source data,
since |Sample| instances store the `filepath` to the data, not the data itself.

However, in certain circumstances, such as loading data from binary sources
like `TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_
or creating a FiftyOne dataset from unorganized and/or temporary files on disk,
it can be desirable to *ingest* the raw data for each sample into a common
backing location.

FiftyOne provides support for ingesting samples and their underlying source
data in both :ref:`common formats <builtin-sample-parser>` and
extended to import datasets in :ref:`custom formats <custom-sample-parser>`.

Basic recipe
~~~~~~~~~~~~

The basic recipe for ingesting samples and their source data into a |Dataset|
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

        # The iterable of samples and the SampleParser to use to parse them
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

        # The iterable of samples and the SampleParser to use to parse them
        samples = ...
        sample_parser = foub.BDDSampleParser  # for example

        # A directory in which the images will be written; If `None`, a default directory
        # based on the dataset's `name` will be used
        dataset_dir = ...

        # Add the labeled image samples to the dataset
        dataset.add_labeled_images(samples, sample_parser, dataset_dir=dataset_dir)

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
`NumPy <https://numpy.org>`_ format via ``np.asarray()`` of the path to an
image on disk.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud


    dataset = fo.Dataset()

    # An iterable of images or image paths and the SampleParser to use to parse
    # the samples
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

    # An iterable of `(image_or_path, anno_or_path)` tuples and the SampleParser to
    # use to parse the tuples
    samples = ...
    sample_parser = foub.BDDSampleParser  # for example

    # A directory in which the images will be written; If `None`, a default directory
    # based on the dataset's `name` will be used
    dataset_dir = ...

    # Ingest the labeled images into the dataset
    # The source images are copied into `dataset_dir`
    dataset.ingest_labeled_images(samples, sample_parser, dataset_dir=dataset_dir)

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
| :class:`ImageClassificationSampleParser                                | Generic parser for image classification samples whose labels are represented as |Classification| instances.     |
| <fiftyone.utils.data.parsers.ImageClassificationSampleParser>`         |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`ImageDetectionSampleParser                                     | Generic parser for image detection samples whose labels are represented as |Detections| instances.              |
| <fiftyone.utils.data.parsers.ImageDetectionSampleParser>`              |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`ImageLabelsSampleParser                                        | Generic parser for image detection samples whose labels are represented as |ImageLabels| instances.             |
| <fiftyone.utils.data.parsers.ImageLabelsSampleParser>`                 |                                                                                                                 |
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
| :class:`TFImageClassificationSampleParser                              | Parser for image classification samples stored as                                                               |
| <fiftyone.utils.tf.TFImageClassificationSampleParser>`                 | `TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_.                                         |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`TFObjectDetectionSampleParser                                  | Parser for image detection samples stored in                                                                    |
| <fiftyone.utils.tf.TFObjectDetectionSampleParser>`                     | `TF Object Detection API format <https://github.com/tensorflow/models/blob/master/research/object_detection>`_. |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`COCODetectionSampleParser                                      | Parser for samples in `COCO detection format <http://cocodataset.org/#home>`_.                                  |
| <fiftyone.utils.coco.COCODetectionSampleParser>`                       |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`VOCDetectionSampleParser                                       | Parser for samples in `VOC detection format <http://host.robots.ox.ac.uk/pascal/VOC>`_.                         |
| <fiftyone.utils.voc.VOCDetectionSampleParser>`                         |                                                                                                                 |
+------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| :class:`KITTIDetectionSampleParser                                     | Parser for samples in `KITTI detection format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.         |
| <fiftyone.utils.kitti.KITTIDetectionSampleParser>`                     |                                                                                                                 |
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

Unlabeled images
~~~~~~~~~~~~~~~~

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

    # An iterable of samples to parse and the SampleParser to use to parse them
    samples = ...
    sample_parser = CustomUnlabeledImageSampleParser(...)

    for sample in samples:
        sample_parser.with_sample(sample)

        filepath = sample_parser.get_image_path()

        if sample_parser.has_image_metadata:
            metadata = sample_parser.get_image_metadata()
        else:
            metadata = None

        dataset.add_sample(fo.Sample(filepath=filepath, metadata=metadata))

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

Labeled images
~~~~~~~~~~~~~~

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
            """The :class:`fiftyone.core.labels.Label` class returned by this
            parser, or ``None`` if it returns a dictionary of labels.
            """
            # Return a Label subclass here
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

    # An iterable of samples and the SampleParser to use to parse them
    samples = ...
    sample_parser = CustomLabeledImageSampleParser(...)

    # The name of the sample field in which to store the labels
    label_field = "ground_truth"  # for example

    for sample in samples:
        sample_parser.with_sample(sample)

        filepath = sample_parser.get_image_path()

        if sample_parser.has_image_metadata:
            metadata = sample_parser.get_image_metadata()
        else:
            metadata = None

        label = sample_parser.get_label()

        sample = fo.Sample(filepath=filepath, metadata=metadata)

        if isinstance(label, dict):
            sample.update_fields(label)
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

By convention, all |LabeledImageSampleParser| implementations must make the
current sample's image available via
:meth:`get_image() <fiftyone.utils.data.parsers.LabeledImageSampleParser.get_image>`
, and they must make the current sample's label available via
:meth:`get_label() <fiftyone.utils.data.parsers.LabeledImageSampleParser.get_label>`.
