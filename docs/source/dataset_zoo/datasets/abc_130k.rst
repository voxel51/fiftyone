.. _dataset-zoo-abc-130k:

ABC-130k
--------

.. default-role:: code

A curated 40-episode subset of the ABC-130k bimanual robot teleoperation
corpus (134,806 episodes, 195 tasks, 3,553 hours).

Each sample is a native `.mcap` episode containing synchronized multi-camera
video and robot telemetry, rendered on the timeline via FiftyOne's multimodal
support.

**Details**

-   Dataset name: ``abc-130k``
-   Dataset source: https://huggingface.co/datasets/Voxel51/ABC-130k
-   Dataset size: 3.52 GB
-   Dataset license: Apache-2.0
-   Tags: ``multimodal, mcap, robotics, video``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`ABC130kDataset <fiftyone.zoo.datasets.base.ABC130kDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("abc-130k")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load abc-130k

        fiftyone app launch abc-130k

.. image:: /images/dataset_zoo/abc-130k.png
   :alt: abc-130k
   :align: center
