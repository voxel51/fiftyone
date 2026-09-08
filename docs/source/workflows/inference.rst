.. _workflows-inference:

Model Inference
===============

Adding model predictions to your dataset is the bridge between training and
evaluation. FiftyOne's :ref:`inference API <running-inference>` handles this
identically whether you're using a :ref:`Model Zoo <model-zoo>` model or your
own, and stores whatever your model produces — classifications, detections,
segmentations, keypoints, heatmaps, and more — as native FiftyOne labels.

If you're using FiftyOne Enterprise with :doc:`cloud-backed media
<../enterprise/cloud_media>` 🚀, download media locally within your inference
loop using the media caching utilities.

.. toctree::
   :maxdepth: 1
   :hidden:

   Inference Overview <../user_guide/inference/index>
   Inference for Classifications <../user_guide/inference/classifications>
   Inference for Detections <../user_guide/inference/detections>
   Inference for Segmentations <../user_guide/inference/segmentations>
   Inference for Keypoints <../user_guide/inference/keypoints>
   Inference for Heatmaps <../user_guide/inference/heatmaps>
   Advanced Inference Usage <../user_guide/inference/advanced>
