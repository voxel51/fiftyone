.. _dataset-zoo-2026-humanoid-ikea-assembly-challenge:

2026 Humanoid IKEA Assembly Challenge
-------------------------------------

.. default-role:: code

Six episodes from the 2026 Humanoid IKEA Assembly Challenge, the shortest
episode from each of six recording days spanning the collection window, as
native `.mcap` episodes.

Each episode carries a side-by-side stereo head camera, both wrist cameras
with their infrared pairs, whole-body and gripper telemetry with timeline
plot channels, base odometry, and the human-annotated subtask sequence.

**Details**

-   Dataset name: ``2026-humanoid-ikea-assembly-challenge``
-   Dataset source:
    https://huggingface.co/datasets/Voxel51/2026-Humanoid-IKEA-Assembly-Challenge
-   Dataset size: 9.75 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, robotics, humanoid, manipulation``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`HumanoidIKEAAssemblyChallengeDataset <fiftyone.zoo.datasets.base.HumanoidIKEAAssemblyChallengeDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "2026-humanoid-ikea-assembly-challenge"
        )

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load 2026-humanoid-ikea-assembly-challenge

        fiftyone app launch 2026-humanoid-ikea-assembly-challenge

.. image:: /images/dataset_zoo/2026-humanoid-ikea-assembly-challenge.png
   :alt: 2026-humanoid-ikea-assembly-challenge
   :align: center
