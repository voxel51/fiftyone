.. _huggingface-integration:

Hugging Face Integration
========================

.. default-role:: code

FiftyOne integrates natively with Hugging Face's
`Transformers <https://huggingface.co/docs/transformers>`_ library, so
you can load, fine-tune, and run inference with your favorite Transformers
models on your FiftyOne datasets with just a few lines of code!

.. _huggingface-setup:

Setup
_____

To get started with
`Transformers <https://huggingface.co/docs/transformers>`_, just install the
`transformers` package:

.. code-block:: shell

    pip install transformers

.. _huggingface-inference:

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

.. _huggingface-image-classification:

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

    # ViT-Hybrid
    from transformers import ViTHybridForImageClassification
    model = ViTHybridForImageClassification.from_pretrained(
        "google/vit-hybrid-base-bit-384"
    )

    # Any auto model
    from transformers import AutoModelForImageClassification
    model = AutoModelForImageClassification.from_pretrained(
        "facebook/levit-128S"
    )

.. code-block:: python
    :linenos:

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

Alternatively, you can manually run inference with the `transformers` model and
then use the
:func:`to_classification() <fiftyone.utils.transformers.to_classification>`
utility to convert the predictions to :ref:`FiftyOne format <classification>`:

.. code-block:: python
    :linenos:

    from PIL import Image
    import fiftyone.utils.transformers as fout

    from transformers import ViTHybridForImageClassification, AutoProcessor
    transformers_model = ViTHybridForImageClassification.from_pretrained(
        "google/vit-hybrid-base-bit-384"
    )
    processor = AutoProcessor.from_pretrained("google/vit-hybrid-base-bit-384")
    id2label = transformers_model.config.id2label

    for sample in dataset.iter_samples(progress=True):
        image = Image.open(sample.filepath)
        inputs = processor(image, return_tensors="pt")
        with torch.no_grad():
            result = transformers_model(**inputs)

        sample["predictions"] = fout.to_classification(result, id2label)
        sample.save()

Finally, you can load `transformers` models directly from the
:ref:`FiftyOne Model Zoo <model-zoo>`!

To load a `transformers` classification model from the zoo, specify
`"classification-transformer-torch"` as the first argument, and pass in the
model's name or path as a keyword argument:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    model = foz.load_zoo_model(
        "classification-transformer-torch",
        name_or_path="facebook/levit-128S",  # HF model name or path
    )

    dataset.apply_model(model, label_field="levit")

    session = fo.launch_app(dataset)

.. _huggingface-object-detection:

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

Alternatively, you can manually run inference with the `transformers` model and
then use the
:func:`to_detections() <fiftyone.utils.transformers.to_detections>` utility to
convert the predictions to :ref:`FiftyOne format <object-detection>`:

.. code-block:: python

    from PIL import Image
    import fiftyone.utils.transformers as fout

    from transformers import AutoModelForObjectDetection, AutoProcessor
    transformers_model = AutoModelForObjectDetection.from_pretrained(
        "microsoft/conditional-detr-resnet-50"
    )
    processor = AutoProcessor.from_pretrained("microsoft/conditional-detr-resnet-50")
    id2label = transformers_model.config.id2label

    for sample in dataset.iter_samples(progress=True):
        image = Image.open(sample.filepath)
        inputs = processor(image, return_tensors="pt")
        with torch.no_grad():
            outputs = transformers_model(**inputs)

        target_sizes = torch.tensor([image.size[::-1]])
        result = processor.post_process_object_detection(
            outputs, target_sizes=target_sizes
        )
        sample["predictions"] = fout.to_detections(result, id2label, [image.size])
        sample.save()

Finally, you can load `transformers` models directly from the
:ref:`FiftyOne Model Zoo <model-zoo>`!

To load a `transformers` detection model from the zoo, specify
`"detection-transformer-torch"` as the first argument, and pass in the model's
name or path as a keyword argument:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    model = foz.load_zoo_model(
        "detection-transformer-torch",
        name_or_path="facebook/detr-resnet-50",  # HF model name or path
    )

    dataset.apply_model(model, label_field="detr")

    session = fo.launch_app(dataset)

