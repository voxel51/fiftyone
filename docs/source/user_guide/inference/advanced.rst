.. _running-inference-advanced:

Advanced Inference Usage
===========================

.. default-role:: code

`apply_model()` isn't limited to the task types covered above. It stores
whatever |Label| your model returns, including |Regression| values,
|Polylines|, |TemporalDetections| for video-level events, and |GeoLocation|
data. These have fewer end-to-end guides today, so search the
:ref:`Model Zoo catalog <model-zoo>` (for example, by the `video` or `3d`
tags) to find a model for one of these tasks, or implement a custom
:class:`Model <fiftyone.core.models.Model>` that returns the label type you
need.

.. _running-inference-sharing:

Sharing a custom model
-------------------------

Once you have a custom model working, you can
:ref:`register it as a remotely-sourced zoo model <model-zoo-remote>` so that
it can be loaded and applied just like a built-in model:

.. code-block:: python

    model = foz.load_zoo_model("your-custom-model")
    dataset.apply_model(model, label_field="predictions")

.. customanimatedcta::
    :button_text: Learn how to publish a remote model
    :button_link: ../../model_zoo/remote.html

.. note::

    Framework-specific examples are also available for
    :ref:`Hugging Face <huggingface-integration>`,
    :ref:`Ultralytics <ultralytics-integration>`, and
    :ref:`PyTorch Hub <pytorch-hub-integration>` models.
