"""
Execution cache decorator.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.operators.cache.utils import (
    _get_ctx_from_args,
    resolve_cache_info,
    _get_store_for_func,
)
from fiftyone.operators.cache.serialization import (
    auto_deserialize,
    auto_serialize,
)

from functools import wraps

_FUNC_ATTRIBUTES = [
    "store_name",
    "link_to_dataset",
    "exec_cache_version",
    "uncached",
    "clear_cache",
    "set_cache",
    "clear_all_caches",
]

_RESIDENCY_OPTIONS = [
    "transient",
    "ephemeral",
    "hybrid",
]


def execution_cache(
    _func=None,
    *,
    residency="hybrid",
    max_size=None,
    ttl=None,
    link_to_dataset=True,
    key_fn=None,
    store_name=None,
    version=None,
    operator_scoped=False,
    user_scoped=False,
    prompt_scoped=False,
    jwt_scoped=False,
    collection_name=None,
    serialize=None,
    deserialize=None,
):
    """
    Decorator for caching function results in an ``ExecutionStore``.

    The function must:
        - accept a `ctx` argument as the first parameter
        - return a serializable value
        - should produce the same output for the same input
        - should have no side effects
        - have serializable parameters and return values

    Args:
        ttl (None): Time-to-live for the cached value in seconds.
        link_to_dataset (True): Whether to tie the cache entry to the dataset
        key_fn (None): A custom function to generate cache keys.
            If not provided, the function arguments are used as the key by serializing them as JSON.
        store_name (None): Custom name for the execution store.
            Defaults to the function name.
        version (None): Set a version number to prevent cache collisions
            when the function implementation changes.
        operator_scoped (False): Whether to tie the cache entry to the current operator
        user_scoped (False): Whether to tie the cache entry to the current user
        prompt_scoped (False): Whether to tie the cache entry to
            the current operator prompt
        jwt_scoped (False): Whether to tie the cache entry to the current user's JWT
        collection_name (None): Override the default collection name for the execution store
            used by the execution_cache. The default collection name is "execution_store".
        serialize (None): Custom serialization function given the original value that returns
            a JSON-serializable value.
        deserialize (None): Custom deserialization given a JSON-serializable value and returns
            the original value.
        residency ("hybrid"): The residency of the cache. Can be one of:
            - "transient": Cache is stored in the execution store with policy="evict".
            - "ephemeral": Cache is stored in memory and is cleared when the process ends.
            - "hybrid": (default) Combination of transient and ephemeral. Cache is stored in memory
                and in the execution store. The memory cache is used first, and if
                the value is not found, it falls back to the execution store.
        max_size (None): Maximum size of the memory cache. Only applicable for
            "ephemeral" and "hybrid" residency modes. If not provided, the default
            size is 1024. The cache will evict the least recently used items when
            the size exceeds this limit.

    note::

        When using ``link_to_dataset=True``:
            - the associated store is deleted the dataset is deleted
            - the cache entry is namespaced to the dataset

    note::

        Return values will be coerced from JSON unsafe types to safe types.
        This may yield unexpected return values if the cached function returns
        non-serializable types (e.g., NumPy arrays), since they are converted
        to a JSON-compatible format.

        This behavior can be overridden by providing custom ``serialize`` and/or
        ``deserialize`` functions.

    Example Usage:
        # Standalone function with default caching
        @execution_cache
        def expensive_query(ctx, path):
            return ctx.dataset.count_values(path)

        # Instance method with dataset-scoped caching
        class Processor:
            @execution_cache(ttl=60, store_name="processor_cache")
            def expensive_query(self, ctx, path):
                return ctx.dataset.count_values(path)

        # Using a custom key function
        def custom_key_fn(ctx, path):
            return [path, get_day_of_week()]

        # Combines the custom key function with user-scoped caching
        @execution_cache(ttl=90, key_fn=custom_key_fn, jwt_scoped=True)
        def user_specific_query(ctx, path):
            return ctx.dataset.match(
                F("creator_id") == ctx.user_id
            ).count_values(path)

        # Bypass the cache
        result = expensive_query.uncached(ctx, path)

        # Set the cache for the given arguments
        expensive_query.set_cache(ctx, path, value_to_cache)

        # Clear the cache for the given arguments
        expensive_query.clear_cache(ctx, path)

        # Remove all cache entries for the function
        expensive_query.clear_all_caches()

        # Clear all cache entries for the function
        expensive_query.clear_all_caches()

        # NOTE: dataset_id is required if link_to_dataset=True
        expensive_query.clear_all_caches(dataset_id=dataset._doc.id)
    """

    def decorator(func):
        for attr in _FUNC_ATTRIBUTES:
            if hasattr(func, attr):
                raise ValueError(
                    f"Function {func.__name__} is already decorated with "
                    f"@execution_cache and cannot be decorated again."
                )

        if residency not in _RESIDENCY_OPTIONS:
            raise ValueError(
                f"Invalid residency option '{residency}'. "
                f"Valid options are: {_RESIDENCY_OPTIONS}"
            )

        # max_size is only applicable for ephemeral and hybrid residency
        if max_size is not None and residency not in ["ephemeral", "hybrid"]:
            raise ValueError(
                "max_size is only valid for ephemeral and hybrid residency."
            )

        func.store_name = store_name
        func.link_to_dataset = link_to_dataset
        func.exec_cache_version = version

        @wraps(func)
        def wrapper(*args, **kwargs):
            ctx, ctx_index = _get_ctx_from_args(args)
            cache_key, store, memory_cache, skip_cache = resolve_cache_info(
                ctx,
                ctx_index,
                args,
                kwargs,
                key_fn,
                func,
                residency=residency,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
                max_size=max_size,
            )
            if skip_cache:
                return func(*args, **kwargs)

            # Hybrid or Ephemeral
            if memory_cache is not None and cache_key in memory_cache:
                cached_value = memory_cache[cache_key]
                return (
                    deserialize(cached_value)
                    if deserialize
                    else auto_deserialize(cached_value)
                )

            # Transient or Hybrid
            cached_value = None
            if store is not None:
                cached_value = store.get(cache_key)

            if cached_value is not None:
                result = (
                    deserialize(cached_value)
                    if deserialize
                    else auto_deserialize(cached_value)
                )

                # Hybrid: Warm memory cache
                if memory_cache is not None:
                    memory_cache[cache_key] = (
                        serialize(result)
                        if serialize
                        else auto_serialize(result)
                    )

                return result

            # Cache miss
            result = func(*args, **kwargs)
            value_to_cache = (
                serialize(result) if serialize else auto_serialize(result)
            )

            if store is not None:
                store.set_cache(cache_key, value_to_cache, ttl=ttl)

            if memory_cache is not None:
                memory_cache[cache_key] = value_to_cache

            return result

        def uncached(*args, **kwargs):
            return func(*args, **kwargs)

        wrapper.uncached = uncached

        def clear_cache(*args, **kwargs):
            ctx, ctx_index = _get_ctx_from_args(args)
            cache_key, store, memory_cache, _ = resolve_cache_info(
                ctx,
                ctx_index,
                args,
                kwargs,
                key_fn,
                func,
                residency=residency,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
            )
            if store:
                store.delete(cache_key)
            if memory_cache is not None and cache_key in memory_cache:
                del memory_cache[cache_key]

        wrapper.clear_cache = clear_cache

        def set_cache(*args, **kwargs):
            arg_to_cache = args[-1]
            regular_args = args[:-1]
            ctx, ctx_index = _get_ctx_from_args(regular_args)
            cache_key, store, memory_cache, _ = resolve_cache_info(
                ctx,
                ctx_index,
                regular_args,
                kwargs,
                key_fn,
                func,
                residency=residency,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
            )
            value_to_cache = (
                serialize(arg_to_cache)
                if serialize
                else auto_serialize(arg_to_cache)
            )
            if store:
                store.set_cache(cache_key, value_to_cache, ttl=ttl)
            if memory_cache is not None:
                memory_cache[cache_key] = value_to_cache

        wrapper.set_cache = set_cache

        def clear_all_caches(dataset_id=None):
            if dataset_id is None and func.link_to_dataset:
                raise ValueError(
                    "dataset_id must be provided when link_to_dataset=True"
                )
            store = _get_store_for_func(
                func, dataset_id=dataset_id, collection_name=collection_name
            )
            store.clear_cache()

        wrapper.clear_all_caches = clear_all_caches

        return wrapper

    return decorator if _func is None else decorator(_func)
