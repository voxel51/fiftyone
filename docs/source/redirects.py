"""
Sphinx utility that generates HTML page redirects specified in the
``app.config.redirects_file`` file.

Inspired by https://github.com/sphinx-contrib/redirects.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import json
import os
import re

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


_EVALUATION_ANCHOR_MAP = {
    "evaluating-models": "evaluation/index.html#evaluating-models",
    "confusion-matrices": "evaluation/index.html#confusion-matrices",
    "analyzing-scenarios": "evaluation/index.html#analyzing-scenarios",
    "managing-evaluations": "evaluation/index.html#managing-evaluations",
    "model-evaluation-panel": "evaluation/index.html#model-evaluation-panel",
    "model-evaluation-panel-sub-new": (
        "evaluation/index.html#model-evaluation-panel"
    ),
    "evaluating-regressions": (
        "evaluation/regressions.html#evaluating-regressions"
    ),
    "regressions": "evaluation/regressions.html#evaluating-regressions",
    "evaluating-classifications": (
        "evaluation/classifications.html#evaluating-classifications"
    ),
    "classifications": (
        "evaluation/classifications.html#evaluating-classifications"
    ),
    "binary-evaluation": "evaluation/classifications.html#binary-evaluation",
    "evaluating-detections": (
        "evaluation/detections.html#evaluating-detections"
    ),
    "detections": "evaluation/detections.html#evaluating-detections",
    "evaluation-detection-types": (
        "evaluation/detections.html#evaluation-detection-types"
    ),
    "evaluation-patches": "evaluation/detections.html#evaluation-patches",
    "evaluating-detections-coco": (
        "evaluation/detections.html#evaluating-detections-coco"
    ),
    "evaluating-detections-open-images": (
        "evaluation/detections.html#evaluating-detections-open-images"
    ),
    "open-images-style-evaluation": (
        "evaluation/detections.html#evaluating-detections-open-images"
    ),
    "evaluating-detections-activitynet": (
        "evaluation/detections.html#evaluating-detections-activitynet"
    ),
    "evaluating-segmentations": (
        "evaluation/segmentations.html#evaluating-segmentations"
    ),
    "semantic-segmentations": (
        "evaluation/segmentations.html#evaluating-segmentations"
    ),
    "evaluation-advanced": "evaluation/advanced.html#evaluation-advanced",
    "advanced-usage": "evaluation/advanced.html#evaluation-advanced",
    "evaluating-views": "evaluation/advanced.html#evaluating-views",
    "load-evaluation-view": "evaluation/advanced.html#load-evaluation-view",
    "evaluating-videos": "evaluation/advanced.html#evaluating-videos",
    "custom-evaluation-metrics": (
        "evaluation/advanced.html#custom-evaluation-metrics"
    ),
    "custom-evaluation-backends": (
        "evaluation/advanced.html#custom-evaluation-backends"
    ),
    "evaluation-config": "evaluation/advanced.html#evaluation-config",
}

_SIMILARITY_ANCHOR_MAP = {
    "similarity": "../user_guide/similarity.html#brain-similarity",
    "brain-similarity": "../user_guide/similarity.html#brain-similarity",
    "similarity-search": "../user_guide/similarity.html#brain-similarity",
    "brain-similarity-backends": (
        "../user_guide/similarity.html#brain-similarity-backends"
    ),
    "image-similarity": (
        "../user_guide/similarity.html#brain-image-similarity"
    ),
    "visual-similarity": (
        "../user_guide/similarity.html#brain-image-similarity"
    ),
    "brain-image-similarity": (
        "../user_guide/similarity.html#brain-image-similarity"
    ),
    "brain-object-similarity": (
        "../user_guide/similarity.html#brain-object-similarity"
    ),
    "text-similarity": ("../user_guide/similarity.html#brain-similarity-text"),
    "brain-similarity-text": (
        "../user_guide/similarity.html#brain-similarity-text"
    ),
    "brain-similarity-api": (
        "../user_guide/similarity.html#brain-similarity-api"
    ),
    "creating-an-index": "../user_guide/similarity.html#creating-an-index",
    "brain-similarity-applications": (
        "../user_guide/similarity.html#brain-similarity-applications"
    ),
}


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


def _write_hash_redirect(app, base_page, anchor_map, default_url):
    """Write a hash-based redirect page for `base_page`."""
    anchor_map_json = json.dumps(anchor_map, indent=2)

    logger.info(
        "Creating hash redirect page '%s' with %d anchors"
        % (base_page, len(anchor_map))
    )

    redirect_path = os.path.join(app.builder.outdir, base_page)
    etau.write_file(
        _HASH_REDIRECT_TEMPLATE.format(
            anchor_map=anchor_map_json, default_url=default_url
        ),
        redirect_path,
    )


def _process_zoo_redirects(app):
    """Process dynamic zoo redirects with hash-based routing."""
    zoo_mappings = _generate_zoo_redirects(app)

    for base_page, anchor_map in zoo_mappings.items():
        # Old page's directory is being replaced by per-item pages, so with
        # no hash, fall back to that section's index page
        _write_hash_redirect(app, base_page, anchor_map, "index.html")


def _process_evaluation_redirects(app):
    """Process the hash-based redirect for the split evaluation user guide."""
    _write_hash_redirect(
        app,
        "user_guide/evaluation.html",
        _EVALUATION_ANCHOR_MAP,
        "evaluation/index.html",
    )


_MOVED_ANCHOR_PAGES = {"brain/index": _SIMILARITY_ANCHOR_MAP}


def _process_api_redirects(app):
    """Generate redirects for old-style API class URLs to main API page."""
    api_dir = os.path.join(app.builder.outdir, "api")
    if not os.path.exists(api_dir):
        return

    count = 0
    for html_file in glob.glob(os.path.join(api_dir, "fiftyone.*.html")):
        module_name = os.path.basename(html_file)
        with open(html_file) as f:
            for class_id in re.findall(r'id="(fiftyone\.[^"]+)"', f.read()):
                if not class_id.split(".")[-1][0].isupper():
                    continue

                redirect_file = "%s.html" % class_id
                if os.path.exists(os.path.join(api_dir, redirect_file)):
                    continue

                _write_redirect_file(
                    api_dir,
                    redirect_file,
                    "%s#%s" % (module_name, class_id),
                    _REDIRECT_TEMPLATE,
                )
                count += 1

    logger.info("Created %d API class redirect pages" % count)


def generate_redirects(app):
    if not isinstance(app.builder, builders.StandaloneHTMLBuilder):
        logger.warning(
            "Page redirection is only supported for the 'html' builder. "
            "Skipping..."
        )
        return

    _process_static_redirects(app)
    _process_zoo_redirects(app)
    _process_evaluation_redirects(app)


def generate_api_redirects(app, exception):
    """Sphinx build-finished event handler to generate API redirects."""
    if exception is not None:
        return

    if not isinstance(app.builder, builders.StandaloneHTMLBuilder):
        return

    _process_api_redirects(app)


def inject_moved_anchor_redirects(
    app, pagename, templatename, context, doctree
):
    """Sphinx html-page-context handler that appends a redirect script to
    pages whose content has moved elsewhere, so old hash-fragment links
    still resolve. Only fires when Sphinx actually (re)renders the page, so
    it can't accumulate duplicate scripts across incremental builds.
    """
    anchor_map = _MOVED_ANCHOR_PAGES.get(pagename)
    if not anchor_map:
        return

    script = _INLINE_ANCHOR_REDIRECT_TEMPLATE.format(
        anchor_map=json.dumps(anchor_map)
    )
    context["body"] = context.get("body", "") + script


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
        // No hash provided - redirect to the default page
        window.location.href = "{default_url}";
      }}
    </script>
  </head>
  <body>
    <p>Redirecting...</p>
  </body>
</html>
"""

_INLINE_ANCHOR_REDIRECT_TEMPLATE = """
<script>
  (function () {{
    var anchorMap = {anchor_map};
    var hash = window.location.hash.substring(1);
    if (hash && anchorMap[hash]) {{
      window.location.replace(anchorMap[hash]);
    }}
  }})();
</script>
"""
