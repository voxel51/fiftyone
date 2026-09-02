.. _dataset-zoo-egocentric-emg-force:

Egocentric EMG-Force
--------------------

.. default-role:: code

First-person household task recordings pairing RGB-D video with wrist EMG and
per-finger contact force, as native `.mcap` episodes.

Someone wearing a depth camera and an eight-channel EMG band on each wrist
works through eight household tasks: sweeping and mopping, tidying a bedroom,
a dining room and a living room, loading a washing machine, washing hands at a
sink, wiping hands on paper towel, and applying hand cream. Alongside the video
each episode carries the muscle signal from both forearms at roughly 550 Hz, a
21-point hand skeleton per frame, an estimate of how hard each finger is
pressing, and wrist IMU.

Every episode is cut into subtasks a reviewer described in English, so the 122
segments read as instructions rather than indices: *pick up dustpan and broom*,
*fit the trash bag into the basin*, *restock paper rolls*.

38.2 minutes of recording: 67,185 camera and depth frames, 2,539,493 EMG
samples, 60,254 hand skeletons and 133,721 per-finger force readings across
121 distinct phases.

Contact force is an estimate derived from hand pose and depth rather than a
reading from an instrumented glove, and it saturates at 45 N. The wrist EMG
leads the camera by 80 ms, and the corrected clock the release publishes is
the one used here.

**Details**

-   Dataset name: ``egocentric-emg-force``
-   Dataset source: https://huggingface.co/datasets/Voxel51/Egocentric-EMG-Force
-   Dataset size: 8.43 GB
-   Dataset license: CC BY-NC 4.0
-   Tags: ``multimodal, mcap, egocentric, emg, force, rgb-d``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`EgocentricEMGForceDataset <fiftyone.zoo.datasets.base.EgocentricEMGForceDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("egocentric-emg-force")

        # The tasks with the firmest contact
        view = dataset.match({"peak_finger_force": {"$gt": 40}})

        # Episodes that involve folding
        view = dataset.match(
            {"phases": {"$elemMatch": {"$regex": "fold"}}}
        )

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load egocentric-emg-force

        fiftyone app launch egocentric-emg-force

.. image:: /images/dataset_zoo/egocentric-emg-force.png
   :alt: egocentric-emg-force
   :align: center
