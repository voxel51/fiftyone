.. _dataset-zoo-gr00t-x-embodiment-sim:

GR00T-X-Embodiment-Sim
----------------------

.. default-role:: code

A 42-episode subset of NVIDIA's GR00T-X-Embodiment-Sim corpus, six episodes
from each of seven robot embodiments, as native `.mcap` episodes.

Each episode carries the camera streams as H.264 video, per-part robot state
and action telemetry with timeline plot channels, and the task instruction.

**Details**

-   Dataset name: ``gr00t-x-embodiment-sim``
-   Dataset source: https://huggingface.co/datasets/Voxel51/GR00T-X-Embodiment-Sim
-   Dataset size: 1.00 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, robotics, simulation``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`GR00TXEmbodimentSimDataset <fiftyone.zoo.datasets.base.GR00TXEmbodimentSimDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("gr00t-x-embodiment-sim")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load gr00t-x-embodiment-sim

        fiftyone app launch gr00t-x-embodiment-sim

.. image:: /images/dataset_zoo/gr00t-x-embodiment-sim.png
   :alt: gr00t-x-embodiment-sim
   :align: center
