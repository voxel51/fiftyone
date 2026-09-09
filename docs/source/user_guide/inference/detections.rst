.. _running-inference-detections:

Inference for Detections
===========================

.. default-role:: code

Object detection models label each sample with a |Detections| field, which
you generate by passing a model to
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`.
The same field type also covers polygon and instance segmentation output,
since |Detection| instances can optionally carry a mask.

The Model Zoo includes detectors like Faster R-CNN and the YOLO family, and
the :ref:`Object Detection Guide <detection_guide>` walks through applying
both a zoo detector and a custom one to the same dataset.

.. customanimatedcta::
    :button_text: See the full recipe for zoo model inference
    :button_link: ../../model_zoo/overview.html

For a custom model, you can either construct |Detection| instances yourself
in a loop, or configure a
:class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>` with a
:class:`DetectorOutputProcessor <fiftyone.utils.torch.DetectorOutputProcessor>`
so it works with `apply_model()` directly, as described in
:ref:`Inference with custom models <running-inference-custom>`.

.. customanimatedcta::
    :button_text: See the manual-loop recipe for custom detectors
    :button_link: ../../recipes/adding_detections.html
