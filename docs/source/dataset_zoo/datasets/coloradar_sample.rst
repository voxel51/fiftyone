.. _dataset-zoo-coloradar-sample:

ColoRadar Sample
----------------

.. default-role:: code

A sample of the ColoRadar 3D millimetre-wave radar dataset, as native `.mcap`
episodes.

A handheld rig carries a TI cascaded imaging radar and a TI single-chip radar
beside an Ouster OS1-64 LiDAR and a Microstrain inertial unit, through
hallways, a lab, a motion-capture space, outdoor built environments, the narrow
and the large passages of an underground mine, and a fast ride along paths and
roads. Each episode carries both radars' point clouds, a top-down render of
each cascaded radar heatmap, the LiDAR scans, the inertial unit and the
release's LiDAR-inertial ground truth.

7 sequences, one from each of the seven places the release records, 13 minutes
46 seconds of recording, 8,263 LiDAR scans holding 382.6 million points, 4,145
cascaded radar frames and 8,340 single-chip radar scans.

**Details**

-   Dataset name: ``coloradar-sample``
-   Dataset source: https://huggingface.co/datasets/Voxel51/ColoRadar-Sample
-   Dataset size: 6.47 GB
-   Dataset license: Apache-2.0
-   Tags: ``multimodal, mcap, radar, lidar, robotics``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`ColoRadarSampleDataset <fiftyone.zoo.datasets.base.ColoRadarSampleDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("coloradar-sample")

        # The sequences that covered the most ground
        view = dataset.sort_by("ground_truth_path_m", reverse=True)

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load coloradar-sample

        fiftyone app launch coloradar-sample

.. image:: /images/dataset_zoo/coloradar-sample.png
   :alt: coloradar-sample
   :align: center
