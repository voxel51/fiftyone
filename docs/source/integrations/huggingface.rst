.. _huggingface-integration:

Hugging Face Integration
========================

.. default-role:: code

FiftyOne integrates natively with Hugging Face's
`Transformers <https://huggingface.co/docs/transformers>`_ library, so
you can load, fine-tune, and run inference with your favorite Transformers
models on your FiftyOne datasets with just a few lines of code!

FiftyOne also integrates with the `Hugging Face Hub <https://huggingface.co/docs/hub/index>`_, 
so you can push datasets to and load datasets from the Hub with ease.

.. _huggingface-transformers:

Transformers Library
____________________


.. _huggingface-transformers-setup:

Setup
-----

To get started with
`Transformers <https://huggingface.co/docs/transformers>`_, just install the
`transformers` package:

.. code-block:: shell

    pip install -U transformers


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
^^^^^^^^^^^^^^^^^^^^^^

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
        name_or_path="Intel/dpt-hybrid-midas",
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
^^^^^^^^^^^^^^^

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

FiftyOne integrates with the `Hugging Face Hub <https://huggingface.co/docs/hub/index>`_
to allow you to push datasets to and load datasets from the Hub with ease. This
integration simplifies the process of sharing datasets with the machine learning 
and computer vision community, and allows you to easily access and work with
many of the most popular vision and multimodal datasets available!


.. _huggingface-hub-setup:

Setup
-----

To push datasets to and load datasets from the `Hugging Face Hub <https://huggingface.co/docs/hub/index>`_,
you will need the `Hugging Face Hub Python client <https://github.com/huggingface/huggingface_hub>`_,
which you can install via PyPI:

.. code-block:: shell

    pip install -U huggingface_hub


To push a dataset to the Hub, and in many cases to even access a dataset on
the hub, you will need to have a `Hugging Face Hub account <https://huggingface.co/join>`_.

Hugging Face handles authentication via tokens, which you can obtain by
logging into your account and navigating to the 
`Access Tokens <https://huggingface.co/settings/tokens>`_ section of your profile.
At the bottom of this page, you can create a new token with write or read access
to the Hub. Once you have your token, you can set it as an environment variable:

.. code-block:: shell

    export HF_TOKEN="<your-token-here>"


.. _huggingface-hub-push-dataset:

Pushing datasets to the Hub
---------------------------

If you are working with a dataset in FiftyOne and you want to quickly share it 
with others, you can do so via the :func:`push_to_hub() <fiftyone.utils.huggingface.push_to_hub>`
function, which takes two positional arguments: 

- the FiftyOne sample collection (a |Dataset| or |DatasetView|)
- the `repo_name`, which will be combined with your Hugging Face username or
  organization name to construct the `repo_id` where the sample collection
  will be uploaded.


As you will see, this simple function allows you to push datasets and filtered
views containing images, videos, point clouds, and other multimodal data to the
Hugging Face Hub, providing you with incredible flexibility in the process.

.. _huggingface-hub-push-dataset-basic:

Basic usage
^^^^^^^^^^^

The basic recipe for pushing a FiftyOne dataset to the Hub is just two lines of
code. As a starting point, let's use the example 
:ref:`Quickstart dataset <dataset-zoo-quickstart>` dataset from the 
:ref:`FiftyOne Dataset Zoo <dataset-zoo>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")


To push the dataset to the Hugging Face Hub, all you need to do is call
:func:`push_to_hub() <fiftyone.utils.huggingface.push_to_hub>` with the dataset
and the desired `repo_name`:

.. code-block:: python
    :linenos:

    import fiftyone.utils.huggingface as fouh

    fouh.push_to_hub(dataset, "my-quickstart-dataset")


When you run this code, a few things happen:

- The dataset and its media files are exported to a temporary directory and
  uploaded to the specified Hugging Face repo.
- A `fiftyone.yml` config file for the dataset is generated and uploaded to
  the repo, which contains all of the necessary information so that the dataset
  can be loaded with :func:`load_from_hub() <fiftyone.utils.huggingface.load_from_hub>`.
- A Hugging Face `Dataset Card <https://huggingface.co/docs/hub/en/datasets-cards>`_
  for the dataset is auto-generated, providing tags, metadata, license info, and
  a code snippet illustrating how to load the dataset from the hub.


Your dataset will be available on the Hub at the following URL:

.. code-block:: shell

    https://huggingface.co/datasets/<your-username-or-org-name>/my-quickstart-dataset


