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