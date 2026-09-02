"""
Shared pytest configuration.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# freezegun swaps the real datetime classes out for fakes, so entering and
# leaving a ``freeze_time`` block walks every module in ``sys.modules`` and
# getattrs its attributes looking for references to swap. Packages that expose
# their subpackages lazily import them for real under that getattr, so the
# walk itself pulls in thousands of modules and compiles their bytecode --
# enough to blow a test's timeout. These hold no datetime reference that a
# test freezes time around, so skipping them costs nothing.
#
# Guarded because this is the root conftest: an unguarded import would fail
# collection for every test under ``tests/`` where freezegun is absent.
try:
    import freezegun
except ImportError:
    pass
else:
    freezegun.configure(
        extend_ignore_list=[
            "ipywidgets",
            "lazy_loader",
            "nbformat",
            "networkx",
            "plotly",
            "scipy",
            "skimage",
            "sympy",
            "torch",
            "transformers",
        ]
    )
