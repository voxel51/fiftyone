.. _dataset-zoo-dsec-sample:

DSEC Sample
-----------

.. default-role:: code

A sample of the DSEC stereo event camera driving dataset, as native `.mcap`
episodes.

A car carries a stereo pair of Prophesee event cameras at 640x480 and a stereo
pair of global-shutter color cameras at 1440x1080 through Zurich, Thun and
Interlaken, with disparity ground truth derived from LiDAR for both pairs and,
on some sequences, optical flow ground truth for the event cameras. Each
episode carries every event of both event cameras as point clouds, one per
1/30 s window, beside a render of each window, with the rectified color images
and the ground truth.

6 sequences across Zurich, Thun and Interlaken, 105 seconds of driving,
2,233,378,133 events and 2,112 image pairs.

**Details**

-   Dataset name: ``dsec-sample``
-   Dataset source: https://huggingface.co/datasets/Voxel51/DSEC-Sample
-   Dataset size: 11.17 GB
-   Dataset license: CC-BY-SA-4.0
-   Tags: ``multimodal, mcap, event-camera, stereo, driving``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`DSECSampleDataset <fiftyone.zoo.datasets.base.DSECSampleDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("dsec-sample")

        # The sequences with the busiest event streams
        view = dataset.sort_by("peak_event_rate_mev_s", reverse=True)

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load dsec-sample

        fiftyone app launch dsec-sample

.. image:: /images/dataset_zoo/dsec-sample.png
   :alt: dsec-sample
   :align: center
