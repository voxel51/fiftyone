.. _dataset-zoo-datasets:

Built-In Zoo Datasets
=====================

.. default-role:: code

This page lists all of the natively available datasets in the FiftyOne Dataset
Zoo.

Check out the :ref:`API reference <dataset-zoo-api>` for complete instructions
for using the Dataset Zoo.

.. note::

    Some datasets are loaded via the
    `TorchVision Datasets <https://pytorch.org/vision/stable/datasets.html>`_
    or `TensorFlow Datasets <https://www.tensorflow.org/datasets>`_ packages
    under the hood.

    If you do not have a :ref:`suitable package <dataset-zoo-ml-backend>`
    installed when attempting to download a zoo dataset, you'll see an error
    message that will help you install one.

.. table::
    :widths: 40 60

    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | Dataset name                                                       | Tags                                                                      |
    +====================================================================+===========================================================================+
    | :ref:`ActivityNet 100 <dataset-zoo-activitynet-100>`               | video, classification, action-recognition, temporal-detection             |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`ActivityNet 200 <dataset-zoo-activitynet-200>`               | video, classification, action-recognition, temporal-detection             |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`BDD100K <dataset-zoo-bdd100k>`                               | image, multilabel, automotive, manual                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Caltech-101 <dataset-zoo-caltech101>`                        | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Caltech-256 <dataset-zoo-caltech256>`                        | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`CIFAR-10 <dataset-zoo-cifar10>`                              | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`CIFAR-100 <dataset-zoo-cifar100>`                            | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Cityscapes <dataset-zoo-cityscapes>`                         | image, multilabel, automotive, manual                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`COCO-2014 <dataset-zoo-coco-2014>`                           | image, detection, segmentation                                            |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`COCO-2017 <dataset-zoo-coco-2017>`                           | image, detection, segmentation                                            |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Fashion MNIST <dataset-zoo-fashion-mnist>`                   | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Families in the Wild <dataset-zoo-fiw>`                      | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`HMDB51 <dataset-zoo-hmdb51>`                                 | video, action-recognition                                                 |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`ImageNet 2012 <dataset-zoo-imagenet-2012>`                   | image, classification, manual                                             |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`ImageNet Sample <dataset-zoo-imagenet-sample>`               | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Kinetics 400 <dataset-zoo-kinetics-400>`                     | video, classification, action-recognition                                 |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Kinetics 600 <dataset-zoo-kinetics-600>`                     | video, classification, action-recognition                                 |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Kinetics 700 <dataset-zoo-kinetics-700>`                     | video, classification, action-recognition                                 |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Kinetics 700-2020 <dataset-zoo-kinetics-700-2020>`           | video, classification, action-recognition                                 |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`KITTI <dataset-zoo-kitti>`                                   | image, detection                                                          |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`KITTI Multiview <dataset-zoo-kitti-multiview>`               | image, point-cloud, detection                                             |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Labeled Faces in the Wild <dataset-zoo-lfw>`                 | image, classification, facial-recognition                                 |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`MNIST <dataset-zoo-mnist>`                                   | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Open Images V6 <dataset-zoo-open-images-v6>`                 | image, classification, detection, segmentation, relationships             |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Open Images V7 <dataset-zoo-open-images-v7>`                 | image, classification, detection, segmentation, keypoints, relationships  |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Places <dataset-zoo-places>`                                 | image, classification                                                     |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Quickstart <dataset-zoo-quickstart>`                         | image, quickstart                                                         |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Quickstart Geo <dataset-zoo-quickstart-geo>`                 | image, location, quickstart                                               |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Quickstart Video <dataset-zoo-quickstart-video>`             | video, quickstart                                                         |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Quickstart Groups <dataset-zoo-quickstart-groups>`           | image, point-cloud, quickstart                                            |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Quickstart 3D <dataset-zoo-quickstart-3d>`                   | 3d, point-cloud, mesh, quickstart                                         |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`Sama-COCO <dataset-zoo-sama-coco>`                           | image, detection, segmentation                                            |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`UCF101 <dataset-zoo-ucf101>`                                 | video, action-recognition                                                 |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`VOC-2007 <dataset-zoo-voc-2007>`                             | image, detection                                                          |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+
    | :ref:`VOC-2012 <dataset-zoo-voc-2012>`                             | image, detection                                                          |
    +--------------------------------------------------------------------+---------------------------------------------------------------------------+

.. _dataset-zoo-activitynet-100:

ActivityNet 100
---------------

ActivityNet is a large-scale video dataset for human activity understanding
supporting the tasks of global video classification, trimmed activity
classification, and temporal activity detection.

This version contains videos and temporal activity detections for the 100 class
version of the dataset.

.. note::

    Check out :ref:`this guide <activitynet>` for more details on using
    FiftyOne to work with ActivityNet.

**Notes**

-   ActivityNet 100 and 200 differ in the number of activity classes and
    videos per split
-   Partial downloads will download videos (if still available) from YouTube
-   Full splits can be loaded by first downloading the official source files
    from the
    `ActivityNet maintainers <https://docs.google.com/forms/d/e/1FAIpQLSeKaFq9ZfcmZ7W0B0PbEhfbTHY41GeEgwsa7WobJgGUhn4DTQ/viewform>`_
-   The test set does not have annotations

**Details**

-   Dataset name: ``activitynet-100``
-   Dataset source: http://activity-net.org/index.html
-   Dataset license: CC-BY-4.0
-   Dataset size: 223 GB
-   Tags: ``video, classification, action-recognition, temporal-detection``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`ActivityNet100Dataset <fiftyone.zoo.datasets.base.ActivityNet100Dataset>`

**Full split stats**

-   Train split: 4,819 videos (7,151 instances)
-   Test split: 2,480 videos (labels withheld)
-   Validation split: 2,383 videos (3,582 instances)

**Partial downloads**

FiftyOne provides parameters that can be used to efficiently download specific
subsets of the ActivityNet dataset to suit your needs. When new subsets are
specified, FiftyOne will use existing downloaded data first if possible before
resorting to downloading additional data from YouTube.

The following parameters are available to configure a partial download of
ActivityNet 100 by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If none are provided, all available
    splits are loaded

-   **source_dir** (*None*): the directory containing the manually downloaded
    ActivityNet files used to avoid downloading videos from YouTube

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **max_duration** (*None*): only videos with a duration in seconds that is
    less than or equal to the `max_duration` will be downloaded. By default,
    all videos are downloaded

-   **copy_files** (*True*): whether to move (False) or create copies (True) of
    the source files when populating ``dataset_dir``. This is only relevant
    when a ``source_dir`` is provided

-   **num_workers** (*None*): the number of processes to use when downloading
    individual videos. By default, ``multiprocessing.cpu_count()`` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``classes`` are also specified, only up to the number of samples that
    contain at least one specified class will be loaded. By default, all
    matching samples are loaded

.. note::

    See
    :class:`ActivityNet100Dataset <fiftyone.zoo.datasets.base.ActivityNet100Dataset>` and
    :class:`ActivityNetDatasetImporter <fiftyone.utils.activitynet.ActivityNetDatasetImporter>`
    for complete descriptions of the optional keyword arguments that you can
    pass to :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Full split downloads**

Many videos have been removed from YouTube since the creation of ActivityNet.
As a result, if you do not specify any partial download parameters defined in
the previous section, you must first download the official source files from
the ActivityNet maintainers in order to load a full split into FiftyOne.

To download the source files, you must fill out
`this form <https://docs.google.com/forms/d/e/1FAIpQLSeKaFq9ZfcmZ7W0B0PbEhfbTHY41GeEgwsa7WobJgGUhn4DTQ/viewform>`_.

