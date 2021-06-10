.. _flash:

PyTorch Lightning Flash Integration
===================================

.. default-role:: code

We have worked together with the team behind PyTorch Lightning Flash to make it
as easy as possible to train Flash models on your FiftyOne datasets and to add
the predictions of Flash models to FiftyOne datasets for visualiziation and
analysis.

The following Flash tasks are supported by FiftyOne:

- :ref:`Image Classification <img-classification-training-flash>`
- :ref:`Image Object Detection <img-detection-training-flash>`
- :ref:`Image Semantic Segmentation <img-segmentation-training-flash>`
- :ref:`Video Classification <video-classification-training-flash>`

With support for future Flash tasks on the horizon.


Model training
______________

One of the primary uses of Flash is to load an existing model and finetune it
on your data with minimal code required. 


.. _img-classification-training-flash:

Image classification
--------------------


Image object detection
----------------------

For example, let's train a Flash object detection model on a FiftyOne dataset
with |Detections| ground truth labels.

.. code-block:: python
    :linenos:
    
    import fiftyone as fo
    import fiftyone.zoo as foz
    import flash

    dataset = foz.load_zoo_dataset("quickstart")


.. _adding-model-predictions:

Adding model predictions
________________________

Once you have a trained Flash model, you can use the FiftyOne integrations to
add generate and add model predictions to your |Dataset| or |View|.


Apply model
-----------

The easiest way to generate predictions on an existing |Dataset| or |View| is
to use the :meth:`apply_model() <fiftyone.core.collections.apply_model>`
function, passing in your Flash model.

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    from flash.image import ObjectDetector

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

    # Load the finetuned model
    model = ObjectDetector.load_from_checkpoint("https://flash-weights.s3.amazonaws.com/object_detection_model.pt")

    # Predict
    dataset.apply_model(model, label_field="flash_predictions")

    # Visualize
    session = fo.launch_app(dataset)


Manually adding predictions
---------------------------

In some cases, you may have loaded your data into Flash datamodules already and
want to generate predictions with those. 

Flash models support different serializers, objects that reformat the output of
models. Using FiftyOne serializers, you can return predictions as FiftyOne
|Labels| directly. All you need to do is set the model serializer to the
corresponding FiftyOne serializer for your task and generate predictions.

There are a few different ways that this workflow may come about. 

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    import flash
    from flash.image import ObjectDetector

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

    # Create a datamodule

    datamodule = ObjectDetectionData.from_fiftyone_dataset(
        predict_dataset=dataset,
    )

    trainer = flash.Trainer() 

    # Load the finetuned model
    model = ObjectDetector.load_from_checkpoint("https://flash-weights.s3.amazonaws.com/object_detection_model.pt")

    # Predict
    dataset.apply_model(model, label_field="flash_predictions")

    # Visualize
    session = fo.launch_app(dataset)

