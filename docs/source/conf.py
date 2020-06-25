"""
Sphinx configuration file.

For a full list of available options, see:
https://www.sphinx-doc.org/en/master/usage/configuration.html

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.constants as foc


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
    "sphinx.ext.viewcode",
    "sphinx.ext.napoleon",
    "sphinx.ext.autosectionlabel",
    "m2r",
    "nbsphinx",
    "sphinx_tabs.tabs",
]

# Types of class members to generate documentation for.
autodoc_default_flags = ["members", "inherited-members"]
autodoc_inherit_docstrings = True
autodoc_member_order = "bysource"
autoclass_content = "class"

# Add any paths that contain templates here, relative to this directory.
templates_path = ["_templates"]

# The suffix(es) of source filenames.
# You can specify multiple suffix as a list of strings.
source_suffix = [".rst", ".md"]

# Parse relative links to MD files into ref and doc directives.
m2r_parse_relative_links = True

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path.
exclude_patterns = []


# -- Options for HTML output -------------------------------------------------

# The theme to use for HTML and HTML Help pages.  See the documentation for
# a list of builtin themes.
#
html_theme = "pytorch_sphinx_theme"
html_theme_options = {
    "pytorch_project": "docs",
}

# Add any paths that contain custom static files (such as style sheets) here,
# relative to this directory. They are copied after the builtin static files,
# so a file named "default.css" will overwrite the builtin "default.css".
html_static_path = ["_static"]

# These paths are either relative to html_static_path
# or fully qualified paths (eg. https://...)
html_css_files = ["css/voxel51-website.css", "css/custom.css"]

html_context = {
    "address_main_line1": "410 N 4th Ave, 3rd Floor",
    "address_main_line2": "Ann Arbor, MI 48104",
    "phone_main": "+1 734-489-1134",
    "email_info": "info@voxel51.com",
    "link_blog": "https://blog.voxel51.com/",
    "link_careers": "https://voxel51.com/careers/",
    "link_contactus": "mailto:solutions@voxel51.com?subject=[Voxel51]%20Contact%20us",
    "link_demo": "https://voxel51.com/demo/",
    "link_docs_fiftyone": "https://voxel51.com/docs/fiftyone/",
    "link_fiftyone": "https://voxel51.com/fiftyone/",
    "link_github": "https://github.com/",
    "link_home": "https://voxel51.com/",
    "link_linkedin": "https://www.linkedin.com/in/",
    "link_ourstory": "https://voxel51.com/ourstory/",
    "link_pdi": "https://pdi.voxel51.com/",
    "link_platform": "https://voxel51.com/platform/",
    "link_platform_login": "https://console.voxel51.com/login",
    "link_press": "https://voxel51.com/press/",
    "link_privacypolicy": "https://voxel51.com/privacy/",
    "link_schedulecall": "mailto:solutions@voxel51.com?subject=[Voxel51]%20Schedule%20a%20call",
    "link_scheduledemo": "https://meetings.hubspot.com/michael908",
    "link_scoop_demo": "https://demo.voxel51.com",
    "link_scoop_login": "https://scoop.voxel51.com/",
    "link_status": "https://status.voxel51.com/",
    "link_termsofservice": "https://voxel51.com/terms/",
    "link_twitter": "https://twitter.com/",
    "link_usecase_advertising": "https://voxel51.com/usecases/advertising/",
    "link_usecase_auto": "https://voxel51.com/usecases/automotive/",
    "link_usecase_research": "https://voxel51.com/usecases/research/",
    "link_usecases": "https://voxel51.com/usecases/",
    "link_usecases_entry": "https://voxel51.com/usecases/automotive/",
    "link_voxel51_facebook": "https://www.facebook.com/voxel51/",
    "link_voxel51_github": "https://github.com/voxel51/",
    "link_voxel51_linkedin": "https://www.linkedin.com/company/voxel51/",
    "link_voxel51_twitter": "https://twitter.com/voxel51",
}
