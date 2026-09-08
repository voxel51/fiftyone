.. _running-inference-keypoints:

Inference for Keypoints
==========================

.. default-role:: code

Pose and landmark models label each sample with a |Keypoints| field, which
you generate by passing a model to
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`.

The :ref:`Ultralytics integration <ultralytics-integration>` shows this in
practice: a YOLO pose model can be passed directly to `apply_model()` with no
wrapping required, producing keypoints that render with FiftyOne's built-in
skeleton support.

.. customanimatedcta::
    :button_text: See Ultralytics keypoint inference
    :button_link: ../../integrations/ultralytics.html#ultralytics-keypoints

For a fully custom model, configure a
:class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>` with a
:class:`KeypointDetectorOutputProcessor <fiftyone.utils.torch.KeypointDetectorOutputProcessor>`
so it works with `apply_model()` directly, as described in
:ref:`Inference with custom models <running-inference-custom>`.
