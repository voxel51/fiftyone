"""
Context utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


_COLAB = "COLAB"
_IPYTHON = "IPYTHON"
_NONE = "NONE"

_context = None


def _get_context():
    """Determine the most specific context that we're in.

    Returns:
      _COLAB: If in Colab with an IPython notebook context.
      _IPYTHON: If not in Colab, but we are in an IPython notebook
        context (e.g., from running `jupyter notebook` at the command
        line).
      _NONE: Otherwise (e.g., by running a Python script at the
        command-line or using the `ipython` interactive shell).
    """
    global _context
    if _context is not None:
        return _context
    # In Colab, the `google.colab` module is available, but the shell
    # returned by `IPython.get_ipython` does not have a `get_trait`
    # method.
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

    # In an IPython command line shell or Jupyter notebook, we can
    # directly query whether we're in a notebook context.
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
