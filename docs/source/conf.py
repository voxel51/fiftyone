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
copyright = foc.COPYRIGHT
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
    "nbsphinx",
    "sphinx_tabs.tabs",
    "sphinx_copybutton",
    "autodocsumm",
    "myst_parser",
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
html_theme = "pytorch_sphinx_theme"
html_theme_path = ["../theme"]
html_theme_options = {
    "pytorch_project": "docs",
}

html_favicon = "favicon.ico"

# Add any paths that contain custom static files (such as style sheets) here,
# relative to this directory. They are copied after the builtin static files,
# so a file named "default.css" will overwrite the builtin "default.css".
html_static_path = ["_static"]

# These paths are either relative to html_static_path
# or fully qualified paths (eg. https://...)
html_css_files = ["css/voxel51-website.css", "css/custom.css"]
html_js_files = ["js/voxel51-website.js", "js/custom.js"]

# Prevent RST source files from being included in output
html_copy_source = False

html_context = {
    "address_main_line1": "330 E Liberty St",
    "address_main_line2": "Ann Arbor, MI 48104",
    "phone_main": "+1 734-519-0955",
    "email_info": "info@voxel51.com",
    # Links - copied from website config
    "link_blog": "https://voxel51.com/blog/",
    "link_contactus": "mailto:solutions@voxel51.com?subject=[Voxel51]%20Contact%20us",
    "link_docs_fiftyone": "https://docs.voxel51.com/",
    "link_fiftyone": "https://voxel51.com/fiftyone/",
    "link_fiftyone_teams": "https://voxel51.com/fiftyone-teams/",
    "link_usecases": "https://voxel51.com/computer-vision-use-cases/",
    "link_success_stories": "https://voxel51.com/success-stories/",
    "link_talk_to_sales": "https://voxel51.com/talk-to-sales/",
    "link_workshop": "https://voxel51.com/schedule-teams-workshop/",
    "link_fiftyone_tutorials": "https://docs.voxel51.com/tutorials/index.html",
    "link_fiftyone_examples": "https://github.com/voxel51/fiftyone-examples",
    "link_fiftyone_quickstart": "https://colab.research.google.com/github/voxel51/fiftyone-examples/blob/master/examples/quickstart.ipynb",
    "link_home": "https://voxel51.com/",
    "link_ourstory": "https://voxel51.com/ourstory/",
    "link_events": "https://voxel51.com/computer-vision-events/",
    "link_voxel51_jobs": "https://voxel51.com/jobs/",
    "link_press": "https://voxel51.com/press/",
    "link_privacypolicy": "https://voxel51.com/privacy/",
    "link_termsofservice": "https://voxel51.com/terms/",
    "link_voxel51_facebook": "https://www.facebook.com/voxel51/",
    "link_voxel51_github": "https://github.com/voxel51/",
    "link_voxel51_linkedin": "https://www.linkedin.com/company/voxel51/",
    "link_voxel51_discord": "https://community.voxel51.com",
    "link_voxel51_slack": "https://slack.voxel51.com",
    "link_voxel51_twitter": "https://twitter.com/voxel51",
    "link_voxel51_blog": "https://voxel51.com/blog/",
    "og_image": "https://voxel51.com/wp-content/uploads/2024/03/3.24_webpages_Home_AV.png",
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
