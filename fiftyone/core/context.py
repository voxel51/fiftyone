"""
Context utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
import typing as t

_COLAB = "COLAB"
_DATABRICKS = "DATABRICKS"
_IPYTHON = "IPYTHON"
_NONE = "NONE"

_context = None


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

    if os.environ.get("FIFTYONE_COLAB", None):
        _context = _COLAB
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
            return _context

    # Otherwise, we're not in a known notebook context.
    _context = _NONE

    return _context


def get_url(
    address: str, port: int, subscription: t.Optional[str] = None
) -> str:
    context = _get_context()
    if context == _COLAB:
        # pylint: disable=no-name-in-module,import-error
        from google.colab.output import eval_js

        _url = eval_js(f"google.colab.kernel.proxyPort({port})")
    elif _context == _DATABRICKS:
        import IPython

        ipython = IPython.get_ipython()
        dbutils = ipython.user_ns["dbutils"]
        ctx = json.loads(
            dbutils.entry_point.getDbutils().notebook().getContext().toJson()
        )
        ctx_tags = ctx["tags"]
        browser_host_name = ctx_tags["browserHostName"]
        org_id = ctx_tags["orgId"]
        cluster_id = ctx_tags["clusterId"]
        _url = f"https://{browser_host_name}/driver-proxy/o/{org_id}/{cluster_id}/{port}/"
    else:
        _url = f"http://{address}:{port}/"

    if subscription:
        return f"{_url}?context={_get_context().lower()}&subscription={subscription}"

    return _url


class ContextError(EnvironmentError):
    """Exception raised when an action is taken in an unsupported context."""
