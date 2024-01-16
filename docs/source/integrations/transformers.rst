.. _transformers-integration:

Transformers Integration
========================

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
`transformers` package:

.. code-block:: shell

    pip install transformers

.. _transformers-inference:

Inference
_________

All
`Transformers models <https://huggingface.co/docs/transformers/index#supported-models-and-frameworks>`_
that support image classification, object detection, and semantic segmentation
can be passed directly to your FiftyOne dataset's
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method.

The examples below show how to run inference with various Transformers models
on the following sample dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)
    dataset.select_fields().keep_fields()

.. _transformers-image-classification:

Image classification
--------------------

You can pass `transformers` classification models directly to FiftyOne
dataset's
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method:

.. code-block:: python
    :linenos:

    # BeiT
    from transformers import BeitForImageClassification
    model = BeitForImageClassification.from_pretrained(
        "microsoft/beit-base-patch16-224"
    )

    # DeiT
    from transformers import DeiTForImageClassification
    model = DeiTForImageClassification.from_pretrained(
        "facebook/deit-base-distilled-patch16-224"
    )

    # DINOv2
    from transformers import Dinov2ForImageClassification
    model = Dinov2ForImageClassification.from_pretrained(
        "facebook/dinov2-small-imagenet1k-1-layer"
    )

    # MobileNetV2
    from transformers import MobileNetV2ForImageClassification
    model = MobileNetV2ForImageClassification.from_pretrained(
        "google/mobilenet_v2_1.0_224"
    )

    # Swin Transformer
    from transformers import SwinForImageClassification
    model = SwinForImageClassification.from_pretrained(
        "microsoft/swin-tiny-patch4-window7-224"
    )

    # ViT
    from transformers import ViTForImageClassification
    model = ViTForImageClassification.from_pretrained(
        "google/vit-base-patch16-224"
    )

    # ViT Hybrid
    from transformers import ViTHybridForImageClassification
    model = ViTHybridForImageClassification(
        "google/vit-hybrid-base-bit-384"
    )

    # Any auto model
    from transformers import AutoModelForImageClassification
    model = AutoModelForImageClassification.from_pretrained(
        "facebook/vit-msn-small"
    )

.. code-block:: python
    :linenos:

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

Alternatively, you can manually run inference with the Transformer and then use
the :func:`to_classification() <fiftyone.utils.transformers.to_classification>`
utility to convert the predictions to :ref:`FiftyOne format <classification>`:

.. code-block:: python
    :linenos:

    from PIL import Image
    import fiftyone.utils.transformers as fout

    from transformers import AutoModelForImageClassification
    transformers_model = AutoModelForImageClassification.from_pretrained(
        "microsoft/beit-base-patch16-224"
    )
    image_processor = AutoImageProcessor.from_pretrained(
        "microsoft/beit-base-patch16-224"
    )
    id2label = transformers_model.config.id2label

    for sample in dataset.iter_samples(progress=True):
        image = Image.open(sample.filepath)
        inputs = image_processor(image, return_tensors="pt")
        with torch.no_grad():
            result = transformers_model(**inputs)
        sample["classif_predictions"] = fout.to_classification(result, id2label)
        sample.save()

.. _transformers-object-detection:

Object detection
----------------

You can pass `transformers` detection models directly to your FiftyOne
dataset's
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method:

.. code-block:: python
    :linenos:

    # DETA
    from transformers import DetaForObjectDetection
    model = DetaForObjectDetection.from_pretrained(
        "jozhang97/deta-swin-large"
    )

    # DETR
    from transformers import DetrForObjectDetection
    model = DetrForObjectDetection.from_pretrained(
        "facebook/detr-resnet-50"
    )

    # DeformableDETR
    from transformers import DeformableDetrForObjectDetection
    model = DeformableDetrForObjectDetection.from_pretrained(
        "SenseTime/deformable-detr"
    )

    # Table Transformer
    from transformers import TableTransformerForObjectDetection
    model = TableTransformerForObjectDetection.from_pretrained(
        "microsoft/table-transformer-detection"
    )

    # YOLOS
    from transformers import YolosForObjectDetection
    model = YolosForObjectDetection.from_pretrained(
        "hustvl/yolos-tiny"
    )

    # Any auto model
    from transformers import AutoModelForObjectDetection
    model = AutoModelForObjectDetection.from_pretrained(
        "microsoft/conditional-detr-resnet-50"
    )

