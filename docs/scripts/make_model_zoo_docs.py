"""
Script for generating the model zoo docs page contents
``docs/source/model_zoo/model_zoo_ecosystem/``.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import re
from pathlib import Path

from jinja2 import Environment, BaseLoader

import eta.core.utils as etau
import fiftyone.zoo as foz


logger = logging.getLogger(__name__)


_CARD_MODEL_TEMPLATE = """
.. customcarditem::
    :header: {{ header }}
    :description: {{ description }}
    :link: {{ link }}
    :tags: {{ tags }}
"""

_MODEL_TEMPLATE = """
.. breadcrumb::
    :text: Model Zoo
    :link: ../index.html
    :text: {{ name }}
    :link: #

.. _model-zoo-{{ name }}:

{{ header_name }}
{{ '_' * header_name|length }}

{{ description }}.

**Details**

-   Model name: ``{{ name }}``
-   Model source: {{ source }}
{% if author %}
-   Model author: {{ author }}
{% endif %}
{% if license %}
-   Model license: {{ license }}
{% endif %}
{% if size %}
-   Model size: {{ size }}
{% endif %}
-   Exposes embeddings? {{ exposes_embeddings }}
-   Tags: ``{{ tags }}``

**Requirements**

{% if base_packages %}
-   Packages: ``{{ base_packages }}``

{% endif %}
-   CPU support

    -   {{ supports_cpu }}
{% if cpu_packages %}
    -   Packages: ``{{ cpu_packages }}``
{% endif %}

-   GPU support

    -   {{ supports_gpu }}
{% if gpu_packages %}
    -   Packages: ``{{ gpu_packages }}``
{% endif %}

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
{% if 'segment-anything' in name and 'video' in name %}
    from fiftyone import ViewField as F
{% elif 'med-sam' in name %}
    from fiftyone import ViewField as F
    from fiftyone.utils.huggingface import load_from_hub
{% endif %}

{% if 'imagenet' in name %}
    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )
{% elif 'segment-anything' in name and 'video' in name %}
    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

    # Only retain detections in the first frame
    (
        dataset
        .match_frames(F("frame_number") > 1)
        .set_field("frames.detections", None)
        .save()
    )
{% elif 'med-sam' in name %}
    dataset = load_from_hub("Voxel51/BTCV-CT-as-video-MedSAM2-dataset")[:2]

    # Retaining detections from a single frame in the middle
    # Note that SAM2 only propagates segmentation masks forward in a video
    (
        dataset
        .match_frames(F("frame_number") != 100)
        .set_field("frames.gt_detections", None)
        .save()
    )
{% else %}
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )
{% endif %}

{% if 'segment-anything' in tags and 'video' not in tags %}
    model = foz.load_zoo_model("{{ name }}")

    # Segment inside boxes
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="ground_truth",  # can contain Detections or Keypoints
    )

    # Full automatic segmentations
    dataset.apply_model(model, label_field="auto")

    session = fo.launch_app(dataset)
{% elif 'med-sam' in name %}
    model = foz.load_zoo_model("{{ name }}")

    # Segment inside boxes and propagate to all frames
    dataset.apply_model(
        model,
        label_field="pred_segmentations",
        prompt_field="frames.gt_detections",
    )

    session = fo.launch_app(dataset)
{% elif 'segment-anything' in tags and 'video' in tags %}
    model = foz.load_zoo_model("{{ name }}")

    # Segment inside boxes and propagate to all frames
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="frames.detections",  # can contain Detections or Keypoints
    )

    session = fo.launch_app(dataset)
{% elif 'dinov2' in name %}
    model = foz.load_zoo_model("{{ name }}")

    embeddings = dataset.compute_embeddings(model)
{% elif 'zero-shot-classification' in name and 'transformer' in name %}
    classes = ["person", "dog", "cat", "bird", "car", "tree", "chair"]

    model = foz.load_zoo_model(
        "{{ name }}",
        classes=classes,
    )

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

    # some models make require additional arguments
    # check the Hugging Face docs to see if any are needed

    # for example, AltCLIP requires `padding=True` in its processor
    model = foz.load_zoo_model(
        "zero-shot-classification-transformer-torch",
        classes=classes,
        name_or_path="BAAI/AltCLIP",
        transformers_processor_kwargs={
            "padding": True,
        }
    )

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)
{% elif 'zero-shot-detection' in name and 'transformer' in name %}
    classes = ["person", "dog", "cat", "bird", "car", "tree", "chair"]

    model = foz.load_zoo_model(
        "{{ name }}",
        classes=classes,
    )

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)
{% elif 'group-vit' in name and 'transformer' in name %}
    model = foz.load_zoo_model("{{ name }}",
        text_prompt="A photo of a",
        classes=["person", "dog", "cat", "bird", "car", "tree", "other"])

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)
{% elif 'transformers' in tags and 'zero-shot' in tags %}

    classes = ["person", "dog", "cat", "bird", "car", "tree", "chair"]

    model = foz.load_zoo_model(
        "{{ name }}",
        classes=classes,
    )

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)
{% else %}
    model = foz.load_zoo_model("{{ name }}")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)
{% endif %}

