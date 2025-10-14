.. _dataset-zoo-hmdb51:

HMBD51
-------

HMDB51 is an action recognition dataset containing a total of 6,766
clips distributed across 51 action classes.

**Details**

-   Dataset name: ``hmdb51``
-   Dataset source: https://serre-lab.clps.brown.edu/resource/hmdb-a-large-human-motion-database
-   Dataset license: CC-BY-4.0
-   Dataset size: 2.16 GB
-   Tags: ``video, action-recognition``
-   Supported splits: ``train, test, other``
-   ZooDataset class:
    :class:`HMDB51Dataset <fiftyone.zoo.datasets.base.HMDB51Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz
        import fiftyone.utils.video as fouv

        dataset = foz.load_zoo_dataset("hmdb51", split="test")

        # Re-encode source videos as H.264 MP4s so they can be viewed in the App
        fouv.reencode_videos(dataset)

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load hmdb51 --split test

        # Re-encode source videos as H.264 MP4s so they can be viewed in the App
        fiftyone utils transform-videos hmdb51-test --reencode

        fiftyone app launch hmdb51-test

.. note::

    In order to work with video datasets, you’ll need to have
    :ref:`ffmpeg installed <troubleshooting-video>`.

.. image:: /images/dataset_zoo/hmdb51-test.png
   :alt: hmdb51-test
   :align: center
