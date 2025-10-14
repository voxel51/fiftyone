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