.. _huggingface-semantic-segmentation:

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

    # Segformer
    from transformers import SegformerForSemanticSegmentation
    model = SegformerForSemanticSegmentation.from_pretrained(
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

Alternatively, you can manually run inference with the `transformers` model and
then use the
:func:`to_segmentation() <fiftyone.utils.transformers.to_segmentation>` utility
to convert the predictions to :ref:`FiftyOne format <semantic-segmentation>`:

.. code-block:: python

    from PIL import Image
    import fiftyone.utils.transformers as fout

    from transformers import AutoModelForSemanticSegmentation, AutoProcessor
    transformers_model = AutoModelForSemanticSegmentation.from_pretrained(
        "Intel/dpt-large-ade"
    )
    processor = AutoProcessor.from_pretrained("Intel/dpt-large-ade")

    for sample in dataset.iter_samples(progress=True):
        image = Image.open(sample.filepath)
        inputs = processor(image, return_tensors="pt")
        target_size = [image.size[::-1]]

        with torch.no_grad():
            output = transformers_model(**inputs)

        result = processor.post_process_semantic_segmentation(
            output, target_sizes=target_size
        )

        sample["predictions"] = fout.to_segmentation(result)
        sample.save()

Finally, you can load `transformers` models directly from the
:ref:`FiftyOne Model Zoo <model-zoo>`!

To load a `transformers` semantic segmentation model from the zoo, specify
`"segmentation-transformer-torch"` as the first argument, and pass in the
model's name or path as a keyword argument:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    model = foz.load_zoo_model(
        "segmentation-transformer-torch",
        name_or_path="nvidia/segformer-b0-finetuned-ade-512-512",  # HF model name or path
    )

    dataset.apply_model(model, label_field="segformer")

    session = fo.launch_app(dataset)

.. _huggingface-zero-shot-classification:

Zero-shot classification
------------------------

Zero-shot image classification models from `transformers` can be loaded 
directly from the :ref:`FiftyOne Model Zoo <model-zoo>`!

To load a  `transformers` zero-shot classification model from the zoo, specify
`"zero-shot-classification-transformer-torch"` as the first argument, and pass
in the model's name or path as a keyword argument:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    model = foz.load_zoo_model(
        "zero-shot-classification-transformer-torch",
        name_or_path="BAAI/AltCLIP",  # HF model name or path
        classes=["cat", "dog", "bird", "fish", "turtle"],  # optional
    )

Once loaded, you can pass the model directly to your FiftyOne dataset's 
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method:

.. code-block:: python
    :linenos:

    dataset.apply_model(model, label_field="altclip")

    session = fo.launch_app(dataset)

You can also generate embeddings for the samples in your dataset with zero shot
models as follows:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    model = foz.load_zoo_model(
        "zero-shot-classification-transformer-torch",
        name_or_path="BAAI/AltCLIP",  # HF model name or path
    )

    dataset.compute_embeddings(model, embeddings_field="altclip_embeddings")

    session = fo.launch_app(dataset)

You can also change the label classes of zero shot models any time by setting
the `classes` attribute of the model:

.. code-block:: python
    :linenos:

    model.classes = ["cat", "dog", "bird", "fish", "turtle"]

    dataset.apply_model(model, label_field="altclip")

    session = fo.launch_app(dataset)

The
:func:`convert_transformers_model() <fiftyone.utils.transformers.convert_transformers_model>`
utility also allows you to manually convert a zero-shot `transformers` model to
FiftyOne format:

.. code-block:: python
    :linenos:

    import fiftyone.utils.transformers as fout

    from transformers import CLIPSegModel
    transformers_model = CLIPSegModel.from_pretrained("CIDAS/clipseg-rd64-refined")

    model = fout.convert_transformers_model(
        transformers_model,
        task="image-classification",  # "image-classification" or "semantic-segmentation"
    )

.. note::

    Some zero-shot models are compatible with multiple tasks, so it is
    recommended that you specify the task type when converting the model.

.. _huggingface-zero-shot-detection:

Zero-shot object detection
--------------------------

Zero-shot object detection models from `transformers` can be loaded directly
from the :ref:`FiftyOne Model Zoo <model-zoo>`!

To load a `transformers` zero-shot object detection model from the zoo, specify
`"zero-shot-detection-transformer-torch"` as the first argument, and pass
in the model's name or path as a keyword argument. You can optionally pass in a
list of label classes as a keyword argument `classes`:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    model = foz.load_zoo_model(
        "zero-shot-detection-transformer-torch",
        name_or_path="google/owlvit-base-patch32",  # HF model name or path
        classes=["cat", "dog", "bird", "fish", "turtle"],  # optional
    )

The
:func:`convert_transformers_model() <fiftyone.utils.transformers.convert_transformers_model>`
utility also allows you to manually convert a zero-shot `transformers` model to
FiftyOne format:

.. code-block:: python
    :linenos:

    import fiftyone.utils.transformers as fout

    from transformers import OwlViTForObjectDetection
    transformers_model = OwlViTForObjectDetection.from_pretrained("google/owlvit-base-patch32")

    model = fout.convert_transformers_model(
        transformers_model,
        task="object-detection",
    )

