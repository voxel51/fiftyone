.. _activitynet:

ActivityNet Integration
=======================

.. default-role:: code

We've worked to make it easy to download, visualize, and evaluate on the ActivityNet dataset
natively in FiftyOne!


.. _activitynet-dataset:

Loading the ActivityNet dataset
_______________________________

The FiftyOne Dataset Zoo provides support for loading both the
:ref:`ActivityNet-100 <dataset-zoo-activitynet-100>` and
:ref:`ActivityNet-200 <dataset-zoo-activitynet-200>` datasets.

Like all other zoo datasets, you can use
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>` to download
and load an ActivityNet split into FiftyOne:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Download and load 10 samples from the validation split of ActivityNet-200
    dataset = foz.load_zoo_dataset("activitynet-200", split="validation", max_samples=10)

    session = fo.launch_app(dataset)


In addition, FiftyOne provides parameters that can be used to efficiently
download specific subsets of the ActivityNet dataset, allowing you to quickly explore
different slices of the dataset without downloading the entire split.

When performing partial downloads, FiftyOne will use existing downloaded data
first if possible before resorting to downloading additional data from the web.

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
        "activitynet-200",
        split="validation",
        max_samples=10,
        shuffle=True,
    )

    session = fo.launch_app(dataset)

    #
    # Load 10 samples from the validation split that
    # contain the actions "Disc dog" and "Grooming dog"
    #
    # Videos that contain all `classes` will be prioritized first, followed
    # by videos that contain at least one of the required `classes`. If
    # there are not enough videos matching `classes` in the split to meet
    # `max_samples`, only the available videos will be loaded.
    #
    # Videos will only be downloaded if necessary
    #

    dataset = foz.load_zoo_dataset(
        "activitynet-200",
        split="validation",
        classes=["Disc dog", "Grooming dog"],
        max_samples=10,
    )

    session.dataset = dataset

The following parameters are available to configure partial downloads of both
ActivityNet-100 and ActivityNet-200 by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If none are provided, all available
    splits are loaded

-   **source_dir** (*None*): the directory containing the manually downloaded
    ActivityNet files used to avoid downloading videos from YouTube

-   **classes** (*None*): a string or list of strings specifying required classes
    to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **max_duration** (*None*): only videos with a duration in seconds that is
    less than or equal to the `max_duration` will be downloaded. By
    default, all videos are downloaded

-   **copy_files** (*True*): whether to move (False) or create copies (True) of
    the source files when populating ``dataset_dir``. This is only
    relevant when a ``source_dir`` is provided

-   **num_workers** (*None*): the number of processes to use when downloading
    individual images. By default, ``multiprocessing.cpu_count()`` is
    used

-   **shuffle** (*False*): whether to randomly shuffle the order in which samples
    are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``classes`` are also specified, only up to the number of samples
    that contain at least one specified class will be loaded.
    By default, all matching samples are loaded

