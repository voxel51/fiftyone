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
