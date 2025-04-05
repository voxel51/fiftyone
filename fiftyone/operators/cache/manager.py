"""
Execution cache manager.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.operators.store import ExecutionStoreService
from fiftyone.operators.cache.utils import get_store_for_func


def clear_all_caches():
    """
    Clears all named execution stores and their cache entries.
    """
    svc = ExecutionStoreService()
    svc.clear_cache()


def clear_function_cache(ctx, func, store_name=None, link_to_dataset=True):
    """
    Clears cache entries for a specific function decorated with ``@execution_cache``.

    ::note::

        This will clear the cache for the given ``ExecutionContext`` and associated dataset.

        Provide `link_to_dataset=False` to clear the cache for the non-dataset-scoped store.

    Args:
        ctx: The ExecutionContext.
        func: The original function (not the wrapped one).
        store_name (Nonel): Override the store name if different.
    """
    store = get_store_for_func(ctx, func)
    store.clear()
