.. _dataset-zoo-api:

Dataset Zoo API Reference
=========================

.. default-role:: code

This page describes the full API for working with the Dataset Zoo.

.. _dataset-zoo-package:

Dataset zoo package
-------------------

You can interact with the Dataset Zoo either via the Python library or
the CLI.

.. tabs::

  .. group-tab:: Python

    The Dataset Zoo is accessible via the :mod:`fiftyone.zoo.datasets` package,
    whose public methods are imported into the ``fiftyone.zoo`` namespace, for
    convenience.

  .. group-tab:: CLI

    The :ref:`fiftyone zoo datasets <cli-fiftyone-zoo-datasets>` command
    provides convenient utilities for working with datasets in the FiftyOne
    Dataset Zoo.

.. _dataset-zoo-list:

Listing zoo datasets
--------------------

.. tabs::

  .. group-tab:: Python

    You can list the available zoo datasets via
    :meth:`list_zoo_datasets() <fiftyone.zoo.datasets.list_zoo_datasets>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        available_datasets = foz.list_zoo_datasets()

        print(available_datasets)

    .. code-block:: text

        ['bdd100k',
        'caltech101',
        'cifar10',
        ...
        'voc-2012']

    To view the zoo datasets that you have downloaded, you can use
    :meth:`list_downloaded_zoo_datasets() <fiftyone.zoo.datasets.list_downloaded_zoo_datasets>`:

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        downloaded_datasets = foz.list_downloaded_zoo_datasets()
        fo.pprint(downloaded_datasets)

    .. code-block:: text

        {
            ...
            'cifar10': (
                '~/fiftyone/cifar10',
                <fiftyone.zoo.datasets.ZooDatasetInfo object at 0x141a63048>,
            ),
            'kitti': (
                '~/fiftyone/kitti',
                <fiftyone.zoo.datasets.ZooDatasetInfo object at 0x141a62940>,
            ),
            ...
        }

  .. group-tab:: CLI

    You can access information about the available zoo datasets via the
    :ref:`fiftyone zoo datasets list <cli-fiftyone-zoo-datasets-list>` command.

    For example, to list the available zoo datasets and whether you have
    downloaded them, you can execute:

    .. code-block:: shell

        fiftyone zoo datasets list

    Dataset splits that have been downloaded are indicated by a checkmark in
    the ``downloaded`` column, and their location on disk is indicated by
    the ``dataset_dir`` column.

    The ``base`` column indicates datasets that are available directly via
    FiftyOne without requiring an ML backend.

    The ``torch`` and ``tensorflow`` columns indicate whether the particular
    dataset split is provided via the respective ML backend. The ``(*)``
    indicates your default ML backend, which will be used in case a given
    split is available through multiple ML backends.

.. _dataset-zoo-info:

Getting information about zoo datasets
--------------------------------------

.. tabs::

  .. group-tab:: Python

    Each zoo dataset is represented by a
    :class:`ZooDataset <fiftyone.zoo.datasets.ZooDataset>` subclass, which
    contains information about the dataset, its available splits, and more. You
    can access this object for a given dataset via the
    :meth:`get_zoo_dataset() <fiftyone.zoo.datasets.get_zoo_dataset>` method.

    For example, let's print some information about the CIFAR-10 dataset:

    .. code-block:: python
        :linenos:

        import textwrap
        import fiftyone.zoo as foz

        zoo_dataset = foz.get_zoo_dataset("cifar10")

        print("***** Dataset description *****")
        print(textwrap.dedent("    " + zoo_dataset.__doc__))

        print("***** Tags *****")
        print("%s\n" % ", ".join(zoo_dataset.tags))

        print("***** Supported splits *****")
        print("%s\n" % ", ".join(zoo_dataset.supported_splits))

    .. code-block:: text

        ***** Dataset description *****
        The CIFAR-10 dataset consists of 60000 32 x 32 color images in 10
        classes, with 6000 images per class. There are 50000 training images and
        10000 test images.

        Dataset size:
            132.40 MiB

        Source:
            https://www.cs.toronto.edu/~kriz/cifar.html

        ***** Tags *****
        image, classification

        ***** Supported splits *****
        test, train

    When a zoo dataset is downloaded, a
    :class:`ZooDatasetInfo <fiftyone.zoo.datasets.ZooDatasetInfo>` instance is
    created in its root directory that contains additional information about
    the dataset, including which splits have been downloaded (if applicable).

    You can load the
    :class:`ZooDatasetInfo <fiftyone.zoo.datasets.ZooDatasetInfo>`
    instance for a downloaded dataset via
    :meth:`load_zoo_dataset_info() <fiftyone.zoo.datasets.load_zoo_dataset_info>`.

    For example, let's print some information about the CIFAR-10 dataset
    (assuming it is downloaded):

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        dataset_dir = foz.find_zoo_dataset("cifar10")
        info = foz.load_zoo_dataset_info("cifar10")

        print("***** Dataset location *****")
        print(dataset_dir)

        print("\n***** Dataset info *****")
        print(info)

    .. code-block:: text

        ***** Dataset location *****
        ~/fiftyone/cifar10

        ***** Dataset info *****
        {
            "name": "cifar10",
            "zoo_dataset": "fiftyone.zoo.datasets.torch.CIFAR10Dataset",
            "dataset_type": "fiftyone.types.dataset_types.ImageClassificationDataset",
            "num_samples": 10000,
            "downloaded_splits": {
                "test": {
                    "split": "test",
                    "num_samples": 10000
                }
            },
            "classes": [
                "airplane",
                "automobile",
                "bird",
                "cat",
                "deer",
                "dog",
                "frog",
                "horse",
                "ship",
                "truck"
            ]
        }

  .. group-tab:: CLI

    You can view detailed information about a dataset (either downloaded or
    not) via the
    :ref:`fiftyone zoo datasets info <cli-fiftyone-zoo-datasets-info>` command.

    For example, you can view information about the CIFAR-10 dataset:

    .. code-block:: shell

        fiftyone zoo datasets info cifar10

    .. code-block:: text

        ***** Dataset description *****
        The CIFAR-10 dataset consists of 60000 32 x 32 color images in 10
        classes, with 6000 images per class. There are 50000 training images and
        10000 test images.

        Dataset size:
            132.40 MiB

        Source:
            https://www.cs.toronto.edu/~kriz/cifar.html

        ***** Tags *****
        image, classification

        ***** Supported splits *****
        test, train

        ***** Dataset location *****
        ~/fiftyone/cifar10

        ***** Dataset info *****
        {
            "name": "cifar10",
            "zoo_dataset": "fiftyone.zoo.datasets.torch.CIFAR10Dataset",
            "dataset_type": "fiftyone.types.dataset_types.ImageClassificationDataset",
            "num_samples": 60000,
            "downloaded_splits": {
                "test": {
                    "split": "test",
                    "num_samples": 10000
                },
                "train": {
                    "split": "train",
                    "num_samples": 50000
                }
            },
            "classes": [
                "airplane",
                "automobile",
                "bird",
                "cat",
                "deer",
                "dog",
                "frog",
                "horse",
                "ship",
                "truck"
            ]
        }

.. _dataset-zoo-download:

Downloading zoo datasets
------------------------

.. tabs::

  .. group-tab:: Python

    You can download zoo datasets (or individual split(s) of them) from the
    web via
    :meth:`download_zoo_dataset() <fiftyone.zoo.datasets.download_zoo_dataset>`.

    For example, let's download the ``train`` split of CIFAR-10:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        dataset = foz.download_zoo_dataset("cifar10", split="train")

    .. code-block:: text

        Downloading split 'train' to '~/fiftyone/cifar10/train'
        Downloading https://www.cs.toronto.edu/~kriz/cifar-10-python.tar.gz to ~/fiftyone/cifar10/tmp-download/cifar-10-python.tar.gz
        170500096it [00:04, 34734776.49it/s]
        Extracting ~/fiftyone/cifar10/tmp-download/cifar-10-python.tar.gz to ~/fiftyone/cifar10/tmp-download
        Writing samples to '~/fiftyone/cifar10/train' in 'fiftyone.types.dataset_types.ImageClassificationDataset' format...
         100% |█████████████████████████████████████████████| 50000/50000 [24.3s elapsed, 0s remaining, 1.7K samples/s]
        Writing labels to '~/fiftyone/cifar10/train/labels.json'
        Dataset created
        Dataset info written to '~/fiftyone/cifar10/info.json'

  .. group-tab:: CLI

    You can download zoo datasets (or individual splits of them) from the
    web via the
    :ref:`fiftyone zoo datasets download <cli-fiftyone-zoo-datasets-download>`
    command.

    For example, you can download the test split of the CIFAR-10 dataset as
    follows:

    .. code-block:: shell

        fiftyone zoo datasets download cifar10 --splits test

    .. code-block:: text

        Downloading split 'test' to '~/fiftyone/cifar10/test'
        Downloading https://www.cs.toronto.edu/~kriz/cifar-10-python.tar.gz to ~/fiftyone/cifar10/tmp-download/cifar-10-python.tar.gz
        170500096it [00:04, 34514685.48it/s]
        Extracting ~/fiftyone/cifar10/tmp-download/cifar-10-python.tar.gz to ~/fiftyone/cifar10/tmp-download
        Writing samples to '~/fiftyone/cifar10/test' in 'fiftyone.types.dataset_types.ImageClassificationDataset' format...
         100% |██████████████████████████████████████████████| 10000/10000 [5.4s elapsed, 0s remaining, 1.9K samples/s]
        Writing labels to '~/fiftyone/cifar10/test/labels.json'
        Dataset created
        Dataset info written to '~/fiftyone/cifar10/info.json'

.. _dataset-zoo-load:

Loading zoo datasets
--------------------

.. tabs::

  .. group-tab:: Python

    You can load a zoo dataset (or individual split(s) of them) via
    :meth:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

    By default, the dataset will be automatically downloaded from the web the
    first time you access it if it is not already downloaded:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        # The dataset will be downloaded from the web the first time you access it
        dataset = foz.load_zoo_dataset("cifar10", split="test")

        # View summary info about the dataset
        print(dataset)

        # Print the first few samples in the dataset
        print(dataset.head())

    You can also provide additional arguments to
    :meth:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>` to
    customize the import behavior:

    .. code-block:: python
        :linenos:

        # Import a random subset of 10 samples from the zoo dataset
        dataset = foz.load_zoo_dataset(
            "cifar10",
            split="test",
            dataset_name="cifar10-test-sample",
            shuffle=True,
            max_samples=10,
        )

    The additional arguments are passed directly to the |DatasetImporter| that
    performs the actual import.

  .. group-tab:: CLI

    After a zoo dataset has been downloaded from the web, you can load it as
    a FiftyOne dataset via the
    :ref:`fiftyone zoo datasets load <cli-fiftyone-zoo-datasets-load>`
    command.

    For example, you can load the test split of the CIFAR-10 dataset as
    follows:

    .. code-block:: shell

        fiftyone zoo datasets load cifar10 --splits test

    .. code-block:: text

        Split 'test' already downloaded
        Loading 'cifar10' split 'test'
         100% |██████████████████████████████████████████████| 10000/10000 [3.6s elapsed, 0s remaining, 2.9K samples/s]
        Dataset 'cifar10-test' created

    You can also provide
    :ref:`additional arguments <cli-fiftyone-zoo-datasets-load>` to customize
    the import behavior. For example, you can load a random subset of 10
    samples from the zoo dataset:

    .. code-block:: shell

        fiftyone zoo datasets load cifar10 --splits test \
            --dataset-name cifar10-test-sample --shuffle --max-samples 10

    .. code-block:: text

        Split 'test' already downloaded
        Loading 'cifar10' split 'test'
         100% |██████████████████████████████████████████████| 10/10 [3.2ms elapsed, 0s remaining, 2.9K samples/s]
        Dataset 'cifar10-test' created

