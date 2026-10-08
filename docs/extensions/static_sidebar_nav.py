"""
Sphinx extension that renders the sidebar nav once per build.

The sidebar shows the whole-site toctree (``startdepth=0``, not collapsed),
and pydata-sphinx-theme rebuilds it for every page. That costs
O(pages x nav size) and dominates the HTML write phase. The nav is the same
on every page except for:

-   its relative links, which depend on the page's directory depth
-   the "current page" markers: ``current``/``active`` classes and open
    ``<details>`` on the page's entry and its ancestors

So this extension renders the nav once, with a placeholder in front of every
internal link, and each page swaps in its own ``content_root``. The inline
script in ``sidebar-nav.html`` then applies the current-page markers in the
browser.

Set ``FIFTYONE_DOCS_PER_PAGE_NAV=1`` to render the nav per page instead.
"""

import functools
import os
from urllib.parse import urlparse

from pydata_sphinx_theme.toctree import add_toctree_functions
from sphinx.application import Sphinx
from sphinx.environment.adapters.toctree import global_toctree_for_doc
from sphinx.util import logging

logger = logging.getLogger(__name__)

# A docname outside every toctree: rendering the nav "from" it yields no
# current-page markers, and every internal link is relative to the docs root
_NAV_DOCNAME = "__static_sidebar_nav__"
_ROOT_PLACEHOLDER = "__STATIC_SIDEBAR_NAV_ROOT__/"


def _render_static_nav(app, kwargs):
    # Run pydata's own sidebar pipeline once, so the markup matches the
    # per-page render exactly
    context = {
        "toctree": lambda **toctree_kwargs: app.builder.render_partial(
            global_toctree_for_doc(
                app.env,
                _NAV_DOCNAME,
                app.builder,
                tags=app.builder.tags,
                **toctree_kwargs,
            )
        )["fragment"]
    }
    add_toctree_functions(app, _NAV_DOCNAME, "page.html", context, None)
    soup = context["generate_toctree_html"]("sidebar", startdepth=0, **kwargs)

    for link in soup.find_all("a", href=True):
        url = urlparse(link["href"])
        if not (url.scheme or url.netloc or link["href"].startswith("#")):
            link["href"] = _ROOT_PLACEHOLDER + link["href"]

    return str(soup)


def _get_static_nav(app, kwargs):
    cache = app.__dict__.setdefault("_static_sidebar_nav_cache", {})
    key = tuple(sorted(kwargs.items()))
    if key not in cache:
        try:
            cache[key] = _render_static_nav(app, kwargs)
        except Exception as e:
            logger.warning(
                "Static sidebar nav failed, rendering it per page: %s", e
            )
            cache[key] = None

    return cache[key]


def _add_sidebar_nav_function(app, pagename, templatename, context, doctree):
    per_page = bool(os.environ.get("FIFTYONE_DOCS_PER_PAGE_NAV"))
    content_root = context["content_root"]

    @functools.cache
    def static_sidebar_nav(**kwargs):
        html = None if per_page else _get_static_nav(app, kwargs)
        if html is None:
            # Looked up at render time: pydata's `html-page-context` handler
            # adds it after this one runs
            return context["generate_toctree_html"](
                "sidebar", startdepth=0, **kwargs
            )

        return html.replace(_ROOT_PLACEHOLDER, content_root)

    context["static_sidebar_nav"] = static_sidebar_nav
    context["static_sidebar_nav_current_href"] = (
        None
        if per_page
        else content_root + app.builder.get_target_uri(pagename)
    )


def setup(app: Sphinx):
    app.connect("html-page-context", _add_sidebar_nav_function)
    return {
        "version": "0.1",
        "parallel_read_safe": True,
        "parallel_write_safe": True,
    }
