.. _dataset-zoo-boilingbench-multimodal:

BoilingBench Multimodal
-----------------------

.. default-role:: code

Pool-boiling and immersion-cooling experiments pairing high-speed or infrared
video with thermal and acoustic sensing, as native `.mcap` episodes.

A copper surface is driven past the onset of boiling while a high-speed camera
watches from the side and a hydrophone, a microphone and an acoustic-emission
sensor listen. Boiling changes character before it changes appearance, and
every modality carries a recorded clock offset against the temperature
acquisition, so the sound, the surface temperature and the frames sit on one
timeline.

Each pool-boiling episode carries the camera, surface temperature and heat
flux, the four embedded thermocouples, acoustic band power and characteristic
frequencies per sensor, per-hit acoustic-emission parameters, and the
release's derived markers stamped where they were found: departure from
nucleate boiling, the surface temperature peak, the critical-heat-flux marker
and the DC power start and shutoff. Two closed-loop immersion-cooling runs are
carried alongside them, recorded in infrared with HFE-7100 and water.

Seven episodes and 1.72 hours of recording, holding 389,483 camera frames,
3,392,459 thermal samples and 171,970 acoustic-emission hits.

The critical-heat-flux figures are the release's own screening markers rather
than validated measurements, and each episode carries the source's
``chf_event_status`` beside them. The camera carries no clock offset of its
own, so its frames are placed by scaling container time onto the run; each
episode records the ``video_time_scale`` it was placed with.

**Details**

-   Dataset name: ``boilingbench-multimodal``
-   Dataset source: https://huggingface.co/datasets/Voxel51/BoilingBench-Multimodal
-   Dataset size: 2.90 GB
-   Dataset license: CC BY 4.0
-   Tags: ``multimodal, mcap, heat-transfer, acoustic, thermal``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`BoilingBenchMultimodalDataset <fiftyone.zoo.datasets.base.BoilingBenchMultimodalDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("boilingbench-multimodal")

        # The runs that reached the highest wall temperature
        view = dataset.sort_by("max_surface_temp_C", reverse=True)

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load boilingbench-multimodal

        fiftyone app launch boilingbench-multimodal

.. image:: /images/dataset_zoo/boilingbench-multimodal.png
   :alt: boilingbench-multimodal
   :align: center
