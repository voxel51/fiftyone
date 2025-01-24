"""
Context utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os
import typing as t
from urllib.parse import urlparse

try:
    import IPython.display
except:
    pass


_COLAB = "COLAB"
_DATABRICKS = "DATABRICKS"
_IPYTHON = "IPYTHON"
_NONE = "NONE"

_DATABRICKS_PROXY = None
_DATABRICKS_HOST = None

_context = None


def init_context():
    """Initializes context settings."""
    _get_context()


def is_notebook_context():
    """Determines whether this process is running in a notebook context, either
    Jupyter or Google Colab.

    Returns:
        True/False
    """
    return _get_context() != _NONE


def is_jupyter_context():
    """Determines whether this process is running in a Jupyter notebook.

    Returns:
        True/False
    """
    return _get_context() == _IPYTHON


def is_colab_context():
    """Determines whether this process is running in Google Colab.

    Returns:
        True/False
    """
    return _get_context() == _COLAB


def is_databricks_context():
    """Determines whether this process is running in Databricks.

    Returns:
        True/False
    """
    return _get_context() == _DATABRICKS


def _get_context():
    """Determine the most specific context that we're in.

    Returns:
        one of

        -   ``_COLAB``: we're in Colab with an IPython notebook context
        -   ``_DATABRICKS``: we're in Databricks with an IPython notebook context
        -   ``_IPYTHON``: we're in an IPython notebook context
            (e.g., from running `jupyter notebook` at the command line)
        -   ``_NONE``: we're in a non-notebook context, e.g., a Python script
            or a Python REPL
    """
    global _context
    if _context is not None:
        return _context

    if os.environ.get("FIFTYONE_CONTEXT", None):
        _context = os.environ["FIFTYONE_CONTEXT"]
        return _context

    # In Colab, the `google.colab` module is available, but the shell returned
    # by `IPython.get_ipython` does not have a `get_trait` method.
    try:
        import google.colab  # noqa: F401
        import IPython
    except ImportError:
        pass
    else:
        if IPython.get_ipython() is not None:
            # We'll assume that we're in a Colab notebook context.
            _context = _COLAB
            os.environ["FIFTYONE_CONTEXT"] = _context
            return _context

    # In Databricks, the `dbutils` module is available and required for the proxy,
    # but the shell returned by `IPython.get_ipython` does not return a kernel
    # via the `get_trait` method.
    try:
        # Location: /databricks/python_shell/dbruntime
        import IPython
        from dbruntime.dbutils import DBUtils  # noqa: F401
    except ImportError:
        pass
    else:
        if IPython.get_ipython() is not None:
            # We'll assume that we're in a Databricks notebook context.
            _context = _DATABRICKS
            os.environ["FIFTYONE_CONTEXT"] = _context
            return _context

    # In an IPython command line shell or Jupyter notebook, we can directly
    # query whether we're in a notebook context.
    try:
        import IPython
    except ImportError:
        pass
    else:
        ipython = IPython.get_ipython()
        if ipython is not None and ipython.has_trait("kernel"):
            _context = _IPYTHON
            os.environ["FIFTYONE_CONTEXT"] = _context
            return _context

    # Otherwise, we're not in a known notebook context.
    _context = _NONE
    os.environ["FIFTYONE_CONTEXT"] = _context

    return _context


def _requires_http_polling():
    ### SSE is unreliable in GitHub Codespaces
    if os.environ.get("CODESPACES", None) == "true":
        return True

    # SSE does not work in Colab
    if _get_context() == _COLAB:
        return True

    return False


def get_url(
    address: str,
    port: int,
    proxy_url: str = None,
    **kwargs: t.Dict[str, str],
) -> str:
    context = _get_context()

    if context == _COLAB:
        # pylint: disable=no-name-in-module,import-error
        from google.colab.output import eval_js

        _url = eval_js(f"google.colab.kernel.proxyPort({port})")
    elif _context == _DATABRICKS:
        _url = _get_databricks_proxy_url(port)
        kwargs["proxy"] = _get_databricks_proxy(port)
        kwargs["context"] = "databricks"
    elif proxy_url:
        _url = proxy_url if proxy_url.endswith("/") else f"{proxy_url}/"
        path = urlparse(_url).path
        if path != "/":
            kwargs["proxy"] = path
    else:
        _url = f"http://{address}:{port}/"

    if "proxy" in kwargs or _requires_http_polling():
        kwargs["polling"] = "true"

    params = "&".join([f"{k}={v}" for k, v in kwargs.items()])
    if params:
        _url = f"{_url}?{params}"

    return _url


def _get_databricks_proxy(port: int):
    _set_databricks()
    global _DATABRICKS_PROXY

    return f"{_DATABRICKS_PROXY}{port}/"


def _get_databricks_proxy_url(port: int):
    _set_databricks()
    global _DATABRICKS_HOST
    global _DATABRICKS_PROXY

    return f"https://{_DATABRICKS_HOST}{_DATABRICKS_PROXY}{port}/"


def _set_databricks() -> str:
    global _DATABRICKS_HOST
    global _DATABRICKS_PROXY

    if _DATABRICKS_PROXY:
        return

    import IPython

    shell = IPython.get_ipython()
    dbutils = shell.user_ns["dbutils"]
    data = json.loads(
        dbutils.entry_point.getDbutils().notebook().getContext().toJson()
    )["tags"]

    _DATABRICKS_HOST = data["browserHostName"]

    org_id = data["orgId"]
    cluster_id = data["clusterId"]
    _DATABRICKS_PROXY = f"/driver-proxy/o/{org_id}/{cluster_id}/"


class ContextError(EnvironmentError):
    """Exception raised when an action is taken in an unsupported context."""
