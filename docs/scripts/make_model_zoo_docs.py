"""
Script for generating the model zoo docs page contents
``docs/source/user_guide/model_zoo/models.rst ``.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

from jinja2 import Environment, BaseLoader

import eta.core.utils as etau

import fiftyone.zoo as foz


logger = logging.getLogger(__name__)


_SECTION_TEMPLATE = """
.. _model-zoo-{{ link_name }}-models:

{{ header_name }} models
{{ '-' * (header_name|length + 7) }}

Available models
________________

.. table::
    :widths: 40 60

    +{{ '-' * col1_width }}+{{ '-' * col2_width }}+
    | Model name {{ ' ' * (col1_width - 12) }}| Tags {{ ' ' * (col2_width - 6) }}|
    +{{ '=' * col1_width }}+{{ '=' * col2_width }}+
{% for model in models %}
    | :ref:`{{ model['name'] }} <model-zoo-{{ model['name'] }}>` {{ ' ' * (col1_width - 2 * model['name']|length - 22) }}| {{ model['tags_str'] }} {{ ' ' * (col2_width - model['tags_str']|length - 2) }}|
    +{{ '-' * col1_width }}+{{ '-' * col2_width }}+
{% endfor %}
"""

_MODEL_TEMPLATE = """
.. _model-zoo-{{ name }}:

{{ header_name }}
{{ '_' * header_name|length }}

{{ description }}.

**Details**

-   Model name: ``{{ name }}``
-   Model source: {{ source }}
-   Model size: {{ size }}
-   Exposes embeddings? {{ exposes_embeddings }}
-   Tags: ``{{ tags }}``

**Requirements**

{% if base_packages %}
-   Packages: ``{{ base_packages }}``

{% endif %}
-   CPU

    -   Support? {{ supports_cpu }}
{% if cpu_packages %}
    -   Packages: ``{{ cpu_packages }}``
{% endif %}

-   GPU

    -   Support? {{ supports_gpu }}
{% if gpu_packages %}
    -   Packages: ``{{ gpu_packages }}``
{% endif %}

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

{% if 'imagenet' in name %}
    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
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

    model = foz.load_zoo_model("{{ name }}")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)
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

    size_str = etau.to_human_bytes_str(zoo_model.size_bytes, decimals=2)
    size_str = size_str[:-2] + " " + size_str[-2:]  # 123.45 MB, not 123.45MB

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


def _print_section(template, all_models, print_source, header_name):
    section_content = _render_section_content(
        template, all_models, print_source, header_name
    )
    print(section_content)

    for _, source, content in all_models:
        if source == print_source:
            print(content)


environment = Environment(
    loader=BaseLoader, trim_blocks=True, lstrip_blocks=True,
)

section_template = environment.from_string(_SECTION_TEMPLATE)
model_template = environment.from_string(_MODEL_TEMPLATE)

models = []
for model_name in foz.list_zoo_models():
    source, content = _render_model_content(model_template, model_name)
    models.append((model_name, source, content))

# Torch models
_print_section(section_template, models, "torch", "Torch")

# TensorFlow models
_print_section(section_template, models, "tensorflow", "TensorFlow")
