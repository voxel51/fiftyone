"""
Sphinx utility that generates HTML page redirects specified in the
``app.config.redirects_file`` file.

Inspired by https://github.com/sphinx-contrib/redirects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import json
import os

from sphinx.builders import html as builders
from sphinx.util import logging

import eta.core.utils as etau


logger = logging.getLogger(__name__)


def _build_anchor_map(directory, subdirectory, excluded_files):
    """Build anchor-to-page mapping for a zoo directory."""
    anchor_map = {}
    if not os.path.exists(directory):
        return anchor_map

    for rst_file in glob.glob(os.path.join(directory, "*.rst")):
        filename = os.path.basename(rst_file)
        if filename in excluded_files:
            continue

        slug = os.path.splitext(filename)[0]
        anchor = slug.replace("_", "-")
        anchor_map[anchor] = "%s/%s.html" % (subdirectory, slug)
    return anchor_map


def _generate_zoo_redirects(app):
    """Generate anchor-to-page mapping for model zoo and dataset zoo."""
    zoo_mappings = {}
    excluded_files = ("model_cards.rst", "dataset_cards.rst", "index.rst")

    models_dir = os.path.join(app.srcdir, "model_zoo", "models")
    model_anchors = _build_anchor_map(models_dir, "models", excluded_files)
    if model_anchors:
        zoo_mappings["model_zoo/models.html"] = model_anchors

    datasets_dir = os.path.join(app.srcdir, "dataset_zoo", "datasets")
    dataset_anchors = _build_anchor_map(
        datasets_dir, "datasets", excluded_files
    )
    if dataset_anchors:
        zoo_mappings["dataset_zoo/datasets.html"] = dataset_anchors

    return zoo_mappings


def _write_redirect_file(outdir, from_path, to_url, template):
    """Write a redirect HTML file."""
    redirect_path = os.path.join(outdir, from_path)
    etau.write_file(template.format(url=to_url), redirect_path)


def _process_static_redirects(app):
    """Process static redirects from the redirects file."""
    path = os.path.join(app.srcdir, app.config.redirects_file)
    if not os.path.exists(path):
        logger.warning("Could not find redirects file at '%s'" % path)
        return

    with open(path) as redirects:
        for line in redirects.readlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            from_path, to_path = line.split()
            from_html_path = os.path.splitext(from_path)[0] + ".html"

            depth = len(from_html_path.split(os.path.sep)) - 1
            to_path_prefix = ("..%s" % os.path.sep) * depth
            to_html_path = (
                to_path_prefix + os.path.splitext(to_path)[0] + ".html"
            )

            logger.info(
                "Redirecting '%s' to '%s'" % (from_html_path, to_html_path)
            )

            _write_redirect_file(
                app.builder.outdir,
                from_html_path,
                to_html_path,
                _REDIRECT_TEMPLATE,
            )


def _process_zoo_redirects(app):
    """Process dynamic zoo redirects with hash-based routing."""
    zoo_mappings = _generate_zoo_redirects(app)

    for base_page, anchor_map in zoo_mappings.items():
        anchor_map_json = json.dumps(anchor_map, indent=2)

        logger.info(
            "Creating hash redirect page '%s' with %d anchors"
            % (base_page, len(anchor_map))
        )

        redirect_path = os.path.join(app.builder.outdir, base_page)
        etau.write_file(
            _HASH_REDIRECT_TEMPLATE.format(anchor_map=anchor_map_json),
            redirect_path,
        )


def generate_redirects(app):
    if not isinstance(app.builder, builders.StandaloneHTMLBuilder):
        logger.warning(
            "Page redirection is only supported for the 'html' builder. "
            "Skipping..."
        )
        return

    _process_static_redirects(app)
    _process_zoo_redirects(app)


_REDIRECT_TEMPLATE = """
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url={url}"/>
    <script>
      window.location.href = "{url}"
    </script>
  </head>
  <body>
    <p>This page has moved <a href="{url}">here</a>.</p>
  </body>
</html>
"""

_HASH_REDIRECT_TEMPLATE = """
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Redirecting...</title>
    <script>
      var anchorMap = {anchor_map};
      var hash = window.location.hash.substring(1);
      if (hash && anchorMap[hash]) {{
        window.location.href = anchorMap[hash];
      }} else {{
        // No hash provided - redirect to index page
        var pathParts = window.location.pathname.split('/');
        pathParts.pop(); // Remove current file (e.g., 'models.html' or 'datasets.html')
        pathParts.push('index.html');
        window.location.href = pathParts.join('/');
      }}
    </script>
  </head>
  <body>
    <p>Redirecting...</p>
  </body>
</html>
"""
