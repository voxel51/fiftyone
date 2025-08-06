"""
Sphinx configuration file.

For a full list of available options, see:
https://www.sphinx-doc.org/en/master/usage/configuration.html

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import re
import sys

sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("../extensions"))

from custom_directives import (
    CustomButtonDirective,
    CustomCalloutItemDirective,
    CustomCardItemDirective,
    CustomImageLinkDirective,
)
from redirects import generate_redirects

import fiftyone.constants as foc


with open("../../setup.py") as f:
    setup_version = re.search(r'VERSION = "(.+?)"', f.read()).group(1)

if setup_version != foc.VERSION:
    raise RuntimeError(
        "FiftyOne version in setup.py (%r) does not match installed version "
        "(%r). If this is a dev install, reinstall with `pip install -e .` "
        "and try again." % (setup_version, foc.VERSION)
    )


# -- Path setup --------------------------------------------------------------

# If extensions (or modules to document with autodoc) are in another directory,
# add these directories to sys.path here. If the directory is relative to the
# documentation root, use os.path.abspath to make it absolute, like shown here.
#


# -- Project information -----------------------------------------------------

project = "FiftyOne"
copyright = foc.COPYRIGHT.rsplit('.', 1)[0]
author = foc.AUTHOR
release = foc.VERSION


# -- General configuration ---------------------------------------------------

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named "sphinx.ext.*") or your custom
# ones.
extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.intersphinx",
    "sphinx.ext.napoleon",
    "sphinxcontrib.jquery",
    "nbsphinx",
    "sphinx_tabs.tabs",
    "sphinx_copybutton",
    "sphinx_pushfeedback",
    "sphinx_docsearch",
    "sphinx_design",
    "autodocsumm",
    "myst_parser",
    "llms_txt",
]

# Types of class members to generate documentation for.
autodoc_default_options = {
    "members": True,
    "inherited-members": True,
    "member-order": "bysource",
    "autosummary": True,
    "exclude-members": "objects",
}
autodoc_inherit_docstrings = True
autoclass_content = "class"

# Add any paths that contain templates here, relative to this directory.
templates_path = ["_templates"]

# The suffix(es) of source filenames.
# You can specify multiple suffix as a list of strings.
source_suffix = [".rst", ".md"]

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path.
exclude_patterns = ["_includes"]

# A string of reStructuredText that will be included at the beginning of every
# source file that is read
rst_prolog = """
.. include:: /_includes/substitutions.rst
"""

# Disable nbshinx loading require.js - this breaks the pytorch theme's
# scrolling handling, and we don't appear to have any notebook content that
# requires it
nbsphinx_requirejs_path = ""

# Don't execute notbooks during the build process
nbsphinx_execute = "never"

# Adds helpful external links to the built HTML
ref = "v%s" % foc.VERSION
nbsphinx_prolog = """

.. raw:: html

    <table class="fo-notebook-links" align="left">
        <td>
            <a target="_blank" href="https://colab.research.google.com/github/voxel51/fiftyone/blob/%s/docs/source/{{ env.doc2path(env.docname, base=None) }}">
                <img src="../_static/images/icons/colab-logo-256px.png"> &nbsp; Run in Google Colab
            </a>
        </td>
        <td>
            <a target="_blank" href="https://github.com/voxel51/fiftyone/blob/%s/docs/source/{{ env.doc2path(env.docname, base=None) }}">
                <img src="../_static/images/icons/github-logo-256px.png"> &nbsp; View source on GitHub
            </a>
        </td>
        <td>
            <a target="_blank" href="https://raw.githubusercontent.com/voxel51/fiftyone/%s/docs/source/{{ env.doc2path(env.docname, base=None) }}" download>
                <img src="../_static/images/icons/cloud-icon-256px.png"> &nbsp; Download notebook
            </a>
        </td>
    </table>

