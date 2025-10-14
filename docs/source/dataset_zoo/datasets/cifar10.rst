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
