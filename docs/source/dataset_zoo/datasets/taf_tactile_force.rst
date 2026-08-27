.. _dataset-zoo-taf-tactile-force:

TaF Tactile-Force
-----------------

.. default-role:: code

Contact-rich probing runs pairing tactile sensing with measured force, as
native `.mcap` episodes.

Every frame carries what a tactile sensor sees and what a force sensor measures
at the same instant: a vision-based tactile image, a 12x12 piezoelectric
pressure map locating the contact, and a six-axis wrench from an ATI sensor.
Contacts reach 90.8 N and 1.58 Nm.

3,594 episodes across 408 sequences, 10,057,742 frames, 93.1 hours. Six sensor
configurations are represented, spanning the GelSight Mini with and without
markers and a custom sensor with several marker grids.

**Details**

-   Dataset name: ``taf-tactile-force``
-   Dataset source: https://huggingface.co/datasets/Voxel51/TaF-Tactile-Force
-   Dataset size: 41.65 GB
-   Dataset license: MIT
-   Tags: ``multimodal, mcap, tactile, force-torque, manipulation``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`TaFTactileForceDataset <fiftyone.zoo.datasets.base.TaFTactileForceDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("taf-tactile-force")

        # The firmest contacts
        view = dataset.match({"peak_force": {"$gt": 50}})

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load taf-tactile-force

        fiftyone app launch taf-tactile-force

.. image:: /images/dataset_zoo/taf-tactile-force.png
   :alt: taf-tactile-force
   :align: center