.. _dataset-zoo-manual-download:

Loading zoo datasets with manual downloads
------------------------------------------

Some zoo datasets such as
:class:`BDD100K <fiftyone.zoo.datasets.base.BDD100KDataset>`
and :class:`Cityscapes <fiftyone.zoo.datasets.base.CityscapesDataset>` require
that you create accounts on a website and manually download the source files.
In such cases, the :class:`ZooDataset <fiftyone.zoo.datasets.ZooDataset>` class
will provide additional argument(s) that let you specify the paths to these
files that you have manually downloaded on disk.

You can load these datasets into FiftyOne by first calling
:meth:`download_zoo_dataset() <fiftyone.zoo.datasets.download_zoo_dataset>`
with the appropriate keyword arguments (which are passed to the underlying
:class:`ZooDataset <fiftyone.zoo.datasets.ZooDataset>` constructor) to wrangle
the raw download into FiftyOne format, and then calling
:meth:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>` or using
:ref:`fiftyone zoo datasets load <cli-fiftyone-zoo-datasets-load>` to load the
dataset into FiftyOne.

For example, the following snippet shows how to load the BDD100K dataset from
the zoo:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # First parse the manually downloaded files in `source_dir`
    foz.download_zoo_dataset(
        "bdd100k", source_dir="/path/to/dir-with-bdd100k-files"
    )

    # Now load into FiftyOne
    dataset = foz.load_zoo_dataset("bdd100k", split="validation")

.. _dataset-zoo-custom-dir:

Controlling where zoo datasets are downloaded
---------------------------------------------

By default, zoo datasets are downloaded into subdirectories of
``fiftyone.config.dataset_zoo_dir`` corresponding to their names.

You can customize this backend by modifying the `dataset_zoo_dir` setting
of your :ref:`FiftyOne config <configuring-fiftyone>`.

.. tabs::

    .. group-tab:: JSON

        Directly edit your FiftyOne config at `~/.fiftyone/config.json`:

        .. code-block:: shell

            # Print your current config
            fiftyone config

            # Locate your config (and edit the `dataset_zoo_dir` field)
            fiftyone constants FIFTYONE_CONFIG_PATH

    .. group-tab:: Environment

        Set the ``FIFTYONE_DATASET_ZOO_DIR`` environment variable:

        .. code-block:: shell

            # Customize where zoo datasets are downloaded
            export FIFTYONE_DATASET_ZOO_DIR=/your/custom/directory

    .. group-tab:: Code

        Set the `dataset_zoo_dir` config setting from Python code:

        .. code-block:: python
            :linenos:

            import fiftyone as fo

            # Customize where zoo datasets are downloaded
            fo.config.dataset_zoo_dir = "/your/custom/directory"

.. _dataset-zoo-delete:

Deleting zoo datasets
---------------------

.. tabs::

  .. group-tab:: Python

    You can delete the local copy of a zoo dataset (or individual split(s) of
    them) via
    :meth:`delete_zoo_dataset() <fiftyone.zoo.datasets.delete_zoo_dataset>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        foz.delete_zoo_dataset("cifar10", split="test")

  .. group-tab:: CLI

    You can delete the local copy of a zoo dataset (or individual split(s) of
    them) via the
    :ref:`fiftyone zoo datasets delete <cli-fiftyone-zoo-datasets-delete>`
    command:

    .. code-block:: shell

        fiftyone zoo datasets delete cifar10 --splits test