""" % (
    ref,
    ref,
    ref,
)

# Path to the redirects file, relative to `source/`
redirects_file = "redirects"

# -- Options for intersphinx extension ---------------------------------------

intersphinx_mapping = {
    # including `python` autolinks things like (None) which is not desirable
    # "python": ("https://docs.python.org/3", None),
    "numpy": ("https://numpy.org/doc/stable/", None),
    "plotly": ("https://plotly.com/python-api-reference/", None),
    "torch": ("https://pytorch.org/docs/stable/", None),
    "torchvision": ("https://pytorch.org/vision/stable/", None),
    "flash": ("https://lightning-flash.readthedocs.io/en/latest", None),
    "pymongo": ("https://pymongo.readthedocs.io/en/stable/", None),
    "mongoengine": ("https://docs.mongoengine.org/", None),
    "sklearn": ("https://scikit-learn.org/stable/", None),
    "pydicom": ("https://pydicom.github.io/pydicom/stable/", None),
    "rasterio": ("https://rasterio.readthedocs.io/en/latest/", None),
}

# -- Options for HTML output -------------------------------------------------

# The theme to use for HTML and HTML Help pages.  See the documentation for
# a list of builtin themes.
#
html_logo = "_static/images/voxel51-logo.svg"

html_theme = "pydata_sphinx_theme"
html_theme_options = {
    "navbar_start": ["navbar-logo"],
    "navbar_center": ["navbar-links"],
    "navbar_end": ["book-a-demo"],
    "navbar_persistent": [],
    "footer_start": ["copyright"],
    "footer_end": ["footer-links"],
    # Navbar links
    "link_docs_fiftyone": "https://docs.voxel51.com/",
    "link_fiftyone": "https://voxel51.com/fiftyone/",
    "link_fiftyone_enterprise": "https://voxel51.com/enterprise/",
    "link_usecases": "https://voxel51.com/computer-vision-use-cases/",
    "link_success_stories": "https://voxel51.com/success-stories/",
    "link_talk_to_sales": "https://voxel51.com/talk-to-sales/",
    "link_ourstory": "https://voxel51.com/ourstory/",
    "link_events": "https://voxel51.com/computer-vision-events/",
    "link_voxel51_jobs": "https://voxel51.com/jobs/",
    "link_voxel51_discord": "https://community.voxel51.com",
    "link_voxel51_blog": "https://voxel51.com/blog/",
}

html_sidebars = {
    "**": ["algolia.html", "sidebar-nav"]
}

html_favicon = "_static/favicon/favicon.ico"

# Add any paths that contain custom static files (such as style sheets) here,
# relative to this directory. They are copied after the builtin static files,
# so a file named "default.css" will overwrite the builtin "default.css".
html_static_path = ["_static"]

# These paths are either relative to html_static_path
# or fully qualified paths (eg. https://...)
html_css_files = ["css/voxel51-website.css", "css/custom.css"]
html_js_files = [
    "https://cdn.jsdelivr.net/npm/list.js@2.3.1/dist/list.min.js",
    "js/custom.js",
    "js/tutorial-filters.js"
]

# Prevent RST source files from being included in output
html_copy_source = False


# -- Options for pushfeedback extension ---------------------------------------
pushfeedback_project = "1nx7ekqhts"
pushfeedback_feedback_button_text = "Feedback"
pushfeedback_button_position = "center-right"
pushfeedback_modal_position = "sidebar-right"

# -- Options for sphinx-docsearch --------------------------------------------
docsearch_app_id = os.environ.get("DOCSEARCH_APP_ID", "8ZYQ0G7IMC")
docsearch_api_key = os.environ.get("DOCSEARCH_API_KEY", "")
docsearch_index_name = os.environ.get("DOCSEARCH_INDEX_NAME", "voxel51")
docsearch_container = "#searchbox"

# -- Options for theme -------------------------------------------------------
html_context = {
    # https://pydata-sphinx-theme.readthedocs.io/en/stable/user_guide/light-dark.html#configure-default-theme-mode
    "default_mode": "light",
    "docsearch_app_id": docsearch_app_id,
    "docsearch_api_key": docsearch_api_key,
    "docsearch_index_name": docsearch_index_name,
}


# -- Custom app setup --------------------------------------------------------


def setup(app):
    # Generate page redirects
    app.add_config_value("redirects_file", "redirects", "env")
    app.connect("builder-inited", generate_redirects)

    # Custom directives
    app.add_directive("custombutton", CustomButtonDirective)
    app.add_directive("customcalloutitem", CustomCalloutItemDirective)
    app.add_directive("customcarditem", CustomCardItemDirective)
    app.add_directive("customimagelink", CustomImageLinkDirective)
