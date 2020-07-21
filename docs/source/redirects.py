"""
Sphinx utility that generates HTML page redirects specified in the
``app.config.redirects_file`` file.

Inspired by https://github.com/sphinx-contrib/redirects.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

from sphinx.builders import html as builders

import eta.core.utils as etau


logger = logging.getLogger(__name__)


def generate_redirects(app):
    path = os.path.join(app.srcdir, app.config.redirects_file)
    if not os.path.exists(path):
        logger.warning("Could not find redirects file at '%s'" % path)
        return

    if not type(app.builder) == builders.StandaloneHTMLBuilder:
        logger.warning(
            "Link redirection is only supported for the 'html' builder. "
            "Skipping..."
        )
        return

    with open(path) as redirects:
        for line in redirects.readlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            from_path, to_path = line.split()

            from_html_path = os.path.splitext(from_path)[0] + ".html"

            to_path_prefix = (
                "..%s"
                % os.path.sep
                * (len(from_html_path.split(os.path.sep)) - 1)
            )
            to_html_path = (
                to_path_prefix + os.path.splitext(to_path)[0] + ".html"
            )

            logger.info(
                "Redirecting '%s' to '%s'" % (from_html_path, to_html_path)
            )

            redirect_path = os.path.join(app.builder.outdir, from_html_path)
            etau.write_file(_REDIRECT_TEMPLATE % to_html_path, redirect_path)


_REDIRECT_TEMPLATE = """
<html>
  <head><meta http-equiv="refresh" content="0; url=%s"/></head>
</html>
"""
