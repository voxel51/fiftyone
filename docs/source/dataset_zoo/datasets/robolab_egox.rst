.. _dataset-zoo-robolab-egox:

RoboLab-EgoX
------------

.. default-role:: code

Policy rollouts recorded on NVIDIA's
`RoboLab <https://github.com/NVLabs/RoboLab>`_ manipulation benchmark, as
native `.mcap` episodes.

Each take carries three synchronized camera views with a matching 16-bit
depth stream, per-camera intrinsics, joint positions, actions, end-effector
pose, and the task instruction. Takes keep the benchmark's own success label,
so failed rollouts sit alongside successful ones: 632 of the 4,000 takes
succeeded, spanning all 28 tasks and 99 background scenes.

In 153 of the 4,000 takes the camera streams carry 80 frames while depth and
telemetry carry 81, so align streams by timestamp rather than by index.

**Details**

-   Dataset name: ``robolab-egox``
-   Dataset source: https://huggingface.co/datasets/Voxel51/RoboLab-EgoX
-   Dataset size: 19.84 GB
-   Dataset license: Apache-2.0
-   Tags: ``multimodal, mcap, robotics, manipulation, depth``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`RoboLabEgoXDataset <fiftyone.zoo.datasets.base.RoboLabEgoXDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("robolab-egox")

        # Rollouts the policy got right
        view = dataset.match({"success": True})

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load robolab-egox

        fiftyone app launch robolab-egox

.. image:: /images/dataset_zoo/robolab-egox.png
   :alt: robolab-egox
   :align: center