{% if 'clip' in tags %}
    #
    # Make zero-shot predictions with custom classes
    #

    model = foz.load_zoo_model(
        "{{ name }}",
        text_prompt="A photo of a",
        classes=["person", "dog", "cat", "bird", "car", "tree", "chair"],
    )

    dataset.apply_model(model, label_field="predictions")
    session.refresh()
{% elif 'zero-shot' in tags and 'yolo' in tags %}
    #
    # Make zero-shot predictions with custom classes
    #

    model = foz.load_zoo_model(
        "{{ name }}",
        classes=["person", "dog", "cat", "bird", "car", "tree", "chair"],
    )

    dataset.apply_model(model, label_field="predictions")
    session.refresh()
{% endif %}
"""


def _render_card_model_content(template, model_name):
    """Render card content for a model (following original pattern)."""
    zoo_model = foz.get_zoo_model(model_name)

    tags = []
    for tag in zoo_model.tags:
        if tag == "tf1":
            tags.append("TensorFlow-1")
        elif tag == "tf2":
            tags.append("TensorFlow-2")
        elif tag == "tf":
            tags.append("TensorFlow")
        elif tag == "torch":
            tags.append("PyTorch")
        else:
            tags.append(tag.capitalize().replace(" ", "-"))

    tags_str = ",".join(tags)

    # Create link to individual model page
    model_slug = model_name.replace(".", "_").replace("-", "_")
    link = f"model_zoo_ecosystem/{model_slug}.html"

    description = zoo_model.description
    description = description.replace("`_", '"')
    description = description.replace("`", '"')
    description = re.sub(" <.*>", "", description)

    content = template.render(
        header=zoo_model.name,
        description=description,
        link=link,
        tags=tags_str,
    )

    return content


def _render_model_content(template, model_name):
    """Render individual model page content (following original pattern)."""
    zoo_model = foz.get_zoo_model(model_name)

    header_name = model_name

    if zoo_model.size_bytes is not None:
        size_str = etau.to_human_bytes_str(zoo_model.size_bytes, decimals=2)
        size_str = (
            size_str[:-2] + " " + size_str[-2:]
        )  # 123.45 MB, not 123.45MB
    else:
        size_str = None

    if "embeddings" in zoo_model.tags:
        exposes_embeddings = "yes"
    else:
        exposes_embeddings = "no"

    tags_str = ", ".join(zoo_model.tags)

    base_packages = zoo_model.requirements.packages
    if base_packages is not None:
        base_packages = ", ".join(base_packages)

    if zoo_model.supports_cpu:
        supports_cpu = "yes"
    else:
        supports_cpu = "no"

    cpu_packages = zoo_model.requirements.cpu_packages
    if cpu_packages is not None:
        cpu_packages = ", ".join(cpu_packages)

    if zoo_model.supports_gpu:
        supports_gpu = "yes"
    else:
        supports_gpu = "no"

    gpu_packages = zoo_model.requirements.gpu_packages
    if gpu_packages is not None:
        gpu_packages = ", ".join(gpu_packages)

    content = template.render(
        name=zoo_model.name,
        header_name=header_name,
        description=zoo_model.description,
        source=zoo_model.source,
        author=zoo_model.author,
        license=zoo_model.license,
        size=size_str,
        exposes_embeddings=exposes_embeddings,
        tags=tags_str,
        base_packages=base_packages,
        supports_cpu=supports_cpu,
        cpu_packages=cpu_packages,
        supports_gpu=supports_gpu,
        gpu_packages=gpu_packages,
    )

    return content


def main():
    """Main function to generate model zoo documentation."""
    environment = Environment(
        loader=BaseLoader,
        trim_blocks=True,
        lstrip_blocks=True,
    )

    card_model_template = environment.from_string(_CARD_MODEL_TEMPLATE)
    model_template = environment.from_string(_MODEL_TEMPLATE)

    docs_dir = "/".join(os.path.realpath(__file__).split("/")[:-2])
    docs_source_dir = os.path.join(docs_dir, "source")
    model_zoo_ecosystem_dir = os.path.join(
        docs_source_dir, "model_zoo", "model_zoo_ecosystem"
    )

    os.makedirs(model_zoo_ecosystem_dir, exist_ok=True)

    all_models = foz.list_zoo_models()
    if not all_models:
        logger.warning("No models found in Model Zoo")
        return

    logger.info(f"Found {len(all_models)} models")

    model_cards_content = []
    for model_name in all_models:
        card_content = _render_card_model_content(
            card_model_template, model_name
        )
        model_cards_content.append(card_content)

    cards_path = os.path.join(model_zoo_ecosystem_dir, "model_cards.rst")
    etau.write_file("\n".join(model_cards_content), cards_path)

    for model_name in all_models:
        model_content = _render_model_content(model_template, model_name)
        model_slug = model_name.replace(".", "_").replace("-", "_")
        model_path = os.path.join(model_zoo_ecosystem_dir, f"{model_slug}.rst")
        etau.write_file(model_content, model_path)

    logger.info("Model zoo documentation generated successfully!")


if __name__ == "__main__":
    main()
