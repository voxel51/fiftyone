.. _super-gradients-integration:

Super Gradients Integration
===========================

.. default-role:: code

FiftyOne integrates natively with Deci AI's
`SuperGradients <https://github.com/Deci-AI/super-gradients>`_ library, so you
can run inference with YOLO-NAS architectures on your FiftyOne datasets with
just a few lines of code!

.. _super-gradients-setup:

Setup
_____

To get started with
`SuperGradients <https://github.com/Deci-AI/super-gradients>`_, just install
the `super-gradients` package:

.. code-block:: shell

    pip install super-gradients

.. _super-gradients-inference:

Inference
_________

You can directly pass SuperGradients YOLO-NAS models to your FiftyOne dataset's
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    from super_gradients.training import models

    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)
    dataset.select_fields().keep_fields()

    model = models.get("yolo_nas_m", pretrained_weights="coco")
    # model = models.get("yolo_nas_l", pretrained_weights="coco")
    # model = models.get("yolo_nas_s", pretrained_weights="coco")

    dataset.apply_model(model, label_field="yolo_nas", confidence_thresh=0.7)

    session = fo.launch_app(dataset)

.. _super-gradients-model-zoo:

Model zoo
_________

SuperGradients YOLO-NAS is also available directly from the
:ref:`FiftyOne Model Zoo <model-zoo-yolo-nas-torch>`!

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    model = foz.load_zoo_model("yolo-nas-torch")

    dataset = foz.load_zoo_dataset("quickstart")
    dataset.apply_model(model, label_field="yolo_nas")

    session = fo.launch_app(dataset)