.. code-block:: python
    :linenos:

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

Alternatively, you can manually run inference with the Transformer and then use
the :func:`to_detections() <fiftyone.utils.transformers.to_detections>` utility
to convert the predictions to :ref:`FiftyOne format <object-detection>`:

.. code-block:: python

    from PIL import Image
    import fiftyone.utils.transformers as fout

    from transformers import AutoModelForObjectDetection
    transformers_model = AutoModelForObjectDetection.from_pretrained(
        "microsoft/conditional-detr-resnet-50"
    )
    image_processor = AutoImageProcessor.from_pretrained(
        "microsoft/conditional-detr-resnet-50"
    )

    id2label = transformers_model.config.id2label

    for sample in dataset.iter_samples(progress=True):
        image = Image.open(sample.filepath)
        inputs = image_processor(image, return_tensors="pt")
        with torch.no_grad():
            outputs = transformers_model(**inputs)

        results = image_processor.post_process_object_detection(
            outputs, target_sizes=[image.size[::-1]]
        )

        sample["det_predictions"] = fout.to_detections(
            results, id2label, [image.size]
            )
        sample.save()

.. _transformers-semantic-segmentation:

Semantic segmentation
---------------------

You can pass a `transformers` semantic segmentation model directly to your
FiftyOne dataset's
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method:

.. code-block:: python
    :linenos:

    # Mask2Former
    from transformers import Mask2FormerForUniversalSegmentation
    model = Mask2FormerForUniversalSegmentation.from_pretrained(
        "facebook/mask2former-swin-small-coco-instance"
    )

    # Mask2Former
    from transformers import MaskFormerForInstanceSegmentation
    model = MaskFormerForInstanceSegmentation.from_pretrained(
        "facebook/maskformer-swin-base-ade"
    )

    # SegFormer
    from transformers import SegFormerForSemanticSegmentation
    model = SegFormerForSemanticSegmentation.from_pretrained(
        "nvidia/segformer-b0-finetuned-ade-512-512"
    )

    # Any auto model
    from transformers import AutoModelForSemanticSegmentation
    model = AutoModelForSemanticSegmentation.from_pretrained(
        "Intel/dpt-large-ade"
    )

.. code-block:: python
    :linenos:

    dataset.apply_model(model, label_field="predictions")
    dataset.default_mask_targets = model.config.id2label

    session = fo.launch_app(dataset)

Alternatively, you can manually run inference with the Transformer and then use
the :func:`to_segmentation() <fiftyone.utils.transformers.to_segmentation>`
utility to convert the predictions to
:ref:`FiftyOne format <semantic-segmentation>`:

.. code-block:: python

    from PIL import Image
    import fiftyone.utils.transformers as fout

    from transformers import AutoModelForSemanticSegmentation
    transformers_model = AutoModelForSemanticSegmentation.from_pretrained(
        "Intel/dpt-large-ade"
    )
    image_processor = AutoImageProcessor.from_pretrained("Intel/dpt-large-ade")

    for sample in dataset.iter_samples(progress=True):
        image = Image.open(sample.filepath)
        inputs = image_processor(image, return_tensors="pt")
        with torch.no_grad():
            outputs = transformers_model(**inputs)

        results = image_processor.post_process_semantic_segmentation(
            outputs, target_sizes=[image.size[::-1]]
        )

        sample["seg_predictions"] = fout.to_segmentation(results)
        sample.save()

    dataset.default_mask_targets = transformers_model.config.id2label

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
    import fiftyone.utils.transformers as fout

    # Pick a model
    transformers_model = ...
    image_processor = ...
    id2label = transformers_model.config.id2label

    filepaths = dataset.values("filepath")
    batch_size = 16

    predictions = []
    for paths in iter_batches(filepaths, batch_size):
        images = [Image.open(p) for p in paths]
        inputs = image_processor(images, return_tensors="pt")
        image_sizes = [i.size for i in images]

        with torch.no_grad():
            outputs = transformers_model(**inputs)

        results = image_processor.<post_processing_function>(...)

        ## classification
        predictions.extend(fout.to_classification(results, id2label))

        ## detection
        predictions.extend(fout.to_detections(results, id2label, image_sizes))

        ## semantic segmentations
        predictions.extend(fout.to_segmentation(results))

    dataset.set_values("predictions", predictions)

