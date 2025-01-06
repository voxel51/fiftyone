"""
Script for generating the model zoo docs page contents
``docs/source/user_guide/model_zoo/models.rst``.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import re

from jinja2 import Environment, BaseLoader

import eta.core.utils as etau

import fiftyone.zoo as foz


logger = logging.getLogger(__name__)


_HEADER = """
.. _model-zoo-models:

Built-In Zoo Models
===================

.. default-role:: code

This page lists all of the natively available models in the FiftyOne Model Zoo.

Check out the :ref:`API reference <model-zoo-api>` for complete instructions
for using the Model Zoo.
"""


_SECTION_TEMPLATE = """
.. _model-zoo-{{ link_name }}-models:

{{ header_name }} models
{{ '-' * (header_name|length + 7) }}
"""


_MODEL_TEMPLATE = """
.. _model-zoo-{{ name }}:

{{ header_name }}
{{ '_' * header_name|length }}

{{ description }}.

**Details**

-   Model name: ``{{ name }}``
-   Model source: {{ source }}
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
{% elif 'zero-shot' in name and 'transformer' in name %}
    model = foz.load_zoo_model(
        "{{ name }}",
        classes=["person", "dog", "cat", "bird", "car", "tree", "chair"],
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
{% endif %}
"""


_CARD_SECTION_START = """
.. raw:: html

    <div id="tutorial-cards-container">

    <nav class="navbar navbar-expand-lg navbar-light tutorials-nav col-12">
        <div class="tutorial-tags-container">
            <div id="dropdown-filter-tags">
                <div class="tutorial-filter-menu">
                    <div class="tutorial-filter filter-btn all-tag-selected" data-tag="all">All</div>
                </div>
            </div>
        </div>
    </nav>

    <hr class="tutorials-hr">

    <div class="row">

    <div id="tutorial-cards">
    <div class="list">
"""


_CARD_SECTION_END = """
.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>
"""


_CARD_MODEL_TEMPLATE = """
.. customcarditem::
    :header: {{ header }}
    :description: {{ description }}
    :link: {{ link }}
    :tags: {{ tags }}
"""


def _render_section_content(template, all_models, print_source, header_name):
    models = []
    for model_name, source, _ in all_models:
        if source != print_source:
            continue

        zoo_model = foz.get_zoo_model(model_name)

        tags_str = ", ".join(zoo_model.tags)

        models.append({"name": model_name, "tags_str": tags_str})

    col1_width = 2 * max(len(m["name"]) for m in models) + 22
    col2_width = max(len(m["tags_str"]) for m in models) + 2

    return template.render(
        link_name=print_source,
        header_name=header_name,
        col1_width=col1_width,
        col2_width=col2_width,
        models=models,
    )


def _render_model_content(template, model_name):
    zoo_model = foz.get_zoo_model(model_name)

    if "torch" in zoo_model.tags:
        source = "torch"
    elif any(t in zoo_model.tags for t in ("tf", "tf1", "tf2")):
        source = "tensorflow"
    else:
        source = "other"

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
        size=size_str,
        exposes_embeddings=exposes_embeddings,
        tags=tags_str,
        base_packages=base_packages,
        supports_cpu=supports_cpu,
        cpu_packages=cpu_packages,
        supports_gpu=supports_gpu,
        gpu_packages=gpu_packages,
    )

    return source, content


def _render_card_model_content(template, model_name):
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

    tags = ",".join(tags)

    link = "models.html#%s" % zoo_model.name.replace(".", "-")

    description = zoo_model.description

    # remove paper links from descriptions
    description = description.replace("`_", '"')
    description = description.replace("`", '"')
    description = re.sub(" <.*>", "", description)

    content = template.render(
        header=zoo_model.name, description=description, link=link, tags=tags
    )

    return content


def _generate_section(template, all_models, print_source, header_name):
    content = [
        _render_section_content(
            template, all_models, print_source, header_name
        )
    ]

    for _, source, model_content in all_models:
        if source == print_source:
            content.append(model_content)

    return content


def main():
    # Render model sections

    environment = Environment(
        loader=BaseLoader,
        trim_blocks=True,
        lstrip_blocks=True,
    )

    section_template = environment.from_string(_SECTION_TEMPLATE)
    model_template = environment.from_string(_MODEL_TEMPLATE)
    card_model_template = environment.from_string(_CARD_MODEL_TEMPLATE)

    models = []
    for model_name in foz.list_zoo_models():
        source, content = _render_model_content(model_template, model_name)
        models.append((model_name, source, content))

    # Generate page content

    content = [_HEADER]
    content.append(_CARD_SECTION_START)
    for model_name in foz.list_zoo_models():
        card_content = _render_card_model_content(
            card_model_template, model_name
        )
        content.append(card_content)

    content.append(_CARD_SECTION_END)
    content.extend(
        _generate_section(section_template, models, "torch", "Torch")
    )
    content.extend(
        _generate_section(section_template, models, "tensorflow", "TensorFlow")
    )

    # Write docs page

    docs_dir = "/".join(os.path.realpath(__file__).split("/")[:-2])
    outpath = os.path.join(docs_dir, "source/model_zoo/models.rst")

    print("Writing '%s'" % outpath)
    etau.write_file("\n".join(content), outpath)


if __name__ == "__main__":
    main()
