.. _huggingface-integration:

Hugging Face Integration
========================

.. default-role:: code

FiftyOne integrates natively with Hugging Face's
`Transformers <https://huggingface.co/docs/transformers>`_ library, so
you can load, fine-tune, and run inference with your favorite Transformers
models on your FiftyOne datasets with just a few lines of code! What's more, 
FiftyOne also integrates with the `Hugging Face Hub <https://huggingface.co/docs/hub/index>`_, 
so you can push datasets to and load datasets from the Hub with ease.

.. _huggingface-transformers:

Transformers
____________


.. _huggingface-transformers-setup:

Setup
-----

To get started with
`Transformers <https://huggingface.co/docs/transformers>`_, just install the
`transformers` package:

.. code-block:: shell

    pip install transformers


.. _huggingface-transformers-inference:

Inference
---------

All
`Transformers models <https://huggingface.co/docs/transformers/index#supported-models-and-frameworks>`_
that support image classification, object detection, semantic segmentation, or
monocular depth estimation tasks can be passed directly to your FiftyOne dataset's
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

.. _huggingface-transformers-image-classification:

Image classification
^^^^^^^^^^^^^^^^^^^^

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

    dataset.apply_model(model, label_field="classif_predictions")

    session = fo.launch_app(dataset)

Alternatively, you can manually run inference with the `transformers` model and
then use the
:func:`to_classification() <fiftyone.utils.transformers.to_classification>`
utility to convert the predictions to :ref:`FiftyOne format <classification>`:

.. code-block:: python
    :linenos:

    from PIL import Image
    import torch
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

        sample["classif_predictions"] = fout.to_classification(result, id2label)
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

.. _huggingface-transformers-object-detection:

Object detection
^^^^^^^^^^^^^^^^

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

    dataset.apply_model(model, label_field="det_predictions")

    session = fo.launch_app(dataset)

Alternatively, you can manually run inference with the `transformers` model and
then use the
:func:`to_detections() <fiftyone.utils.transformers.to_detections>` utility to
convert the predictions to :ref:`FiftyOne format <object-detection>`:

.. code-block:: python

    from PIL import Image
    import torch

    import fiftyone.utils.transformers as fout

    from transformers import AutoModelForObjectDetection, AutoProcessor
    transformers_model = AutoModelForObjectDetection.from_pretrained(
        "microsoft/conditional-detr-resnet-50"
    )
    processor = AutoProcessor.from_pretrained(
        "microsoft/conditional-detr-resnet-50"
    )
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
        sample["det_predictions"] = fout.to_detections(
            result, id2label, [image.size]
        )
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

.. _huggingface-transformers-semantic-segmentation:

Semantic segmentation
^^^^^^^^^^^^^^^^^^^^^

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

    dataset.apply_model(model, label_field="seg_predictions")
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
        sample["seg_predictions"] = fout.to_segmentation(result)
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
        name_or_path="nvidia/segformer-b0-finetuned-ade-512-512",
    )

    dataset.apply_model(model, label_field="segformer")

    session = fo.launch_app(dataset)


.. _huggingface-transformers-monocular-depth-estimation:

Monocular depth estimation
^^^^^^^^^^^^^^^^^^^^^^^^^^

You can pass a `transformers` monocular depth estimation model directly to your
FiftyOne dataset's :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
method:

.. code-block:: python
    :linenos:

    # DPT
    from transformers import DPTForDepthEstimation
    model = DPTForDepthEstimation.from_pretrained("Intel/dpt-large")

    # GLPN
    from transformers import GLPNForDepthEstimation
    model = GLPNForDepthEstimation.from_pretrained("vinvino02/glpn-kitti")


.. code-block:: python
    :linenos:

    dataset.apply_model(model, label_field="depth_predictions")

    session = fo.launch_app(dataset)

Alternatively, you can load `transformers` depth estimation models directly from
the :ref:`FiftyOne Model Zoo <model-zoo>`!

To load a `transformers` depth estimation model from the zoo, specify
`"depth-estimation-transformer-torch"` as the first argument, and pass in the
model's name or path as a keyword argument:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    model = foz.load_zoo_model(
        "depth-estimation-transformer-torch",
        name_or_path="Intel/dpt-hybrid-midas"",
    )

    dataset.apply_model(model, label_field="dpt_hybrid_midas")

    session = fo.launch_app(dataset)


.. _huggingface-transformers-zero-shot-classification:

Zero-shot classification
^^^^^^^^^^^^^^^^^^^^^^^^

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
    transformers_model = CLIPSegModel.from_pretrained(
        "CIDAS/clipseg-rd64-refined"
    )

    model = fout.convert_transformers_model(
        transformers_model,
        task="image-classification",  # or "semantic-segmentation"
    )

