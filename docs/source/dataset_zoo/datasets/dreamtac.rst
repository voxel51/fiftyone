.. _dataset-zoo-dreamtac:

DreamTac
--------

.. default-role:: code

Contact-rich Franka manipulation with vision-based tactile fingertips, as
native `.mcap` episodes.

A Franka Emika Panda works through contact-rich tabletop tasks while four
cameras record on one 20 fps clock: a third-person view, a wrist view, and two
Xense Photon vision-based tactile sensors on the gripper fingertips. Each
fingertip is a gel pad printed with a marker grid that deforms where the object
presses, so the moment of contact is visible rather than inferred from a force
reading.

703 trajectories across 12 tasks, 506,078 frames, 7.03 hours. The tasks run
from picking up a baguette or a USB plug to wiping a whiteboard and cutting a
banana, and each episode also carries the end-effector pose, the gripper
opening and the task instruction.

**Details**

-   Dataset name: ``dreamtac``
-   Dataset source: https://huggingface.co/datasets/Voxel51/DreamTac
-   Dataset size: 2.36 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, tactile, manipulation, robotics``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`DreamTacDataset <fiftyone.zoo.datasets.base.DreamTacDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("dreamtac")

        # The trajectories that moved the furthest
        view = dataset.sort_by("end_effector_path_m", reverse=True)

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load dreamtac

        fiftyone app launch dreamtac

.. image:: /images/dataset_zoo/dreamtac.png
   :alt: dreamtac
   :align: center
