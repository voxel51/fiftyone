"""
Make ``decorators`` and ``utils`` (which live at ``tests/unittests/``)
importable from this nested test directory. Mirrors the flat-layout
convention used by the existing ``server_*_tests.py`` modules.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import sys

_TESTS_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
if _TESTS_ROOT not in sys.path:
    sys.path.insert(0, _TESTS_ROOT)
