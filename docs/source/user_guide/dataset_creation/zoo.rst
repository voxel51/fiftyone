
.. _dataset-zoo:

FiftyOne Dataset Zoo
====================

.. default-role:: code

FiftyOne provides a Dataset Zoo that contains a collection of common datasets
that you can download and load into FiftyOne via a few simple commands.

.. note::

    Behind the scenes, FiftyOne's Dataset Zoo uses the
    `TorchVision Datasets <https://pytorch.org/docs/stable/torchvision/datasets.html>`_ or
    `TensorFlow Datasets <https://www.tensorflow.org/datasets>`_
    libraries to wrangle some datasets, depending on which ML library you have
    installed.

    If you do not have the proper packages installed when attempting to
    download a zoo dataset, you will receive an error message that will help
    you resolve the issue.

    See :ref:`customizing your ML backend <zoo-customizing-your-ml-backend>`
    for more information about configuring the backend behavior of the Dataset
    Zoo.

You can interact with the Dataset Zoo either via the Python library or
the CLI.

.. tabs::

  .. group-tab:: Python

    The Dataset Zoo is accessible via the :mod:`fiftyone.zoo` package.

  .. group-tab:: CLI

    The :ref:`fiftyone zoo <cli-fiftyone-zoo>` CLI command provides convenient
    utilities for working with datasets in the FiftyOne Dataset Zoo.

Listing zoo datasets
--------------------