.. _dataset-zoo-add:

Adding datasets to the zoo
--------------------------

We frequently add new datasets to the Dataset Zoo, which will automatically
become accessible to you when you update your FiftyOne package.

.. note::

    FiftyOne is open source! You are welcome to contribute datasets to the
    public dataset zoo by submitting a pull request to
    `the GitHub repository <https://github.com/voxel51/fiftyone>`_.

You can also add your own datasets to your local dataset zoo, enabling you to
work with these datasets via the :mod:`fiftyone.zoo.datasets` package and the
CLI using the same syntax that you would with publicly available datasets.

To add dataset(s) to your local zoo, you simply write a JSON manifest file in
the format below to tell FiftyOne about the dataset. For example, the manifest
below adds a second copy of the ``quickstart`` dataset to the zoo under the
alias ``quickstart-copy``:

.. code-block:: json

    {
        "custom": {
            "quickstart-copy": "fiftyone.zoo.datasets.base.QuickstartDataset"
        }
    }

In the above, ``custom`` specifies the source of the dataset, which can be an
arbitrary string and simply controls the column of the
:ref:`fiftyone zoo datasets list <cli-fiftyone-zoo-datasets-list>` listing in
which the dataset is annotated; ``quickstart-copy`` is the name of the new
dataset; and ``fiftyone.zoo.datasets.base.QuickstartDataset`` is the
fully-qualified class name of the
:class:`ZooDataset class <fiftyone.zoo.datasets.ZooDataset>` for the dataset,
which specifies how to download and load the dataset into FiftyOne. This class
can be defined anywhere that is importable at runtime in your environment.

