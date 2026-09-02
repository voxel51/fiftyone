.. _dataset-zoo-robomind:

RoboMIND
--------

.. default-role:: code

A 32-episode subset of the RoboMIND manipulation benchmark, eight episodes
from each of four robot embodiments (Franka, AgileX, Tien Kung, UR), as
native `.mcap` episodes.

Each episode carries per-camera RGB and depth streams, joint telemetry for
every recorded arm with timeline plot channels, and the language instruction.

**Details**

-   Dataset name: ``robomind``
-   Dataset source: https://huggingface.co/datasets/Voxel51/RoboMIND
-   Dataset size: 2.51 GB
-   Dataset license: Apache-2.0
-   Tags: ``multimodal, mcap, robotics, manipulation``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`RoboMINDDataset <fiftyone.zoo.datasets.base.RoboMINDDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("robomind")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load robomind

        fiftyone app launch robomind

.. image:: /images/dataset_zoo/robomind.png
   :alt: robomind
   :align: center