.. note::

    Some zero-shot models are compatible with multiple tasks, so it is
    recommended that you specify the task type when converting the model.

.. _huggingface-transformers-zero-shot-detection:

Zero-shot object detection
^^^^^^^^^^^^^^^^^^^^^^^^^^

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
    transformers_model = OwlViTForObjectDetection.from_pretrained(
        "google/owlvit-base-patch32"
    )

    model = fout.convert_transformers_model(
        transformers_model,
        task="object-detection",
    )

.. note::

    Some zero-shot models are compatible with multiple tasks, so it is
    recommended that you specify the task type when converting the model.

.. _huggingface-transformers-batch-inference:

Batch inference
---------------

When using
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
you can request batch inference by passing the optional `batch_size` parameter:

.. code-block:: python
    :linenos:

    dataset.apply_model(model, label_field="det_predictions", batch_size=16)

The manual inference loops can be also executed using batch inference via the
pattern below:

.. code-block:: python
    :linenos:

    from fiftyone.core.utils import iter_batches
    import fiftyone.utils.transformers as fout

    # Load a detection model and its corresponding processor
    from transformers import YolosForObjectDetection, AutoProcessor
    transformers_model = YolosForObjectDetection.from_pretrained(
        "hustvl/yolos-tiny"
    )
    processor = AutoProcessor.from_pretrained("hustvl/yolos-tiny")
    id2label = transformers_model.config.id2label

    filepaths = dataset.values("filepath")
    batch_size = 16

    predictions = []
    for paths in iter_batches(filepaths, batch_size):
        images = [Image.open(p) for p in paths]
        image_sizes = [i.size for i in images]
        target_sizes = torch.tensor([image.size[::-1] for image in images])
        inputs = processor(images, return_tensors="pt")
        with torch.no_grad():
            outputs = transformers_model(**inputs)

        results = processor.post_process_object_detection(
            outputs, target_sizes=target_sizes
        )
        predictions.extend(fout.to_detections(results, id2label, image_sizes))

    dataset.set_values("det_predictions", predictions)

.. note::

    See :ref:`this section <batch-updates>` for more information about
    performing batch updates to your FiftyOne datasets.

.. _huggingface-transformers-embeddings:

Embeddings
----------

Any `transformers` model that supports image classification or object detection
tasks — zero-shot or otherwise — can be used to compute embeddings for your 
samples.

.. note::

    For  zero-shot models, FiftyOne will use the `transformers` model's
    `get_image_features()` method to extract embeddings.

    For non-zero-shot models, regardless of whether you use a classification,
    detection, or base model, FiftyOne will extract embeddings from the
    `last_hidden_state` of the model's base encoder.

.. _huggingface-transformers-image-embeddings:

