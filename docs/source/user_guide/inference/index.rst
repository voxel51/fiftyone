.. _running-inference:

Running Inference
==================

.. default-role:: code

FiftyOne lets you add model predictions to any dataset or view via
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
and
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`.
Whatever your model produces — classifications, detections, instance or
semantic segmentations, keypoints, heatmaps, and more — is stored directly on
your samples using FiftyOne's native |Label| types, ready to explore in the
App.

These methods work identically whether the model comes from the
:ref:`Model Zoo <model-zoo>` or is entirely your own.

.. _running-inference-zoo:

Inference with zoo models
--------------------------

The :ref:`Model Zoo <model-zoo>` provides hundreds of pre-trained models,
spanning detection, classification, segmentation, keypoints, embeddings, and
more, that you can apply to your data in a couple of lines:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    model = foz.load_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")
    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. customanimatedcta::
    :button_text: See the full recipe for zoo model inference
    :button_link: ../../model_zoo/overview.html

.. note::

    Browse or search the :ref:`Model Zoo catalog <model-zoo>` to find a model
    for your task, or work through the
    :ref:`Model Dataset Zoo Guide <model_dataset_zoo_guide>` for a complete,
    guided walkthrough.

.. _running-inference-custom:

Inference with custom models
------------------------------

If your model isn't in the zoo, you have two options.

The simplest is to iterate over your dataset and construct the appropriate
|Label| instances yourself. This is the most direct path and requires no
FiftyOne-specific model code.

The more reusable option is to wrap your model so that it implements the
|Model| interface, at which point it works with
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
and
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`
exactly like a zoo model. FiftyOne's
:class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>` class makes
this easy for most PyTorch models.

.. customanimatedcta::
    :button_text: Grok the Model interface and custom models
    :button_link: ../../model_zoo/design.html#model-zoo-custom-models

.. note::

    Did you know? You can also
    :ref:`register your custom model <model-zoo-remote>` under a name of your
    choice so that it can be loaded and shared just like a built-in zoo
    model.
