.. _running-inference-segmentations:

Inference for Segmentations
==============================

.. default-role:: code

Semantic segmentation models label each sample with a |Segmentation| field,
while instance segmentation output is stored as a |Detections| field whose
|Detection| instances carry per-object masks. Both are populated by passing
a model to
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`.

The :ref:`Segmentation Guide <segmentation_guide>` walks through applying a
zoo model — Segment Anything 2 — to generate segmentations from prompts.

.. customanimatedcta::
    :button_text: Work through the Segmentation Guide
    :button_link: ../../getting_started/segmentation/index.html

For a custom model, configure a
:class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>` with an
:class:`InstanceSegmenterOutputProcessor <fiftyone.utils.torch.InstanceSegmenterOutputProcessor>`
or
:class:`SemanticSegmenterOutputProcessor <fiftyone.utils.torch.SemanticSegmenterOutputProcessor>`
so it works with `apply_model()` directly, as described in
:ref:`Inference with custom models <running-inference-custom>`.

.. customanimatedcta::
    :button_text: Grok the Model interface and custom models
    :button_link: ../../model_zoo/design.html#model-zoo-custom-models
