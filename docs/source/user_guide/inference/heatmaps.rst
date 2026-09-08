.. _running-inference-heatmaps:

Inference for Heatmaps
=========================

.. default-role:: code

Dense per-pixel predictions such as depth maps are stored as a |Heatmap|
field, which you populate by passing a model to
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
or by constructing |Heatmap| instances yourself.

The :ref:`Depth Estimation Guide <depth_estimation_guide>` covers both paths
end to end: loading a depth model from the zoo, and running inference with a
custom Hugging Face model that isn't zoo-compatible out of the box.

.. customanimatedcta::
    :button_text: Work through the Depth Estimation Guide
    :button_link: ../../getting_started/depth_estimation/index.html
