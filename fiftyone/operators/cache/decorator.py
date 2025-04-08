"""
Execution cache decorator.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.operators.cache.utils import (
    _get_ctx_from_args,
    resolve_cache_info,
    auto_deserialize,
    _get_store_for_func,
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


def execution_cache(
    _func=None,
    *,
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

        func.store_name = store_name
        func.link_to_dataset = link_to_dataset
        func.exec_cache_version = version

        @wraps(func)
        def wrapper(*args, **kwargs):
            ctx, ctx_index = _get_ctx_from_args(args)
            cache_key, store, skip_cache = resolve_cache_info(
                ctx,
                ctx_index,
                args,
                kwargs,
                key_fn,
                func,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
            )
            if skip_cache:
                return func(*args, **kwargs)

            cached_value = store.get(cache_key)
            if cached_value is not None:
                if deserialize is not None:
                    return deserialize(cached_value)
                else:
                    return auto_deserialize(cached_value)

            result = func(*args, **kwargs)

            if serialize is not None:
                value_to_cache = serialize(result)
            else:
                value_to_cache = auto_deserialize(result)
            store.set_cache(cache_key, value_to_cache, ttl=ttl)

            return result

        def uncached(*args, **kwargs):
            return func(*args, **kwargs)

        wrapper.uncached = uncached

        def clear_cache(*args, **kwargs):
            ctx, ctx_index = _get_ctx_from_args(args)
            cache_key, store, _ = resolve_cache_info(
                ctx,
                ctx_index,
                args,
                kwargs,
                key_fn,
                func,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
            )
            # TODO: check if this fails when the cache key is not found
            store.delete(cache_key)

        wrapper.clear_cache = clear_cache

        def set_cache(*args, **kwargs):
            arg_to_cache = args[-1]
            regular_args = args[:-1]
            ctx, ctx_index = _get_ctx_from_args(args)
            cache_key, store, _ = resolve_cache_info(
                ctx,
                ctx_index,
                regular_args,
                kwargs,
                key_fn,
                func,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
            )
            value_to_cache = auto_deserialize(arg_to_cache)
            store.set_cache(cache_key, value_to_cache, ttl=ttl)

        wrapper.set_cache = set_cache

        def clear_all_caches(dataset_id=None):
            store = _get_store_for_func(
                func, dataset_id=dataset_id, collection_name=collection_name
            )
            store.clear_cache()

        wrapper.clear_all_caches = clear_all_caches

        return wrapper

    return decorator if _func is None else decorator(_func)