Refer to :ref:`this page <activitynet-full-split-downloads>` to see how to load
full splits by passing the `source_dir` parameter to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary)
        #

        dataset = foz.load_zoo_dataset(
            "activitynet-100",
            split="validation",
            max_samples=10,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load 10 samples from the validation split that
        # contain the actions "Bathing dog" and "Walking the dog"
        #
        # Videos that contain all `classes` will be prioritized first, followed
        # by videos that contain at least one of the required `classes`. If
        # there are not enough videos matching `classes` in the split to meet
        # `max_samples`, only the available videos will be loaded.
        #
        # Videos will only be downloaded if necessary
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any videos
        #

        dataset = foz.load_zoo_dataset(
            "activitynet-100",
            split="validation",
            classes=["Bathing dog", "Walking the dog"],
            max_samples=10,
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary)
        #

        fiftyone zoo datasets load activitynet-100 \
            --split validation \
            --kwargs max_samples=10

        fiftyone app launch activitynet-100-validation-10

        #
        # Load 10 samples from the validation split that
        # contain the actions "Archery" and "Cricket"
        #
        # Videos that contain all `classes` will be prioritized first, followed
        # by videos that contain at least one of the required `classes`. If
        # there are not enough videos matching `classes` in the split to meet
        # `max_samples`, only the available videos will be loaded.
        #
        # Videos will only be downloaded if necessary
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any videos
        #

        fiftyone zoo datasets load activitynet-100 \
            --split validation \
            --kwargs \
                classes=Archery,Cricket \
                max_samples=10

        fiftyone app launch activitynet-100-validation-10

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/activitynet-100-validation.png
   :alt: activitynet-100-validation
   :align: center

.. _dataset-zoo-activitynet-200:

ActivityNet 200
---------------

ActivityNet is a large-scale video dataset for human activity understanding
supporting the tasks of global video classification, trimmed activity
classification, and temporal activity detection.

This version contains videos and temporal activity detections for the 200 class
version of the dataset.

.. note::

    Check out :ref:`this guide <activitynet>` for more details on using
    FiftyOne to work with ActivityNet.

**Notes**

-   ActivityNet 200 is a superset of ActivityNet 100
-   ActivityNet 100 and 200 differ in the number of activity classes and videos
    per split
-   Partial downloads will download videos (if still available) from YouTube
-   Full splits can be loaded by first downloading the official source files
    from the
    `ActivityNet maintainers <https://docs.google.com/forms/d/e/1FAIpQLSeKaFq9ZfcmZ7W0B0PbEhfbTHY41GeEgwsa7WobJgGUhn4DTQ/viewform>`_
-   The test set does not have annotations

**Details**

-   Dataset name: ``activitynet-200``
-   Dataset source: http://activity-net.org/index.html
-   Dataset license: CC-BY-4.0
-   Dataset size: 500 GB
-   Tags: ``video, classification, action-recognition, temporal-detection``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`ActivityNet200Dataset <fiftyone.zoo.datasets.base.ActivityNet200Dataset>`

**Full split stats**

-   Train split: 10,024 videos (15,410 instances)
-   Test split: 5,044 videos (labels withheld)
-   Validation split: 4,926 videos (7,654 instances)

**Partial downloads**

FiftyOne provides parameters that can be used to efficiently download specific
subsets of the ActivityNet dataset to suit your needs. When new subsets are
specified, FiftyOne will use existing downloaded data first if possible before
resorting to downloading additional data from YouTube.

The following parameters are available to configure a partial download of
ActivityNet 200 by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If none are provided, all available
    splits are loaded

-   **source_dir** (*None*): the directory containing the manually downloaded
    ActivityNet files used to avoid downloading videos from YouTube

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **max_duration** (*None*): only videos with a duration in seconds that is
    less than or equal to the `max_duration` will be downloaded. By default,
    all videos are downloaded

-   **copy_files** (*True*): whether to move (False) or create copies (True) of
    the source files when populating ``dataset_dir``. This is only relevant
    when a ``source_dir`` is provided

-   **num_workers** (*None*): the number of processes to use when downloading
    individual videos. By default, ``multiprocessing.cpu_count()`` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``classes`` are also specified, only up to the number of samples that
    contain at least one specified class will be loaded. By default, all
    matching samples are loaded

.. note::

    See
    :class:`ActivityNet200Dataset <fiftyone.zoo.datasets.base.ActivityNet200Dataset>` and
    :class:`ActivityNetDatasetImporter <fiftyone.utils.activitynet.ActivityNetDatasetImporter>`
    for complete descriptions of the optional keyword arguments that you can
    pass to :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Full split downloads**

Many videos have been removed from YouTube since the creation of ActivityNet.
As a result, if you do not specify any partial download parameters defined in
the previous section, you must first download the official source files from
the ActivityNet maintainers in order to load a full split into FiftyOne.

To download the source files, you must fill out
`this form <https://docs.google.com/forms/d/e/1FAIpQLSeKaFq9ZfcmZ7W0B0PbEhfbTHY41GeEgwsa7WobJgGUhn4DTQ/viewform>`_.

Refer to :ref:`this page <activitynet-full-split-downloads>` to see how to load
full splits by passing the `source_dir` parameter to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary)
        #

        dataset = foz.load_zoo_dataset(
            "activitynet-200",
            split="validation",
            max_samples=10,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load 10 samples from the validation split that
        # contain the actions "Bathing dog" and "Walking the dog"
        #
        # Videos that contain all `classes` will be prioritized first, followed
        # by videos that contain at least one of the required `classes`. If
        # there are not enough videos matching `classes` in the split to meet
        # `max_samples`, only the available videos will be loaded.
        #
        # Videos will only be downloaded if necessary
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any videos
        #

        dataset = foz.load_zoo_dataset(
            "activitynet-200",
            split="validation",
            classes=["Bathing dog", "Walking the dog"],
            max_samples=10,
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary)
        #

        fiftyone zoo datasets load activitynet-200 \
            --split validation \
            --kwargs max_samples=10

        fiftyone app launch activitynet-200-validation-10

        #
        # Load 10 samples from the validation split that
        # contain the actions "Archery" and "Cricket"
        #
        # Videos that contain all `classes` will be prioritized first, followed
        # by videos that contain at least one of the required `classes`. If
        # there are not enough videos matching `classes` in the split to meet
        # `max_samples`, only the available videos will be loaded.
        #
        # Videos will only be downloaded if necessary
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any videos
        #

        fiftyone zoo datasets load activitynet-100 \
            --split validation \
            --kwargs \
                classes=Archery,Cricket \
                max_samples=10

        fiftyone app launch activitynet-100-validation-10

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/activitynet-200-validation.png
   :alt: activitynet-200-validation
   :align: center

.. _dataset-zoo-bdd100k:

BDD100K
-------

The Berkeley Deep Drive (BDD) dataset is one of the largest and most diverse
video datasets for autonomous vehicles.

The BDD100K dataset contains 100,000 video clips collected from more than
50,000 rides covering New York, San Francisco Bay Area, and other regions.
The dataset contains diverse scene types such as city streets, residential
areas, and highways. Furthermore, the videos were recorded in diverse
weather conditions at different times of the day.

The videos are split into training (70K), validation (10K) and testing
(20K) sets. Each video is 40 seconds long with 720p resolution and a frame
rate of 30fps. The frame at the 10th second of each video is annotated for
image classification, detection, and segmentation tasks.

This version of the dataset contains only the 100K images extracted from
the videos as described above, together with the image classification,
detection, and segmentation labels.

.. note::

    In order to load the BDD100K dataset, you must download the source data
    manually. The directory should be organized in the following format:

    .. code-block:: text

        source_dir/
            labels/
                bdd100k_labels_images_train.json
                bdd100k_labels_images_val.json
            images/
                100k/
                    train/
                    test/
                    val/

    You can register at https://bdd-data.berkeley.edu in order to get links
    to download the data.

**Details**

-   Dataset name: ``bdd100k``
-   Dataset source: https://bdd-data.berkeley.edu
-   Dataset license: https://doc.bdd100k.com/license.html
-   Dataset size: 7.10 GB
-   Tags: ``image, multilabel, automotive, manual``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`BDD100KDataset <fiftyone.zoo.datasets.base.BDD100KDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        # The path to the source files that you manually downloaded
        source_dir = "/path/to/dir-with-bdd100k-files"

        dataset = foz.load_zoo_dataset(
            "bdd100k",
            split="validation",
            source_dir=source_dir,
        )

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        # The path to the source files that you manually downloaded
        SOURCE_DIR="/path/to/dir-with-bdd100k-files"

        fiftyone zoo datasets load bdd100k --split validation \
            --kwargs "source_dir=${SOURCE_DIR}"

        fiftyone app launch bdd100k-validation

.. image:: /images/dataset_zoo/bdd100k-validation.png
   :alt: bdd100k-validation
   :align: center

.. _dataset-zoo-caltech101:

Caltech-101
-----------

The Caltech-101 dataset of images.

The dataset consists of pictures of objects belonging to 101 classes, plus
one background clutter class (``BACKGROUND_Google``). Each image is labelled
with a single object.

Each class contains roughly 40 to 800 images, totalling around 9,000
images. Images are of variable sizes, with typical edge lengths of 200-300
pixels. This version contains image-level labels only.

**Details**

-   Dataset name: ``caltech101``
-   Dataset source: https://data.caltech.edu/records/mzrjq-6wc02
-   Dataset license: CC-BY-4.0
-   Dataset size: 138.60 MB
-   Tags: ``image, classification``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`Caltech101Dataset <fiftyone.zoo.datasets.base.Caltech101Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("caltech101")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load caltech101

        fiftyone app launch caltech101

.. image:: /images/dataset_zoo/caltech101.png
   :alt: caltech101
   :align: center

.. _dataset-zoo-caltech256:

Caltech-256
-----------

The Caltech-256 dataset of images.

The dataset consists of pictures of objects belonging to 256 classes, plus
one background clutter class (``clutter``). Each image is labelled with a
single object.

Each class contains between 80 and 827 images, totalling 30,607 images.
Images are of variable sizes, with typical edge lengths of 80-800 pixels.

**Details**

-   Dataset name: ``caltech256``
-   Dataset source: https://data.caltech.edu/records/nyy15-4j048
-   Dataset license: CC-BY-4.0
-   Dataset size: 1.16 GB
-   Tags: ``image, classification``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`Caltech256Dataset <fiftyone.zoo.datasets.base.Caltech256Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("caltech256")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load caltech256

        fiftyone app launch caltech256

.. image:: /images/dataset_zoo/caltech256.png
   :alt: caltech256
   :align: center

.. _dataset-zoo-cifar10:

CIFAR-10
--------

The CIFAR-10 dataset of images.

The dataset consists of 60,000 32 x 32 color images in 10 classes, with 6,000
images per class. There are 50,000 training images and 10,000 test images.

**Details**

-   Dataset name: ``cifar10``
-   Dataset source: https://www.cs.toronto.edu/~kriz/cifar.html
-   Dataset size: 132.40 MB
-   Tags: ``image, classification``
-   Supported splits: ``train, test``
-   ZooDataset classes:

    -   :class:`CIFAR10Dataset <fiftyone.zoo.datasets.tf.CIFAR10Dataset>` (TF backend)
    -   :class:`CIFAR10Dataset <fiftyone.zoo.datasets.torch.CIFAR10Dataset>` (Torch backend)

.. note::

    You must have the
    :ref:`Torch or TensorFlow backend(s) <dataset-zoo-ml-backend>` installed to
    load this dataset.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("cifar10", split="test")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load cifar10 --split test

        fiftyone app launch cifar10-test

.. image:: /images/dataset_zoo/cifar10-test.png
   :alt: cifar10-test
   :align: center

.. _dataset-zoo-cifar100:

CIFAR-100
---------

The CIFAR-100 dataset of images.

The dataset consists of 60,000 32 x 32 color images in 100 classes, with
600 images per class. There are 50,000 training images and 10,000 test
images.

**Details**

-   Dataset name: ``cifar100``
-   Dataset source: https://www.cs.toronto.edu/~kriz/cifar.html
-   Dataset size: 132.03 MB
-   Tags: ``image, classification``
-   Supported splits: ``train, test``
-   ZooDataset classes:

    -   :class:`CIFAR100Dataset <fiftyone.zoo.datasets.tf.CIFAR100Dataset>` (TF backend)
    -   :class:`CIFAR100Dataset <fiftyone.zoo.datasets.torch.CIFAR100Dataset>` (Torch backend)

.. note::

    You must have the
    :ref:`Torch or TensorFlow backend(s) <dataset-zoo-ml-backend>` installed to
    load this dataset.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("cifar100", split="test")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load cifar100 --split test

        fiftyone app launch cifar100-test

.. image:: /images/dataset_zoo/cifar100-test.png
   :alt: cifar100-test
   :align: center

.. _dataset-zoo-cityscapes:

Cityscapes
----------

Cityscapes is a large-scale dataset that contains a diverse set of
stereo video sequences recorded in street scenes from 50 different cities,
with high quality pixel-level annotations of 5,000 frames in addition to a
larger set of 20,000 weakly annotated frames.

The dataset is intended for:

-   Assessing the performance of vision algorithms for major tasks of
    semantic urban scene understanding: pixel-level, instance-level, and
    panoptic semantic labeling
-   Supporting research that aims to exploit large volumes of (weakly)
    annotated data, e.g. for training deep neural networks

.. note::

    In order to load the Cityscapes dataset, you must download the source data
    manually. The directory should be organized in the following format:

    .. code-block:: text

        source_dir/
            leftImg8bit_trainvaltest.zip
            gtFine_trainvaltest.zip             # optional
            gtCoarse.zip                        # optional
            gtBbox_cityPersons_trainval.zip     # optional

    You can register at https://www.cityscapes-dataset.com/register in order
    to get links to download the data.

**Details**

-   Dataset name: ``cityscapes``
-   Dataset source: https://www.cityscapes-dataset.com
-   Dataset license: https://www.cityscapes-dataset.com/license
-   Dataset size: 11.80 GB
-   Tags: ``image, multilabel, automotive, manual``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`CityscapesDataset <fiftyone.zoo.datasets.base.CityscapesDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        # The path to the source files that you manually downloaded
        source_dir = "/path/to/dir-with-cityscapes-files"

        dataset = foz.load_zoo_dataset(
            "cityscapes",
            split="validation",
            source_dir=source_dir,
        )

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        # The path to the source files that you manually downloaded
        SOURCE_DIR="/path/to/dir-with-cityscapes-files"

        fiftyone zoo datasets load cityscapes --split validation \
            --kwargs "source_dir=${SOURCE_DIR}"

        fiftyone app launch cityscapes-validation

.. image:: /images/dataset_zoo/cityscapes-validation.png
   :alt: cityscapes-validation
   :align: center

.. _dataset-zoo-coco-2014:

COCO-2014
---------

COCO is a large-scale object detection, segmentation, and captioning
dataset.

This version contains images, bounding boxes, and segmentations for the 2014
version of the dataset.

.. note::

    With support from the `COCO team <https://cocodataset.org/#download>`_,
    FiftyOne is a recommended tool for downloading, visualizing, and evaluating
    on the COCO dataset!

    Check out :ref:`this guide <coco>` for more details on using FiftyOne to
    work with COCO.

**Notes**

-   COCO defines 91 classes but the data only uses 80 classes
-   Some images from the train and validation sets don't have annotations
-   The test set does not have annotations
-   COCO 2014 and 2017 use the same images, but the splits are different

**Details**

-   Dataset name: ``coco-2014``
-   Dataset source: http://cocodataset.org/#home
-   Dataset license: CC-BY-4.0
-   Dataset size: 37.57 GB
-   Tags: ``image, detection, segmentation``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`COCO2014Dataset <fiftyone.zoo.datasets.base.COCO2014Dataset>`

**Full split stats**

-   Train split: 82,783 images
-   Test split: 40,775 images
-   Validation split: 40,504 images

**Partial downloads**

FiftyOne provides parameters that can be used to efficiently download specific
subsets of the COCO dataset to suit your needs. When new subsets are specified,
FiftyOne will use existing downloaded data first if possible before resorting
to downloading additional data from the web.

The following parameters are available to configure a partial download of
COCO-2014 by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **label_types** (*None*): a label type or list of label types to load.
    Supported values are ``("detections", "segmentations")``. By default, only
    detections are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **image_ids** (*None*): a list of specific image IDs to load. The IDs can
    be specified either as ``<split>/<image-id>`` strings or ``<image-id>``
    ints of strings. Alternatively, you can provide the path to a TXT
    (newline-separated), JSON, or CSV file containing the list of image IDs to
    load in either of the first two formats

-   **include_id** (*False*): whether to include the COCO ID of each sample in
    the loaded labels

-   **include_license** (*False*): whether to include the COCO license of each
    sample in the loaded labels, if available. The supported values are:

    -   ``"False"`` (default): don't load the license
    -   ``True``/``"name"``: store the string license name
    -   ``"id"``: store the integer license ID
    -   ``"url"``: store the license URL

-   **only_matching** (*False*): whether to only load labels that match the
    ``classes`` or ``attrs`` requirements that you provide (True), or to load
    all labels for samples that match the requirements (False)

-   **num_workers** (*None*): the number of processes to use when downloading
    individual images. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``label_types`` and/or ``classes`` are also specified, first priority will
    be given to samples that contain all of the specified label types and/or
    classes, followed by samples that contain at least one of the specified
    labels types or classes. The actual number of samples loaded may be less
    than this maximum value if the dataset does not contain sufficient samples
    matching your requirements

.. note::

    See
    :class:`COCO2014Dataset <fiftyone.zoo.datasets.base.COCO2014Dataset>` and
    :class:`COCODetectionDatasetImporter <fiftyone.utils.coco.COCODetectionDatasetImporter>`
    for complete descriptions of the optional keyword arguments that you can
    pass to :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, only detections are loaded
        #

        dataset = foz.load_zoo_dataset(
            "coco-2014",
            split="validation",
            max_samples=50,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load segmentations for 25 samples from the validation split that
        # contain cats and dogs
        #
        # Images that contain all `classes` will be prioritized first, followed
        # by images that contain at least one of the required `classes`. If
        # there are not enough images matching `classes` in the split to meet
        # `max_samples`, only the available images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        dataset = foz.load_zoo_dataset(
            "coco-2014",
            split="validation",
            label_types=["segmentations"],
            classes=["cat", "dog"],
            max_samples=25,
        )

        session.dataset = dataset

        #
        # Download the entire validation split and load both detections and
        # segmentations
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        dataset = foz.load_zoo_dataset(
            "coco-2014",
            split="validation",
            label_types=["detections", "segmentations"],
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, only detections are loaded
        #

        fiftyone zoo datasets load coco-2014 \
            --split validation \
            --kwargs \
                max_samples=50

        fiftyone app launch coco-2014-validation-50

        #
        # Load segmentations for 25 samples from the validation split that
        # contain cats and dogs
        #
        # Images that contain all `classes` will be prioritized first, followed
        # by images that contain at least one of the required `classes`. If
        # there are not enough images matching `classes` in the split to meet
        # `max_samples`, only the available images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        fiftyone zoo datasets load coco-2014 \
            --split validation \
            --kwargs \
                label_types=segmentations \
                classes=cat,dog \
                max_samples=25

        fiftyone app launch coco-2014-validation-25

        #
        # Download the entire validation split and load both detections and
        # segmentations
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load coco-2014 \
            --split validation \
            --kwargs \
                label_types=detections,segmentations

        fiftyone app launch coco-2014-validation

.. image:: /images/dataset_zoo/coco-2014-validation.png
   :alt: coco-2014-validation
   :align: center

.. _dataset-zoo-coco-2017:

COCO-2017
---------

COCO is a large-scale object detection, segmentation, and captioning
dataset.

This version contains images, bounding boxes, and segmentations for the 2017
version of the dataset.

.. note::

    With support from the `COCO team <https://cocodataset.org/#download>`_,
    FiftyOne is a recommended tool for downloading, visualizing, and evaluating
    on the COCO dataset!

    Check out :ref:`this guide <coco>` for more details on using FiftyOne to
    work with COCO.

**Notes**

-   COCO defines 91 classes but the data only uses 80 classes
-   Some images from the train and validation sets don't have annotations
-   The test set does not have annotations
-   COCO 2014 and 2017 use the same images, but the splits are different

**Details**

-   Dataset name: ``coco-2017``
-   Dataset source: http://cocodataset.org/#home
-   Dataset license: CC-BY-4.0
-   Dataset size: 25.20 GB
-   Tags: ``image, detection, segmentation``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`COCO2017Dataset <fiftyone.zoo.datasets.base.COCO2017Dataset>`

**Full split stats**

-   Train split: 118,287 images
-   Test split: 40,670 images
-   Validation split: 5,000 images

**Partial downloads**

FiftyOne provides parameters that can be used to efficiently download specific
subsets of the COCO dataset to suit your needs. When new subsets are specified,
FiftyOne will use existing downloaded data first if possible before resorting
to downloading additional data from the web.

The following parameters are available to configure a partial download of
COCO-2017 by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **label_types** (*None*): a label type or list of label types to load.
    Supported values are ``("detections", "segmentations")``. By default, only
    detections are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **image_ids** (*None*): a list of specific image IDs to load. The IDs can
    be specified either as ``<split>/<image-id>`` strings or ``<image-id>``
    ints of strings. Alternatively, you can provide the path to a TXT
    (newline-separated), JSON, or CSV file containing the list of image IDs to
    load in either of the first two formats

-   **include_id** (*False*): whether to include the COCO ID of each sample in
    the loaded labels

-   **include_license** (*False*): whether to include the COCO license of each
    sample in the loaded labels, if available. The supported values are:

    -   ``"False"`` (default): don't load the license
    -   ``True``/``"name"``: store the string license name
    -   ``"id"``: store the integer license ID
    -   ``"url"``: store the license URL

-   **only_matching** (*False*): whether to only load labels that match the
    ``classes`` or ``attrs`` requirements that you provide (True), or to load
    all labels for samples that match the requirements (False)

-   **num_workers** (*None*): the number of processes to use when downloading
    individual images. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``label_types`` and/or ``classes`` are also specified, first priority will
    be given to samples that contain all of the specified label types and/or
    classes, followed by samples that contain at least one of the specified
    labels types or classes. The actual number of samples loaded may be less
    than this maximum value if the dataset does not contain sufficient samples
    matching your requirements

.. note::

    See
    :class:`COCO2017Dataset <fiftyone.zoo.datasets.base.COCO2017Dataset>` and
    :class:`COCODetectionDatasetImporter <fiftyone.utils.coco.COCODetectionDatasetImporter>`
    for complete descriptions of the optional keyword arguments that you can
    pass to :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, only detections are loaded
        #

        dataset = foz.load_zoo_dataset(
            "coco-2017",
            split="validation",
            max_samples=50,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load segmentations for 25 samples from the validation split that
        # contain cats and dogs
        #
        # Images that contain all `classes` will be prioritized first, followed
        # by images that contain at least one of the required `classes`. If
        # there are not enough images matching `classes` in the split to meet
        # `max_samples`, only the available images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        dataset = foz.load_zoo_dataset(
            "coco-2017",
            split="validation",
            label_types=["segmentations"],
            classes=["cat", "dog"],
            max_samples=25,
        )

        session.dataset = dataset

        #
        # Download the entire validation split and load both detections and
        # segmentations
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        dataset = foz.load_zoo_dataset(
            "coco-2017",
            split="validation",
            label_types=["detections", "segmentations"],
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, only detections are loaded
        #

        fiftyone zoo datasets load coco-2017 \
            --split validation \
            --kwargs \
                max_samples=50

        fiftyone app launch coco-2017-validation-50

        #
        # Load segmentations for 25 samples from the validation split that
        # contain cats and dogs
        #
        # Images that contain all `classes` will be prioritized first, followed
        # by images that contain at least one of the required `classes`. If
        # there are not enough images matching `classes` in the split to meet
        # `max_samples`, only the available images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        fiftyone zoo datasets load coco-2017 \
            --split validation \
            --kwargs \
                label_types=segmentations \
                classes=cat,dog \
                max_samples=25

        fiftyone app launch coco-2017-validation-25

        #
        # Download the entire validation split and load both detections and
        # segmentations
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load coco-2017 \
            --split validation \
            --kwargs \
                label_types=detections,segmentations

        fiftyone app launch coco-2017-validation

.. image:: /images/dataset_zoo/coco-2017-validation.png
   :alt: coco-2017-validation
   :align: center

.. _dataset-zoo-fashion-mnist:

Fashion MNIST
-------------

The Fashion-MNIST database of Zalando's fashion article images.

The dataset consists of 70,000 28 x 28 grayscale images in 10 classes.
There are 60,000 training images and 10,000 test images.

**Details**

-   Dataset name: ``fashion-mnist``
-   Dataset source: https://github.com/zalandoresearch/fashion-mnist
-   Dataset license: MIT
-   Dataset size: 36.42 MB
-   Tags: ``image, classification``
-   Supported splits: ``train, test``
-   ZooDataset classes:

    -   :class:`FashionMNISTDataset <fiftyone.zoo.datasets.tf.FashionMNISTDataset>` (TF backend)
    -   :class:`FashionMNISTDataset <fiftyone.zoo.datasets.torch.FashionMNISTDataset>` (Torch backend)

.. note::

    You must have the
    :ref:`Torch or TensorFlow backend(s) <dataset-zoo-ml-backend>` installed to
    load this dataset.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("fashion-mnist", split="test")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load fashion-mnist --split test

        fiftyone app launch fashion-mnist-test

.. image:: /images/dataset_zoo/fashion-mnist-test.png
   :alt: fashion-mnist-test
   :align: center

.. _dataset-zoo-fiw:

Families in the Wild
--------------------

Families in the Wild is a public benchmark for recognizing families via facial
images. The dataset contains over 26,642 images of 5,037 faces collected from
978 families. A unique Family ID (FID) is assigned per family, ranging from
F0001-F1018 (i.e., some families were merged or removed since its first release
in 2016). The dataset is a continued work in progress. Any contributions are
both welcome and appreciated!

Faces were cropped from imagery using the five-point face detector MTCNN from
various phototypes (i.e., mostly family photos, along with several profile pics
of individuals (facial shots). The number of members per family varies from
3-to-26, with the number of faces per subject ranging from 1 to >10.

Various levels and types of labels are associated with samples in this dataset.
Family-level labels contain a list of members, each assigned a member ID (MID)
unique to that respective family (e.g., F0011.MID2 refers to member 2 of family
11). Each member has annotations specifying gender and relationship to all
other members in that respective family.

The relationships in FIW are:

.. code-block:: text

    =====  =====
      ID    Type
    =====  =====
        0  not related or self
        1  child
        2  sibling
        3  grandchild
        4  parent
        5  spouse
        6  grandparent
        7  great grandchild
        8  great grandparent
        9  TBD
    =====  =====

Within FiftyOne, each sample corresponds to a single face image and contains
primitive labels of the Family ID, Member ID, etc. The relationship labels are
stored as :ref:`multi-label classifications <multilabel-classification>`,
where each classification represents one relationship that the member has with
another member in the family. The number of relationships will differ from one
person to the next, but all faces of one person will have the same relationship
labels.

Additionally, the labels for the
`Kinship Verification task <https://competitions.codalab.org/competitions/21843>`_
are also loaded into this dataset through FiftyOne. These labels are stored
as classifications just like relationships, but the labels of kinship differ
from those defined above. For example, rather than Parent, the label might be
`fd` representing a Father-Daughter kinship or `md` for Mother-Daughter.

In order to make it easier to browse the dataset in the FiftyOne App, each
sample also contains a `face_id` field containing a unique integer for each
face of a member, always starting at 0. This allows you to filter the `face_id`
field to 0 in the App to show only a single image of each person.

For your reference, the relationship labels are stored in disk in a matrix that
provides the relationship of each member with other members of the family as
well as names and genders. The i-th rows represent the i-th family member's
relationship to the j-th other members.

For example, `FID0001.csv` contains:

.. code-block:: text

    MID     1     2     3     Name    Gender
     1      0     4     5     name1     f
     2      1     0     1     name2     f
     3      5     4     0     name3     m

Here we have three family members, as listed under the MID column (far-left).
Each MID reads across its row. We can see that MID1 is related to MID2 by
4 -> 1 (Parent -> Child), which of course can be viewed as the inverse, i.e.,
MID2 -> MID1 is 1 -> 4. It can also be seen that MID1 and MID3 are spouses of
one another, i.e., 5 -> 5.

.. note::

    The spouse label will likely be removed in future version of this
    dataset. It serves no value to the problem of kinship.

For more information on the data (e.g., statistics, task evaluations,
benchmarks, and more), see the recent journal:

.. code-block:: text

    Robinson, JP, M. Shao, and Y. Fu. "Survey on the Analysis and Modeling of
    Visual Kinship: A Decade in the Making." IEEE Transactions on Pattern
    Analysis and Machine Intelligence (PAMI), 2021.

**Details**

-   Dataset name: ``fiw``
-   Dataset source: https://web.northeastern.edu/smilelab/fiw/
-   Dataset license: https://fulab.sites.northeastern.edu/fiw-download
-   Dataset size: 173.00 MB
-   Tags: ``image, kinship, verification, classification, search-and-retrieval, facial-recognition``
-   Supported splits: ``test, val, train``
-   ZooDataset class:
    :class:`FIWDataset <fiftyone.zoo.datasets.base.FIWDataset>`

.. note::

    For your convenience, FiftyOne provides
    :func:`get_pairwise_labels() <fiftyone.utils.fiw.get_pairwise_labels>`
    and
    :func:`get_identifier_filepaths_map() <fiftyone.utils.fiw.get_identifier_filepaths_map>`
    utilities for FIW.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("fiw", split="test")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load fiw --split test

        fiftyone app launch fiw-test

.. image:: /images/dataset_zoo/fiw.png
   :alt: fiw
   :align: center

.. _dataset-zoo-hmdb51:

HMBD51
-------

HMDB51 is an action recognition dataset containing a total of 6,766
clips distributed across 51 action classes.

**Details**

-   Dataset name: ``hmdb51``
-   Dataset source: https://serre-lab.clps.brown.edu/resource/hmdb-a-large-human-motion-database
-   Dataset license: CC-BY-4.0
-   Dataset size: 2.16 GB
-   Tags: ``video, action-recognition``
-   Supported splits: ``train, test, other``
-   ZooDataset class:
    :class:`HMDB51Dataset <fiftyone.zoo.datasets.base.HMDB51Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz
        import fiftyone.utils.video as fouv

        dataset = foz.load_zoo_dataset("hmdb51", split="test")

        # Re-encode source videos as H.264 MP4s so they can be viewed in the App
        fouv.reencode_videos(dataset)

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load hmdb51 --split test

        # Re-encode source videos as H.264 MP4s so they can be viewed in the App
        fiftyone utils transform-videos hmdb51-test --reencode

        fiftyone app launch hmdb51-test

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/hmdb51-test.png
   :alt: hmdb51-test
   :align: center

.. _dataset-zoo-imagenet-2012:

ImageNet 2012
-------------

The ImageNet 2012 dataset.

ImageNet, as known as ILSVRC 2012, is an image dataset organized according
to the WordNet hierarchy. Each meaningful concept in WordNet, possibly
described by multiple words or word phrases, is called a "synonym set" or
"synset". There are more than 100,000 synsets in WordNet, majority of them
are nouns (80,000+). ImageNet provides on average 1,000 images to
illustrate each synset. Images of each concept are quality-controlled and
human-annotated. In its completion, we hope ImageNet will offer tens of
millions of cleanly sorted images for most of the concepts in the WordNet
hierarchy.

Note that labels were never publicly released for the test set, so only the
training and validation sets are provided.

.. note::

    In order to load the ImageNet dataset, you must download the source data
    manually. The directory should be organized in the following format:

    .. code-block:: text

        source_dir/
            ILSVRC2012_devkit_t12.tar.gz    # both splits
            ILSVRC2012_img_train.tar        # train split
            ILSVRC2012_img_val.tar          # validation split

    You can register at http://www.image-net.org/download-images in order to
    get links to download the data.

**Details**

-   Dataset name: ``imagenet-2012``
-   Dataset source: http://image-net.org
-   Dataset license: https://image-net.org/download
-   Dataset size: 144.02 GB
-   Tags: ``image, classification, manual``
-   Supported splits: ``train, validation``
-   ZooDataset classes:

    -   :class:`ImageNet2012Dataset <fiftyone.zoo.datasets.tf.ImageNet2012Dataset>` (TF backend)
    -   :class:`ImageNet2012Dataset <fiftyone.zoo.datasets.torch.ImageNet2012Dataset>` (Torch backend)

.. note::

    You must have the
    :ref:`Torch or TensorFlow backend(s) <dataset-zoo-ml-backend>` installed to
    load this dataset.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        # The path to the source files that you manually downloaded
        source_dir = "/path/to/dir-with-imagenet-files"

        dataset = foz.load_zoo_dataset(
            "imagenet-2012",
            split="validation",
            source_dir=source_dir,
        )

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        # The path to the source files that you manually downloaded
        SOURCE_DIR="/path/to/dir-with-imagenet-files"

        fiftyone zoo datasets load imagenet-2012 --split validation \
            --kwargs "source_dir=${SOURCE_DIR}"

        fiftyone app launch imagenet-2012-validation

.. image:: /images/dataset_zoo/imagenet-2012-validation.png
   :alt: imagenet-2012-validation
   :align: center

.. _dataset-zoo-imagenet-sample:

ImageNet Sample
---------------

A small sample of images from the ImageNet 2012 dataset.

The dataset contains 1,000 images, one randomly chosen from each class of
the validation split of the ImageNet 2012 dataset.

These images are provided according to the terms below.

.. code-block:: text

    You have been granted access for non-commercial research/educational
    use. By accessing the data, you have agreed to the following terms.

    You (the "Researcher") have requested permission to use the ImageNet
    database (the "Database") at Princeton University and Stanford
    University. In exchange for such permission, Researcher hereby agrees
    to the following terms and conditions:

    1.  Researcher shall use the Database only for non-commercial research
        and educational purposes.
    2.  Princeton University and Stanford University make no
        representations or warranties regarding the Database, including but
        not limited to warranties of non-infringement or fitness for a
        particular purpose.
    3.  Researcher accepts full responsibility for his or her use of the
        Database and shall defend and indemnify Princeton University and
        Stanford University, including their employees, Trustees, officers
        and agents, against any and all claims arising from Researcher's
        use of the Database, including but not limited to Researcher's use
        of any copies of copyrighted images that he or she may create from
        the Database.
    4.  Researcher may provide research associates and colleagues with
        access to the Database provided that they first agree to be bound
        by these terms and conditions.
    5.  Princeton University and Stanford University reserve the right to
        terminate Researcher's access to the Database at any time.
    6.  If Researcher is employed by a for-profit, commercial entity,
        Researcher's employer shall also be bound by these terms and
        conditions, and Researcher hereby represents that he or she is
        fully authorized to enter into this agreement on behalf of such
        employer.
    7.  The law of the State of New Jersey shall apply to all disputes
        under this agreement.

**Details**

-   Dataset name: ``imagenet-sample``
-   Dataset source: http://image-net.org
-   Dataset license: https://image-net.org/download
-   Dataset size: 98.26 MB
-   Tags: ``image, classification``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`ImageNetSampleDataset <fiftyone.zoo.datasets.base.ImageNetSampleDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("imagenet-sample")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load imagenet-sample

        fiftyone app launch imagenet-sample

.. image:: /images/dataset_zoo/imagenet-sample.png
   :alt: imagenet-sample
   :align: center

.. _dataset-zoo-kinetics-400:

Kinetics 400
------------

Kinetics is a collection of large-scale, high-quality datasets of URL links of
up to 650,000 video clips that cover 400/600/700 human action classes,
depending on the dataset version. The videos include human-object interactions
such as playing instruments, as well as human-human interactions such as
shaking hands and hugging. Each action class has at least 400/600/700 video
clips. Each clip is human annotated with a single action class and lasts around
10 seconds.

This dataset contains videos and action classifications for the 400 class
version of the dataset.

**Details**

-   Dataset name: ``kinetics-400``
-   Dataset source: https://deepmind.com/research/open-source/kinetics
-   Dataset size: 456 GB
-   Tags: ``video, classification, action-recognition``
-   Supported splits: ``train, test, validation``
-   ZooDataset class:
    :class:`Kinetics400Dataset <fiftyone.zoo.datasets.base.Kinetics400Dataset>`

Original split stats:

-   Train split: 219,782 videos
-   Test split: 35,357 videos
-   Validation split: 18,035 videos

CVDF split stats:

-   Train split: 246,534 videos
-   Test split: 39,805 videos
-   Validation split: 19,906 videos

Dataset size:

-   Train split: 370 GB
-   Test split: 56 GB
-   Validation split: 30 GB

**Partial downloads**

Kinetics is a massive dataset, so FiftyOne provides parameters that can be used
to efficiently download specific subsets of the dataset to suit your needs.
When new subsets are specified, FiftyOne will use existing downloaded data
first if possible before resorting to downloading additional data from the web.

Kinetics videos were originally only accessible from YouTube. Over time, some
videos have become unavailable so the
`CVDF <https://github.com/cvdfoundation>`_ have hosted the Kinetics dataset on
AWS.

If you are partially downloading the dataset through FiftyOne, the specific
videos of interest will be downloaded from YouTube, if necessary. However,
when you load an entire split, the CVDF-provided files will be downloaded from
AWS.

The following parameters are available to configure a partial download of
Kinetics by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **num_workers** (*None*): the number of processes to use when downloading
    individual videos. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``classes`` are also specified, only up to the number of samples that
    contain at least one specified class will be loaded. By default, all
    matching samples are loaded

.. note::

    Unlike other versions, Kinteics 400 does not have zips available by class
    so whenever either `classes` or `max_samples` is provided, videos will be
    downloaded from YouTube.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary)
        #

        dataset = foz.load_zoo_dataset(
            "kinetics-400",
            split="validation",
            max_samples=10,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load 10 samples from the validation split that
        # contain the actions "springboard diving" and "surfing water"
        #
        # Videos that contain all `classes` will be prioritized first, followed
        # by videos that contain at least one of the required `classes`. If
        # there are not enough videos matching `classes` in the split to meet
        # `max_samples`, only the available videos will be loaded.
        #
        # Videos will only be downloaded if necessary
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any videos
        #

        dataset = foz.load_zoo_dataset(
            "kinetics-400",
            split="validation",
            classes=["springboard diving", "surfing water"],
            max_samples=10,
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary)
        #

        fiftyone zoo datasets load kinetics-400 \
            --split validation \
            --kwargs max_samples=10

        fiftyone app launch kinetics-400-validation-10

        #
        # Download the entire validation split
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load kinetics-400 --split validation

        fiftyone app launch kinetics-400-validation

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/kinetics.png
   :alt: kinetics
   :align: center

.. _dataset-zoo-kinetics-600:

Kinetics 600
------------

Kinetics is a collection of large-scale, high-quality datasets of URL links of
up to 650,000 video clips that cover 400/600/700 human action classes,
depending on the dataset version. The videos include human-object interactions
such as playing instruments, as well as human-human interactions such as
shaking hands and hugging. Each action class has at least 400/600/700 video
clips. Each clip is human annotated with a single action class and lasts around
10 seconds.

This dataset contains videos and action classifications for the 600 class
version of the dataset.

**Details**

-   Dataset name: ``kinetics-600``
-   Dataset source: https://deepmind.com/research/open-source/kinetics
-   Dataset size: 779 GB
-   Tags: ``video, classification, action-recognition``
-   Supported splits: ``train, test, validation``
-   ZooDataset class:
    :class:`Kinetics600Dataset <fiftyone.zoo.datasets.base.Kinetics600Dataset>`

Original split stats:

-   Train split: 370,582 videos
-   Test split: 56,618 videos
-   Validation split: 28,313 videos

CVDF split stats:

-   Train split: 427,549 videos
-   Test split: 72,924 videos
-   Validation split: 29,793 videos

Dataset size:

-   Train split: 648 GB
-   Test split: 88 GB
-   Validation split: 43 GB

**Partial downloads**

Kinetics is a massive dataset, so FiftyOne provides parameters that can be used
to efficiently download specific subsets of the dataset to suit your needs.
When new subsets are specified, FiftyOne will use existing downloaded data
first if possible before resorting to downloading additional data from the web.

Kinetics videos were originally only accessible from YouTube. Over time, some
videos have become unavailable so the
`CVDF <https://github.com/cvdfoundation>`_ have hosted the Kinetics dataset on
AWS.

If you are partially downloading the dataset through FiftyOne, the specific
videos of interest will be downloaded from YouTube, if necessary. However,
when you load an entire split, the CVDF-provided files will be downloaded from
AWS.

The following parameters are available to configure a partial download of
Kinetics by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **num_workers** (*None*): the number of processes to use when downloading
    individual videos. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``classes`` are also specified, only up to the number of samples that
    contain at least one specified class will be loaded. By default, all
    matching samples are loaded

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary).
        #

        dataset = foz.load_zoo_dataset(
            "kinetics-600",
            split="validation",
            max_samples=10,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load 10 samples from the validation split that
        # contain the actions "springboard diving" and "surfing water"
        #
        # Videos that contain all `classes` will be prioritized first, followed
        # by videos that contain at least one of the required `classes`. If
        # there are not enough videos matching `classes` in the split to meet
        # `max_samples`, only the available videos will be loaded.
        #
        # Videos will only be downloaded if necessary
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any videos
        #

        dataset = foz.load_zoo_dataset(
            "kinetics-600",
            split="validation",
            classes=["springboard diving", "surfing water"],
            max_samples=10,
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary).
        #

        fiftyone zoo datasets load kinetics-600 \
            --split validation \
            --kwargs max_samples=10

        fiftyone app launch kinetics-600-validation-10

        #
        # Download the entire validation split
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load kinetics-600 --split validation

        fiftyone app launch kinetics-600-validation

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/kinetics.png
   :alt: kinetics
   :align: center

.. _dataset-zoo-kinetics-700:

Kinetics 700
------------

Kinetics is a collection of large-scale, high-quality datasets of URL links of
up to 650,000 video clips that cover 400/600/700 human action classes,
depending on the dataset version. The videos include human-object interactions
such as playing instruments, as well as human-human interactions such as
shaking hands and hugging. Each action class has at least 400/600/700 video
clips. Each clip is human annotated with a single action class and lasts around
10 seconds.

This dataset contains videos and action classifications for the 700 class
version of the dataset.

**Details**

-   Dataset name: ``kinetics-700``
-   Dataset source: https://deepmind.com/research/open-source/kinetics
-   Dataset size: 710 GB
-   Tags: ``video, classification, action-recognition``
-   Supported splits: ``train, test, validation``
-   ZooDataset class:
    :class:`Kinetics700Dataset <fiftyone.zoo.datasets.base.Kinetics700Dataset>`

Split stats:

-   Train split: 529,046 videos
-   Test split: 67,446 videos
-   Validation split: 33,925 videos

Dataset size

-   Train split: 603 GB
-   Test split: 59 GB
-   Validation split: 48 GB

**Partial downloads**

Kinetics is a massive dataset, so FiftyOne provides parameters that can be used
to efficiently download specific subsets of the dataset to suit your needs.
When new subsets are specified, FiftyOne will use existing downloaded data
first if possible before resorting to downloading additional data from the web.

Kinetics videos were originally only accessible from YouTube. Over time, some
videos have become unavailable so the
`CVDF <https://github.com/cvdfoundation>`_ have hosted the Kinetics dataset on
AWS.

If you are partially downloading the dataset through FiftyOne, the specific
videos of interest will be downloaded from YouTube, if necessary. However,
when you load an entire split, the CVDF-provided files will be downloaded from
AWS.

The following parameters are available to configure a partial download of
Kinetics by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **num_workers** (*None*): the number of processes to use when downloading
    individual videos. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``classes`` are also specified, only up to the number of samples that
    contain at least one specified class will be loaded. By default, all
    matching samples are loaded

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary).
        #

        dataset = foz.load_zoo_dataset(
            "kinetics-700",
            split="validation",
            max_samples=10,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load 10 samples from the validation split that
        # contain the actions "springboard diving" and "surfing water"
        #
        # Videos that contain all `classes` will be prioritized first, followed
        # by videos that contain at least one of the required `classes`. If
        # there are not enough videos matching `classes` in the split to meet
        # `max_samples`, only the available videos will be loaded.
        #
        # Videos will only be downloaded if necessary
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any videos
        #

        dataset = foz.load_zoo_dataset(
            "kinetics-700",
            split="validation",
            classes=["springboard diving", "surfing water"],
            max_samples=10,
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary).
        #

        fiftyone zoo datasets load kinetics-700 \
            --split validation \
            --kwargs max_samples=10

        fiftyone app launch kinetics-700-validation-10

        #
        # Download the entire validation split
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load kinetics-700 --split validation

        fiftyone app launch kinetics-700-validation

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/kinetics.png
   :alt: kinetics
   :align: center

.. _dataset-zoo-kinetics-700-2020:

Kinetics 700-2020
-----------------

Kinetics is a collection of large-scale, high-quality datasets of URL links of
up to 650,000 video clips that cover 400/600/700 human action classes,
depending on the dataset version. The videos include human-object interactions
such as playing instruments, as well as human-human interactions such as
shaking hands and hugging. Each action class has at least 400/600/700 video
clips. Each clip is human annotated with a single action class and lasts around
10 seconds.

This version contains videos and action classifications for the 700 class
version of the dataset that was updated with new videos in 2020. This dataset
is a superset of Kinetics 700.

**Details**

-   Dataset name: ``kinetics-700-2020``
-   Dataset source: https://deepmind.com/research/open-source/kinetics
-   Dataset size: 710 GB
-   Tags: ``video, classification, action-recognition``
-   Supported splits: ``train, test, validation``
-   ZooDataset class:
    :class:`Kinetics7002020Dataset <fiftyone.zoo.datasets.base.Kinetics7002020Dataset>`

Original split stats:

-   Train split: 542,352 videos
-   Test split: 67,433 videos
-   Validation split: 34,125 videos

CVDF split stats:

-   Train split: 534,073 videos
-   Test split: 64,260 videos
-   Validation split: 33,914 videos

Dataset size

-   Train split: 603 GB
-   Test split: 59 GB
-   Validation split: 48 GB

**Partial downloads**

Kinetics is a massive dataset, so FiftyOne provides parameters that can be used
to efficiently download specific subsets of the dataset to suit your needs.
When new subsets are specified, FiftyOne will use existing downloaded data
first if possible before resorting to downloading additional data from the web.

Kinetics videos were originally only accessible from YouTube. Over time, some
videos have become unavailable so the
`CVDF <https://github.com/cvdfoundation>`_ have hosted the Kinetics dataset on
AWS.

If you are partially downloading the dataset through FiftyOne, the specific
videos of interest will be downloaded from YouTube, if necessary. However,
when you load an entire split, the CVDF-provided files will be downloaded from
AWS.

The following parameters are available to configure a partial download of
Kinetics by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **num_workers** (*None*): the number of processes to use when downloading
    individual videos. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``classes`` are also specified, only up to the number of samples that
    contain at least one specified class will be loaded. By default, all
    matching samples are loaded

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary).
        #

        dataset = foz.load_zoo_dataset(
            "kinetics-700-2020",
            split="validation",
            max_samples=10,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load 10 samples from the validation split that
        # contain the actions "springboard diving" and "surfing water"
        #
        # Videos that contain all `classes` will be prioritized first, followed
        # by videos that contain at least one of the required `classes`. If
        # there are not enough videos matching `classes` in the split to meet
        # `max_samples`, only the available videos will be loaded.
        #
        # Videos will only be downloaded if necessary
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any videos
        #

        dataset = foz.load_zoo_dataset(
            "kinetics-700-2020",
            split="validation",
            classes=["springboard diving", "surfing water"],
            max_samples=10,
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 10 random samples from the validation split
        #
        # Only the required videos will be downloaded (if necessary).
        #

        fiftyone zoo datasets load kinetics-700-2020 \
            --split validation \
            --kwargs max_samples=10

        fiftyone app launch kinetics-700-2020-validation-10

        #
        # Download the entire validation split
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load kinetics-700-2020 --split validation

        fiftyone app launch kinetics-700-2020-validation

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/kinetics.png
   :alt: kinetics
   :align: center

.. _dataset-zoo-kitti:

KITTI
-----

KITTI contains a suite of vision tasks built using an autonomous
driving platform.

This dataset contains the left camera images and the associated 2D object
detections.

The training split contains 7,481 annotated images, and the test split contains
7,518 unlabeled images.

A full description of the annotations can be found in the README of the
object development kit on the KITTI homepage.

**Details**

-   Dataset name: ``kitti``
-   Dataset source: http://www.cvlibs.net/datasets/kitti
-   Dataset license: CC-BY-NC-SA-3.0
-   Dataset size: 12.57 GB
-   Tags: ``image, detection``
-   Supported splits: ``train, test``
-   ZooDataset class:
    :class:`KITTIDataset <fiftyone.zoo.datasets.base.KITTIDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("kitti", split="train")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load kitti --split train

        fiftyone app launch kitti-train

.. image:: /images/dataset_zoo/kitti-train.png
   :alt: kitti-train
   :align: center

.. _dataset-zoo-kitti-multiview:

KITTI Multiview
---------------

KITTI contains a suite of vision tasks built using an autonomous
driving platform.

This dataset contains the following multiview data for each scene:

-   Left camera images annotated with 2D object detections
-   Right camera images annotated with 2D object detections
-   Velodyne LIDAR point clouds annotated with 3D object detections

The training split contains 7,481 annotated scenes, and the test split contains
7,518 unlabeled scenes.

A full description of the annotations can be found in the README of the
object development kit on the KITTI homepage.

**Details**

-   Dataset name: ``kitti-multiview``
-   Dataset source: http://www.cvlibs.net/datasets/kitti
-   Dataset license: CC-BY-NC-SA-3.0
-   Dataset size: 53.34 GB
-   Tags: ``image, point-cloud, detection``
-   Supported splits: ``train, test``
-   ZooDataset class:
    :class:`KITTIMultiviewDataset <fiftyone.zoo.datasets.base.KITTIMultiviewDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("kitti-multiview", split="train")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load kitti-multiview --split train

        fiftyone app launch kitti-multiview-train

.. image:: /images/dataset_zoo/kitti-multiview-train.png
   :alt: kitti-multiview-train
   :align: center

.. _dataset-zoo-lfw:

Labeled Faces in the Wild
-------------------------

Labeled Faces in the Wild is a public benchmark for face verification,
also known as pair matching.

The dataset contains 13,233 images of 5,749 people's faces collected from
the web. Each face has been labeled with the name of the person pictured.
1,680 of the people pictured have two or more distinct photos in the data
set. The only constraint on these faces is that they were detected by the
Viola-Jones face detector.

**Details**

-   Dataset name: ``lfw``
-   Dataset source: http://vis-www.cs.umass.edu/lfw
-   Dataset size: 173.00 MB
-   Tags: ``image, classification, facial-recognition``
-   Supported splits: ``test, train``
-   ZooDataset class:
    :class:`LabeledFacesInTheWildDataset <fiftyone.zoo.datasets.base.LabeledFacesInTheWildDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("lfw", split="test")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load lfw --split test

        fiftyone app launch lfw-test

.. image:: /images/dataset_zoo/lfw-test.png
   :alt: lfw-test
   :align: center

.. _dataset-zoo-mnist:

MNIST
-----

The MNIST database of handwritten digits.

The dataset consists of 70,000 28 x 28 grayscale images in 10 classes.
There are 60,000 training images and 10,000 test images.

**Details**

-   Dataset name: ``mnist``
-   Dataset source: http://yann.lecun.com/exdb/mnist
-   Dataset license: CC-BY-SA-3.0
-   Dataset size: 21.00 MB
-   Tags: ``image, classification``
-   Supported splits: ``train, test``
-   ZooDataset classes:

    -   :class:`MNISTDataset <fiftyone.zoo.datasets.tf.MNISTDataset>` (TF backend)
    -   :class:`MNISTDataset <fiftyone.zoo.datasets.torch.MNISTDataset>` (Torch backend)

.. note::

    You must have the
    :ref:`Torch or TensorFlow backend(s) <dataset-zoo-ml-backend>` installed to
    load this dataset.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("mnist", split="test")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load mnist --split test

        fiftyone app launch mnist-test

.. image:: /images/dataset_zoo/mnist-test.png
   :alt: mnist-test
   :align: center

.. _dataset-zoo-open-images-v6:

Open Images V6
--------------

Open Images V6 is a dataset of ~9 million images, roughly 2 million of which
are annotated and available via this zoo dataset.

The dataset contains annotations for classification, detection, segmentation,
and visual relationship tasks for the 600 boxable classes.

.. note::

    We've collaborated with the
    `Open Images Team at Google <https://storage.googleapis.com/openimages/web/download.html>`_
    to make FiftyOne a recommended tool for downloading, visualizing, and
    evaluating on the Open Images Dataset!

    Check out :ref:`this guide <open-images>` for more details on using
    FiftyOne to work with Open Images.

**Details**

-   Dataset name: ``open-images-v6``
-   Dataset source: https://storage.googleapis.com/openimages/web/index.html
-   Dataset license: CC-BY-2.0
-   Dataset size: 561 GB
-   Tags: ``image, detection, segmentation, classification``
-   Supported splits: ``train, test, validation``
-   ZooDataset class:
    :class:`OpenImagesV6Dataset <fiftyone.zoo.datasets.base.OpenImagesV6Dataset>`

**Notes**

-   Not all images contain all types of labels
-   All images have been rescaled so that their largest side is at most
    1024 pixels

**Full split stats**

-   Train split: 1,743,042 images (513 GB)
-   Test split: 125,436 images (36 GB)
-   Validation split: 41,620 images (12 GB)

**Partial downloads**

Open Images is a massive dataset, so FiftyOne provides parameters that can be
used to efficiently download specific subsets of the dataset to suit your
needs. When new subsets are specified, FiftyOne will use existing downloaded
data first if possible before resorting to downloading additional data from the
web.

The following parameters are available to configure a partial download of Open
Images V6 by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **label_types** (*None*): a label type or list of label types to load.
    Supported values are
    ``("detections", "classifications", "relationships", "segmentations")``.
    By default, all labels types are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded. You can use
    :func:`get_classes() <fiftyone.utils.openimages.get_classes>` and
    :func:`get_segmentation_classes() <fiftyone.utils.openimages.get_segmentation_classes>`
    to see the available classes and segmentation classes, respectively

-   **attrs** (*None*): a string or list of strings specifying required
    relationship attributes to load. This parameter is only applicable if
    ``label_types`` contains ``"relationships"``. If provided, only samples
    containing at least one instance of a specified attribute will be loaded.
    You can use
    :func:`get_attributes() <fiftyone.utils.openimages.get_attributes>`
    to see the available attributes

-   **image_ids** (*None*): a list of specific image IDs to load. The IDs can
    be specified either as ``<split>/<image-id>`` or ``<image-id>`` strings.
    Alternatively, you can provide the path to a TXT (newline-separated), JSON,
    or CSV file containing the list of image IDs to load in either of the first
    two formats

-   **include_id** (*True*): whether to include the Open Images ID of each
    sample in the loaded labels

-   **only_matching** (*False*): whether to only load labels that match the
    ``classes`` or ``attrs`` requirements that you provide (True), or to load
    all labels for samples that match the requirements (False)

-   **num_workers** (*None*): the number of processes to use when downloading
    individual images. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``label_types``, ``classes``, and/or ``attrs`` are also specified, first
    priority will be given to samples that contain all of the specified label
    types, classes, and/or attributes, followed by samples that contain at
    least one of the specified labels types or classes. The actual number of
    samples loaded may be less than this maximum value if the dataset does not
    contain sufficient samples matching your requirements

.. note::

    See
    :class:`OpenImagesV6Dataset <fiftyone.zoo.datasets.base.OpenImagesV6Dataset>`
    and :class:`OpenImagesV6DatasetImporter <fiftyone.utils.openimages.OpenImagesV6DatasetImporter>`
    for complete descriptions of the optional keyword arguments that you can
    pass to :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, all label types are loaded
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v6",
            split="validation",
            max_samples=50,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load detections and classifications for 25 samples from the
        # validation split that contain fedoras and pianos
        #
        # Images that contain all `label_types` and `classes` will be
        # prioritized first, followed by images that contain at least one of
        # the required `classes`. If there are not enough images matching
        # `classes` in the split to meet `max_samples`, only the available
        # images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v6",
            split="validation",
            label_types=["detections", "classifications"],
            classes=["Fedora", "Piano"],
            max_samples=25,
        )

        session.dataset = dataset

        #
        # Download the entire validation split and load detections
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v6",
            split="validation",
            label_types=["detections"],
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, all label types are loaded
        #

        fiftyone zoo datasets load open-images-v6 \
            --split validation \
            --kwargs \
                max_samples=50

        fiftyone app launch open-images-v6-validation-50

        #
        # Load detections and classifications for 25 samples from the
        # validation split that contain fedoras and pianos
        #
        # Images that contain all `label_types` and `classes` will be
        # prioritized first, followed by images that contain at least one of
        # the required `classes`. If there are not enough images matching
        # `classes` in the split to meet `max_samples`, only the available
        # images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        fiftyone zoo datasets load open-images-v6 \
            --split validation \
            --kwargs \
                label_types=segmentations,classifications \
                classes=Fedora,Piano \
                max_samples=25

        fiftyone app launch open-images-v6-validation-25

        #
        # Download the entire validation split and load detections
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load open-images-v6 \
            --split validation

        fiftyone app launch open-images-v6-validation

.. image:: /images/dataset_zoo/open-images-v6.png
   :alt: open-images-v6
   :align: center

.. _dataset-zoo-open-images-v7:

Open Images V7
--------------

Open Images V7 is a dataset of ~9 million images, roughly 2 million of which
are annotated and available via this zoo dataset.

The dataset contains annotations for classification, detection, segmentation,
keypoints, and visual relationship tasks for the 600 boxable classes.

.. note::

    We've collaborated with the
    `Open Images Team at Google <https://storage.googleapis.com/openimages/web/download.html>`_
    to make FiftyOne a recommended tool for downloading, visualizing, and
    evaluating on the Open Images Dataset!

    Check out :ref:`this guide <open-images>` for more details on using
    FiftyOne to work with Open Images.

**Details**

-   Dataset name: ``open-images-v7``
-   Dataset source: https://storage.googleapis.com/openimages/web/index.html
-   Dataset license: CC-BY-2.0
-   Dataset size: 561 GB
-   Tags: ``image, detection, segmentation, classification, keypoint``
-   Supported splits: ``train, test, validation``
-   ZooDataset class:
    :class:`OpenImagesV7Dataset <fiftyone.zoo.datasets.base.OpenImagesV7Dataset>`

**Notes**

-   Not all images contain all types of labels
-   All images have been rescaled so that their largest side is at most
    1024 pixels

**Full split stats**

-   Train split: 1,743,042 images (513 GB)
-   Test split: 125,436 images (36 GB)
-   Validation split: 41,620 images (12 GB)

**Partial downloads**

Open Images is a massive dataset, so FiftyOne provides parameters that can be
used to efficiently download specific subsets of the dataset to suit your
needs. When new subsets are specified, FiftyOne will use existing downloaded
data first if possible before resorting to downloading additional data from the
web.

The following parameters are available to configure a partial download of Open
Images V7 by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **label_types** (*None*): a label type or list of label types to load.
    Supported values are
    ``("detections", "classifications", "relationships", "points", segmentations")``.
    By default, all labels types are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded. You can use
    :func:`get_classes() <fiftyone.utils.openimages.get_classes>` and
    :func:`get_segmentation_classes() <fiftyone.utils.openimages.get_segmentation_classes>`
    to see the available classes and segmentation classes, respectively

-   **attrs** (*None*): a string or list of strings specifying required
    relationship attributes to load. This parameter is only applicable if
    ``label_types`` contains ``"relationships"``. If provided, only samples
    containing at least one instance of a specified attribute will be loaded.
    You can use
    :func:`get_attributes() <fiftyone.utils.openimages.get_attributes>`
    to see the available attributes

-   **image_ids** (*None*): a list of specific image IDs to load. The IDs can
    be specified either as ``<split>/<image-id>`` or ``<image-id>`` strings.
    Alternatively, you can provide the path to a TXT (newline-separated), JSON,
    or CSV file containing the list of image IDs to load in either of the first
    two formats

-   **include_id** (*True*): whether to include the Open Images ID of each
    sample in the loaded labels

-   **only_matching** (*False*): whether to only load labels that match the
    ``classes`` or ``attrs`` requirements that you provide (True), or to load
    all labels for samples that match the requirements (False)

-   **num_workers** (*None*): the number of processes to use when downloading
    individual images. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``label_types``, ``classes``, and/or ``attrs`` are also specified, first
    priority will be given to samples that contain all of the specified label
    types, classes, and/or attributes, followed by samples that contain at
    least one of the specified labels types or classes. The actual number of
    samples loaded may be less than this maximum value if the dataset does not
    contain sufficient samples matching your requirements

.. note::

    See
    :class:`OpenImagesV7Dataset <fiftyone.zoo.datasets.base.OpenImagesV7Dataset>`
    and :class:`OpenImagesV7DatasetImporter <fiftyone.utils.openimages.OpenImagesV7DatasetImporter>`
    for complete descriptions of the optional keyword arguments that you can
    pass to :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, all label types are loaded
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v7",
            split="validation",
            max_samples=50,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load only point labels (potentially negative or mixed) for 25 samples 
        # from the validation split for tortoise and sea turtle classes
        #
        # Images that contain all `label_types` and `classes` will be
        # prioritized first, followed by images that contain at least one of
        # the required `classes`. If there are not enough images matching
        # `classes` in the split to meet `max_samples`, only the available
        # images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v7",
            split="validation",
            label_types=["points"],
            classes = ["Tortoise", "Sea turtle"],
            max_samples=25,
        )

        session.dataset = dataset

        #
        # Download the entire validation split and load detections and points
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v7",
            split="validation",
            label_types=["detections", "points"],
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, all label types are loaded
        #

        fiftyone zoo datasets load open-images-v7 \
            --split validation \
            --kwargs \
                max_samples=50

        fiftyone app launch open-images-v7-validation-50

        #
        # Load detections, classifications and points for 25 samples from the
        # validation split that contain fedoras and pianos
        #
        # Images that contain all `label_types` and `classes` will be
        # prioritized first, followed by images that contain at least one of
        # the required `classes`. If there are not enough images matching
        # `classes` in the split to meet `max_samples`, only the available
        # images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        fiftyone zoo datasets load open-images-v7 \
            --split validation \
            --kwargs \
                label_types=segmentations,classifications,points \
                classes=Fedora,Piano \
                max_samples=25

        fiftyone app launch open-images-v7-validation-25

        #
        # Download the entire validation split and load detections
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load open-images-v7 \
            --split validation

        fiftyone app launch open-images-v7-validation

.. image:: /images/dataset_zoo/open-images-v7.png
   :alt: open-images-v7
   :align: center

.. _dataset-zoo-places:

Places
------

Places is a scene recognition dataset of 10 million images comprising ~400
unique scene categories.

The images are labeled with scene semantic categories, comprising a large
and diverse list of the types of environments encountered in the world.

**Details**

-   Dataset name: ``places``
-   Dataset source: http://places2.csail.mit.edu/download-private.html
-   Dataset size: 29 GB
-   Tags: ``image, classification``
-   Supported splits: ``train, validation, test``
-   ZooDataset classes:
    :class:`PlacesDataset <fiftyone.zoo.datasets.base.PlacesDataset>`

**Full split stats**

-   Train split: 1,803,460 images, with between 3,068 and 5,000 per category
-   Test split: 328,500 images, with 900 images per category
-   Validation split: 36,500 images, with 100 images per category

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("places", split="validation")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load places --split validation

        fiftyone app launch places-validation

.. image:: /images/dataset_zoo/places-validation.png
   :alt: places-validation
   :align: center

.. _dataset-zoo-quickstart:

Quickstart
----------

A small dataset with ground truth bounding boxes and predictions.

The dataset consists of 200 images from the validation split of COCO-2017,
with model predictions generated by an out-of-the-box Faster R-CNN model
from
`torchvision.models <https://pytorch.org/docs/stable/torchvision/models.html>`_.

**Details**

-   Dataset name: ``quickstart``
-   Dataset size: 23.40 MB
-   Dataset license: CC-BY-4.0
-   Tags: ``image, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`QuickstartDataset <fiftyone.zoo.datasets.base.QuickstartDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart

        fiftyone app launch quickstart

.. image:: /images/dataset_zoo/quickstart.png
   :alt: quickstart
   :align: center

.. _dataset-zoo-quickstart-geo:

Quickstart Geo
--------------

A small dataset with geolocation data.

The dataset consists of 500 images from the validation split of the BDD100K
dataset in the New York City area with object detections and GPS timestamps.

**Details**

-   Dataset name: ``quickstart-geo``
-   Dataset size: 33.50 MB
-   Tags: ``image, location, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`QuickstartGeoDataset <fiftyone.zoo.datasets.base.QuickstartGeoDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-geo")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart-geo

        fiftyone app launch quickstart-geo

.. image:: /images/dataset_zoo/quickstart-geo.png
   :alt: quickstart-geo
   :align: center

.. _dataset-zoo-quickstart-video:

Quickstart Video
----------------

A small video dataset with dense annotations.

The dataset consists of 10 video segments with dense object detections
generated by human annotators.

**Details**

-   Dataset name: ``quickstart-video``
-   Dataset size: 35.20 MB
-   Dataset license: CC-BY-4.0
-   Tags: ``video, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`QuickstartVideoDataset <fiftyone.zoo.datasets.base.QuickstartVideoDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart-video

        fiftyone app launch quickstart-video

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/quickstart-video.png
   :alt: quickstart-video
   :align: center

.. _dataset-zoo-quickstart-groups:

Quickstart Groups
-----------------

A small dataset with grouped image and point cloud data.

The dataset consists of 200 scenes from the train split of the KITTI dataset,
each containing left camera, right camera, point cloud, and 2D/3D object
annotation data.

**Details**

-   Dataset name: ``quickstart-groups``
-   Dataset size: 516.3 MB
-   Dataset license: CC-BY-NC-SA-3.0
-   Tags: ``image, point-cloud, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`QuickstartGroupsDataset <fiftyone.zoo.datasets.base.QuickstartGroupsDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-groups")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart-groups

        fiftyone app launch quickstart-groups

.. image:: /images/dataset_zoo/quickstart-groups.png
   :alt: quickstart-groups
   :align: center

.. _dataset-zoo-quickstart-3d:

Quickstart 3D
-------------

A small 3D dataset with meshes, point clouds, and oriented bounding boxes.

The dataset consists of 200 3D mesh samples from the test split of the
`ModelNet40 <https://modelnet.cs.princeton.edu>`_ dataset, with point
clouds generated using a Poisson disk sampling method, and oriented
bounding boxes generated based on the convex hull.

Objects have been rescaled and recentered from the original dataset.

**Details**

-   Dataset name: ``quickstart-3d``
-   Dataset size: 215.7 MB
-   Dataset license: https://modelnet.cs.princeton.edu
-   Tags: ``3d, point-cloud, mesh, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`Quickstart3DDataset <fiftyone.zoo.datasets.base.Quickstart3DDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-3d")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart-3d

        fiftyone app launch quickstart-3d

.. image:: /images/dataset_zoo/quickstart-3d.png
   :alt: quickstart-3d
   :align: center

.. _dataset-zoo-sama-coco:

Sama-COCO
---------

Sama-COCO is a relabeling of COCO-2017 and is a large-scale object detection
and segmentation dataset. Masks in Sama-COCO are tighter and many crowd
instances have been decomposed into their components.

This version contains images from the COCO-2017 version of the dataset, as well
as annotations in the form of bounding boxes, and segmentation masks provided
by Sama.

**Notes**

-   Sama-COCO defines 91 classes but the data only uses 80 classes (like COCO-2017)
-   Some images from the train and validation sets don't have annotations
-   The test set does not have annotations
-   Sama-COCO has identical splits to COCO-2017

**Details**

-   Dataset name: ``sama-coco``
-   Dataset source: https://www.sama.com/sama-coco-dataset/
-   Dataset license: CC-BY-4.0
-   Dataset size: 25.67 GB
-   Tags: ``image, detection, segmentation``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`SamaCOCODataset <fiftyone.zoo.datasets.base.SamaCOCODataset>`

**Full split stats**

-   Train split: 118,287 images
-   Test split: 40,670 images
-   Validation split: 5,000 images

**Partial downloads**

FiftyOne provides parameters that can be used to efficiently download specific
subsets of the Sama-COCO dataset to suit your needs. When new subsets are
specified, FiftyOne will use existing downloaded data first if possible before
resorting to downloading additional data from the web.

The following parameters are available to configure a partial download of
Sama-COCO by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **label_types** (*None*): a label type or list of label types to load.
    Supported values are ``("detections", "segmentations")``. By default, only
    detections are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **image_ids** (*None*): a list of specific image IDs to load. The IDs can
    be specified either as ``<split>/<image-id>`` strings or ``<image-id>``
    ints of strings. Alternatively, you can provide the path to a TXT
    (newline-separated), JSON, or CSV file containing the list of image IDs to
    load in either of the first two formats

-   **include_id** (*False*): whether to include the COCO ID of each sample in
    the loaded labels

-   **include_license** (*False*): whether to include the COCO license of each
    sample in the loaded labels, if available. The supported values are:

    -   ``"False"`` (default): don't load the license
    -   ``True``/``"name"``: store the string license name
    -   ``"id"``: store the integer license ID
    -   ``"url"``: store the license URL

-   **only_matching** (*False*): whether to only load labels that match the
    ``classes`` or ``attrs`` requirements that you provide (True), or to load
    all labels for samples that match the requirements (False)

-   **num_workers** (*None*): the number of processes to use when downloading
    individual images. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``label_types`` and/or ``classes`` are also specified, first priority will
    be given to samples that contain all of the specified label types and/or
    classes, followed by samples that contain at least one of the specified
    labels types or classes. The actual number of samples loaded may be less
    than this maximum value if the dataset does not contain sufficient samples
    matching your requirements

.. note::

    See
    :class:`SamaCOCODataset <fiftyone.zoo.datasets.base.SamaCOCODataset>` and
    :class:`COCODetectionDatasetImporter <fiftyone.utils.coco.COCODetectionDatasetImporter>`
    for complete descriptions of the optional keyword arguments that you can
    pass to :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, only detections are loaded
        #

        dataset = foz.load_zoo_dataset(
            "sama-coco",
            split="validation",
            max_samples=50,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load segmentations for 25 samples from the validation split that
        # contain cats and dogs
        #
        # Images that contain all `classes` will be prioritized first, followed
        # by images that contain at least one of the required `classes`. If
        # there are not enough images matching `classes` in the split to meet
        # `max_samples`, only the available images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        dataset = foz.load_zoo_dataset(
            "sama-coco",
            split="validation",
            label_types=["segmentations"],
            classes=["cat", "dog"],
            max_samples=25,
        )

        session.dataset = dataset

        #
        # Download the entire validation split and load both detections and
        # segmentations
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        dataset = foz.load_zoo_dataset(
            "sama-coco",
            split="validation",
            label_types=["detections", "segmentations"],
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, only detections are loaded
        #

        fiftyone zoo datasets load sama-coco \
            --split validation \
            --kwargs \
                max_samples=50

        fiftyone app launch sama-coco-validation-50

        #
        # Load segmentations for 25 samples from the validation split that
        # contain cats and dogs
        #
        # Images that contain all `classes` will be prioritized first, followed
        # by images that contain at least one of the required `classes`. If
        # there are not enough images matching `classes` in the split to meet
        # `max_samples`, only the available images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        fiftyone zoo datasets load sama-coco \
            --split validation \
            --kwargs \
                label_types=segmentations \
                classes=cat,dog \
                max_samples=25

        fiftyone app launch sama-coco-validation-25

        #
        # Download the entire validation split and load both detections and
        # segmentations
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load sama-coco \
            --split validation \
            --kwargs \
                label_types=detections,segmentations

        fiftyone app launch sama-coco-validation

.. image:: /images/dataset_zoo/sama-coco-validation.png
   :alt: sama-coco-validation
   :align: center

.. _dataset-zoo-ucf101:

UCF101
------

UCF101 is an action recognition data set of realistic action videos,
collected from YouTube, having 101 action categories. This data set is an
extension of UCF50 data set which has 50 action categories.

With 13,320 videos from 101 action categories, UCF101 gives the largest
diversity in terms of actions and with the presence of large variations in
camera motion, object appearance and pose, object scale, viewpoint,
cluttered background, illumination conditions, etc, it is the most
challenging data set to date. As most of the available action recognition
data sets are not realistic and are staged by actors, UCF101 aims to
encourage further research into action recognition by learning and
exploring new realistic action categories.

The videos in 101 action categories are grouped into 25 groups, where each
group can consist of 4-7 videos of an action. The videos from the same
group may share some common features, such as similar background, similar
viewpoint, etc.

**Details**

-   Dataset name: ``ucf101``
-   Dataset source: https://www.crcv.ucf.edu/research/data-sets/ucf101
-   Dataset license: CC0-1.0
-   Dataset size: 6.48 GB
-   Tags: ``video, action-recognition``
-   Supported splits: ``train, test``
-   ZooDataset class:
    :class:`UCF101Dataset <fiftyone.zoo.datasets.base.UCF101Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz
        import fiftyone.utils.video as fouv

        dataset = foz.load_zoo_dataset("ucf101", split="test")

        # Re-encode source videos as H.264 MP4s so they can be viewed in the App
        fouv.reencode_videos(dataset)

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load ucf101 --split test

        # Re-encode source videos as H.264 MP4s so they can be viewed in the App
        fiftyone utils transform-videos ucf101-test --reencode

        fiftyone app launch ucf101-test

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

    Also, if you don’t already have a utility to uncompress ``.rar`` archives,
    you may need to install one. For example, on macOS:

    .. code-block:: shell

        brew install rar

.. image:: /images/dataset_zoo/ucf101-test.png
   :alt: ucf101-test
   :align: center

.. _dataset-zoo-voc-2007:

VOC-2007
--------

The dataset for the PASCAL Visual Object Classes Challenge 2007
(VOC2007) for the detection competition.

A total of 9,963 images are included in this dataset, where each image
contains a set of objects, out of 20 different classes, making a total of
24,640 annotated objects.

Note that, as per the official dataset, the test set of VOC2007 does not
contain annotations.

**Details**

-   Dataset name: ``voc-2007``
-   Dataset source: http://host.robots.ox.ac.uk/pascal/VOC/voc2007
-   Dataset size: 868.85 MB
-   Tags: ``image, detection``
-   Supported splits: ``train, validation, test``
-   ZooDataset classes:

    -   :class:`VOC2007Dataset <fiftyone.zoo.datasets.tf.VOC2007Dataset>` (TF backend)
    -   :class:`VOC2007Dataset <fiftyone.zoo.datasets.torch.VOC2007Dataset>` (Torch backend)

.. note::

    The ``test`` split is only available via the
    :ref:`TensorFlow backend <dataset-zoo-ml-backend>`.

.. note::

    You must have the
    :ref:`Torch or TensorFlow backend(s) <dataset-zoo-ml-backend>` installed to
    load this dataset.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("voc-2007", split="validation")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load voc-2007 --split validation

        fiftyone app launch voc-2007-validation

.. image:: /images/dataset_zoo/voc-2007-validation.png
   :alt: voc-2007-validation
   :align: center

.. _dataset-zoo-voc-2012:

VOC-2012
--------

The dataset for the PASCAL Visual Object Classes Challenge 2012
(VOC2012) for the detection competition.

A total of 11540 images are included in this dataset, where each image
contains a set of objects, out of 20 different classes, making a total of
27450 annotated objects.

Note that, as per the official dataset, the test set of VOC2012 does not
contain annotations.

**Details**

-   Dataset name: ``voc-2012``
-   Dataset source: http://host.robots.ox.ac.uk/pascal/VOC/voc2012
-   Dataset size: 3.59 GB
-   Tags: ``image, detection``
-   Supported splits: ``train, validation, test``
-   ZooDataset classes:

    -   :class:`VOC2012Dataset <fiftyone.zoo.datasets.tf.VOC2012Dataset>` (TF backend)
    -   :class:`VOC2012Dataset <fiftyone.zoo.datasets.torch.VOC2012Dataset>` (Torch backend)

.. note::

    The ``test`` split is only available via the
    :ref:`TensorFlow backend <dataset-zoo-ml-backend>`.

.. note::

    You must have the
    :ref:`Torch or TensorFlow backend(s) <dataset-zoo-ml-backend>` installed to
    load this dataset.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("voc-2012", split="validation")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load voc-2012 --split validation

        fiftyone app launch voc-2012-validation

.. image:: /images/dataset_zoo/voc-2012-validation.png
   :alt: voc-2012-validation
   :align: center