.. note::

    Some zero-shot models are compatible with multiple tasks, so it is
    recommended that you specify the task type when converting the model.

.. _huggingface-batch-inference:

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

        # Use the appropriate one of these
        predictions.extend(fout.to_classification(results, id2label))
        predictions.extend(fout.to_detections(results, id2label, image_sizes))
        predictions.extend(fout.to_segmentation(results))

    dataset.set_values("predictions", predictions)

.. note::

    See :ref:`this section <batch-updates>` for more information about
    performing batch updates to your FiftyOne datasets.

.. _huggingface-embeddings:

Embeddings
__________

Any `transformers` model that supports image classification or object detection
tasks — zero-shot or otherwise — can be used to compute embeddings for your 
samples.

.. note::

    For  zero-shot models, FiftyOne will use the `transformers` model's
    `get_image_features()` method to extract embeddings.

    For non-zero-shot models, regardless of whether you use a classification,
    detection, or base model, FiftyOne will extract embeddings from the
    `last_hidden_state` of the model's base encoder.

.. _huggingface-image-embeddings:

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

    # Embeddings from zero-shot classification model
    from transformers import AutoModelForImageClassification
    model = AutoModelForImageClassification.from_pretrained(
        "BAAI/AltCLIP"
    )

    # Embeddings from zero-shot detection model
    from transformers import OwlViTForObjectDetection
    model = OwlViTForObjectDetection.from_pretrained(
        "google/owlvit-base-patch32"
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
utility to convert a `transformers` model to FiftyOne format, which allows you
to check the model's
:meth:`has_embeddings <fiftyone.core.models.Model.has_embeddings>` property to
see if the model can be used to generate embeddings:

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

.. _huggingface-text-embeddings:

Text embeddings
---------------

Zero-shot image classification and object detection models from `transformers`
can also be used to compute embeddings for text:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)
    dataset.select_fields().keep_fields()

    model = foz.load_zoo_model(
        "zero-shot-classification-transformer-torch",
        name_or_path="BAAI/AltCLIP",
    )

    embedding = model.embed_prompt("a photo of a dog")

You can check whether a model supports text embeddings by checking the
:meth:`can_embed_prompts <fiftyone.utils.transformers.ZeroShotTransformerPromptMixin.embed_prompts>`
property:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # A zero-shot model that supports text embeddings
    model = foz.load_zoo_model(
        "zero-shot-classification-transformer-torch",
        name_or_path="BAAI/AltCLIP",
    )
    print(model.can_embed_prompts)  # True

    # A classification model that does not support text embeddings
    model = foz.load_zoo_model(
        "classification-transformer-torch",
        name_or_path="microsoft/beit-base-patch16-224",
    )
    print(model.can_embed_prompts)  # False

.. _huggingface-batch-embeddings:

Batch embeddings
----------------

You can request batch inference by passing the optional `batch_size` parameter
to
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`:

.. code-block:: python
    :linenos:

    dataset.compute_embeddings(model, embeddings_field="embeddings", batch_size=16)

.. _huggingface-patch-embeddings:

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

.. _huggingface-brain-methods:

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

    # Classification model
    from transformers import BeitModel
    transformers_model = BeitModel.from_pretrained(
        "microsoft/beit-base-patch16-224-pt22k"
    )

    # Detection model
    from transformers import DetaForObjectDetection
    transformers_model = DetaForObjectDetection.from_pretrained(
        "jozhang97/deta-swin-large"
    )

    # Zero-shot classification model
    from transformers import AutoModelForImageClassification
    transformers_model = AutoModelForImageClassification.from_pretrained(
        "BAAI/AltCLIP"
    )

    # Zero-shot detection model
    from transformers import OwlViTForObjectDetection
    transformers_model = OwlViTForObjectDetection.from_pretrained(
        "google/owlvit-base-patch32"
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

Because `transformers` zero-shot models can be used to embed text, they can
also be used to construct similarity indexes on your datasets which support
natural language queries.

To use this functionality, you must pass the model by **name** into the brain
method, along with any necessary keyword arguments that must be passed to
:func:`load_zoo_model() <fiftyone.zoo.load_zoo_model>` to load the correct
model:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)

    fob.compute_similarity(
        dataset,
        brain_key="zero_shot_sim",
        model="zero-shot-classification-transformer-torch",
        name_or_path="BAAI/AltCLIP",
    )

    view = dataset.sort_by_similarity("A photo of a dog", k=25)

    session = fo.launch_app(view)