.. tabs::

  .. group-tab:: Python

    You can list the available zoo datasets via
    :meth:`list_zoo_datasets() <fiftyone.zoo.list_zoo_datasets>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        available_datasets = foz.list_zoo_datasets()

        print(available_datasets)

    .. code-block:: text

        ['bdd100k',
        'caltech101',
        'cifar10',
        'cifar100',
        'coco-2014',
        'coco-2014-segmentation',
        'coco-2017',
        'coco-2017-segmentation',
        'fashion-mnist',
        'hmdb51',
        'imagenet-2012',
        'kitti',
        'mnist',
        'quickstart',
        'quickstart-video',
        'ucf101',
        'voc-2007',
        'voc-2012']

    To view the zoo datasets that you have downloaded, you can use
    :meth:`list_downloaded_zoo_datasets() <fiftyone.zoo.list_downloaded_zoo_datasets>`:

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        downloaded_datasets = foz.list_downloaded_zoo_datasets()
        fo.pprint(downloaded_datasets)

    .. code-block:: text

        {
            'cifar10': (
                '~/fiftyone/cifar10',
                <fiftyone.zoo.ZooDatasetInfo object at 0x141a63048>,
            ),
            'kitti': (
                '~/fiftyone/kitti',
                <fiftyone.zoo.ZooDatasetInfo object at 0x141a62940>,
            ),
            ...
        }

  .. group-tab:: CLI

    You can access information about the available zoo datasets via the
    :ref:`fiftyone zoo list <cli-fiftyone-zoo-list>` command.

    For example, to list the available zoo datasets and whether you have
    downloaded them, you can execute:

    .. code-block:: text

        $ fiftyone zoo list

        name                    split       downloaded    dataset_dir                                   torch (*)    tensorflow    base
        ----------------------  ----------  ------------  --------------------------------------------  -----------  ------------  ------
        bdd100k                 test        ✓             ~/fiftyone/bdd100k/test                                                  ✓
        bdd100k                 train       ✓             ~/fiftyone/bdd100k/train                                                 ✓
        bdd100k                 validation  ✓             ~/fiftyone/bdd100k/validation                                            ✓
        caltech101              test        ✓             ~/fiftyone/caltech101/test                                 ✓
        caltech101              train                                                                                           ✓
        cifar10                 test        ✓             ~/fiftyone/cifar10/test                       ✓            ✓
        cifar10                 train       ✓             ~/fiftyone/cifar10/train                      ✓            ✓
        cifar100                test        ✓             ~/fiftyone/cifar100/test                      ✓            ✓
        cifar100                train                                                                   ✓            ✓
        coco-2014               test                                                                    ✓            ✓
        coco-2014               train                                                                   ✓            ✓
        coco-2014               validation                                                              ✓            ✓
        coco-2014-segmentation  test                                                                                               ✓
        coco-2014-segmentation  train                                                                                              ✓
        coco-2014-segmentation  validation                                                                                         ✓
        coco-2017               test                                                                    ✓            ✓
        coco-2017               train                                                                   ✓            ✓
        coco-2017               validation  ✓             ~/fiftyone/coco-2017/validation               ✓            ✓
        coco-2017-segmentation  test                                                                                               ✓
        coco-2017-segmentation  train                                                                                              ✓
        coco-2017-segmentation  validation  ✓             ~/fiftyone/coco-2017-segmentation/validation                             ✓
        fashion-mnist           test                                                                    ✓            ✓
        fashion-mnist           train                                                                   ✓            ✓
        hmdb51                  other       ✓             ~/fiftyone/hmdb51/other                                                  ✓
        hmdb51                  test        ✓             ~/fiftyone/hmdb51/test                                                   ✓
        hmdb51                  train       ✓             ~/fiftyone/hmdb51/train                                                  ✓
        imagenet-2012           train                                                                   ✓            ✓
        imagenet-2012           validation                                                              ✓            ✓
        kitti                   test                                                                                 ✓
        kitti                   train                                                                                ✓
        kitti                   validation  ✓             ~/fiftyone/kitti/validation                                ✓
        mnist                   test        ✓             ~/fiftyone/mnist/test                         ✓            ✓
        mnist                   train       ✓             ~/fiftyone/mnist/train                        ✓            ✓
        quickstart                          ✓             ~/fiftyone/quickstart                                                    ✓
        quickstart-video                    ✓             ~/fiftyone/quickstart-video                                              ✓
        ucf101                  test        ✓             ~/fiftyone/ucf101/test                                                   ✓
        ucf101                  train       ✓             ~/fiftyone/ucf101/train                                                  ✓
        voc-2007                test                                                                                 ✓
        voc-2007                train       ✓             ~/fiftyone/voc-2007/train                     ✓            ✓
        voc-2007                validation  ✓             ~/fiftyone/voc-2007/validation                ✓            ✓
        voc-2012                test                                                                                 ✓
        voc-2012                train                                                                   ✓            ✓
        voc-2012                validation                                                              ✓            ✓

    Dataset splits that have been downloaded are indicated by a checkmark in
    the ``downloaded`` column, and their location on disk is indicated by
    the ``dataset_dir`` column.

    The ``torch`` and ``tensorflow`` columns indicate whether the particular
    dataset split is provided via the respective ML backend. The ``(*)``
    indicates your default ML backend, which will be used in case a given
    split is available through multiple ML backends. The ``base`` column
    indicates datasets that are available directly via FiftyOne without
    requiring an ML backend.

Getting information about zoo datasets
--------------------------------------

.. tabs::

  .. group-tab:: Python

    Each zoo dataset is represented by a
    :class:`ZooDataset <fiftyone.zoo.ZooDataset>` subclass, which contains
    information about the dataset, its available splits, and more.

    For example, let's print some information about the CIFAR-10 dataset:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        zoo_dataset = foz.get_zoo_dataset("cifar10")

        print("***** Dataset description *****")
        print(zoo_dataset.__doc__)

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

        ***** Supported splits *****
        test, train

    When a zoo dataset is downloaded, a
    :class:`ZooDatasetInfo <fiftyone.zoo.ZooDatasetInfo>` instance is created
    in its root directory that contains additional information about the
    dataset, including which splits have been downloaded (if applicable).

    You can load the :class:`ZooDatasetInfo <fiftyone.zoo.ZooDatasetInfo>`
    instance for a downloaded dataset via
    :meth:`load_zoo_dataset_info() <fiftyone.zoo.load_zoo_dataset_info>`.

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
            "zoo_dataset": "fiftyone.zoo.torch.CIFAR10Dataset",
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
    not) via the :ref:`fiftyone zoo info <cli-fiftyone-zoo-info>` command.

    For example, you can view information about the CIFAR-10 dataset:

    .. code-block:: text

        $ fiftyone zoo info cifar10

        ***** Dataset description *****
        The CIFAR-10 dataset consists of 60000 32 x 32 color images in 10
            classes, with 6000 images per class. There are 50000 training images and
            10000 test images.

            Dataset size:
                132.40 MiB

            Source:
                https://www.cs.toronto.edu/~kriz/cifar.html

        ***** Supported splits *****
        test, train

        ***** Dataset location *****
        ~/fiftyone/cifar10

        ***** Dataset info *****
        {
            "name": "cifar10",
            "zoo_dataset": "fiftyone.zoo.torch.CIFAR10Dataset",
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

Downloading zoo datasets
------------------------

.. tabs::

  .. group-tab:: Python

    You can download zoo datasets (or individual split(s) of them) from the
    web via :meth:`download_zoo_dataset() <fiftyone.zoo.download_zoo_dataset>`.

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
    web via the :ref:`fiftyone zoo download <cli-fiftyone-zoo-download>`
    command.

    For example, you can download the test split of the CIFAR-10 dataset as
    follows:

    .. code-block:: text

        $ fiftyone zoo download cifar10 --splits test

        Downloading split 'test' to '~/fiftyone/cifar10/test'
        Downloading https://www.cs.toronto.edu/~kriz/cifar-10-python.tar.gz to ~/fiftyone/cifar10/tmp-download/cifar-10-python.tar.gz
        170500096it [00:04, 34514685.48it/s]
        Extracting ~/fiftyone/cifar10/tmp-download/cifar-10-python.tar.gz to ~/fiftyone/cifar10/tmp-download
        Writing samples to '~/fiftyone/cifar10/test' in 'fiftyone.types.dataset_types.ImageClassificationDataset' format...
         100% |██████████████████████████████████████████████| 10000/10000 [5.4s elapsed, 0s remaining, 1.9K samples/s]
        Writing labels to '~/fiftyone/cifar10/test/labels.json'
        Dataset created
        Dataset info written to '~/fiftyone/cifar10/info.json'

Loading zoo datasets
--------------------

.. tabs::

  .. group-tab:: Python

    You can load a zoo dataset (or individual split(s) of them) via
    :meth:`load_zoo_dataset() <fiftyone.zoo.load_zoo_dataset>`.

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
    :meth:`load_zoo_dataset() <fiftyone.zoo.load_zoo_dataset>` to customize the
    import behavior:

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
    a FiftyOne dataset via the :ref:`fiftyone zoo load <cli-fiftyone-zoo-load>`
    command.

    For example, you can load the test split of the CIFAR-10 dataset as
    follows:

    .. code-block:: text

        $ fiftyone zoo load cifar10 --splits test

        Split 'test' already downloaded
        Loading 'cifar10' split 'test'
         100% |██████████████████████████████████████████████| 10000/10000 [3.6s elapsed, 0s remaining, 2.9K samples/s]
        Dataset 'cifar10-test' created

    You can also provide :ref:`additional arguments <cli-fiftyone-zoo-load>`
    to customize the import behavior. For example, you can load a random subset
    of 10 samples from the zoo dataset:

    .. code-block:: text

        $ fiftyone zoo load cifar10 --splits test \
            --dataset-name cifar10-test-sample --shuffle --max-samples 10

        Split 'test' already downloaded
        Loading 'cifar10' split 'test'
         100% |██████████████████████████████████████████████| 10/10 [3.2ms elapsed, 0s remaining, 2.9K samples/s]
        Dataset 'cifar10-test' created

Controlling where zoo datasets are downloaded
---------------------------------------------

By default, zoo datasets are downloaded into subdirectories of
``fiftyone.config.default_dataset_dir`` corresponding to their names.

You can customize this backend by modifying the `default_dataset_dir` setting
of your :doc:`FiftyOne config </user_guide/config>`.

.. tabs::

    .. group-tab:: JSON

        Directly edit your FiftyOne config at `~/.fiftyone/config.json`:

        .. code-block:: shell

            # Print your current config
            fiftyone config

            # Locate your config (and edit the `default_dataset_dir` field)
            fiftyone constants FIFTYONE_CONFIG_PATH

    .. group-tab:: Environment

        Set the ``FIFTYONE_DEFAULT_DATASET_DIR`` environment variable:

        .. code-block:: shell

            # Customize where zoo datasets are downloaded
            export FIFTYONE_DEFAULT_DATASET_DIR=/your/custom/directory

    .. group-tab:: Code

        Set the `default_dataset_dir` config setting from Python code:

        .. code-block:: python
            :linenos:

            # Customize where zoo datasets are downloaded
            import fiftyone.core.config as foc

            foc.set_config_settings(default_dataset_dir="/your/custom/directory")

.. _zoo-customizing-your-ml-backend:

Customizing your ML backend
---------------------------

Behind the scenes, FiftyOne uses either
`TensorFlow Datasets <https://www.tensorflow.org/datasets>`_ or
`TorchVision Datasets <https://pytorch.org/docs/stable/torchvision/datasets.html>`_
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
of your :doc:`FiftyOne config </user_guide/config>`.

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

            # Use the `torch` backend
            import fiftyone.core.config as foc

            foc.set_config_settings(default_ml_backend="torch")
