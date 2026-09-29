"""
Pytest config for the label-schemas plugin tests: every test runs
against an in-memory collection, so the suite has no Mongo dependency.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import pytest

from .memory import install


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    yield install(monkeypatch)
