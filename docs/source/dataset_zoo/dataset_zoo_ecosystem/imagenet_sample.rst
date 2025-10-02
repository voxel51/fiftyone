.. _dataset-zoo-imagenet-sample:

ImageNet Sample
---------------

A small sample of images from the ImageNet 2012 dataset.

The dataset contains 1,000 images, one randomly chosen from each class of
the validation split of the ImageNet 2012 dataset.

These images are provided according to the terms below.

.. code-block:: text

    You have been granted access for non-commercial research/educational
    use. By accessing the data, you have agreed to the following terms.

    You (the "Researcher") have requested permission to use the ImageNet
    database (the "Database") at Princeton University and Stanford
    University. In exchange for such permission, Researcher hereby agrees
    to the following terms and conditions:

    1.  Researcher shall use the Database only for non-commercial research
        and educational purposes.
    2.  Princeton University and Stanford University make no
        representations or warranties regarding the Database, including but
        not limited to warranties of non-infringement or fitness for a
        particular purpose.
    3.  Researcher accepts full responsibility for his or her use of the
        Database and shall defend and indemnify Princeton University and
        Stanford University, including their employees, Trustees, officers
        and agents, against any and all claims arising from Researcher's
        use of the Database, including but not limited to Researcher's use
        of any copies of copyrighted images that he or she may create from
        the Database.
    4.  Researcher may provide research associates and colleagues with
        access to the Database provided that they first agree to be bound
        by these terms and conditions.
    5.  Princeton University and Stanford University reserve the right to
        terminate Researcher's access to the Database at any time.
    6.  If Researcher is employed by a for-profit, commercial entity,
        Researcher's employer shall also be bound by these terms and
        conditions, and Researcher hereby represents that he or she is
        fully authorized to enter into this agreement on behalf of such
        employer.
    7.  The law of the State of New Jersey shall apply to all disputes
        under this agreement.

**Details**

-   Dataset name: ``imagenet-sample``
-   Dataset source: http://image-net.org
-   Dataset license: https://image-net.org/download
-   Dataset size: 98.26 MB
-   Tags: ``image, classification``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`ImageNetSampleDataset <fiftyone.zoo.datasets.base.ImageNetSampleDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("imagenet-sample")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load imagenet-sample

        fiftyone app launch imagenet-sample

.. image:: /images/dataset_zoo/imagenet-sample.png
   :alt: imagenet-sample
   :align: center