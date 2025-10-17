.. _dataset-zoo-lfw:

Labeled Faces in the Wild
-------------------------

.. default-role:: code

Labeled Faces in the Wild is a public benchmark for face verification,
also known as pair matching.

The dataset contains 13,233 images of 5,749 people's faces collected from
the web. Each face has been labeled with the name of the person pictured.
1,680 of the people pictured have two or more distinct photos in the data
set. The only constraint on these faces is that they were detected by the
Viola-Jones face detector.

**Details**

-   Dataset name: ``lfw``
-   Dataset source: http://vis-www.cs.umass.edu/lfw
-   Dataset size: 173.00 MB
-   Tags: ``image, classification, facial-recognition``
-   Supported splits: ``test, train``
-   ZooDataset class:
    :class:`LabeledFacesInTheWildDataset <fiftyone.zoo.datasets.base.LabeledFacesInTheWildDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("lfw", split="test")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load lfw --split test

        fiftyone app launch lfw-test

.. image:: /images/dataset_zoo/lfw-test.png
   :alt: lfw-test
   :align: center
