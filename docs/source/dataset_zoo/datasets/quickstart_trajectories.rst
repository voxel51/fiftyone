.. _dataset-zoo-quickstart-trajectories:

Quickstart Trajectories
-----------------------

.. default-role:: code

A small video dataset for trajectory annotation.

The dataset consists of the same 10 video segments as
:ref:`quickstart-video <dataset-zoo-quickstart-video>`, but the per-frame
object detections are linked across frames into object trajectories via the
:class:`Instance <fiftyone.core.labels.Instance>` values in their ``instance``
attributes (the legacy ``index`` attribute has been removed).

.. note::

    Before annotating trajectories, you must compute video metadata and sample
    the videos into frames:

    .. code-block:: python

        dataset.compute_metadata()
        dataset.to_frames(sample_frames=True)

**Details**

-   Dataset name: ``quickstart-trajectories``
-   Dataset size: 35.20 MB
-   Dataset license: CC-BY-4.0
-   Tags: ``video, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`QuickstartTrajectoriesDataset <fiftyone.zoo.datasets.base.QuickstartTrajectoriesDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-trajectories")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart-trajectories

        fiftyone app launch quickstart-trajectories

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/quickstart-trajectories.png
   :alt: quickstart-trajectories
   :align: center
