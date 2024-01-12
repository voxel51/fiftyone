.. _transformers-integration:

Transformers Integration
=======================

.. default-role:: code

FiftyOne integrates natively with Hugging Face's
`Transformers <https://huggingface.co/docs/transformers>`_ library, so
you can load, fine-tune, and run inference with your favorite Transformers
models on your FiftyOne datasets with just a few lines of code!

.. _transformers-setup:

Setup
_____

To get started with
`Transformers <https://huggingface.co/docs/transformers>`_, just install the
`transformers` library:

.. code-block:: shell

    pip install transformers


.. _transformers-inference:

Inference
_________

All of the `Transformers models <https://huggingface.co/docs/transformers/index#supported-models-and-frameworks>`_ 
that support image classification, object detection, and semantic segmentation
can be applied for those tasks in FiftyOne via the 
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>` 
method.

The examples below show how to run inference with various Transformers models on
the following sample dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.transformers as fout

    # Load an example dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)
    dataset.select_fields().keep_fields()

.. _transformers-image-classification:

Image Classification
--------------------

You can pass the `transformers` model directly into the FiftyOne sample 
collection's :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method:

.. code-block:: python
    :linenos:

    # BeiT
    from transformers import BeitForImageClassification
    model = BeitForImageClassification.from_pretrained(
        "microsoft/beit-base-patch16-224"
    )

    ## DeiT
    # from transformers import DeiTForImageClassification
    # model = DeiTForImageClassification.from_pretrained(
    #     "facebook/deit-base-distilled-patch16-224"
    # )

    ## DINOV2
    # from transformers import Dinov2ForImageClassification
    # model = Dinov2ForImageClassification.from_pretrained(
    #     "facebook/dinov2-small-imagenet1k-1-layer"
    # )

    ## MobileNetV2
    # from transformers import MobileNetV2ForImageClassification
    # model = MobileNetV2ForImageClassification.from_pretrained(
    #     "google/mobilenet_v2_1.0_224"
    # )

    ## Swin Transformer
    # from transformers import SwinForImageClassification
    # model = SwinForImageClassification.from_pretrained(
    #     "microsoft/swin-tiny-patch4-window7-224"
    # )

    ## ViT
    # from transformers import ViTForImageClassification
    # model = ViTForImageClassification.from_pretrained(
    #     "google/vit-base-patch16-224"
    # )


    ## Or any model loaded with `transformers.AutoModelForImageClassification`
    # from transformers import AutoModelForImageClassification
    # model = AutoModelForImageClassification.from_pretrained(
    #     "google/vit-hybrid-base-bit-384"
    # )

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

Alternatively, you can use FiftyOne's `transformers` utilities to explicitly
convert the transformer model to a 
:class:`FiftyOneTransformer <fiftyone.utils.transformers.FiftyOneTransformer>` 
instance and then run inference:

.. code-block:: python
    :linenos:

    from transformers import AutoModelForImageClassification
    transformers_model = AutoModelForImageClassification.from_pretrained(
        "google/vit-hybrid-base-bit-384"
    )

    model = fout.convert_transformers_model(transformers_model)

    dataset.apply_model(model, label_field="predictions")


A third option is to run inference with the transformer model manually and then
convert the predictions to :ref:`FiftyOne format <classification>`:

.. code-block:: python

    from PIL import Image

    from transformers import AutoModelForImageClassification
    transformers_model = AutoModelForImageClassification.from_pretrained(
        "google/vit-hybrid-base-bit-384"
    )

    id2label = transformers_model.config.id2label

    for sample in dataset.iter_samples(progress=True, autosave=True):
        image = Image.open(sample.filepath)
        result = transformers_model(image)
        sample["predictions"] = fout.to_classification(result, id2label)


.. _transformers-object-detection:

Object Detection
----------------

You can pass the `transformers` model directly into the FiftyOne sample
collection's :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method:

.. code-block:: python
    :linenos:

    # DETA
    from transformers import DetaForObjectDetection
    model = DetaForObjectDetection.from_pretrained(
        "jozhang97/deta-swin-large"
    )

    ## DETR
    # from transformers import DetrForObjectDetection
    # model = DetrForObjectDetection.from_pretrained(
    #     "facebook/detr-resnet-50"
    # )

    ## DeformableDETR
    # from transformers import DeformableDetrForObjectDetection
    # model = DeformableDetrForObjectDetection.from_pretrained(
    #     "SenseTime/deformable-detr"
    # )

    ## Table Transformer
    # from transformers import TableTransformerForObjectDetection
    # model = TableTransformerForObjectDetection.from_pretrained(
    #     "microsoft/table-transformer-detection"
    # )

    ## YOLOS
    # from transformers import YolosForObjectDetection
    # model = YolosForObjectDetection.from_pretrained('hustvl/yolos-tiny')

    ## Or any model loaded with `transformers.AutoModelForObjectDetection`
    # from transformers import AutoModelForObjectDetection
    # model = AutoModelForObjectDetection.from_pretrained(
    #     "microsoft/conditional-detr-resnet-50"
    # )

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)


Alternatively, you can use FiftyOne's `transformers` utilities to explicitly
convert the transformer model to a 
:class:`FiftyOneTransformer <fiftyone.utils.transformers.FiftyOneTransformer>`
instance and then run inference:

.. code-block:: python
    :linenos:

    from transformers import AutoModelForObjectDetection
    transformers_model = AutoModelForObjectDetection.from_pretrained(
        "microsoft/conditional-detr-resnet-50"
    )

    model = fout.convert_transformers_model(transformers_model)

    dataset.apply_model(model, label_field="predictions")


A third option is to run inference with the transformer model manually and then
convert the predictions to :ref:`FiftyOne format <object-detection>`:

.. code-block:: python

    from PIL import Image

    from transformers import AutoModelForObjectDetection
    transformers_model = AutoModelForObjectDetection.from_pretrained(
        "microsoft/conditional-detr-resnet-50"
    )

    id2label = transformers_model.config.id2label

    for sample in dataset.iter_samples(progress=True, autosave=True):
        image = Image.open(sample.filepath)
        image_shape = image.size
        result = transformers_model(image)
        sample["predictions"] = fout.to_detections(result, id2label, [image_shape])


.. _transformers-semantic-segmentation:

Semantic Segmentation
---------------------

You can pass the `transformers` model directly into the FiftyOne sample
collection's :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
 method:

.. code-block:: python
    :linenos:

    # Mask2Former
    from transformers import Mask2FormerForUniversalSegmentation
    model = Mask2FormerForUniversalSegmentation.from_pretrained(
        "facebook/mask2former-swin-small-coco-instance"
    )

    ## Mask2Former
    # from transformers import MaskFormerForInstanceSegmentation
    # model = MaskFormerForInstanceSegmentation.from_pretrained(
    #     "facebook/maskformer-swin-base-ade"
    # )

    ## SegFormer
    # from transformers import SegFormerForSemanticSegmentation
    # model = SegFormerForSemanticSegmentation.from_pretrained(
    #     "nvidia/segformer-b0-finetuned-ade-512-512"
    # )

    ## Or any model loaded with `transformers.AutoModelForSemanticSegmentation`
    # from transformers import AutoModelForSemanticSegmentation
    # model = AutoModelForSemanticSegmentation.from_pretrained(
    #     "Intel/dpt-large-ade"
    # )

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)


Alternatively, you can use FiftyOne's `transformers` utilities to explicitly
convert the transformer model to a
:class:`FiftyOneTransformer <fiftyone.utils.transformers.FiftyOneTransformer>`
instance and then run inference:

.. code-block:: python
    :linenos:

    from transformers import AutoModelForSemanticSegmentation
    transformers_model = AutoModelForSemanticSegmentation.from_pretrained(
        "Intel/dpt-large-ade"
    )

    model = fout.convert_transformers_model(transformers_model)

    dataset.apply_model(model, label_field="predictions")


A third option is to run inference with the transformer model manually and then
convert the predictions to :ref:`FiftyOne format <semantic-segmentation>`:

.. code-block:: python

    from PIL import Image

    from transformers import AutoModelForSemanticSegmentation
    transformers_model = AutoModelForSemanticSegmentation.from_pretrained(
        "Intel/dpt-large-ade"
    )

    for sample in dataset.iter_samples(progress=True, autosave=True):
        image = Image.open(sample.filepath)
        result = transformers_model(image)
        sample["predictions"] = fout.to_segmentation(result)


.. _transformers-batch-inference:

Batch inference
---------------

When using
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
you can request batch inference by passing the optional `batch_size` parameter:

.. code-block:: python
    :linenos:

    dataset.apply_model(model, label_field="predictions", batch_size=16)

The manual inference loops can be also executed using batch inference via the
pattern below:

.. code-block:: python
    :linenos:

    from fiftyone.core.utils import iter_batches

    filepaths = dataset.values("filepath")
    batch_size = 16

    predictions = []
    for paths in iter_batches(filepaths, batch_size):
        results = model(paths)
        predictions.extend(fou.to_detections(results))

    dataset.set_values("predictions", predictions)

.. note::

    See :ref:`this section <batch-updates>` for more information about
    performing batch updates to your FiftyOne datasets.


.. _transformers-embeddings:

Embeddings
__________

Any transformer model that supports image classification or object detection
tasks can be used to compute embeddings for your samples.

The embeddings that are extracted are the final hidden states of the model's
base encoder, which are typically the embeddings that are fed into the
classification or detection heads. For the Transformer model, these embeddings
would be accessed via the ``last_hidden_state`` attribute of the model output.

.. _transformers-image-embeddings:


Image Embeddings
----------------

To compute embeddings for images, you can pass the `transformers` model
directly into the FiftyOne sample collection's
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`
method:

.. note::

    Regardless of whether you pass a classification or detection model, or a
    base Transformer model, FiftyOne will extract the same embeddings by 
    accessing the `base_model` attribute of the model, if it exists and using 
    the `last_hidden_state` attribute of this base model's output.


The examples below show how to compute embeddings for the images in the sample
dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.transformers as fout

    # Load an example dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)
    dataset.select_fields().keep_fields()

    # Embeddings from base model (`BeiTModel`)
    from transformers import BeitModel
    model = BeitModel.from_pretrained("microsoft/beit-base-patch16-224-pt22k")

    ## Embeddings from classification model (`BeitForImageClassification`)
    # from transformers import BeitForImageClassification
    # model = BeitForImageClassification.from_pretrained(
    #     "microsoft/beit-base-patch16-224"
    # )

    ## Embeddings from detection model (`DetaForImageObjectDetection`)
    # from transformers import DetaForImageObjectDetection
    # model = DetaForImageObjectDetection.from_pretrained(
    #     "jozhang97/deta-swin-large-o365"
    # )

    dataset.compute_embeddings(model, embeddings_field="embeddings")

    session = fo.launch_app(dataset)


Alternatively, you can use FiftyOne's `transformers` utilities to explicitly
convert the transformer model to a 
:class:`FiftyOneTransformer <fiftyone.utils.transformers.FiftyOneTransformer>`
instance and then compute embeddings:

