.. _dataset-zoo-haptile:

HapTile
-------

.. default-role:: code

Teleoperated contact-rich manipulation with vision-based tactile fingertips
and the operator's haptic feedback, as native `.mcap` episodes.

A UR5e arm with a Robotiq 2F-85 gripper works through contact-rich tabletop
tasks under teleoperation. Each gripper finger carries a vision-based tactile
sensor that films a gel pad printed with a marker grid, so the contact shows as
the markers moving. Two RGB-D cameras watch the scene, one facing the table and
one on the wrist, and the haptic feedback the operator felt is recorded
alongside the robot state and the language instruction.

1,699 episodes across 38 tasks, 664,045 frames, 12.36 hours. The tasks run
from inserting a peg and folding a T-shirt to pouring from a bottle and wiping
a whiteboard.

**Details**

-   Dataset name: ``haptile``
-   Dataset source: https://huggingface.co/datasets/Voxel51/HapTile
-   Dataset size: 6.32 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, tactile, haptics, manipulation``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`HapTileDataset <fiftyone.zoo.datasets.base.HapTileDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("haptile")

        # The firmest contacts on the right fingertip
        view = dataset.sort_by("peak_marker_motion_right", reverse=True)

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load haptile

        fiftyone app launch haptile

.. image:: /images/dataset_zoo/haptile.png
   :alt: haptile
   :align: center