Finally, expose your new dataset(s) to FiftyOne by adding your manifest to the
``dataset_zoo_manifest_paths`` parameter of your
:ref:`FiftyOne config <configuring-fiftyone>`. One way to do this is to set the
``FIFTYONE_DATASET_ZOO_MANIFEST_PATHS`` environment variable:

.. code-block:: shell

    export FIFTYONE_DATASET_ZOO_MANIFEST_PATHS=/path/to/custom/manifest.json

Now you can access the ``quickstart-copy`` dataset as you would any other zoo
dataset:

.. code-block:: shell

    # Will contain `quickstart-copy`
    fiftyone zoo datasets list

    # Load custom dataset into FiftyOne
    fiftyone zoo datasets load quickstart-copy

.. _dataset-zoo-ml-backend:

Customizing your ML backend
---------------------------

Behind the scenes, FiftyOne uses either
`TensorFlow Datasets <https://www.tensorflow.org/datasets>`_ or
`TorchVision Datasets <https://pytorch.org/vision/stable/datasets.html>`_
libraries to download and wrangle some zoo datasets, depending on which ML
library you have installed. In order to load datasets using TF, you must have
the `tensorflow-datasets <https://pypi.org/project/tensorflow-datasets>`_
package installed on your machine. In order to load datasets using PyTorch, you
must have the `torch <https://pypi.org/project/torch>`_ and
`torchvision <https://pypi.org/project/torchvision>`_ packages installed.

Note that the ML backends may expose different datasets.

For datasets that require an ML backend, FiftyOne will use whichever ML backend
is necessary to download the requested zoo dataset. If a dataset is available
through both backends, it will use the backend specified by the
`fo.config.default_ml_backend` setting in your FiftyOne config.

You can customize this backend by modifying the `default_ml_backend` setting
of your :ref:`FiftyOne config <configuring-fiftyone>`.

.. tabs::

    .. group-tab:: JSON

        Directly edit your FiftyOne config at `~/.fiftyone/config.json`:

        .. code-block:: shell

            # Print your current config
            fiftyone config

            # Locate your config (and edit the `default_ml_backend` field)
            fiftyone constants FIFTYONE_CONFIG_PATH

    .. group-tab:: Environment

        Set the ``FIFTYONE_DEFAULT_ML_BACKEND`` environment variable:

        .. code-block:: shell

            # Use the `tensorflow` backend
            export FIFTYONE_DEFAULT_ML_BACKEND=tensorflow

    .. group-tab:: Code

        Set the `default_ml_backend` config setting from Python code:

        .. code-block:: python
            :linenos:

            import fiftyone as fo

            # Use the `torch` backend
            fo.config.default_ml_backend = "torch"
