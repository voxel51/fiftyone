Adding Samples to Datasets
==========================

.. default-role:: code
.. include:: ../../substitutions.rst

FiftyOne datasets are composed of |Sample| instances, and FiftyOne provides a
number of options for building datasets from samples.

You can take a fully customized approach and build your own |Sample| instances,
or you can a builtin |SampleParser| clasess to parse samples from a variety of
common formats, or you can provide your own |SampleParser| to automatically
load samples in your own custom formats.

Manually building datasets
--------------------------

The most flexible way to create a FiftyOne dataset is to manually
construct your own |Sample| instances.

The following examples demonstrate how to construct datasets of various kinds
manually:

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
        print(dataset.view().head())

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
        print(dataset.view().head())

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
        print(dataset.view().head())

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
        print(dataset.view().head())

Adding samples in builtin formats
---------------------------------

FiftyOne provides native support for loading samples in a variety of common
formats. See the table below for details.

The basic recipe is that you create a |SampleParser| of the appropriate type of
sample that you're loading and then pass the parser along with an iterable of
samples to the appropriate |Dataset| method:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.core.utils.bdd as foub

    dataset = fo.Dataset()

    # The iterable of samples
    samples = ...

    # The SampleParser to use to parse the samples
    sample_parser = foub.BDDSampleParser  # for example

    # Add the labeled image samples to the dataset
    dataset.add_labeled_images(samples, sample_parser)

.. note::

    A typical use case is that ``samples`` in the above recipe is a
    ``torch.utils.data.Dataset`` or an iterable generated by
    ``tf.data.Dataset.as_numpy_iterator()``.

Supported formats
~~~~~~~~~~~~~~~~~

The following table describes the common dataset formats for which FiftyOne
provides builtin |SampleParser| implementations.

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

Adding unlabeled images
~~~~~~~~~~~~~~~~~~~~~~~

FiftyOne provides a few convenient ways to load unlabeled images into FiftyOne
datasets.

Adding a directory of images
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_images_dir() <fiftyone.core.dataset.Dataset.add_images_dir>`
to add a directory of images to a dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # A directory of images to add
    images_dir = "/path/to/images"

    dataset = fo.Dataset()

    # Add images to the dataset
    dataset.add_images_dir(images_dir)

Adding a glob pattern of images
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_images_patt() <fiftyone.core.dataset.Dataset.add_images_patt>`
to add a glob pattern of images to a dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # A glob pattern of images to add
    image_patt = "/path/to/images"

    dataset = fo.Dataset()

    # Add images to the dataset
    dataset.add_images_patt(image_patt)

Adding images using a SampleParser
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Use :meth:`Dataset.add_images() <fiftyone.core.dataset.Dataset.add_images>`
to add an iterable of unlabeled images that can be parsed via a specified
|UnlabeledImageSampleParser| to a dataset.

For example, FiftyOne provides an
:class:`ImageSampleParser <fiftyone.utils.data.parsers.ImageSampleParser>`
that handles samples that contain either an image that can be converted to
`NumPy <https://numpy.org>`_ format via ``np.asarray()`` of the path to an
image on disk.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.data as foud

    # An iterable of images or image paths
    samples = ...

    dataset = fo.Dataset()

    # Add images to the dataset
    dataset.add_images(samples, foud.ImageSampleParser)

Adding labeled images
~~~~~~~~~~~~~~~~~~~~~

Use :meth:`Dataset.add_labeled_images() <fiftyone.core.dataset.Dataset.add_labeled_images>`
to add an iterable of samples that can be parsed via a specified
|LabeledImageSampleParser| to a dataset.

For example, FiftyOne provides an
:class:`BDDSampleParser <fiftyone.utils.bdd.BDDSampleParser>` that handles
samples that contain ``(image_or_path, anno_or_path)`` tuples, where:

- ``image_or_path`` is either an image that can be converted to numpy
  format via ``np.asarray()`` or the path to an image on disk

- ``anno_or_path`` is a dict of
  :class:`BDD annotations <fiftyone.utils.bdd.BDDSampleParser>` or the path to
  such a JSON file on disk

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.bdd as foub

    # An iterable of `(image_or_path, anno_or_path)` tuples
    samples = ...

    dataset = fo.Dataset()

    # Add images to the dataset
    dataset.add_labeled_images(samples, foub.BDDSampleParser)

Adding samples in custom formats
---------------------------------

If your samples are stored in a custom format, you can provide a custom
|SampleParser| class and provide it to FiftyOne when adding your samples to
datasets.

|SampleParser| itself is an abstract interface; the concrete interface that you
should implement is determined by the type of samples that you are importing.

**Unlabeled images**

To define a custom parser for unlabeled images, implement the
|UnlabeledImageSampleParser| interface.

The pseudocode below provides a template for a custom
|UnlabeledImageSampleParser|:
