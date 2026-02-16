#!/usr/bin/env bash
# Previews a single documentation page with full styling.
#
# Copyright 2017-2026, Voxel51, Inc.
# voxel51.com
#


usage() {
    echo "Usage:  bash $0 [-h] <page>

Options:
-h      Display this help message.
<page>  Path to the doc page relative to docs/source/.
        Also accepts absolute paths or paths relative to your
        current working directory.

Examples:
  bash $0 user_guide/using_datasets.rst
  bash $0 tutorials/image_embeddings.ipynb
"
}


SHOW_HELP=false
while getopts "h" FLAG; do
    case "${FLAG}" in
        h) SHOW_HELP=true ;;
        *) usage; exit 2 ;;
    esac
done
shift $((OPTIND - 1))
[[ ${SHOW_HELP} = true ]] && usage && exit 0

set -eo pipefail

THIS_DIR=$(realpath "$(dirname "$0")")
SOURCE_DIR="${THIS_DIR}/source"
EXTENSIONS_DIR="${THIS_DIR}/extensions"

if [[ -z "$1" ]]; then
    echo "Error: No page specified." >&2
    usage
    exit 1
fi

PAGE_INPUT="$1"
if [[ -f "${SOURCE_DIR}/${PAGE_INPUT}" ]]; then
    FULL_PATH=$(realpath "${SOURCE_DIR}/${PAGE_INPUT}")
elif [[ -f "${PAGE_INPUT}" ]]; then
    FULL_PATH=$(realpath "${PAGE_INPUT}")
else
    echo "Error: File not found: ${PAGE_INPUT}" >&2
    exit 1
fi

PAGE="${FULL_PATH#"${SOURCE_DIR}/"}"
if [[ "${PAGE}" = "${FULL_PATH}" ]]; then
    echo "Error: File is not under ${SOURCE_DIR}" >&2
    exit 1
fi

echo "**** Previewing ${PAGE} ****"

PREVIEW_DIR="${THIS_DIR}/build/preview"
rm -rf "${PREVIEW_DIR}"
mkdir -p "${PREVIEW_DIR}"

ln -s "${SOURCE_DIR}/_static" "${PREVIEW_DIR}/_static"
ln -s "${SOURCE_DIR}/_templates" "${PREVIEW_DIR}/_templates"
ln -s "${SOURCE_DIR}/_includes" "${PREVIEW_DIR}/_includes"

if [[ -d "${SOURCE_DIR}/images" ]]; then
    ln -s "${SOURCE_DIR}/images" "${PREVIEW_DIR}/images"
fi

PAGE_DIR=$(dirname "${PAGE}")
mkdir -p "${PREVIEW_DIR}/${PAGE_DIR}"
cp "${SOURCE_DIR}/${PAGE}" "${PREVIEW_DIR}/${PAGE}"

if [[ -d "${SOURCE_DIR}/${PAGE_DIR}/images" ]] && \
   [[ ! -e "${PREVIEW_DIR}/${PAGE_DIR}/images" ]]; then
    ln -s \
        "${SOURCE_DIR}/${PAGE_DIR}/images" \
        "${PREVIEW_DIR}/${PAGE_DIR}/images"
fi

TOCTREE_ENTRY="${PAGE%.*}"
cat > "${PREVIEW_DIR}/index.rst" << EOF
Preview
=======

.. toctree::
   :hidden:

   ${TOCTREE_ENTRY}
EOF

EXTRA_EXTENSIONS=""
NBSPHINX_CONF=""
case "${PAGE}" in
    *.ipynb)
        EXTRA_EXTENSIONS="\"nbsphinx\","
        NBSPHINX_CONF="
nbsphinx_requirejs_path = ''
nbsphinx_execute = 'never'"
        ;;
esac

cat > "${PREVIEW_DIR}/conf.py" << CONFEOF
import sys

sys.path.insert(0, "${SOURCE_DIR}")
sys.path.insert(0, "${EXTENSIONS_DIR}")

from custom_directives import (
    CustomButtonDirective,
    CustomCalloutItemDirective,
    CustomCardItemDirective,
    CustomImageLinkDirective,
    CustomGuidesCardDirective,
    CustomAnimatedCTADirective,
)

project = "FiftyOne"
extensions = [
    "sphinx_tabs.tabs",
    "sphinx_copybutton",
    "sphinx_design",
    ${EXTRA_EXTENSIONS}
]
source_suffix = ".rst"
exclude_patterns = ["_includes"]
templates_path = ["_templates"]
rst_prolog = """
.. include:: /_includes/substitutions.rst
"""
${NBSPHINX_CONF}

html_theme = "pydata_sphinx_theme"
html_logo = "_static/images/voxel51-logo.svg"
html_theme_options = {
    "navbar_start": ["navbar-logo"],
    "navbar_center": ["navbar-links"],
    "navbar_end": ["book-a-demo"],
    "navbar_align": "left",
    "navbar_persistent": [],
    "footer_start": ["copyright"],
    "footer_end": ["footer-links"],
}
html_sidebars = {"**": ["sidebar-nav"]}
html_favicon = "_static/favicon/favicon.ico"
html_static_path = ["_static"]
html_css_files = ["css/voxel51-website.css", "css/custom.css"]
html_js_files = ["js/custom.js"]
html_copy_source = False
html_context = {"default_mode": "light"}


def setup(app):
    app.add_directive("custombutton", CustomButtonDirective)
    app.add_directive("customcalloutitem", CustomCalloutItemDirective)
    app.add_directive("customcarditem", CustomCardItemDirective)
    app.add_directive("customimagelink", CustomImageLinkDirective)
    app.add_directive("customguidescard", CustomGuidesCardDirective)
    app.add_directive("customanimatedcta", CustomAnimatedCTADirective)
CONFEOF

sphinx-build -b html "${PREVIEW_DIR}" "${PREVIEW_DIR}/_build"

OUTPUT="${PREVIEW_DIR}/_build/${TOCTREE_ENTRY}.html"

if [[ ! -f "${OUTPUT}" ]]; then
    echo "Error: Build failed." >&2
    exit 1
fi

echo "**** Preview ready ****"

case "$(uname -s)" in
    Darwin)  open "${OUTPUT}" ;;
    Linux)   xdg-open "${OUTPUT}" 2>/dev/null || \
                printf "To view the preview, open:\n\n%s\n\n" "${OUTPUT}" ;;
    CYGWIN*|MINGW*|MSYS*) cmd.exe /c start "" "${OUTPUT}" ;;
    *)       printf "To view the preview, open:\n\n%s\n\n" "${OUTPUT}" ;;
esac