.. code-block:: python
    :linenos:

    from transformers import BeitModel
    transformers_model = BeitModel.from_pretrained(
        "microsoft/beit-base-patch16-224-pt22k"
    )

    model = fout.convert_transformers_model(transformers_model)

    dataset.compute_embeddings(model, embeddings_field="embeddings")


If you convert a `transformers` model to a 
:class:`FiftyOneTransformer <fiftyone.utils.transformers.FiftyOneTransformer>`,
you can check if the :class:`FiftyOneTransformer <fiftyone.utils.transformers.FiftyOneTransformer>` 
instance can be used to generate embeddings:

.. code-block:: python
    :linenos:

    import numpy as np

    from transformers import BeitModel
    transformers_model = BeitModel.from_pretrained(
        "microsoft/beit-base-patch16-224-pt22k"
    )

    model = fout.convert_transformers_model(transformers_model)

    print(model.has_embeddings)  # True

    ## embed an image directly
    image = Image.open(dataset.first().filepath)
    image_embedding = model(np.array(image))


.. _transformers-batch-embeddings:

Batch Embeddings
================

When using
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`,
you can request batch inference by passing the optional `batch_size` parameter:

.. code-block:: python
    :linenos:

    dataset.compute_embeddings(model, embeddings_field="embeddings", batch_size=16)


.. _transformers-patch-embeddings:

Patch Embeddings
----------------

In analogous fashion to the :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`
method, you can compute embeddings for image patches by passing the
`transformers` model directly into the FiftyOne sample collection's
:meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`
method:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.transformers as fout

    # Load an example dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)

    from transformers import BeitModel
    model = BeitModel.from_pretrained("microsoft/beit-base-patch16-224-pt22k")

    dataset.compute_patch_embeddings(model, embeddings_field="embeddings")



