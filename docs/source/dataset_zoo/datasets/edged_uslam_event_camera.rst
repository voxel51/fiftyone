.. _dataset-zoo-edged-uslam-event-camera:

Edged-USLAM Event Camera
------------------------

.. default-role:: code

Quadrotor flights with a DAVIS346 event camera, carrying every event, as
native `.mcap` episodes.

A DAVIS346 event camera rides a quadrotor flown in a motion-capture room. Each
run records the camera's asynchronous events, its grayscale frames and its
inertial unit with the Vicon pose of the vehicle, across lines, squares,
circles, aggressive turns and manual flights and under lighting from under 5
lux to blinking lights and strong side light. The events are carried as point
clouds, one per 1/30 s window, beside a render of each window.

13 runs, 16 minutes 27 seconds of flight, 657,511,373 events and 39,457
frames. The darkest runs show what the event camera adds: where the frames are
close to black, the events still trace the room.

**Details**

-   Dataset name: ``edged-uslam-event-camera``
-   Dataset source: https://huggingface.co/datasets/Voxel51/Edged-USLAM-Event-Camera
-   Dataset size: 4.88 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, event-camera, uav, robotics``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`EdgedUSLAMEventCameraDataset <fiftyone.zoo.datasets.base.EdgedUSLAMEventCameraDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("edged-uslam-event-camera")

        # The darkest runs, where the frames see least
        view = dataset.sort_by("mean_frame_brightness")

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load edged-uslam-event-camera

        fiftyone app launch edged-uslam-event-camera

.. image:: /images/dataset_zoo/edged-uslam-event-camera.png
   :alt: edged-uslam-event-camera
   :align: center