Image embeddings
^^^^^^^^^^^^^^^^

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
    from transformers import DetaForObjectDetection
    model = DetaForObjectDetection.from_pretrained(
        "jozhang97/deta-swin-large-o365"
    )

    # Embeddings from zero-shot classification model
    from transformers import AltCLIPModel
    model = AltCLIPModel.from_pretrained(
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

.. _huggingface-transformers-text-embeddings:

Text embeddings
^^^^^^^^^^^^^^^

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

.. _huggingface-transformers-batch-embeddings:

Batch embeddings
^^^^^^^^^^^^^^^^

You can request batch inference by passing the optional `batch_size` parameter
to
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`:

.. code-block:: python
    :linenos:

    dataset.compute_embeddings(model, embeddings_field="embeddings", batch_size=16)

.. _huggingface-transformers-patch-embeddings:

Patch embeddings
^^^^^^^^^^^^^^^^

You can compute embeddings for image patches by passing `transformers` models
directly to your FiftyOne dataset's
:meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`
method:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.transformers as fout

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

.. _huggingface-transformers-brain-methods:

Brain methods
-------------

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


.. _huggingface-hub:

Hugging Face Hub
________________

FiftyOne's Hugging Face Hub integration allows you to push datasets to and load
datasets from the `Hugging Face Hub <https://huggingface.co/docs/hub/index>`_.

.. _huggingface-hub-setup:

Setup
-----

If you haven't already, install the `huggingface_hub` and `datasets` packages, 
and log in to your Hugging Face account:

.. code-block:: shell

    pip -U install "huggingface_hub[cli]" datasets
    huggingface-cli login


You may be prompted to enter an access token for reading or writing datasets. 
If you don't have an access token, you can create one in your Hugging Face
account settings `<https://huggingface.co/settings/tokens>`_.


.. _huggingface-hub-push:

Pushing datasets to the Hub
---------------------------

If you have a FiftyOne dataset that you'd like to share with the world, you can
push it to the Hugging Face Hub with just a few lines of code, using 
:meth:`push_to_hub() <fiftyone.utils.hf_hub.push_to_hub>`!


.. _huggingface-hub-basic-push:

Basic recipe for pushing a dataset to the Hub
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To push a |Dataset| to the Hub, simply pass the dataset to the 
:meth:`push_to_hub() <fiftyone.utils.hf_hub.push_to_hub>` method, along with a
name for the dataset:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz
    import fiftyone.utils.hf_hub as fouh

    dataset = foz.load_zoo_dataset("quickstart")

    # upload view to HF hub
    fouh.push_to_hub(dataset, "quickstart")


This will create a repo on the hugging face hub in your account with the name 
`quickstart` and upload the dataset to it. 

💡 You can check your Hugging Face username with `huggingface_hub.whoami()["name"]`


You can also push a |DatasetView| to the Hub in the same way:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.hf_hub as fouh

    dataset = foz.load_zoo_dataset("quickstart")
    ## create a view containing only the first 10 samples
    view = dataset.take(10)

    # upload view to HF hub
    fouh.push_to_hub(view, "quickstart-10")


If you want to keep your dataset private, you can pass `private=True` to the
:meth:`push_to_hub() <fiftyone.utils.hf_hub.push_to_hub>` method:

.. code-block:: python
    :linenos:

    fouh.push_to_hub(dataset, "quickstart", private=True)


.. _huggingface-hub-dataset-card-push:

Customizing the dataset card
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

When you push a dataset to the Hub, FiftyOne will automatically generate a
`dataset card <https://huggingface.co/docs/hub/en/datasets-cards>`_ for it. You 
can customize the dataset card by passing any keyword arguments that are 
accepted by the `datasets.DatasetCardData` constructor to the 
:meth:`push_to_hub() <fiftyone.utils.hf_hub.push_to_hub>` method. For example,
you can specify the dataset's license:

.. code-block:: python
    :linenos:

    fouh.push_to_hub(
        dataset,
        "quickstart",
        license="CC-BY-SA-4.0",
    )


For a full list of the available keyword arguments, 
see `this example <https://github.com/huggingface/hub-docs/blob/main/datasetcard.md?plain=1>`_.


.. _huggingface-hub-loading-datasets:

Loading datasets from the Hub
------------------------------

When it comes to loading datasets from the Hugging Face Hub, there is a wide
range of possible formats the dataset can be in. Broadly speaking, these are 
divided into three categories:

1. FiftyOne datasets, like the ones you push to the Hub using 
   :meth:`push_to_hub() <fiftyone.utils.hf_hub.push_to_hub>`.
2. Hugging Face datasets that adhere to standards for representing 
   image classification and object detection tasks. 
3. Custom datasets that don't adhere to any standard format.

The `fiftyone.utils.hf_hub` module provides a single method, 
:meth:`load_from_hub() <fiftyone.utils.hf_hub.load_from_hub>`, that can load
datasets from the Hub in any of these formats, when given the correct arguments.


.. _huggingface-hub-loading-fiftyone-datasets:

Loading FiftyOne datasets from the Hub
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To load a FiftyOne dataset from the Hub, simply pass the `repo_id` containing
the dataset to the :meth:`load_from_hub() <fiftyone.utils.hf_hub.load_from_hub>`
method. For example, to load the `quickstart` dataset that we pushed to the Hub

.. code-block:: python
    :linenos:

    import fiftyone.utils.hf_hub as fouh

    # load from HF hub
    quickstart = fouh.load_from_hub(
        "<your-hf-username>/quickstart", 
        name="hf-quickstart-dataset",
        persistent=True
    )

    # launch app
    session = fo.launch_app(quickstart)


Notice that we passed the `name` and `persistent` arguments to the 
:meth:`load_from_hub() <fiftyone.utils.hf_hub.load_from_hub>` method. These are
keyword arguments that are accepted by the `fiftyone.core.dataset.Dataset`
constructor. In fact, you can pass any keyword arguments that are accepted by
the `fiftyone.core.dataset.Dataset` constructor to the 
:meth:`load_from_hub() <fiftyone.utils.hf_hub.load_from_hub>` method, and they
will be passed through to the `fiftyone.core.dataset.Dataset` constructor when
the dataset is loaded.


.. _huggingface-hub-loading-hf-datasets:

Loading Hugging Face datasets from the Hub
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Many of the common computer vision datasets available on the Hugging Face Hub
adhere to standards for representing 
`image classification <https://huggingface.co/docs/datasets/en/image_classification>`_ 
and `object detection <https://huggingface.co/docs/datasets/en/object_detection>`_
tasks. In particular, classes are enumerated via `ClassLabel`, and bounding
boxes are stored in COCO format.

If the Hugging Face repo containing this dataset has a `fiftyone.py` file — even
if it's just a stub — you can load the dataset using the 
:meth:`load_from_hub() <fiftyone.utils.hf_hub.load_from_hub>` method, and FiftyOne
will automatically convert it to a FiftyOne dataset:

.. code-block:: python
    :linenos:

    import fiftyone.utils.hf_hub as fouh

    # load from HF hub
    pokemon = fouh.load_from_hub(
        "jamarks/pokemon_copy", 
        name="pokemon",
    )

    # launch app
    session = fo.launch_app(pokemon)


💡 As a dataset author, even if you uploaded your dataset to the Hub in a non-FiftyOne
format, consider adding a `fiftyone.py` file to your repo to make it easier for
FiftyOne users to load your dataset!

If the Hugging Face repo containing the dataset does not have a `fiftyone.py`
then you can still load the dataset using the :class:`DefaultHuggingFaceLoader`, after
loading the Hugging Face dataset using the `datasets` library:

.. code-block:: python
    :linenos:

    import fiftyone.utils.hf_hub as fouh
    import datasets

    # load from HF hub
    hf_dataset = load_dataset("cppe-5", split='train')

    # load using the default loader
    loader = fouh.DefaultHuggingFaceLoader("cppe-5", hf_dataset)
    dataset = loader.load()

    # launch app
    session = fo.launch_app(dataset)


.. _huggingface-hub-loading-custom-datasets:

Loading custom datasets from the Hub
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

If the dataset you want to load from the Hub doesn't adhere to any standard
format, you can define a custom loader to load it. To do this, subclass the
:class:`fiftyone.utils.hf_hub.BaseHuggingFaceLoader` class and implement the 
`load()` method.

As a simple example, let's write a loader for the 
`Fashionpedia detection dataset <https://huggingface.co/datasets/detection-datasets/fashionpedia`_,
which has detections in VOC format:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.hf_hub as fouh
    import datasets

    import fiftyone as fo
    import fiftyone.utils.hf_hub as fouh
    import datasets

    class FashionpediaLoader(fouh.BaseHuggingFaceLoader):

        def load(self):
            if isinstance(self.hf_dataset, datasets.DatasetDict):
                split_names = list(self.hf_dataset.keys())
                self.hf_dataset = self.hf_dataset[split_names[0]]
            if "name" in self.kwargs:
                self.kwargs.pop("name")
            dataset = fo.Dataset(name="fashionopedia-val", **self.kwargs)
            
            label_classes = self.hf_dataset.features['objects'].feature['category'].names

            samples = []

            download_dir = fouh._get_download_dir(self.repo_id)

            for i, item in enumerate(self.hf_dataset):
                image = item['image']
                basename = f"image_{i}"
                save_path = fouh._save_PIL_image_to_disk(image, download_dir, basename)
                
                width, height = item['width'], item['height']

                objs = item['objects']
                categories = objs['category']
                bboxes = objs['bbox']
                dets = []
                
                for cat, bbox in zip(categories, bboxes):
                    x0, y0, x1, y1 = bbox
                    x0n, y0n, x1n, y1n = x0/width, y0/height, x1/width, y1/height
                    fo_bbox = [x0n, y0n, x1n-x0n, y1n-y0n]
                    label = label_classes[cat]
                    dets.append(fo.Detection(label=label, bounding_box=fo_bbox))

                detections = fo.Detections(detections=dets)

                samples.append(fo.Sample(filepath=save_path, objs=detections))
            dataset.add_samples(samples)
            return dataset


That's all that we need! If this is stored in a `fiftyone.py` file in the repo
containing the Fashionpedia dataset, we can load the dataset using the
:meth:`load_from_hub() <fiftyone.utils.hf_hub.load_from_hub>` method. For instance,
`this copy <https://huggingface.co/datasets/jamarks/fashionpedia-copy>`_ of the 
Fashionpedia dataset available on the Hub can be loaded as follows: 

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.hf_hub as fouh
    # load from HF hub
    dataset = fouh.load_from_hub("jamarks/fashionpedia-copy")

    # launch app
    session = fo.launch_app(dataset)


How does this work? When a `fiftyone.py` file is present in the repo, FiftyOne
will download the file and parse it for a class that subclasses 
:class:`fiftyone.utils.hf_hub.BaseHuggingFaceLoader`. If it finds one, it will 
use that class to load the dataset. If it doesn't find one, it will use the
:class:`DefaultHuggingFaceLoader` to load the dataset.

We can also convert the dataset to a FiftyOne dataset directly using the
`FashionpediaLoader` we defined:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.hf_hub as fouh
    import datasets

    # load from HF hub
    hf_dataset = datasets.load_dataset("jamarks/fashionpedia-copy")
    loader = FashionpediaLoader("fashionpedia", hf_dataset)
    dataset = loader.load()

    # launch app
    session = fo.launch_app(dataset)


