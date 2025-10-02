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

    In order to work with video datasets, you'll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/kinetics.png
   :alt: kinetics
   :align: center