.. note::

    See :ref:`this section <batch-updates>` for more information about
    performing batch updates to your FiftyOne datasets.

.. _transformers-embeddings:

Embeddings
__________

Any Transformer that supports image classification or object detection
tasks can be used to compute embeddings for your samples.

.. note::

    Regardless of whether you use a classification, detection, or base model,
    FiftyOne will extract embeddings from the final hidden state
    (``last_hidden_state``) of the model's base encoder.

.. _transformers-image-embeddings:

Image embeddings
----------------

To compute embeddings for images, you can pass the `transformers` model
directly to your FiftyOne dataset's
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`
method:

.. code-block:: python
    :linenos:

    # Embeddings from base model
    from transformers import BeitModel
    model = BeitModel.from_pretrained(
        "microsoft/beit-base-patch16-224-pt22k"
    )

    # Embeddings from classification model
    from transformers import BeitForImageClassification
    model = BeitForImageClassification.from_pretrained(
        "microsoft/beit-base-patch16-224"
    )

    # Embeddings from detection model
    from transformers import DetaForImageObjectDetection
    model = DetaForImageObjectDetection.from_pretrained(
        "jozhang97/deta-swin-large-o365"
    )

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Load an example dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)
    dataset.select_fields().keep_fields()

    dataset.compute_embeddings(model, embeddings_field="embeddings")

Alternatively, you can use the
:func:`convert_transformers_model() <fiftyone.utils.transformers.convert_transformers_model>`
utility to convert a Tranformer to FiftyOne format, which allows you to check
the model's :meth:`has_embeddings <fiftyone.core.models.Model.has_embeddings>`
property to see if the model can be used to generate embeddings:

.. code-block:: python
    :linenos:

    import numpy as np
    from PIL import Image
    import fiftyone.utils.transformers as fout

    from transformers import BeitModel
    transformers_model = BeitModel.from_pretrained(
        "microsoft/beit-base-patch16-224-pt22k"
    )

    model = fout.convert_transformers_model(transformers_model)
    print(model.has_embeddings)  # True

    # Embed an image directly
    image = Image.open(dataset.first().filepath)
    embedding = model.embed(np.array(image))

.. _transformers-batch-embeddings:

Batch embeddings
----------------

You can request batch inference by passing the optional `batch_size` parameter
to
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`:

.. code-block:: python
    :linenos:

    dataset.compute_embeddings(model, embeddings_field="embeddings", batch_size=16)

.. _transformers-patch-embeddings:

Patch embeddings
----------------

You can compute embeddings for image patches by passing `transformers` models
directly to your FiftyOne dataset's
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
    model = BeitModel.from_pretrained(
        "microsoft/beit-base-patch16-224-pt22k"
    )

    dataset.compute_patch_embeddings(
        model,
        patches_field="ground_truth",
        embeddings_field="embeddings",
    )

.. _transformers-brain-methods:

Brain methods
_____________

Because `transformers` models can be used to compute embeddings, they can be
passed to :ref:`Brain methods <fiftyone-brain>` like
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` and
:meth:`compute_visualization() <fiftyone.brain.compute_visualization>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)

    from transformers import BeitModel
    transformers_model = BeitModel.from_pretrained(
        "microsoft/beit-base-patch16-224-pt22k"
    )

.. code-block:: python
    :linenos:

    # Option 1: directly pass `transformers` model
    fob.compute_similarity(dataset, model=transformers_model, brain_key="sim1")
    fob.compute_visualization(dataset, model=transformers_model, brain_key="vis1")

.. code-block:: python
    :linenos:

    # Option 2: pass pre-computed embeddings
    dataset.compute_embeddings(transformers_model, embeddings_field="embeddings")

    fob.compute_similarity(dataset, embeddings="embeddings", brain_key="sim2")
    fob.compute_visualization(dataset, embeddings="embeddings", brain_key="vis2")
