.. _dataset-zoo-construction-site-traversability:

Construction-Site Traversability
--------------------------------

.. default-role:: code

Closed-loop recordings from an autonomous mobile robot on two active
construction sites, as native `.mcap` episodes.

A tracked mobile robot drives through the sites carrying an OAK-D colour and
range camera, a Livox 3D LiDAR, two inertial units and a u-blox GNSS
receiver. A LiDAR-inertial odometry estimate and the wheel encoders are
recorded alongside the sensors, and the runs revisit the same ground, which
is what makes them useful for loop closure and for traversability work.

Four sessions and 105 minutes of driving over 9,760 m of ground, holding
62,995 colour frames, 62,931 range frames, 62,995 LiDAR sweeps carrying 1.26
billion points, 3.15 million inertial samples and 4,986 satellite fixes.

.. note::

    The recordings were made on working sites and contain site personnel and
    vehicles in the camera streams. They are republished unchanged from a
    public release.

**Details**

-   Dataset name: ``construction-site-traversability``
-   Dataset source: https://huggingface.co/datasets/Voxel51/Construction-Site-Traversability
-   Dataset size: 18.45 GB
-   Dataset license: CC BY-NC 4.0
-   Tags: ``multimodal, mcap, robotics, lidar, depth, gnss``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`ConstructionSiteTraversabilityDataset <fiftyone.zoo.datasets.base.ConstructionSiteTraversabilityDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("construction-site-traversability")

        # The longest run
        view = dataset.sort_by("duration", reverse=True)

        # The runs from the second site
        view = dataset.match({"site": "site2"})

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load construction-site-traversability

        fiftyone app launch construction-site-traversability

.. image:: /images/dataset_zoo/construction-site-traversability.png
   :alt: construction-site-traversability
   :align: center
