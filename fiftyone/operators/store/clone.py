"""
Clone execution store records when a dataset is cloned.

This module registers an "extras cloner" (see
:func:`fiftyone.core.dataset.register_extras_cloner`) that copies an
allowlisted set of execution store records from a source dataset to its
clone, so the run history backing stateful panels follows a full dataset
clone.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

from bson import ObjectId

import fiftyone.core.odm as foo
from fiftyone.core.dataset import register_extras_cloner

logger = logging.getLogger(__name__)


# Store names registered by downstream code (e.g. additional panels) to be
# cloned alongside the built-in ones. See :func:`register_cloneable_store`.
_registered_store_names = []


def register_cloneable_store(store_name):
    """Registers an execution store whose records should be copied when a full
    dataset is cloned.

    Lets code outside this module (e.g. additional panels) opt their store into
    cloning without this module needing to import them. Registrations must be
    in place before the clone runs.

    Args:
        store_name: the execution store name
    """
    if store_name and store_name not in _registered_store_names:
        _registered_store_names.append(store_name)


def _cloneable_store_names():
    """Execution store names whose records are copied when a full dataset is
    cloned: built-in panels (sourced from their own store-name constants) plus
    anything registered via :func:`register_cloneable_store`.

    This is intentionally an allowlist rather than "clone every store for the
    dataset": stores may hold arbitrary plugin state, and some embed the source
    dataset id (or version) inside their values or store name, so naively
    copying them would produce stale or incorrect references on the clone.

    Built-in panels are imported lazily here (at clone time, not at module
    import) and skipped if unavailable, so a panel that isn't installed simply
    isn't cloned.
    """
    names = list(_registered_store_names)

    try:
        from plugins.panels.similarity_search.constants import STORE_NAME

        if STORE_NAME not in names:
            names.append(STORE_NAME)
    except Exception:
        pass

    try:
        from plugins.utils.model_evaluation import STORE_NAME

        if STORE_NAME not in names:
            names.append(STORE_NAME)
    except Exception:
        pass

    return names


# Ids are 24-char ObjectId hex strings; strings longer than this can't be id
# references, so skipping them keeps the value remap O(1) for large serialized
# payloads (e.g. cached metrics) rather than hashing them on every lookup.
_MAX_ID_LEN = 64


def _remap_ids(value, id_map):
    """Recursively rewrites any id in ``value`` that appears in ``id_map``.

    Replaces both dict keys and scalar values (``str`` or ``ObjectId``). Only
    substitutes ids the clone actually minted, so it needs no knowledge of a
    store's schema; anything not in ``id_map`` passes through untouched.
    """
    if isinstance(value, dict):
        return {
            id_map.get(k, k): _remap_ids(v, id_map) for k, v in value.items()
        }
    if isinstance(value, list):
        return [_remap_ids(v, id_map) for v in value]
    if isinstance(value, str):
        return id_map.get(value, value) if len(value) <= _MAX_ID_LEN else value
    if isinstance(value, ObjectId):
        mapped = id_map.get(str(value))
        return ObjectId(mapped) if mapped else value
    return value


def clone_execution_stores(src_dataset, dst_dataset, now, id_map=None):
    """Copies allowlisted execution store records to a cloned dataset.

    Execution store records are keyed by ``(store_name, key, dataset_id)``.
    Cloning copies each matching record under a fresh ``_id`` with
    ``dataset_id`` rewritten to the destination dataset. Original timestamps
    are preserved so the cloned panels reflect the original run history.

    A clone re-creates run docs with new ids, so store data keyed by (or
    referencing) a run doc id would otherwise be orphaned. ``id_map`` maps each
    source id (the dataset doc + cloned run docs) to its new id; each record's
    ``key`` and ``value`` are rewritten through it so references resolve on the
    clone.

    Args:
        src_dataset: the source :class:`fiftyone.core.dataset.Dataset`
        dst_dataset: the destination (clone)
            :class:`fiftyone.core.dataset.Dataset`
        now: the clone timestamp (unused; record timestamps are preserved)
        id_map (None): a ``{str(old_id): str(new_id)}`` mapping of source ids to
            their clone counterparts
    """
    from fiftyone.factory.repos.execution_store import MongoExecutionStoreRepo

    src_id = src_dataset._doc.id
    dst_id = dst_dataset._doc.id
    if src_id is None or dst_id is None:
        return

    store_names = _cloneable_store_names()
    if not store_names:
        return

    id_map = id_map or {}

    coll = foo.get_db_conn()[MongoExecutionStoreRepo.COLLECTION_NAME]

    docs = []
    for doc in coll.find(
        {
            "dataset_id": src_id,
            "store_name": {"$in": store_names},
        }
    ):
        doc.pop("_id", None)
        doc["dataset_id"] = dst_id
        if id_map:
            doc["key"] = id_map.get(doc.get("key"), doc.get("key"))
            doc["value"] = _remap_ids(doc.get("value"), id_map)
        docs.append(doc)

    if docs:
        coll.insert_many(docs)
        logger.debug(
            "Cloned %d execution store record(s) from dataset %s to %s",
            len(docs),
            src_id,
            dst_id,
        )


# Runs on import. Keep the `import ...store.clone` in fiftyone/__init__.py —
# without it nothing registers and clones silently stop copying these records.
register_extras_cloner(clone_execution_stores)
