"""
In-memory stand-in for the ``label_schemas`` collection.

``fiftyone.core.label_schema_docs`` only needs equality filters,
``$set``/``$unset``/``$inc`` updates and single-document deletes, so a
dict-backed collection is enough to run its suite (and the workflows
plugin's, which creates docs for stage tests) without Mongo. Swap it
in with ``monkeypatch.setattr(label_schema_docs, "_db", lambda: db)``.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import copy
from types import SimpleNamespace
from typing import Optional

from bson import ObjectId

#: The scope the suites create docs under.
DATASET_ID = ObjectId("000000000000000000000001")


class MemoryCollection:
    def __init__(self):
        self._docs: list[dict] = []

    # -- pymongo surface the module uses -------------------------------

    def list_indexes(self):
        return []

    def create_indexes(self, _models):
        return None

    def drop_index(self, _name):
        return None

    def insert_one(self, doc: dict) -> None:
        self._docs.append(copy.deepcopy(doc))

    def find(self, flt: Optional[dict] = None):
        return [copy.deepcopy(d) for d in self._docs if _matches(d, flt)]

    def find_one(self, flt: Optional[dict] = None):
        for d in self._docs:
            if _matches(d, flt):
                return copy.deepcopy(d)
        return None

    def update_one(self, flt: dict, update: dict):
        for d in self._docs:
            if not _matches(d, flt):
                continue
            for k, v in (update.get("$set") or {}).items():
                d[k] = copy.deepcopy(v)
            for k in update.get("$unset") or {}:
                d.pop(k, None)
            for k, v in (update.get("$inc") or {}).items():
                d[k] = d.get(k, 0) + v
            return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    def delete_one(self, flt: dict):
        for i, d in enumerate(self._docs):
            if _matches(d, flt):
                del self._docs[i]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)


class MemoryDatabase:
    def __init__(self):
        self._colls: dict[str, MemoryCollection] = {}

    def __getitem__(self, name: str) -> MemoryCollection:
        return self._colls.setdefault(name, MemoryCollection())


def _matches(doc: dict, flt: Optional[dict]) -> bool:
    return all(doc.get(k) == v for k, v in (flt or {}).items())


def install(monkeypatch) -> MemoryDatabase:
    """Points :mod:`fiftyone.core.label_schema_docs` at a fresh memory
    database for the test; returns it."""
    import fiftyone.core.label_schema_docs as docs

    db = MemoryDatabase()
    monkeypatch.setattr(docs, "_db", lambda: db)
    return db


__all__ = ["DATASET_ID", "MemoryCollection", "MemoryDatabase", "install"]
