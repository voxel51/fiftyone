.. _workflows-inference:

Model Inference
===============

Adding model predictions to your dataset is the bridge between training and
evaluation. If your model is in the :doc:`Model Zoo <../model_zoo/index>`,
``dataset.apply_model()`` handles inference in one line — including with your
own fine-tuned weights. For custom models, write a simple inference loop that
converts your model's outputs into FiftyOne labels.

If you're using FiftyOne Enterprise with :doc:`cloud-backed media
<../enterprise/cloud_media>` 🚀, download media locally within your inference
loop using the media caching utilities.

.. toctree::
   :maxdepth: 1
   :hidden:

   Adding object detections <../recipes/adding_detections.ipynb>
   Adding classifier predictions <../recipes/adding_classifications.ipynb>
   Zero-shot classification <../tutorials/zero_shot_classification.ipynb>
