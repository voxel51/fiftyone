.. _activitynet:

ActivityNet Integration
=======================

.. default-role:: code

We've worked to make it easy to download, visualize, and evaluate on the 
`ActivityNet dataset <http://activity-net.org/index.html>`_
natively in FiftyOne!

.. image:: /images/dataset_zoo/activitynet-200-validation.png
   :alt: activitynet-200-validation
   :align: center

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
    dataset = foz.load_zoo_dataset(
        "activitynet-200",
        split="validation",
        max_samples=10,
    )

    session = fo.launch_app(dataset)

.. note::

    ActivityNet-200 is a superset of ActivityNet-100 so we have made sure
    to only store one copy of every video on disk. Videos in the
    ActivityNet-100 zoo directory are used directly by ActivityNet-200.


Partial Downloads
-----------------

In addition, FiftyOne provides parameters that can be used to efficiently
download specific subsets of the ActivityNet dataset, allowing you to quickly explore
different slices of the dataset without downloading the entire split.

When performing partial downloads, FiftyOne will use existing downloaded data
first if possible before resorting to downloading additional data from YouTube.

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
    # contain the actions "Bathing dog" and "Walking the dog"
    # with a maximum duration of 20 seconds
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
        classes=["Bathing dog", "Walking the dog"],
        max_samples=10,
        max_duration=20,
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


Full Split Downloads
--------------------

Many videos have been removed from YouTube since the creation of ActivityNet.
Due to this, if you do not specify any partial download parameters 
`classes`, `max_duration`, or `max_samples` (defined above), then it
is means that the entire split is requested. 
In this case, you are required to manually download the entire
dataset.

In order to manually download the entire source dataset, you must fill out 
`this form <https://docs.google.com/forms/d/e/1FAIpQLSeKaFq9ZfcmZ7W0B0PbEhfbTHY41GeEgwsa7WobJgGUhn4DTQ/viewform>`_
which will give you access to the dataset through Google Drive
for 7 days.

After downloading the full dataset, it can be loaded into FiftyOne:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    source_dir = "/path/to/dir-with-activitynet-files"

    # Load the entire ActivityNet-200 dataset into FiftyOne 
    dataset = foz.load_zoo_dataset("activitynet-200", source_dir=source_dir)

    session = fo.launch_app(dataset)


The contents of the `source_dir` is expected to contain the data directly
downloaded from the source. This includes either the zip files
or the unzipped contents of these files in the following format:

.. code-block:: text
   
    \source_dir
        missing_files.zip
        missing_files_v1-2_test.zip
        missing_files_v1-3_test.zip
        v1-2_test.tar.gz
        v1-2_train.tar.gz
        v1-2_val.tar.gz
        v1-3_test.tar.gz
        v1-3_train_val.tar.gz

        \v1-2
            \train
                v_<id>.<ext>
                ...
            \val
                ...
            \test
                ...

        \v1-3
            \train_val
                v_<id>.<ext>
                ...
            \test
                ...

        \missing_files
            v_<id>.<ext>

        \missing_files_v1-2_test
            v_<id>.<ext>

        \missing_files_v_1-3_test
            v_<id>.<ext>
        
Not all of the above zips or directories are required to be present. Any zip files will
be unzipped by a call to 
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.


Once :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`
is called with the `source_dir` parameter, all contents will attempt to be moved
or copied to the FiftyOne Dataset Zoo backing directory depending on the value
of the `copy_files` parameter. All future calls to 
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`
will not require `source_dir` any longer since the files are in the backing
directory. 


