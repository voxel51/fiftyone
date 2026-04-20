"""
Similarity brain-key catalog.

Reads similarity brain runs from a dataset and returns the subset that are
safe to expose in the UI — specifically, runs that completed and produced
results. Failed ``compute_similarity`` calls still register a brain key but
have no results; those are dropped here.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import Any, Dict, List

from fiftyone.core.brain import BrainMethod

logger = logging.getLogger(__name__)


def list_similarity_brain_keys(dataset) -> List[Dict[str, Any]]:
    """Return similarity brain keys on ``dataset`` with config metadata.

    Only returns brain keys whose runs produced results. Failed runs (brain
    key registered but ``run_doc.results`` is falsy) are filtered out.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`

    Returns:
        list of dicts, one per valid brain key, with keys:
        ``key``, ``supports_prompts``, ``supports_least_similarity``,
        ``patches_field``, ``model``, ``backend``, ``embeddings_field``
    """
    try:
        run_docs = BrainMethod._get_run_docs(dataset)
        brain_keys = dataset.list_brain_runs(type="similarity")
    except Exception as e:
        logger.warning("Failed to list similarity brain runs: %s", e)
        return []

    result = []
    for key in brain_keys:
        run_doc = run_docs.get(key)
        if run_doc is None or not run_doc.results:
            continue

        try:
            result.append(_describe(dataset, key))
        except Exception as e:
            logger.warning("Failed to load brain info for key %s: %s", key, e)

    return result


def _describe(dataset, key: str) -> Dict[str, Any]:
    """Build the UI metadata dict for a single similarity brain key.

    Only curated, non-sensitive fields are exposed. Never include
    credentials (``api_key``, ``token``, ``password``, etc.) — the frontend
    receives this dict verbatim.
    """
    config = dataset.get_brain_info(key).config
    supports_least = getattr(config, "supports_least_similarity", None)

    return {
        "key": key,
        "supports_prompts": bool(getattr(config, "supports_prompts", False)),
        "supports_least_similarity": bool(
            supports_least() if callable(supports_least) else supports_least
        ),
        "patches_field": getattr(config, "patches_field", None),
        "model": getattr(config, "model", None),
        "backend": getattr(config, "method", None),
        "embeddings_field": getattr(config, "embeddings_field", None),
        # Where the index lives, normalized across backends.
        # Qdrant: url; Milvus/LanceDB: uri; Redis: host. Others: None.
        # Never include credential fields (api_key, token, password, ...).
        "endpoint": (
            getattr(config, "url", None)
            or getattr(config, "uri", None)
            or getattr(config, "host", None)
        ),
    }
