.. _dataset-zoo-tartanground:

TartanGround
------------

.. default-role:: code

Six trajectories from the TartanGround ground-robot dataset, one per
simulation environment (AbandonedFactory, CyberPunkDowntown, GreatMarsh,
Hospital, JapaneseCity, NordicHarbor), as native `.mcap` episodes.

Each episode carries the front camera, its segmentation stream, per-frame
lidar point clouds, ego pose, and IMU plot channels on a 10 Hz frame clock.

**Details**

-   Dataset name: ``tartanground``
-   Dataset source: https://huggingface.co/datasets/Voxel51/TartanGround
-   Dataset size: 6.80 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, robotics, lidar, simulation``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`TartanGroundDataset <fiftyone.zoo.datasets.base.TartanGroundDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("tartanground")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load tartanground

        fiftyone app launch tartanground

.. image:: /images/dataset_zoo/tartanground.png
   :alt: tartanground
   :align: center
