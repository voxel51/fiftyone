.. _dataset-zoo-treescope-multimodal:

TreeScope Multimodal
--------------------

.. default-role:: code

The VAT-0723 collection of the TreeScope forestry robotics dataset: 10
`.mcap` episodes of UAV-mounted lidar and odometry streams recorded in
agricultural and forestry environments.

.. note::

    This dataset is licensed under CC-BY-NC-SA-4.0, which does not permit
    commercial use.

**Details**

-   Dataset name: ``treescope-multimodal``
-   Dataset source: https://huggingface.co/datasets/Voxel51/treescope-vat0723-multimodal
-   Dataset size: 41.59 GB
-   Dataset license: CC-BY-NC-SA-4.0
-   Tags: ``multimodal, mcap, robotics, lidar``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`TreeScopeMultimodalDataset <fiftyone.zoo.datasets.base.TreeScopeMultimodalDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("treescope-multimodal")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load treescope-multimodal

        fiftyone app launch treescope-multimodal

.. image:: /images/dataset_zoo/treescope-multimodal.png
   :alt: treescope-multimodal
   :align: center