Pushing a |DatasetView| to the Hub works in exactly the same way. For example,
if you want to push a filtered view of the `quickstart` dataset containing only
predictions with high confidence, you can do so by creating the view as usual,
and then passing that in to :func:`push_to_hub() <fiftyone.utils.huggingface.push_to_hub>`:

.. code-block:: python
    :linenos:

    import fiftyone.utils.huggingface as fouh

    # create view with high confidence predictions
    view = dataset.filter_labels("predictions", F("confidence") > 0.95)

    # push view to the Hub as a new dataset
    fouh.push_to_hub(view, "my-quickstart-high-conf")

When you do so, note that the view is exported as a new dataset, and other 
details from the original dataset are not included.

.. _huggingface-hub-push-dataset-advanced:

Advanced usage
^^^^^^^^^^^^^^

The :func:`push_to_hub() <fiftyone.utils.huggingface.push_to_hub>` function
provides a number of optional arguments that allow you to customize how your
dataset is pushed to the Hub, including whether the dataset is public or private,
what license it is released under, and more.

FiftyOne's :func:`push_to_hub() <fiftyone.utils.huggingface.push_to_hub>`
function supports the Hugging Face Hub API arguments `private` and `exist_ok`.

- `private` (bool): Whether the dataset should be private. If `True`, the
  dataset will be private and only accessible to you. If `False`, the dataset
  will be public and accessible to anyone with the link. Defaults to `False`.
- `exist_ok` (bool): Whether to overwrite an existing dataset with the same
    `repo_name`. If `True`, the existing dataset will be overwritten. If `False`,
    an error will be raised if a dataset with the same `repo_name` already exists.
    Defaults to `False`.

For example, to push a dataset to the Hub as private, you can do the following:

.. code-block:: python
    :linenos:

    import fiftyone.utils.huggingface as fouh

    fouh.push_to_hub(dataset, "my-private-dataset", private=True)


You can also specify the `tags`, `license`, and `description` of the dataset,
all of which will propagate to the `fiftyone.yml` config file and the Hugging
Face Dataset Card. For example, to push a video action recognition dataset with
an MIT license and a description, you can do the following:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.huggingface as fouh

    dataset = foz.load_zoo_dataset("quickstart-video")

    fouh.push_to_hub(
        dataset,
        "my-action-recognition-dataset",
        tags=["video", "action-recognition"],
        license="mit",
        description="A dataset of videos for action recognition tasks",
    )


The pushed dataset will be available on the Hub and the dataset page will look
like this:

.. image:: /images/integrations/hf_push_advanced_example.jpg
   :alt: Pushing a dataset to the Hugging Face Hub with advanced options
   :align: center


.. note::

    The `tags` argument can be a string or a list of strings. The tag `fiftyone`
    is automatically added to all datasets pushed with FiftyOne, communicating
    that the dataset was created with FiftyOne and can be loaded with the
    :func:`load_from_hub() <fiftyone.utils.huggingface.load_from_hub>` function.


The license is specified as a string. For a list of supported licenses, see the
`Hugging Face Hub documentation <https://huggingface.co/docs/hub/en/repositories-licenses>`_.

The `description` argument can be used for whatever you like. When the dataset
is loaded from the Hub, this description will be accessible via the dataset's
:meth:`description <fiftyone.core.dataset.Dataset.description>` property.

Additionally, you can specify the "format" of the uploaded dataset. By default,
the format is the standard :ref:`FiftyOneDataset <FiftyOneDataset-import>` format,
but you can also specify the data is uploaded in any of these
:ref:`common formats <supported-import-formats>`. For example, to push the
quickstart dataset in :ref:`COCO <COCODetectionDataset-import>` format, with a
Creative Commons Attribution 4.0 license, you can do the following:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.huggingface as fouh
    import fiftyone.types as fot

    dataset = foz.load_zoo_dataset("quickstart")
    dataset_type = fot.dataset_types.COCODetectionDataset

    fouh.push_to_hub(
        dataset,
        "quickstart-coco",
        dataset_type=dataset_type,
        license="cc-by-4.0",
        label_fields="*" ### convert all label fields, not just ground truth
    )


.. note::

    The `label_fields` argument is used to specify which label fields to convert
    to the specified dataset type. By default when using some dataset formats,
    only the `ground_truth` label field is converted. If you want to convert all
    label fields, you can set `label_fields="*"`. If you want to convert specific
    label fields, you can pass a list of field names.