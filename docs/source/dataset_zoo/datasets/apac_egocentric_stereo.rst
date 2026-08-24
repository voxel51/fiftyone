.. _dataset-zoo-apac-egocentric-stereo:

APAC Egocentric Stereo
----------------------

.. default-role:: code

The labeled stereo release of the APAC egocentric dataset, as native `.mcap`
episodes.

Twelve people were filmed doing their jobs while wearing a head-mounted stereo
rig. Each sequence runs about a minute and carries the rectified video from
both eyes, a depth render, a hand and head tracking render, and a caption
describing what the wearer is doing at every moment. The work spans
industrial, hospitality, logistics and retail settings, across 248 captioned
segments and 62 distinct verbs.

The depth stream is a false-colour render rather than metric depth, and both
eyes ride in one side-by-side stream cut at `per_eye_width`.

**Details**

-   Dataset name: ``apac-egocentric-stereo``
-   Dataset source: https://huggingface.co/datasets/Voxel51/APAC-Egocentric-Stereo
-   Dataset size: 9.36 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, egocentric, stereo, action``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`APACEgocentricStereoDataset <fiftyone.zoo.datasets.base.APACEgocentricStereoDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("apac-egocentric-stereo")

        # The industrial workplaces
        view = dataset.match({"environment": "Industrial"})

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load apac-egocentric-stereo

        fiftyone app launch apac-egocentric-stereo

.. image:: /images/dataset_zoo/apac-egocentric-stereo.png
   :alt: apac-egocentric-stereo
   :align: center
