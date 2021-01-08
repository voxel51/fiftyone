"""
Script for generating the model zoo card contents to be added to
``docs/source/user_guide/model_zoo/index.rst ``.

Usage:
    python make_model_zoo_cards.py > zoo_cards.txt

    # Copy zoo_cards.txt contents into
    # docs/source/user_guide/model_zoo/index.rst

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import re

from jinja2 import Environment, BaseLoader

import fiftyone.zoo as foz


logger = logging.getLogger(__name__)


_SECTION_START = """
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

.. Add model zoo cards below"""

_SECTION_END = """
.. End of model zoo cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>
"""


_MODEL_TEMPLATE = """
.. customcarditem::
    :header: {{ header }}
    :description: {{ description }}
    :link: {{ link }}
    :tags: {{ tags }}
"""


def _render_model_content(template, model_name):
    zoo_model = foz.get_zoo_model(model_name)

    if "torch" in zoo_model.tags:
        source = "torch"
    elif any(t in zoo_model.tags for t in ("tf", "tf1", "tf2")):
        source = "tensorflow"
    else:
        source = "other"

    tags = []

    for tag in zoo_model.tags:
        if "tf1" in tag:
            tags.append("TensorFlow 1")
        elif "tf2" in tag:
            tags.append("TensorFlow 2")
        elif "tf" in tag:
            tags.append("TensorFlow")
        elif "torch" in tag:
            tags.append("PyTorch")
        elif tag != "tf":
            tags.append(tag.capitalize())

    tags = ",".join(tags)

    link = "models.html#%s" % zoo_model.name

    description = zoo_model.description
    description = description.replace("`_", "`")
    description = re.sub("<.*>", "", description)

    content = template.render(
        header=zoo_model.name, description=description, link=link, tags=tags
    )

    return source, content


environment = Environment(
    loader=BaseLoader, trim_blocks=True, lstrip_blocks=True,
)

model_template = environment.from_string(_MODEL_TEMPLATE)

print(_SECTION_START)
for model_name in foz.list_zoo_models():
    source, content = _render_model_content(model_template, model_name)
    print(content)

print(_SECTION_END)
