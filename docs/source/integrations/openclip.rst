.. _openclip-integration:

OpenCLIP Integration
===========================

.. default-role:: code

FiftyOne's model zoo is integrated with the
`OpenCLIP <https://github.com/mlfoundations/open_clip>`_ library,
an open source implementation of OpenAI's CLIP (Contrastive Language-Image Pre-training) 
model! Easily run inference with any variation you want with a few lines of code!

.. _openclip-setup:

Setup
_____

To get started with OpenCLIP, install the `open_clip_torch` package:

.. code-block:: shell
   pip install open_clip_torch


It also helps to make sure `timm <https://pypi.org/project/timm/>`_ package is up to date as well 

.. code-block:: shell
    pip install timm --upgrade

.. _openclip-loadzoo:

Loading from the Model Zoo
__________________________

To begin, you can load the original ViT-B-32 OpenAI pretrained model with just the following:

.. code-block:: python
    :linenos:

    model = foz.load_zoo_model("open-clip-torch")


You can also specify different model architectures and pretrained weights by passing in optional parameters.
Pretrained models can be loaded directly from OpenCLIP or from hf-hub.

.. code-block:: python
    :linenos:

    RN50 = foz.load_zoo_model(
        "open-clip-torch",
        clip_model="RN50",
        pretrained="cc12m"
        )

    meta_clip = foz.load_zoo_model(
        "open-clip-torch",
        clip_model='ViT-B-32-quickgelu', 
        pretrained='metaclip_400m',
        )

    eva_clip = foz.load_zoo_model(
        "open-clip-torch",
        clip_model='EVA02-B-16', 
        pretrained='merged2b_s8b_b131k',
        )

    clipa = foz.load_zoo_model(
        "open-clip-torch",
        clip_model='hf-hub:UCSC-VLAA/ViT-L-14-CLIPA-datacomp1B', 
        pretrained='',
        )

    siglip = foz.load_zoo_model(
        "open-clip-torch",
        clip_model='hf-hub:timm/ViT-B-16-SigLIP', 
        pretrained='',
        )

.. _openclip_inference:

Inference with a Prompt and Set Classes
________________________________________

With OpenCLIP, you can also optionally specify a text prompt 
to help guide a model towards a solution as well as only specify
a certain number of classes to output during zero shot classification. 
For example we can inference as such:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    model = foz.load_zoo_model(
        "open-clip-torch",
        text_prompt="A photo of a",
        classes=["person", "dog", "cat", "bird", "car", "tree", "chair"],
    )

    dataset.apply_model(model, label_field="clip_predictions")

    session = fo.launch_app(dataset)

.. image:: /images/integrations/zsc-openclip.png
   :alt: zero-shot-classification-example
   :align: center

.. _openclip_embeddings:

Compare Different Models in Embedding Panel
____________________________________________

Another application of OpenCLIP is comparing different embedding visualizations by utilizing different models!
Let's compare the original OpenAI CLIP model to MetaCLIP. We will also perform a quick zero shot classification
to color the embeddings:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    meta_clip = foz.load_zoo_model(
        "open-clip-torch",
        clip_model='ViT-B-32-quickgelu', 
        pretrained='metaclip_400m',
        text_prompt="A photo of a"
        )

    dataset.apply_model(meta_clip, label_field="meta_clip_classification")


    fob.compute_visualization(
        dataset,
        model=meta_clip,
        brain_key="meta_clip",
    )

    openai_clip = foz.load_zoo_model(
        "open-clip-torch",
        text_prompt="A photo of a"
        )

    dataset.apply_model(openai_clip, label_field="openai_clip_classifications")

    fob.compute_visualization(
        dataset,
        model=openai_clip,
        brain_key="openai_clip",
    )

Here is the final result!

.. image:: /images/integrations/clip-compare.gif
   :alt: clip-compare
   :align: center