.. _running-inference-classifications:

Inference for Classifications
================================

.. default-role:: code

Classification models label each sample (or frame) with a |Classification|,
which you generate by passing a model to
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`.

With a zoo model, this includes zero-shot classifiers like CLIP, which
require no training data at all.

.. customanimatedcta::
    :button_text: Walk through zero-shot classification with a zoo model
    :button_link: ../../tutorials/zero_shot_classification.html

For a custom model, you can either construct |Classification| instances
yourself in a loop, or configure a
:class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>` with a
:class:`ClassifierOutputProcessor <fiftyone.utils.torch.ClassifierOutputProcessor>`
so it works with `apply_model()` directly, as described in
:ref:`Inference with custom models <running-inference-custom>`.

.. customanimatedcta::
    :button_text: See the manual-loop recipe for custom classifiers
    :button_link: ../../recipes/adding_classifications.html
