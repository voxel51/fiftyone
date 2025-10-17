.. _dataset-zoo-activitynet-200:

ActivityNet 200
---------------

.. default-role:: code

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
